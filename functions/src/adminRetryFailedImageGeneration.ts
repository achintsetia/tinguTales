import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";
import {normalizeBackCoverText} from "./_backCoverLessonText.js";

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
  commonContextEntitiesJson?: string;
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

    const storySnap = await db.collection("stories").doc(payload.storyId).get();
    const story = storySnap.data() ?? {};
    const normalizedText = payload.pageType === "back_cover" ?
      normalizeBackCoverText(
        payload.text ?? "",
        (story.child_name_english as string) || (story.child_name as string) || "",
        String(story.moral ?? "")
      ) :
      payload.text;
    const retryPayload = {...payload, text: normalizedText};

    const pageRef = db.collection("stories").doc(payload.storyId).collection("pages").doc(payload.pageId);
    await pageRef.set({
      image_url: null,
      jpeg_url: null,
      raw_image_url: null,
      text: normalizedText,
      status: "pending",
      image_generation_qa_status: "retry_queued",
      image_generation_qa_warning: "",
      image_generation_qa_attempts: [],
      image_generation_required_visual_elements: [],
      image_generation_retry_requested_by: request.auth.uid,
      image_generation_retry_requested_at: FieldValue.serverTimestamp(),
      last_image_generation_error: "",
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

    const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
    await queue.enqueue(retryPayload, {dispatchDeadlineSeconds: 600});

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
