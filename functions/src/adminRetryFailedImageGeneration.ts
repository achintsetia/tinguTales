import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";

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
