import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {db} from "./admin.js";
import {generateAvatar} from "./avatarGeneration.js";

interface RetryAvatarData {
  profileId: string;
}

export const retryAvatarGeneration = onCall(
  {timeoutSeconds: 120, memory: "1GiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const {profileId} = request.data as RetryAvatarData;

    if (!profileId) {
      throw new HttpsError("invalid-argument", "profileId is required.");
    }

    const doc = await db.collection("child_profiles").doc(profileId).get();
    if (!doc.exists) {
      throw new HttpsError("not-found", "Profile not found.");
    }

    const data = doc.data() ?? {};
    if (data.user_id !== userId) {
      throw new HttpsError("permission-denied", "Not your profile.");
    }

    if (!data.photo_url) {
      throw new HttpsError("failed-precondition", "Profile has no photo to generate avatar from.");
    }

    logger.info(`Retrying avatar for profile ${profileId} (${data.name})`);

    try {
      await generateAvatar(profileId, userId, data.name as string, data.photo_url as string);
    } catch (err) {
      logger.error(`Avatar retry failed for profile ${profileId}:`, err);
      await db.collection("child_profiles").doc(profileId).update({
        avatar_status: "failed",
      });
      throw new HttpsError("internal", "Avatar generation failed. Please try again.");
    }

    return {success: true};
  }
);
