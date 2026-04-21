import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";

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
    await queue.enqueue({storyId, userId, totalPages, skipEmail: true}, {dispatchDeadlineSeconds: 600});

    logger.info(`[adminRetryPdf] re-enqueued PDF for story ${storyId} by admin ${request.auth.uid}`);
    return {storyId, status: "queued"};
  }
);
