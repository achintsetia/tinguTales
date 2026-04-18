import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {db} from "./admin.js";
import {generateAvatar} from "./avatarGeneration.js";

export const generateAvatarOnProfileCreate = onDocumentCreated(
  {
    document: "child_profiles/{profileId}",
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const profileId = data.profile_id as string;
    const userId = data.user_id as string;
    const name = data.name as string;
    const photoUrl = data.photo_url as string;

    if (!photoUrl) {
      logger.warn(`Profile ${profileId} has no photo — skipping avatar generation`);
      return;
    }

    logger.info(`Generating avatar for profile ${profileId} (${name})`);

    try {
      await generateAvatar(profileId, userId, name, photoUrl);
    } catch (err) {
      logger.error(`Avatar generation failed for profile ${profileId}:`, err);
      await db.collection("child_profiles").doc(profileId).update({
        avatar_status: "failed",
      });
    }
  }
);
