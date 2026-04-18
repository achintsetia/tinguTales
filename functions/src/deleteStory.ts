import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";

interface DeleteStoryData {
  storyId: string;
}

/**
 * Deletes a story document, its pages subcollection, and all associated
 * Storage files (page images and PDF).
 */
export const deleteStory = onCall<DeleteStoryData>(
  {region: "asia-south1", timeoutSeconds: 120},
  async (request): Promise<{success: boolean}> => {
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
    if (!story) {
      throw new HttpsError("not-found", "Story data missing.");
    }
    if (story.user_id !== userId) {
      throw new HttpsError("permission-denied", "Story does not belong to this user.");
    }

    logger.info(`[deleteStory] deleting storyId=${storyId} userId=${userId}`);

    // 1. Delete all Storage files under {userId}/{storyId}/ using prefix deletion
    const prefix = `${userId}/${storyId}/`;
    try {
      const [files] = await bucket.getFiles({prefix});
      if (files.length > 0) {
        await Promise.all(
          files.map(async (file) => {
            try {
              await file.delete();
              logger.info(`[deleteStory] deleted storage file: ${file.name}`);
            } catch (err: unknown) {
              const code = (err as {code?: number}).code;
              if (code !== 404) {
                logger.warn(`[deleteStory] could not delete ${file.name}: ${err}`);
              }
            }
          })
        );
      }
    } catch (err) {
      logger.warn(`[deleteStory] error listing storage files for prefix ${prefix}: ${err}`);
    }

    // 2. Delete pages subcollection documents in batches
    let pagesDeleted = 0;
    const pagesBatchSize = 100;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    let hasMore = true;
    while (hasMore) {
      let query = storyRef.collection("pages").limit(pagesBatchSize);
      if (lastDoc) query = query.startAfter(lastDoc);

      const pagesSnap = await query.get();
      if (pagesSnap.empty) break;

      const batch = db.batch();
      pagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      pagesDeleted += pagesSnap.size;
      lastDoc = pagesSnap.docs[pagesSnap.docs.length - 1];

      if (pagesSnap.size < pagesBatchSize) hasMore = false;
    }

    logger.info(`[deleteStory] deleted ${pagesDeleted} page documents for storyId=${storyId}`);

    // 3. Delete the story document itself
    await storyRef.delete();
    logger.info(`[deleteStory] story document deleted: ${storyId}`);

    return {success: true};
  }
);
