import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";


interface ApproveStoryDraftRequest {
  storyId: string;
  /** Final page texts after user edits */
  pagesText: {page: number; text: string; page_type?: string; cover_title?: string; cover_subtitle?: string}[];
}

/**
 * Saves the user-reviewed page texts back to the story document and
 * marks it as approved, ready for image generation.
 */
export const approveStoryDraft = onCall<ApproveStoryDraftRequest>(
  {region: "asia-south1", timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const userId = request.auth.uid;

    const {storyId, pagesText} = request.data;

    if (!storyId) throw new HttpsError("invalid-argument", "storyId is required.");
    if (!Array.isArray(pagesText) || pagesText.length === 0) {
      throw new HttpsError("invalid-argument", "pagesText must be a non-empty array.");
    }

    const storyRef = db.collection("stories").doc(storyId);
    const storySnap = await storyRef.get();

    if (!storySnap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = storySnap.data();
    if (!story) throw new HttpsError("not-found", "Story data missing.");
    if (story.user_id !== userId) throw new HttpsError("permission-denied", "Story does not belong to this user.");
    if (story.status !== "draft_ready") {
      throw new HttpsError("failed-precondition", `Story must be in draft_ready state (current: ${story.status}).`);
    }

    // Sync user-edited title/subtitle from cover page back to story-level fields
    const coverPage = pagesText.find((p) => p.page === 0);
    const titleUpdate: Record<string, unknown> = {};
    if (coverPage?.cover_title) titleUpdate.title = coverPage.cover_title;
    if (coverPage?.cover_subtitle !== undefined) titleUpdate.subtitle = coverPage.cover_subtitle;

    await storyRef.update({
      draft_pages: pagesText,
      ...titleUpdate,
      status: "approved",
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info(`[approveStoryDraft] storyId=${storyId} approved by userId=${userId}`);

    return {storyId, status: "approved"};
  }
);
