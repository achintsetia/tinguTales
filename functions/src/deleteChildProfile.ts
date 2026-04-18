import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {bucket, db} from "./admin.js";

interface DeleteChildProfileData {
  profileId: string;
}

/**
 * Deletes a child profile document and all associated Storage files
 * (upload photo, avatar PNG, avatar JPEG).
 */
export const deleteChildProfile = onCall<DeleteChildProfileData>(
  {region: "asia-south1", timeoutSeconds: 60},
  async (request): Promise<{success: boolean}> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const {profileId} = request.data;

    if (!profileId || typeof profileId !== "string") {
      throw new HttpsError("invalid-argument", "profileId is required.");
    }

    const profileRef = db.collection("child_profiles").doc(profileId);
    const profileSnap = await profileRef.get();

    if (!profileSnap.exists) {
      throw new HttpsError("not-found", "Profile not found.");
    }

    const profile = profileSnap.data();
    if (!profile) {
      throw new HttpsError("not-found", "Profile data missing.");
    }
    if (profile.user_id !== userId) {
      throw new HttpsError("permission-denied", "Profile does not belong to this user.");
    }

    logger.info(`[deleteChildProfile] deleting profileId=${profileId} userId=${userId}`);

    // Collect all Storage paths to delete
    const storagePaths: string[] = [
      `${userId}/${profileId}/avatar/avatar.png`,
      `${userId}/${profileId}/avatar/avatar.jpg`,
    ];

    // Also delete the original upload photo if stored under this user's uploads
    const photoUrl: string = (profile.photo_url as string) ?? "";
    if (photoUrl && photoUrl.startsWith(`${userId}/uploads/`)) {
      storagePaths.push(photoUrl);
    }

    // Delete storage files in parallel — ignore 404s (may never have been created)
    await Promise.all(
      storagePaths.map(async (path) => {
        try {
          await bucket.file(path).delete();
          logger.info(`[deleteChildProfile] deleted storage file: ${path}`);
        } catch (err: unknown) {
          const code = (err as {code?: number}).code;
          if (code !== 404) {
            logger.warn(`[deleteChildProfile] could not delete ${path}: ${err}`);
          }
        }
      })
    );

    // Delete Firestore profile document last
    await profileRef.delete();
    logger.info(`[deleteChildProfile] profile document deleted: ${profileId}`);

    return {success: true};
  }
);
