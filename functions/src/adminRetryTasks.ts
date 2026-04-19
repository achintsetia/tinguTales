import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the calling user has admin privileges.
 * @param {string} uid - Firebase Auth UID to check.
 * @return {Promise<void>}
 */
async function assertAdmin(uid: string): Promise<void> {
  const userDoc = await db.collection("user_profile").doc(uid).get();
  if (!userDoc.exists || !userDoc.data()?.is_admin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// adminRetryPageImage — re-enqueue a stuck/failed page image task
// ─────────────────────────────────────────────────────────────────────────────

interface RetryPageRequest {
  storyId: string;
  pageId: string;
}

export const adminRetryPageImage = onCall<RetryPageRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
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
    const profileId: string = story.profile_id ?? "";
    const avatarUrl = `${userId}/${profileId}/avatar/avatar.jpg`;
    const characterCardJson = JSON.stringify(story.character_card ?? {});
    const supportingCharactersJson = JSON.stringify(story.supporting_characters ?? []);
    const totalPages: number = story.page_count ?? 8;

    const payload = {
      storyId,
      pageId,
      pageIndex: page.page as number,
      pageType: page.page_type as string,
      text: (page.text as string) ?? "",
      scenePrompt: (page.scene_prompt as string) ?? "",
      coverTitle: page.cover_title as string | undefined,
      coverSubtitle: page.cover_subtitle as string | undefined,
      userId,
      avatarUrl,
      characterCardJson,
      supportingCharactersJson,
      totalPages,
    };

    // Reset to pending so the admin sees it is queued
    await pageRef.update({
      status: "pending",
      updated_at: FieldValue.serverTimestamp(),
    });

    const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
    await queue.enqueue(payload, {dispatchDeadlineSeconds: 600});

    logger.info(`[adminRetryPageImage] re-enqueued page ${page.page} of story ${storyId} by admin ${request.auth.uid}`);
    return {storyId, pageId, status: "queued"};
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// adminRetryFailedImageGeneration — re-drive from _failed_image_generation
// ─────────────────────────────────────────────────────────────────────────────

interface RetryFailedImageGenerationRequest {
  failedDocId: string;
}

interface FailedImagePayload {
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
  supportingCharactersJson: string;
  totalPages: number;
}

export const adminRetryFailedImageGeneration = onCall<RetryFailedImageGenerationRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const failedDocId = String(request.data?.failedDocId || "").trim();
    if (!failedDocId) throw new HttpsError("invalid-argument", "failedDocId is required.");

    const failedRef = db.collection("_failed_image_generation").doc(failedDocId);
    const failedSnap = await failedRef.get();
    if (!failedSnap.exists) throw new HttpsError("not-found", "Failed image item not found.");

    const data = failedSnap.data() ?? {};
    const payload = data.payload as FailedImagePayload | undefined;
    if (!payload || !payload.storyId || !payload.pageId) {
      throw new HttpsError("failed-precondition", "Failed image item has no valid redrive payload.");
    }

    const pageRef = db.collection("stories").doc(payload.storyId).collection("pages").doc(payload.pageId);
    await pageRef.set({
      status: "pending",
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

    const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
    await queue.enqueue(payload, {dispatchDeadlineSeconds: 600});

    await failedRef.set({
      status: "retry_queued",
      last_retry_at: new Date().toISOString(),
      retried_by: request.auth.uid,
      retry_count: Number(data.retry_count ?? 0) + 1,
      server_updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

    logger.info(`[adminRetryFailedImageGeneration] re-enqueued failed item ${failedDocId} by admin ${request.auth.uid}`);
    return {
      failedDocId,
      storyId: payload.storyId,
      pageId: payload.pageId,
      status: "queued",
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// adminRetryPdf — re-enqueue PDF generation for a story
// ─────────────────────────────────────────────────────────────────────────────

interface RetryPdfRequest {
  storyId: string;
}

export const adminRetryPdf = onCall<RetryPdfRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {storyId} = request.data;
    if (!storyId) throw new HttpsError("invalid-argument", "storyId required.");

    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = storySnap.data() ?? {};

    const userId: string = story.user_id ?? "";
    const totalPages: number = story.page_count ?? 8;

    await db.collection("stories").doc(storyId).update({
      status: "creating_pdf",
      updated_at: FieldValue.serverTimestamp(),
    });

    const queue = getFunctions().taskQueue("locations/asia-south1/functions/generateStorybookPdf");
    await queue.enqueue({storyId, userId, totalPages}, {dispatchDeadlineSeconds: 600});

    logger.info(`[adminRetryPdf] re-enqueued PDF for story ${storyId} by admin ${request.auth.uid}`);
    return {storyId, status: "queued"};
  }
);
