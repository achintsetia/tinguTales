import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {bucket, db} from "./admin.js";
import {notifySlackError} from "./_slack.js";

interface CleanupStoryImagesData {
  storyId: string;
}

/**
 * Deletes all page image files (PNG, JPG, raw PNG) from Storage after the user
 * confirms the storybook looks good. The PDF at {userId}/{storyId}/storybook.pdf
 * is intentionally preserved.
 */
export const cleanupStoryImages = onCall<CleanupStoryImagesData>(
  {region: "asia-south1", timeoutSeconds: 120},
  async (request): Promise<{deletedCount: number}> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const {storyId} = request.data;

    if (!storyId || typeof storyId !== "string") {
      throw new HttpsError("invalid-argument", "storyId is required.");
    }

    const storyRef = db.collection("stories").doc(storyId);
    const storySnap = await storyRef.get();

    if (!storySnap.exists) {
      throw new HttpsError("not-found", "Story not found.");
    }

    const story = storySnap.data();
    if (!story) throw new HttpsError("not-found", "Story data missing.");
    if (story.user_id !== userId) {
      throw new HttpsError("permission-denied", "Story does not belong to this user.");
    }

    // Delete only files under the pages/ prefix — PDF at storybook.pdf is untouched
    const pagesPrefix = `${userId}/${storyId}/pages/`;
    let deletedCount = 0;

    try {
      const [files] = await bucket.getFiles({prefix: pagesPrefix});
      if (files.length > 0) {
        await Promise.all(
          files.map(async (file) => {
            try {
              await file.delete();
              deletedCount++;
            } catch (err: unknown) {
              const code = (err as {code?: number}).code;
              if (code !== 404) {
                logger.warn(`[cleanupStoryImages] could not delete ${file.name}: ${err}`);
              }
            }
          })
        );
      }
    } catch (err) {
      logger.warn(`[cleanupStoryImages] error listing files for prefix ${pagesPrefix}: ${err}`);
      notifySlackError("cleanupStoryImages", err, {storyId, userId});
      throw new HttpsError("internal", "Failed to list storage files.");
    }

    await storyRef.update({
      images_cleaned_up_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info(
      `[cleanupStoryImages] deleted ${deletedCount} image files for storyId=${storyId} userId=${userId}`
    );

    return {deletedCount};
  }
);
