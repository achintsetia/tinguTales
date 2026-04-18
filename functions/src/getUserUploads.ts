import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";

export interface UploadItem {
  path: string;
  filename: string;
  downloadUrl: string;
  contentType: string;
  size: number | string;
  updatedAt: string;
}

/**
 * Lists all files the user has uploaded to {userId}/uploads/ in Firebase Storage
 * and returns their download URLs.
 */
export const getUserUploads = onCall(
  {timeoutSeconds: 60},
  async (request): Promise<{uploads: UploadItem[]}> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const prefix = `${userId}/uploads/`;

    logger.info(`[getUserUploads] listing files for userId=${userId} prefix=${prefix}`);

    let files;
    try {
      [files] = await bucket.getFiles({prefix});
    } catch (err) {
      logger.error("[getUserUploads] failed to list files", err);
      throw new HttpsError("internal", "Failed to list uploads.");
    }

    const uploads = await Promise.all(
      files.map(async (file): Promise<UploadItem | null> => {
        try {
          const [metadata] = await file.getMetadata();
          const token = metadata.metadata?.firebaseStorageDownloadTokens as string | undefined;

          let downloadUrl = "";
          if (token) {
            const encodedPath = encodeURIComponent(file.name);
            downloadUrl =
              `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
          } else {
            // Generate a 7-day signed URL as fallback (token-less files)
            const [signedUrl] = await file.getSignedUrl({
              action: "read",
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
            });
            downloadUrl = signedUrl;
          }

          return {
            path: file.name,
            filename: (file.name.split("/").pop() ?? file.name),
            downloadUrl,
            contentType: (metadata.contentType as string) ?? "image/jpeg",
            size: (metadata.size as string | number) ?? 0,
            updatedAt: (metadata.updated as string) ?? "",
          };
        } catch (err) {
          logger.warn(`[getUserUploads] skipping file ${file.name}:`, err);
          return null;
        }
      })
    );

    const result = uploads.filter((u): u is UploadItem => u !== null);
    logger.info(`[getUserUploads] returning ${result.length} uploads for userId=${userId}`);
    return {uploads: result};
  }
);

/**
 * Also exposes a helper to sync photo_download_url on any child_profiles where
 * the photo_url matches but photo_download_url is empty (repair helper).
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
