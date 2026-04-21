import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";

interface UpdatePageTextRequest {
  storyId: string;
  pageId: string;
  text: string;
  /** For page 0 (cover) only */
  coverTitle?: string;
  /** For page 0 (cover) only */
  coverSubtitle?: string;
}

export const adminUpdatePageText = onCall<UpdatePageTextRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {storyId, pageId, text, coverTitle, coverSubtitle} = request.data;
    if (!storyId || !pageId) throw new HttpsError("invalid-argument", "storyId and pageId required.");
    if (typeof text !== "string") throw new HttpsError("invalid-argument", "text must be a string.");

    const pageRef = db.collection("stories").doc(storyId).collection("pages").doc(pageId);
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) throw new HttpsError("not-found", "Page not found.");

    const update: Record<string, unknown> = {
      text,
      updated_at: FieldValue.serverTimestamp(),
    };

    if (coverTitle !== undefined) update.cover_title = coverTitle;
    if (coverSubtitle !== undefined) update.cover_subtitle = coverSubtitle;

    await pageRef.update(update);

    logger.info(
      `[adminUpdatePageText] storyId=${storyId} pageId=${pageId} updated by admin ${request.auth.uid}`
    );
    return {success: true};
  }
);
