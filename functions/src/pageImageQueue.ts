import * as logger from "firebase-functions/logger";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import sharp from "sharp";
import {v4 as uuidv4} from "uuid";
import {db, bucket} from "./admin.js";
import {recordTokenConsumption} from "./tokenConsumption.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PageImageTaskPayload {
  storyId: string;
  pageId: string;
  pageIndex: number;
  pageType: string;
  text: string;
  scenePrompt: string;
  coverTitle?: string;
  coverSubtitle?: string;
  userId: string;
  avatarUrl: string; // GCS path, e.g. userId/profileId/avatar/avatar.jpg
  characterCardJson: string;
  supportingCharactersJson: string; // JSON array of SupportingCharacter
  totalPages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a buffer to Storage with a download token, return the public Firebase download URL.
 * @param {string} filePath - The destination path in Cloud Storage.
 * @param {Buffer} data - The file contents to upload.
 * @param {string} contentType - MIME type of the file.
 * @return {Promise<string>} Public Firebase Storage download URL.
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
 * Build the full illustration prompt for a page from its scene_prompt and text.
 * @param {PageImageTaskPayload} payload - Task payload for the page.
 * @return {string} The prompt string to send to the image generation model.
 */
function buildIllustrationPrompt(
  payload: PageImageTaskPayload
): string {
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

  const characterDesc = card ? (
    `The protagonist is a ${card.gender || "child"} with ${card.skin_tone} skin tone. ` +
    `Face: ${card.face}. Hair: ${card.hair}. ` +
    `Accessories: ${card.accessories}. Outfit: ${card.default_outfit}. ` +
    "CRITICAL: Keep the character's clothing EXACTLY as shown in the provided reference avatar image — " +
    "the top garment (shirt/top/blouse/kurta) and bottom garment (pants/skirt/lehenga/dhoti) must match " +
    "the avatar reference in colour, style, and pattern on every single page."
  ) : "";

  const supportingCharDesc = supportingChars.length > 0 ?
    "SUPPORTING CHARACTERS — draw each with their exact consistent appearance whenever they appear in this scene: " +
    supportingChars.map((sc) => `${sc.name} (${sc.role}): ${sc.appearance}`).join(" | ") +
    " CRITICAL: Never change the appearance of any supporting character between pages. " :
    "";

  if (payload.pageType === "cover") {
    const title = payload.coverTitle || "";
    const subtitle = payload.coverSubtitle || "";
    return (
      "Create a beautiful children's storybook COVER illustration in a warm, vibrant Indian style. " +
      `${characterDesc} ` +
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

  // Interior page — embed the story text directly in the illustration
  const storyText = payload.text || "";
  return (
    "Create a vibrant children's storybook interior PAGE illustration in warm Indian style. " +
    `${characterDesc} ` +
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

// ─────────────────────────────────────────────────────────────────────────────
// QA agent — verify generated image integrity and required text
// ─────────────────────────────────────────────────────────────────────────────

interface ImageQaInput {
  pageType: string;
  requiredText: string[];
}

interface ImageQaResult {
  passed: boolean;
  reason: string;
}

interface FailedImageGenerationRecord {
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

/**
 * Use a vision model to verify the generated image is complete and production-ready.
 * Returns pass=true if QA succeeds or if the QA check itself fails (fail-open).
 * @param {Buffer} imageBuffer - The generated page image to check.
 * @param {ImageQaInput} qaInput - Page-type-specific QA expectations.
 * @param {GoogleGenAI} ai - Initialized GoogleGenAI client.
 * @param {string} qaModelName - Model name to use for QA verification.
 * @return {Promise<ImageQaResult>} QA result with pass/fail and reason.
 */
async function verifyGeneratedImageQuality(
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
 * Build a deterministic document id for failed page-image generation records.
 * @param {string} storyId - Story id.
 * @param {string} pageId - Page id.
 * @return {string}
 */
function failedImageDocId(storyId: string, pageId: string): string {
  return `${storyId}__${pageId}`;
}

/**
 * Persist or update a failed image-generation record for admin redrive.
 * @param {PageImageTaskPayload} payload - Original task payload.
 * @param {number} failureCount - Cumulative failure count for this page.
 * @param {string} errorMessage - Latest failure reason.
 * @return {Promise<void>}
 */
async function upsertFailedImageGeneration(
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

// ─────────────────────────────────────────────────────────────────────────────
// Enqueue trigger — fires when a page doc is created with status "pending"
// ─────────────────────────────────────────────────────────────────────────────

export const enqueuePageImageTask = onDocumentCreated(
  {
    document: "stories/{storyId}/pages/{pageId}",
    region: "asia-south1",
    timeoutSeconds: 60,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== "pending") return;

    const {storyId, pageId} = event.params;

    // Fetch the parent story to get userId, avatarUrl, and characterCard
    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) {
      logger.warn(`[enqueuePageImageTask] story ${storyId} not found — skipping`);
      return;
    }
    const story = storySnap.data() ?? {};
    const userId: string = story.user_id ?? "";
    const profileId: string = story.profile_id ?? "";
    const avatarUrl = `${userId}/${profileId}/avatar/avatar.jpg`;
    const characterCardJson = JSON.stringify(story.character_card ?? {});
    const supportingCharactersJson = JSON.stringify(story.supporting_characters ?? []);
    const totalPages: number = story.page_count ?? 8;

    const payload: PageImageTaskPayload = {
      storyId,
      pageId,
      pageIndex: data.page as number,
      pageType: data.page_type as string,
      text: data.text as string,
      scenePrompt: data.scene_prompt as string,
      coverTitle: data.cover_title,
      coverSubtitle: data.cover_subtitle,
      userId,
      avatarUrl,
      characterCardJson,
      supportingCharactersJson,
      totalPages,
    };

    try {
      const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
      await queue.enqueue(payload, {
        dispatchDeadlineSeconds: 600, // 10 minutes max per task
        uri: undefined, // resolved automatically by Firebase
      });
      logger.info(`[enqueuePageImageTask] enqueued page ${data.page} for story ${storyId}`);
    } catch (err) {
      logger.error(`[enqueuePageImageTask] failed to enqueue page ${data.page}`, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Task handler — generates one page image and updates Firestore
// ─────────────────────────────────────────────────────────────────────────────

export const processPageImage = onTaskDispatched<PageImageTaskPayload>(
  {
    retryConfig: {
      maxAttempts: 2,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 6,
    },
    region: "asia-south1",
    timeoutSeconds: 540, // 9 minutes — image gen can be slow
    memory: "1GiB",
  },
  async (request) => {
    const {
      storyId, pageId, pageIndex, userId, avatarUrl, totalPages,
    } = request.data;

    const pageRef = db.collection("stories").doc(storyId).collection("pages").doc(pageId);

    try {
      // Mark as processing
      await pageRef.update({
        status: "processing",
        updated_at: FieldValue.serverTimestamp(),
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {timeout: 300000}, // 5 minutes
      });

      const modelDoc = await db.collection("models").doc("story_illustration_model").get();
      const modelName: string =
        modelDoc.exists && modelDoc.data()?.name ?
          (modelDoc.data()?.name as string) :
          "gemini-2.0-flash-preview-image-generation";

      const qaModelDoc = await db.collection("models").doc("image_qa_model").get();
      const qaModelName: string =
        qaModelDoc.exists && qaModelDoc.data()?.name ?
          (qaModelDoc.data()?.name as string) :
          "gemini-2.0-flash";

      // Download avatar for character consistency
      let avatarB64: string | null = null;
      let avatarMimeType = "image/jpeg";
      try {
        const [avatarBytes] = await bucket.file(avatarUrl).download();
        const resized = await sharp(avatarBytes)
          .resize(512, 512, {fit: "inside", withoutEnlargement: true})
          .jpeg({quality: 85})
          .toBuffer();
        avatarB64 = resized.toString("base64");
        avatarMimeType = "image/jpeg";
      } catch (err) {
        logger.warn(`[processPageImage] could not load avatar for page ${pageIndex}: ${err}`);
      }

      // Build the illustration prompt
      const illustrationPrompt = buildIllustrationPrompt(request.data);

      // Call Gemini for image generation
      const contentParts: {inlineData?: {mimeType: string; data: string}; text?: string}[] = [];
      if (avatarB64) {
        contentParts.push({inlineData: {mimeType: avatarMimeType, data: avatarB64}});
      }
      contentParts.push({text: illustrationPrompt});

      let totalTokens = 0;

      // ── Generation + QA loop: up to 3 internal attempts ──────────────────────
      // The model is asked to render text directly in the image.
      // A vision QA check verifies the text is legibly present; if not, we regenerate.
      const MAX_GEN_ATTEMPTS = 3;
      const qaInput: ImageQaInput = {
        pageType: request.data.pageType,
        requiredText: (
          request.data.pageType === "cover" ?
            [request.data.coverTitle || request.data.text || "", request.data.coverSubtitle || ""] :
            request.data.pageType === "back_cover" ?
              ["TinguTales.com", request.data.text || ""] :
              [request.data.text || ""]
        ).map((item) => item.trim()).filter(Boolean),
      };

      let finalImage: Buffer | null = null;

      for (let genAttempt = 1; genAttempt <= MAX_GEN_ATTEMPTS; genAttempt++) {
        logger.info(`[processPageImage] generation attempt ${genAttempt}/${MAX_GEN_ATTEMPTS} for page ${pageIndex}`);

        let responseImage: Buffer | null = null;
        let totalTokensThisAttempt = 0;

        // Inner retry for transient API errors
        for (let apiRetry = 1; apiRetry <= 2; apiRetry++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [{role: "user", parts: contentParts}],
              config: {
                responseModalities: ["IMAGE", "TEXT"],
                systemInstruction:
                "You are a professional children's book illustrator specialising in warm, vibrant Indian art style. " +
                "Create full-page storybook illustrations that are joyful, colourful, and age-appropriate. " +
                "Always output a single illustration image in 3:4 portrait orientation. " +
                "When story text or a title is requested, render it clearly and legibly within the image. " +
                "When story text is requested for an interior page, place that text in exactly one location only — never duplicate it across multiple areas. " +
                "Character consistency is paramount: the child protagonist must look identical across every page — " +
                "same face, hair, skin tone, AND clothing. The top garment (shirt/kurta/blouse/top) and bottom garment " +
                "(pants/skirt/lehenga/dhoti) must exactly match the provided reference avatar image in colour, style, and pattern.",
              },
            });

            totalTokensThisAttempt = response.usageMetadata?.totalTokenCount ?? 0;

            for (const part of response.candidates?.[0]?.content?.parts ?? []) {
              if (part.inlineData?.mimeType?.startsWith("image/")) {
                responseImage = Buffer.from(part.inlineData.data ?? "", "base64");
              }
            }
            if (responseImage) break;
          } catch (err) {
            if (apiRetry === 2) throw err;
            logger.warn(`[processPageImage] API retry ${apiRetry} failed for page ${pageIndex}`, err);
            await new Promise((res) => setTimeout(res, 15000));
          }
        }

        if (!responseImage) {
          if (genAttempt === MAX_GEN_ATTEMPTS) {
            throw new Error(`Gemini returned no image for page ${pageIndex} after ${MAX_GEN_ATTEMPTS} attempts`);
          }
          logger.warn(`[processPageImage] no image on gen attempt ${genAttempt}, retrying`);
          continue;
        }

        totalTokens += totalTokensThisAttempt;

        // Enforce 3:4 portrait ratio
        const resized = await sharp(responseImage)
          .resize({width: 768, height: 1024, fit: "cover", position: "centre"})
          .png()
          .toBuffer();

        // QA: verify required text is present and the image looks fully and correctly rendered
        if (qaInput.requiredText.length > 0 || request.data.pageType === "cover") {
          const qaResult = await verifyGeneratedImageQuality(resized, qaInput, ai, qaModelName);
          if (!qaResult.passed) {
            logger.warn(
              `[processPageImage] QA FAILED for page ${pageIndex} (attempt ${genAttempt}) — ${qaResult.reason}`
            );
            if (genAttempt < MAX_GEN_ATTEMPTS) continue;
            // All QA attempts exhausted — save last image anyway
            logger.warn(`[processPageImage] all QA attempts exhausted for page ${pageIndex}, saving last image`);
          } else {
            logger.info(`[processPageImage] QA PASSED for page ${pageIndex} on attempt ${genAttempt}`);
          }
        }

        finalImage = resized;
        break;
      }

      if (!finalImage) {
        throw new Error(`Page ${pageIndex} could not be generated`);
      }

      void recordTokenConsumption(userId, "page_image_generation", "gemini", totalTokens);

      // Save PNG + JPEG
      const pngPath = `${userId}/${storyId}/pages/${pageIndex}/image.png`;
      const jpgPath = `${userId}/${storyId}/pages/${pageIndex}/image.jpg`;

      const [pngUrl, jpgUrl] = await Promise.all([
        saveWithDownloadUrl(pngPath, finalImage, "image/png"),
        sharp(finalImage)
          .jpeg({quality: 85})
          .toBuffer()
          .then((buf) => saveWithDownloadUrl(jpgPath, buf, "image/jpeg")),
      ]);

      // Update page document with image URLs
      await pageRef.update({
        image_url: pngUrl,
        jpeg_url: jpgUrl,
        status: "completed",
        image_generation_fail_count: 0,
        last_image_generation_error: "",
        updated_at: FieldValue.serverTimestamp(),
      });

      // Clear any stale failed-item record if this page eventually succeeds.
      await db.collection("_failed_image_generation").doc(failedImageDocId(storyId, pageId)).delete().catch(() => undefined);

      // If this is the cover page, propagate the JPEG to the story for dashboard thumbnails
      if (pageIndex === 0) {
        await db.collection("stories").doc(storyId).update({
          cover_image_url: jpgUrl,
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      logger.info(`[processPageImage] page ${pageIndex} done — storyId=${storyId}`);

      // ─── Check if all pages are done → enqueue PDF generation ────────────
      const pagesSnap = await db
        .collection("stories")
        .doc(storyId)
        .collection("pages")
        .get();

      const allDone = pagesSnap.docs.every((d) => d.data().status === "completed");
      const totalExpected = totalPages;
      const completedCount = pagesSnap.docs.filter((d) => d.data().status === "completed").length;

      logger.info(`[processPageImage] ${completedCount}/${totalExpected} pages completed for story ${storyId}`);

      if (allDone && completedCount >= totalExpected) {
        // Advance story status to creating_pdf
        await db.collection("stories").doc(storyId).update({
          status: "creating_pdf",
          updated_at: FieldValue.serverTimestamp(),
        });

        // Enqueue PDF generation task
        try {
          const queue = getFunctions().taskQueue("locations/asia-south1/functions/generateStorybookPdf");
          await queue.enqueue(
            {storyId, userId, totalPages: totalExpected},
            {dispatchDeadlineSeconds: 600}
          );
          logger.info(`[processPageImage] PDF task enqueued for story ${storyId}`);
        } catch (err) {
          logger.error(`[processPageImage] failed to enqueue PDF task for story ${storyId}`, err);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Track repeated failures on the page document so only persistent failures are queued for admin redrive.
      const failureCount = await db.runTransaction(async (tx) => {
        const snap = await tx.get(pageRef);
        const current = Number(snap.data()?.image_generation_fail_count ?? 0);
        const next = current + 1;
        tx.set(pageRef, {
          status: "failed",
          image_generation_fail_count: next,
          last_image_generation_error: errorMessage,
          updated_at: FieldValue.serverTimestamp(),
        }, {merge: true});
        return next;
      });

      if (failureCount >= 2) {
        await upsertFailedImageGeneration(request.data, failureCount, errorMessage);
      }

      logger.error(`[processPageImage] page ${pageIndex} failed (count=${failureCount}) storyId=${storyId}`, err);
      throw err;
    }
  }
);
