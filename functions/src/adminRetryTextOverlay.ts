import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import sharp from "sharp";
import {db, bucket} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";
import {saveWithDownloadUrl} from "./_pageImageCore.js";
import {renderDeterministicPageText} from "./_pageTextOverlay.js";
import {normalizeBackCoverText} from "./_backCoverLessonText.js";
import type {PageImageTaskPayload} from "./_pageImageCore.js";

interface RetryTextOverlayRequest {
  storyId: string;
  pageId: string;
}

export const adminRetryTextOverlay = onCall<RetryTextOverlayRequest>(
  {region: "asia-south1", timeoutSeconds: 120},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {storyId, pageId} = request.data;
    if (!storyId || !pageId) throw new HttpsError("invalid-argument", "storyId and pageId required.");

    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = storySnap.data() ?? {};

    const pageRef = db.collection("stories").doc(storyId).collection("pages").doc(pageId);
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) throw new HttpsError("not-found", "Page not found.");
    const page = pageSnap.data() ?? {};

    const userId: string = story.user_id ?? "";
    const pageIndex: number = page.page as number;
    const pageType: string = page.page_type as string;

    if (pageType !== "story") {
      throw new HttpsError("invalid-argument", "Text overlay retry is only supported for story pages.");
    }

    const rawText = (page.text as string) ?? "";
    const normalizedText = normalizeBackCoverText(
      rawText,
      (story.child_name_english as string) || (story.child_name as string) || "",
      String(story.moral ?? "")
    );

    if (!normalizedText.trim()) {
      throw new HttpsError("invalid-argument", "Page has no text to overlay.");
    }

    // Download the raw (pre-overlay) image from Storage
    const rawPngPath = `${userId}/${storyId}/pages/${pageIndex}/image_raw.png`;
    const rawFile = bucket.file(rawPngPath);
    const [rawExists] = await rawFile.exists();
    if (!rawExists) {
      throw new HttpsError(
        "not-found",
        "Raw image not found in storage. This page was generated before raw images were saved — retry full image generation instead."
      );
    }

    const [rawBuffer] = await rawFile.download();
    const rawImage = await sharp(rawBuffer).png().toBuffer();

    const payload: PageImageTaskPayload = {
      storyId,
      pageId,
      pageIndex,
      pageType,
      text: normalizedText,
      scenePrompt: (page.scene_prompt as string) ?? "",
      coverTitle: undefined,
      coverSubtitle: undefined,
      userId,
      avatarUrl: `${userId}/${story.profile_id ?? ""}/avatar/avatar.jpg`,
      characterCardJson: JSON.stringify(story.character_card ?? {}),
      commonContextEntitiesJson: JSON.stringify(story.common_context_entities ?? []),
      supportingCharactersJson: JSON.stringify(story.supporting_characters ?? []),
      totalPages: story.page_count ?? 8,
    };

    const overlayResult = await renderDeterministicPageText(rawImage, payload);
    const composedImage = overlayResult.imageBuffer;

    const pngPath = `${userId}/${storyId}/pages/${pageIndex}/image.png`;
    const jpgPath = `${userId}/${storyId}/pages/${pageIndex}/image.jpg`;

    const [pngUrl, jpgUrl] = await Promise.all([
      saveWithDownloadUrl(pngPath, composedImage, "image/png"),
      sharp(composedImage)
        .jpeg({quality: 85})
        .toBuffer()
        .then((buf) => saveWithDownloadUrl(jpgPath, buf, "image/jpeg")),
    ]);

    await pageRef.update({
      image_url: pngUrl,
      jpeg_url: jpgUrl,
      text_overlay_retry_requested_by: request.auth.uid,
      text_overlay_retry_requested_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    if (pageIndex === 0) {
      await db.collection("stories").doc(storyId).update({
        cover_image_url: jpgUrl,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    logger.info(
      `[adminRetryTextOverlay] overlay re-applied for page ${pageIndex} of story ${storyId} by admin ${request.auth.uid}`
    );

    return {storyId, pageId, pngUrl, jpgUrl};
  }
);
