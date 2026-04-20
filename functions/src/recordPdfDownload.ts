import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";

/**
 * Records that a user has downloaded the PDF for a story.
 * Updates the story document with a `user_downloaded_pdf` timestamp.
 */
export const recordPdfDownload = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const {storyId} = request.data as {storyId: string};
  if (!storyId || typeof storyId !== "string") {
    throw new HttpsError("invalid-argument", "storyId is required.");
  }

  const userId = request.auth.uid;

  const storyRef = db.collection("stories").doc(storyId);
  const storySnap = await storyRef.get();

  if (!storySnap.exists) {
    throw new HttpsError("not-found", "Story not found.");
  }

  const storyData = storySnap.data() ?? {};
  if (storyData.user_id !== userId) {
    throw new HttpsError("permission-denied", "Not authorized to access this story.");
  }

  await storyRef.update({
    user_downloaded_pdf: FieldValue.serverTimestamp(),
  });

  logger.info(`[recordPdfDownload] storyId=${storyId} userId=${userId}`);
  return {success: true};
});
