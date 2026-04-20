import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {admin, db} from "./admin.js";
import {sendRefundRequestAdminEmail} from "./emailService.js";

interface SubmitRefundRequestData {
  storyId: string;
  issue: string;
}

/**
 * Saves a refund request to the `refund_requests` Firestore collection.
 */
export const submitRefundRequest = onCall<SubmitRefundRequestData>(
  {region: "asia-south1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const {storyId, issue} = request.data;

    if (!storyId || typeof storyId !== "string") {
      throw new HttpsError("invalid-argument", "storyId is required.");
    }
    if (!issue || typeof issue !== "string" || !issue.trim()) {
      throw new HttpsError("invalid-argument", "issue description is required.");
    }

    const userId = request.auth.uid;

    // Verify the story belongs to this user
    const storyRef = db.collection("stories").doc(storyId);
    const storySnap = await storyRef.get();
    if (!storySnap.exists) {
      throw new HttpsError("not-found", "Story not found.");
    }
    const storyData = storySnap.data() ?? {};
    if (storyData.user_id !== userId) {
      throw new HttpsError("permission-denied", "Not authorized to access this story.");
    }

    await db.collection("refund_requests").add({
      story_id: storyId,
      user_id: userId,
      story_title: storyData.title ?? "",
      issue: issue.trim(),
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
    });

    // Resolve user email for admin notification (best-effort)
    let userEmail = "";
    try {
      const authUser = await admin.auth().getUser(userId);
      userEmail = authUser.email ?? "";
    } catch {
      // non-fatal
    }

    await sendRefundRequestAdminEmail({
      userId,
      userEmail,
      storyId,
      storyTitle: storyData.title ?? "",
      issue: issue.trim(),
    });

    logger.info(`[submitRefundRequest] storyId=${storyId} userId=${userId}`);
    return {success: true};
  }
);
