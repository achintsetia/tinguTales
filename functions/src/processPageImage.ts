import * as logger from "firebase-functions/logger";
import {onTaskDispatched} from "firebase-functions/v2/tasks";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import sharp from "sharp";
import {db, bucket} from "./admin.js";
import {recordTokenConsumption} from "./tokenConsumption.js";
import {
  PageImageTaskPayload,
  ImageQaInput,
  saveWithDownloadUrl,
  buildIllustrationPrompt,
  verifyGeneratedImageQuality,
  upsertFailedImageGeneration,
  failedImageDocId,
} from "./_pageImageCore.js";

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

    try {
      await pageRef.update({
        status: "processing",
        updated_at: FieldValue.serverTimestamp(),
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {timeout: 300000},
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

        const resized = await sharp(responseImage)
          .resize({width: 768, height: 1024, fit: "cover", position: "centre"})
          .png()
          .toBuffer();

        if (qaInput.requiredText.length > 0 || request.data.pageType === "cover") {
          const qaResult = await verifyGeneratedImageQuality(resized, qaInput, ai, qaModelName);
          if (!qaResult.passed) {
            logger.warn(
              `[processPageImage] QA FAILED for page ${pageIndex} (attempt ${genAttempt}) — ${qaResult.reason}`
            );
            if (genAttempt < MAX_GEN_ATTEMPTS) continue;
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

      const pngPath = `${userId}/${storyId}/pages/${pageIndex}/image.png`;
      const jpgPath = `${userId}/${storyId}/pages/${pageIndex}/image.jpg`;

      const [pngUrl, jpgUrl] = await Promise.all([
        saveWithDownloadUrl(pngPath, finalImage, "image/png"),
        sharp(finalImage)
          .jpeg({quality: 85})
          .toBuffer()
          .then((buf) => saveWithDownloadUrl(jpgPath, buf, "image/jpeg")),
      ]);

      await pageRef.update({
        image_url: pngUrl,
        jpeg_url: jpgUrl,
        status: "completed",
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
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

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
