import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";
import {GoogleGenAI} from "@google/genai";
import sharp from "sharp";
import {v4 as uuidv4} from "uuid";

/**
 * Upload a buffer to Storage with a download token, return the public Firebase download URL.
 * @param {string} filePath - GCS file path.
 * @param {Buffer} data - File contents.
 * @param {string} contentType - MIME type.
 * @return {Promise<string>} Firebase download URL.
 */
async function saveWithDownloadUrl(
  filePath: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const token = uuidv4();
  await bucket.file(filePath).save(data, {
    contentType,
    metadata: {
      metadata: {firebaseStorageDownloadTokens: token},
      cacheControl: "public, max-age=31536000",
    },
  });
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

/**
 * Generate a cartoon avatar for a child profile using Gemini.
 * @param {string} profileId - Firestore profile document ID.
 * @param {string} userId - Firebase Auth UID of the owner.
 * @param {string} name - Child's name.
 * @param {string} photoUrl - GCS path of the source photo.
 * @return {Promise<void>}
 */
export async function generateAvatar(
  profileId: string,
  userId: string,
  name: string,
  photoUrl: string
): Promise<void> {
  logger.info(`[generateAvatar] START profileId=${profileId} userId=${userId} name="${name}"`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("[generateAvatar] GEMINI_API_KEY is not set");
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Mark as generating so the frontend can show a spinner
  await db.collection("child_profiles").doc(profileId).update({
    avatar_status: "generating",
  });
  logger.info(`[generateAvatar] status → generating (profileId=${profileId})`);

  // Download the photo from Storage: {userId}/uploads/...
  logger.info(`[generateAvatar] downloading photo from ${photoUrl}`);
  const [photoBytes] = await bucket.file(photoUrl).download();
  const photoB64 = photoBytes.toString("base64");
  const rawExt = photoUrl.split(".").pop();
  const ext = rawExt ? rawExt.toLowerCase() : "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  logger.info(`[generateAvatar] photo downloaded — size=${photoBytes.length}B mimeType=${mimeType}`);

  const ai = new GoogleGenAI({apiKey});

  // Load model name from Firestore models collection
  const modelDoc = await db.collection("models").doc("avatar_generation_model").get();
  const modelName: string = modelDoc.exists &&
    (modelDoc.data()?.name as string) ?
    (modelDoc.data()?.name as string) :
    "gemini-2.0-flash-preview-image-generation";
  logger.info(`[generateAvatar] using model=${modelName}`);

  const prompt =
    "Transform this child's photo into a cute, adorable cartoon avatar for a children's storybook. " +
    "The avatar should:\n" +
    "- Look like the child in the photo but in a charming cartoon/illustrated style\n" +
    "- EXACTLY preserve the child's face shape, skin tone, eye color, and facial features\n" +
    "- EXACTLY preserve the child's hairstyle, hair color, and hair length\n" +
    "- EXACTLY preserve the outfit and clothing colors/patterns\n" +
    "- EXACTLY preserve the child's body build and proportions\n" +
    "- Have big expressive eyes and a warm smile\n" +
    "- Use warm, vibrant colors (marigold, teal, indigo accents)\n" +
    "- Have a clean circular portrait composition\n" +
    "- Indian cultural style, cheerful and magical\n" +
    `The child's name is ${name}. Make them look like a storybook hero!`;

  logger.info(`[generateAvatar] calling Gemini generateContent (model=${modelName})`);
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          {inlineData: {mimeType, data: photoB64}},
          {text: prompt},
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      systemInstruction:
        "You are a children's book character designer. Create adorable cartoon avatars " +
        "from photos, faithfully preserving the child's face, hairstyle, clothing, and body proportions.",
    },
  });
  logger.info(`[generateAvatar] Gemini response received — candidates=${response.candidates?.length ?? 0}`);

  let avatarPng: Buffer | null = null;
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      avatarPng = Buffer.from(part.inlineData.data ?? "", "base64");
      break;
    }
  }

  if (!avatarPng) {
    logger.error("[generateAvatar] Gemini returned no image part in response", {
      candidates: JSON.stringify(response.candidates?.map((c) => ({
        finishReason: c.finishReason,
        partTypes: c.content?.parts?.map((p) => Object.keys(p)),
      }))),
    });
    throw new Error("Gemini returned no image");
  }
  logger.info(`[generateAvatar] avatar PNG extracted — size=${avatarPng.length}B`);

  const pngPath = `${userId}/${profileId}/avatar/avatar.png`;
  const jpgPath = `${userId}/${profileId}/avatar/avatar.jpg`;

  // Save PNG and JPEG, each with a Firebase download token for direct <img src> use
  logger.info(`[generateAvatar] saving PNG to ${pngPath}`);
  const pngDownloadUrl = await saveWithDownloadUrl(pngPath, avatarPng, "image/png");
  logger.info("[generateAvatar] converting to JPEG");
  const avatarJpg = await sharp(avatarPng).jpeg({quality: 85}).toBuffer();
  logger.info(`[generateAvatar] saving JPEG to ${jpgPath} — size=${avatarJpg.length}B`);
  const jpgDownloadUrl = await saveWithDownloadUrl(jpgPath, avatarJpg, "image/jpeg");

  // Write Firebase download URLs to Firestore — frontend reads them directly as img src
  await db.collection("child_profiles").doc(profileId).update({
    avatar_url: pngDownloadUrl,
    avatar_jpeg_url: jpgDownloadUrl,
    avatar_status: "completed",
  });
  logger.info(`[generateAvatar] DONE — status=completed profileId=${profileId}`);

  logger.info(`Avatar saved for ${profileId} — jpg: ${jpgPath}`);
}
