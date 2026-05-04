import * as logger from "firebase-functions/logger";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import sharp from "sharp";
import {db, bucket} from "./admin.js";
import {recordTokenConsumption} from "./tokenConsumption.js";
import {
  PageImageTaskPayload,
  ImageQaInput,
  saveWithDownloadUrl,
  buildIllustrationPrompt,
  inferRequiredVisualElements,
  verifyGeneratedImageQuality,
  upsertFailedImageGeneration,
  failedImageDocId,
} from "./_pageImageCore.js";
import {renderDeterministicPageText} from "./_pageTextOverlay.js";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_GEMINI_QA_MODEL,
  GEMINI_IMAGE_TIMEOUT_MS,
  GEMINI_MODEL_CONFIG_KEYS,
  createGeminiClient,
  getConfiguredGeminiModel,
} from "./geminiConfig.js";
import {normalizeBackCoverText} from "./_backCoverLessonText.js";
import {notifySlackError} from "./_slack.js";

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
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    const {
      storyId, pageId, pageIndex, userId, avatarUrl, totalPages,
    } = request.data;

    const pageRef = db.collection("stories").doc(storyId).collection("pages").doc(pageId);
    const requiredVisualElements = inferRequiredVisualElements(request.data);

    try {
      if (request.data.pageType === "back_cover") {
        const storySnap = await db.collection("stories").doc(storyId).get();
        const story = storySnap.data() ?? {};
        const normalizedText = normalizeBackCoverText(
          request.data.text ?? "",
          (story.child_name_english as string) || (story.child_name as string) || "",
          String(story.moral ?? "")
        );
        if (normalizedText !== (request.data.text ?? "")) {
          request.data.text = normalizedText;
          await pageRef.set({text: normalizedText}, {merge: true});
        }
      }

      await pageRef.update({
        status: "processing",
        image_generation_qa_status: "processing",
        image_generation_qa_warning: "",
        image_generation_qa_attempts: [],
        image_generation_required_visual_elements: requiredVisualElements,
        image_generation_attempt_started_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

      const ai = createGeminiClient(apiKey, GEMINI_IMAGE_TIMEOUT_MS);

      const [modelName, qaModelName] = await Promise.all([
        getConfiguredGeminiModel(GEMINI_MODEL_CONFIG_KEYS.storyIllustration, DEFAULT_GEMINI_IMAGE_MODEL),
        getConfiguredGeminiModel(GEMINI_MODEL_CONFIG_KEYS.imageQa, DEFAULT_GEMINI_QA_MODEL),
      ]);
      logger.info(`[processPageImage] using model=${modelName}, timeoutMs=${GEMINI_IMAGE_TIMEOUT_MS}`);
      logger.info(`[processPageImage] using qaModel=${qaModelName}`);

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

      const commonContextEntities: Array<{name?: string; category?: string}> = (() => {
        try {
          const parsed = JSON.parse(request.data.commonContextEntitiesJson);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
      logger.info("[processPageImage] common context entities for page", {
        storyId,
        pageId,
        pageIndex,
        pageType: request.data.pageType,
        count: commonContextEntities.length,
        names: commonContextEntities
          .map((entity) => entity.name)
          .filter(Boolean)
          .slice(0, 10),
      });

      const illustrationPrompt = buildIllustrationPrompt(request.data);

      const contentParts: {inlineData?: {mimeType: string; data: string}; text?: string}[] = [];
      if (avatarB64) {
        contentParts.push({inlineData: {mimeType: avatarMimeType, data: avatarB64}});
      }
      contentParts.push({text: illustrationPrompt});

      let totalTokens = 0;

      const MAX_GEN_ATTEMPTS = 3;
      const qaAttempts: Array<{
        attempt: number;
        stage: string;
        passed: boolean;
        reason: string;
        at: string;
      }> = [];
      let qaStatus = "not_run";
      let qaWarning = "";
      const persistQaProgress = async () => {
        await pageRef.set({
          image_generation_qa_status: qaStatus,
          image_generation_qa_warning: qaWarning,
          image_generation_qa_attempts: qaAttempts.slice(-8),
          image_generation_required_visual_elements: requiredVisualElements,
          updated_at: FieldValue.serverTimestamp(),
        }, {merge: true});
      };
      const qaInput: ImageQaInput = {
        pageType: request.data.pageType,
        requiredText: (
          request.data.pageType === "cover" ?
            [request.data.coverTitle || request.data.text || "", request.data.coverSubtitle || ""] :
            request.data.pageType === "back_cover" ?
              ["TinguTales.com", request.data.text || ""] :
              [request.data.text || ""]
        ).map((item) => item.trim()).filter(Boolean),
        requiredVisualElements,
      };

      let finalImage: Buffer | null = null;

      for (let genAttempt = 1; genAttempt <= MAX_GEN_ATTEMPTS; genAttempt++) {
        logger.info(`[processPageImage] generation attempt ${genAttempt}/${MAX_GEN_ATTEMPTS} for page ${pageIndex}`);

        let responseImage: Buffer | null = null;
        let totalTokensThisAttempt = 0;

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
                "For interior story pages, if the prompt references a story sentence, " +
                "leave the bottom 35% as calm natural background for later app typesetting; do not draw any " +
                "text box, banner, parchment, plaque, scroll, speech bubble, caption panel, label area, or blank card. " +
                "The child character must be FULLY VISIBLE from head to toe — never crop, cut off, or hide the character's feet, legs, or lower body. " +
                "Place the ground/floor line at or above the 65% mark from the top of the image so the character's feet are clearly visible above the text-safe zone. " +
                "Keep all characters, key objects, and main action completely above the bottom 35% text-safe area. " +
                "Never draw letters, words, numbers, signs, fake writing, or random text on interior story pages. " +
                "If the prompt lists required visual story anchors, make each one clearly visible and recognizable. " +
                "For cover and back-cover pages, follow the prompt's text instructions normally. " +
                "CHARACTER CONSISTENCY IS THE HIGHEST PRIORITY: the child protagonist must be PIXEL-IDENTICAL in appearance across every page — " +
                "the reference avatar image provided is the single source of truth. " +
                "Hair: EXACT same length, colour, style, and accessories as the avatar — never shorten, lengthen, curl, loosen, or change the hair in any way. " +
                "Face: same eye shape, eye colour, skin tone, nose, and mouth as the avatar — no variations. " +
                "Top garment: same shirt/kurta/top colour, cut, and pattern as the avatar. " +
                "Bottom garment: same pants/skirt/lehenga colour, cut, and pattern as the avatar — never substitute a different colour or style. " +
                "Footwear: same shoes/sandals/chappals as the avatar — identical style and colour on every page. " +
                "SECONDARY CHARACTER AND ENTITY CONSISTENCY: all recurring animals, people, and objects described in the prompt must also look IDENTICAL across every page. " +
                "For animals: the exact skin, fur, or feather colour must never shift between pages — an elephant described as warm gray must be warm gray on every page, not blue-gray or dark gray. " +
                "For people: same face, skin tone, hair, and outfit throughout. " +
                "NEVER reinterpret or 'improve' the colour of a recurring entity — reproduce its exact appearance as described in the prompt on every single page.",
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

        const resizedImage = await sharp(responseImage)
          .resize({width: 768, height: 1024, fit: "cover", position: "centre"})
          .png()
          .toBuffer();

        if (request.data.pageType === "story") {
          const artQaResult = await verifyGeneratedImageQuality(resizedImage, {
            pageType: request.data.pageType,
            requiredText: [],
            requiredVisualElements,
            forbidText: true,
          }, ai, qaModelName);
          qaAttempts.push({
            attempt: genAttempt,
            stage: "artwork_pre_overlay",
            passed: artQaResult.passed,
            reason: artQaResult.reason,
            at: new Date().toISOString(),
          });
          if (!artQaResult.passed) {
            qaStatus = "artwork_warning";
            qaWarning = artQaResult.reason;
            await persistQaProgress();
            logger.warn(
              `[processPageImage] ART QA FAILED for page ${pageIndex} ` +
              `(attempt ${genAttempt}) — ${artQaResult.reason}`
            );
            if (genAttempt === 1 && MAX_GEN_ATTEMPTS > 1) continue;
          } else {
            qaStatus = "processing";
            await persistQaProgress();
          }
        }

        let composedImage = resizedImage;
        if (request.data.pageType === "story" && request.data.text.trim().length > 0) {
          const overlayResult = await renderDeterministicPageText(resizedImage, request.data);
          composedImage = overlayResult.imageBuffer;

          logger.info("[processPageImage] deterministic text overlay applied", {
            pageIndex,
            pageType: request.data.pageType,
            confidence: Number(overlayResult.region.confidence.toFixed(3)),
            useFallbackBox: overlayResult.region.useFallbackBox,
            region: {
              left: overlayResult.region.left,
              top: overlayResult.region.top,
              width: overlayResult.region.width,
              height: overlayResult.region.height,
            },
          });
        }

        if (qaInput.requiredText.length > 0 || request.data.pageType === "cover") {
          const qaResult = await verifyGeneratedImageQuality(composedImage, qaInput, ai, qaModelName);
          qaAttempts.push({
            attempt: genAttempt,
            stage: "final_composited",
            passed: qaResult.passed,
            reason: qaResult.reason,
            at: new Date().toISOString(),
          });
          if (!qaResult.passed) {
            qaStatus = "final_warning";
            qaWarning = qaResult.reason;
            await persistQaProgress();
            logger.warn(
              `[processPageImage] QA FAILED for page ${pageIndex} (attempt ${genAttempt}) — ${qaResult.reason}`
            );
            if (genAttempt < MAX_GEN_ATTEMPTS) continue;
            logger.warn(`[processPageImage] all QA attempts exhausted for page ${pageIndex}, saving last image with warning`);
          } else {
            qaStatus = qaWarning ? "passed_with_warnings" : "passed";
            await persistQaProgress();
            logger.info(`[processPageImage] QA PASSED for page ${pageIndex} on attempt ${genAttempt}`);
          }
        } else if (qaStatus === "not_run") {
          qaStatus = "not_required";
          await persistQaProgress();
        }

        // Store raw (pre-overlay) image so text overlay can be retried cheaply
        finalImage = resizedImage;
        break;
      }

      if (!finalImage) {
        throw new Error(`Page ${pageIndex} could not be generated`);
      }

      void recordTokenConsumption(userId, "page_image_generation", "gemini", totalTokens);

      const rawPngPath = `${userId}/${storyId}/pages/${pageIndex}/image_raw.png`;
      const pngPath = `${userId}/${storyId}/pages/${pageIndex}/image.png`;
      const jpgPath = `${userId}/${storyId}/pages/${pageIndex}/image.jpg`;

      // Apply overlay to produce the final display image
      let composedFinal = finalImage;
      if (request.data.pageType === "story" && request.data.text.trim().length > 0) {
        const overlayResult = await renderDeterministicPageText(finalImage, request.data);
        composedFinal = overlayResult.imageBuffer;
      }

      const [rawPngUrl, pngUrl, jpgUrl] = await Promise.all([
        saveWithDownloadUrl(rawPngPath, finalImage, "image/png"),
        saveWithDownloadUrl(pngPath, composedFinal, "image/png"),
        sharp(composedFinal)
          .jpeg({quality: 85})
          .toBuffer()
          .then((buf) => saveWithDownloadUrl(jpgPath, buf, "image/jpeg")),
      ]);

      await pageRef.update({
        image_url: pngUrl,
        jpeg_url: jpgUrl,
        raw_image_url: rawPngUrl,
        status: "completed",
        image_generation_qa_status: qaStatus,
        image_generation_qa_warning: qaWarning,
        image_generation_qa_attempts: qaAttempts.slice(-8),
        image_generation_required_visual_elements: requiredVisualElements,
        image_generation_fail_count: 0,
        last_image_generation_error: "",
        updated_at: FieldValue.serverTimestamp(),
      });

      await db.collection("_failed_image_generation").doc(failedImageDocId(storyId, pageId)).delete().catch(() => undefined);

      if (pageIndex === 0) {
        await db.collection("stories").doc(storyId).update({
          cover_image_url: jpgUrl,
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      logger.info(`[processPageImage] page ${pageIndex} done — storyId=${storyId}`);

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
        // Check if a PDF already exists — if so, this is an admin retry.
        // Don't auto-generate PDF; admin will trigger it manually via adminRetryPdf.
        const storySnap = await db.collection("stories").doc(storyId).get();
        const existingPdfUrl: string = storySnap.data()?.pdf_url ?? "";

        if (existingPdfUrl.length > 0) {
          logger.info(
            `[processPageImage] all pages done for story ${storyId} but PDF already exists — skipping auto PDF generation (admin retry)`
          );
        } else {
          await db.collection("stories").doc(storyId).update({
            status: "creating_pdf",
            updated_at: FieldValue.serverTimestamp(),
          });

          try {
            const queue = getFunctions().taskQueue("locations/asia-south1/functions/generateStorybookPdf");
            await queue.enqueue(
              {storyId, userId, totalPages: totalExpected},
              {dispatchDeadlineSeconds: 600}
            );
            logger.info(`[processPageImage] PDF task enqueued for story ${storyId}`);
          } catch (err) {
            logger.error(`[processPageImage] failed to enqueue PDF task for story ${storyId}`, err);
            notifySlackError("processPageImage:enqueuePdf", err, {storyId, userId});
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      notifySlackError("processPageImage", err, {storyId, pageId, pageIndex: String(pageIndex), userId});

      const failureCount = await db.runTransaction(async (tx) => {
        const snap = await tx.get(pageRef);
        const current = Number(snap.data()?.image_generation_fail_count ?? 0);
        const next = current + 1;
        tx.set(pageRef, {
          status: "failed",
          image_generation_qa_status: "error",
          image_generation_qa_warning: errorMessage,
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
