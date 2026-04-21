import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import {v4 as uuidv4} from "uuid";
import {db, bucket} from "./admin.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageImageTaskPayload {
  storyId: string;
  pageId: string;
  pageIndex: number;
  pageType: string;
  text: string;
  scenePrompt: string;
  coverTitle?: string;
  coverSubtitle?: string;
  userId: string;
  avatarUrl: string;
  characterCardJson: string;
  commonContextEntitiesJson: string;
  supportingCharactersJson: string;
  totalPages: number;
}

export interface ImageQaInput {
  pageType: string;
  requiredText: string[];
}

export interface ImageQaResult {
  passed: boolean;
  reason: string;
}

export interface FailedImageGenerationRecord {
  story_id: string;
  page_id: string;
  page_index: number;
  page_type: string;
  user_id: string;
  status: string;
  failure_count: number;
  last_error: string;
  payload: PageImageTaskPayload;
  first_failed_at: string;
  last_failed_at: string;
  server_updated_at: FieldValue;
  server_created_at?: FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves a buffer to Cloud Storage and returns a public download URL with a pre-signed token.
 * @param {string} filePath - The destination path within the bucket.
 * @param {Buffer} data - The file contents to save.
 * @param {string} contentType - The MIME type of the file.
 * @return {Promise<string>} The permanent download URL.
 */
export async function saveWithDownloadUrl(
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
 * Builds the full Imagen illustration prompt for a single story page.
 * @param {PageImageTaskPayload} payload - The page image task payload.
 * @return {string} The assembled prompt string.
 */
export function buildIllustrationPrompt(payload: PageImageTaskPayload): string {
  const card = (() => {
    try {
      return JSON.parse(payload.characterCardJson);
    } catch {
      return null;
    }
  })();

  const supportingChars: Array<{name: string; role: string; appearance: string}> = (() => {
    try {
      const parsed = JSON.parse(payload.supportingCharactersJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const commonContextEntities: Array<{
    name: string;
    category: string;
    role: string;
    appearance: string;
    consistency_notes?: string;
  }> = (() => {
    try {
      const parsed = JSON.parse(payload.commonContextEntitiesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const characterDesc = card ? (
    `The protagonist is a ${card.gender || "child"} with ${card.skin_tone} skin tone. ` +
    `Face: ${card.face}. Hair: ${card.hair}. ` +
    `Accessories: ${card.accessories}. Outfit: ${card.default_outfit}. ` +
    `Lower garment: ${card.lower_garment || "as shown in avatar reference"} — ` +
    "this EXACT lower garment color and style must appear on EVERY page without exception. " +
    "CRITICAL: Keep the character's clothing EXACTLY as shown in the provided reference avatar image — " +
    "the top garment (shirt/top/blouse/kurta) and bottom garment (pants/skirt/lehenga/dhoti) must match " +
    "the avatar reference in colour, style, and pattern on every single page."
  ) : "";

  const supportingCharDesc = supportingChars.length > 0 ?
    "SUPPORTING CHARACTERS — draw each with their exact consistent appearance whenever they appear in this scene: " +
    supportingChars.map((sc) => `${sc.name} (${sc.role}): ${sc.appearance}`).join(" | ") +
    " CRITICAL: Never change the appearance of any supporting character between pages. " :
    "";

  const commonContextDesc = commonContextEntities.length > 0 ?
    "COMMON CONTEXT ENTITIES — keep recurring people/animals/vehicles/objects visually identical when they appear: " +
    commonContextEntities.map((entity) =>
      `${entity.name} [${entity.category}] (${entity.role}): ${entity.appearance}` +
      (entity.consistency_notes ? ` Consistency: ${entity.consistency_notes}` : "")
    ).join(" | ") +
    " CRITICAL: Do not change colors, structure, clothing, markings, or defining traits of recurring entities across pages. " :
    "";

  if (payload.pageType === "cover") {
    const title = payload.coverTitle || "";
    const subtitle = payload.coverSubtitle || "";
    return (
      "Create a beautiful children's storybook COVER illustration in a warm, vibrant Indian style. " +
      `${characterDesc} ` +
      `${commonContextDesc}` +
      `${supportingCharDesc}` +
      `Scene: ${payload.scenePrompt} ` +
      "Make it feel magical, joyful, and inviting. Full 3:4 portrait format. " +
      (title ? (
        `IMPORTANT: Render the book title "${title}" prominently in the illustration — ` +
        "large decorative lettering, centered, near the top or bottom of the image. " +
        (subtitle ? `Also render the subtitle "${subtitle}" in smaller text just below the title. ` : "") +
        "The text must be clearly legible and styled as an official book cover title. " +
        "Do not render any other text anywhere on the cover besides the title and subtitle. " +
        "No author names, logos, badges, captions, quotes, page numbers, or extra wording."
      ) : "")
    );
  }

  if (payload.pageType === "back_cover") {
    const blurb = payload.text || "";
    return (
      "Create a warm, magical children's storybook BACK COVER illustration in vibrant Indian style. " +
      "Full 3:4 portrait format. " +
      "Background: a beautiful warm gradient from peach/orange at the bottom to soft lavender/purple at the top. " +
      "Border: an elegant floral border made of lotus flowers, jasmine, and leaves framing the entire page. " +
      "Scatter golden sparkle stars and soft light bokeh throughout the background. " +
      "CENTER BRANDING (most important element): " +
      "In the center of the image, render the text \"TinguTales.com\" in large, elegant decorative " +
      "cursive/script lettering — the same style and size as the title on the front cover. " +
      "Add a small ornamental golden divider (lotus or paisley motif) above and below this text. " +
      (blurb ? (
        "BLURB: In a calm area above the branding, render this short blurb text " +
        "in a clean, readable child-friendly font: " +
        `"${blurb}" ` +
        "The blurb text must be fully legible. "
      ) : "") +
      "AVATAR: Place the child character (from the reference avatar image) in a warm ornate circular frame " +
      "in the bottom-right corner, like a publisher's portrait medallion. " +
      "Do NOT render this branding on any other page type."
    );
  }

  const storyText = payload.text || "";
  return (
    "Create a vibrant children's storybook interior PAGE illustration in warm Indian style. " +
    `${characterDesc} ` +
    `${commonContextDesc}` +
    `${supportingCharDesc}` +
    `Scene: ${payload.scenePrompt} ` +
    "Full 3:4 portrait format, bright and joyful colours. " +
    (storyText ? (
      "IMPORTANT: Include the following story text legibly inside the illustration, " +
      "rendered in a clean child-friendly font in a calm area of the image " +
      "(e.g. a text band at the bottom, a sky area, or a scroll/banner element): " +
      `"${storyText}" ` +
      "The text must be fully readable and completely fit within the image boundaries. " +
      "Render this story text EXACTLY ONCE in the entire image. " +
      "Do not repeat, duplicate, echo, or restate the same sentence anywhere else on the page."
    ) : "")
  );
}

/**
 * Uses Gemini Vision to verify that a generated image meets quality requirements.
 * @param {Buffer} imageBuffer - The image data to inspect.
 * @param {ImageQaInput} qaInput - Quality-assurance parameters.
 * @param {GoogleGenAI} ai - The Gemini AI client.
 * @param {string} qaModelName - The Gemini model to use for QA.
 * @return {Promise<ImageQaResult>} Whether the image passed QA and the reason.
 */
export async function verifyGeneratedImageQuality(
  imageBuffer: Buffer,
  qaInput: ImageQaInput,
  ai: GoogleGenAI,
  qaModelName: string
): Promise<ImageQaResult> {
  const requiredText = qaInput.requiredText.map((item) => item.trim()).filter(Boolean);
  try {
    const imgB64 = imageBuffer.toString("base64");
    const requiredTextSection = requiredText.length > 0 ?
      requiredText.map((item) => `- "${item}"`).join("\n") :
      "- None";
    const extraTextRule = qaInput.pageType === "cover" ?
      "For cover pages, FAIL if any visible text appears beyond the required title/subtitle lines." :
      "Extra decorative text is allowed only if it is part of the requested page design.";
    const duplicateTextRule = qaInput.pageType === "story" ?
      "For story pages, FAIL if the same story text appears in multiple places (for example both top and bottom). " +
      "The required story text must appear once only." :
      "";
    const response = await ai.models.generateContent({
      model: qaModelName,
      contents: [{
        role: "user",
        parts: [
          {inlineData: {mimeType: "image/png", data: imgB64}},
          {
            text:
              "You are a strict production QA reviewer for children's storybook images. " +
              "Decide whether this image is safe to deliver to the customer.\n\n" +
              `Page type: ${qaInput.pageType}\n\n` +
              "FAIL the image if ANY of the following is true:\n" +
              "1. The image looks partially generated, unfinished, corrupted, or malformed.\n" +
              "2. Any edge, especially the top area, has an abrupt blank, flat, unpainted, duplicated, cropped, or broken strip/band/block.\n" +
              "3. Important artwork or text is cut off, clipped, malformed, or only partly visible.\n" +
              "4. Required text is missing, illegible, or only partially readable.\n" +
              `5. ${extraTextRule}\n` +
              (duplicateTextRule ? `6. ${duplicateTextRule}\n` : "") +
              "7. The composition does not look like a complete, intentional full-page illustration.\n\n" +
              "Required visible text:\n" +
              `${requiredTextSection}\n\n` +
              "Be strict. If you are uncertain, respond FAIL.\n" +
              "Respond in exactly one line using one of these formats only:\n" +
              "PASS\n" +
              "FAIL: <short reason>",
          },
        ],
      }],
    });
    const answer = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const normalizedAnswer = answer.trim();
    const passed = normalizedAnswer.toUpperCase() === "PASS";
    const reason = passed ? "ok" : (normalizedAnswer || "FAIL: unknown QA response");
    logger.info(`[verifyGeneratedImageQuality] QA result: "${normalizedAnswer.slice(0, 160)}" → ${passed ? "PASS" : "FAIL"}`);
    return {passed, reason};
  } catch (err) {
    logger.warn("[verifyGeneratedImageQuality] QA check error — failing open", err);
    return {passed: true, reason: "qa_error_fail_open"};
  }
}

/**
 * Returns a deterministic Firestore document ID for a failed-image-generation record.
 * @param {string} storyId - The story ID.
 * @param {string} pageId - The page ID.
 * @return {string} The composite document ID.
 */
export function failedImageDocId(storyId: string, pageId: string): string {
  return `${storyId}__${pageId}`;
}

/**
 * Creates or updates a failed-image-generation document in Firestore.
 * @param {PageImageTaskPayload} payload - The page image task payload.
 * @param {number} failureCount - The cumulative failure count for this page.
 * @param {string} errorMessage - A human-readable description of the failure.
 * @return {Promise<void>} Resolves when the document has been written.
 */
export async function upsertFailedImageGeneration(
  payload: PageImageTaskPayload,
  failureCount: number,
  errorMessage: string
): Promise<void> {
  const failedRef = db.collection("_failed_image_generation").doc(failedImageDocId(payload.storyId, payload.pageId));
  const snap = await failedRef.get();
  const nowIso = new Date().toISOString();

  const record: FailedImageGenerationRecord = {
    story_id: payload.storyId,
    page_id: payload.pageId,
    page_index: payload.pageIndex,
    page_type: payload.pageType,
    user_id: payload.userId,
    status: "failed",
    failure_count: failureCount,
    last_error: errorMessage,
    payload,
    first_failed_at: snap.exists ? (snap.data()?.first_failed_at as string) || nowIso : nowIso,
    last_failed_at: nowIso,
    server_updated_at: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : {server_created_at: FieldValue.serverTimestamp()}),
  };

  await failedRef.set(record, {merge: true});
}
