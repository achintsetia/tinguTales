import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";
import {notifySlackError} from "./_slack.js";

interface DeleteUserUploadData {
  /** Storage path of the file to delete, e.g. "{userId}/uploads/photo.jpg" */
  path: string;
}

/**
 * Deletes a file from the user's uploads directory and clears the reference
 * from any child_profiles that point to it.
 */
export const deleteUserUpload = onCall(
  {timeoutSeconds: 60},
  async (request): Promise<{success: boolean}> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const {path} = request.data as DeleteUserUploadData;

    if (!path || typeof path !== "string") {
      throw new HttpsError("invalid-argument", "path is required.");
    }

    // Security: the file must be within this user's upload directory
    if (!path.startsWith(`${userId}/uploads/`)) {
      throw new HttpsError("permission-denied", "Not your file.");
    }

    logger.info(`[deleteUserUpload] deleting path=${path} userId=${userId}`);

    // Delete from Storage
    try {
      await bucket.file(path).delete();
    } catch (err: unknown) {
      const code = (err as {code?: number}).code;
      if (code === 404) {
        // File already gone — treat as success
        logger.warn(`[deleteUserUpload] file not found (already deleted): ${path}`);
      } else {
        logger.error("[deleteUserUpload] storage delete failed", err);
        notifySlackError("deleteUserUpload", err, {path});
        throw new HttpsError("internal", "Failed to delete file from storage.");
      }
    }

    // Clear references in child_profiles
    const snap = await db.collection("child_profiles")
      .where("user_id", "==", userId)
      .where("photo_url", "==", path)
      .get();

    if (!snap.empty) {
      await Promise.all(
        snap.docs.map((d) =>
          d.ref.update({
            photo_url: "",
            photo_download_url: "",
            avatar_status: "none",
          })
        )
      );
      logger.info(`[deleteUserUpload] cleared photo_url on ${snap.size} profile(s)`);
    }

    return {success: true};
  }
);
