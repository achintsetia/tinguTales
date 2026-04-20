import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";

/**
 * Syncs photo_download_url on child profiles where photo_download_url is empty
 * but a matching file exists in Storage (repair helper).
 */
export const syncUploadUrls = onCall(
  {timeoutSeconds: 60},
  async (request): Promise<{synced: number}> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const prefix = `${userId}/uploads/`;

    const [files] = await bucket.getFiles({prefix});

    // Build a map: storagePath -> downloadUrl
    const urlMap: Record<string, string> = {};
    await Promise.all(
      files.map(async (file) => {
        try {
          const [metadata] = await file.getMetadata();
          const token = metadata.metadata?.firebaseStorageDownloadTokens as string | undefined;
          if (token) {
            const enc = encodeURIComponent(file.name);
            urlMap[file.name] =
              `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${enc}?alt=media&token=${token}`;
          }
        } catch {/* skip */}
      })
    );

    // Update profiles that are missing photo_download_url
    const snap = await db.collection("child_profiles")
      .where("user_id", "==", userId)
      .where("photo_download_url", "==", "")
      .get();

    let synced = 0;
    await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const url = urlMap[data.photo_url as string];
        if (url) {
          await docSnap.ref.update({photo_download_url: url});
          synced++;
        }
      })
    );

    logger.info(`[syncUploadUrls] synced ${synced} profiles for userId=${userId}`);
    return {synced};
  }
);
