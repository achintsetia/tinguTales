import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {admin, db} from "./admin.js";
import {v4 as uuidv4} from "uuid";

interface CreateChildProfileData {
  name: string;
  age: number;
  gender: string;
  /** GCS storage path: {userId}/uploads/{filename} — used by Cloud Functions to download the photo */
  photo_storage_path: string;
  /** Firebase download URL returned by getDownloadURL() after client upload — used for direct display */
  photo_download_url?: string;
}

export const createChildProfile = onCall(
  {timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const {
      name, age, gender,
      photo_storage_path: photoStoragePath,
      photo_download_url: photoDownloadUrl,
    } = request.data as CreateChildProfileData;

    if (!name) {
      throw new HttpsError("invalid-argument", "name is required.");
    }

    const profileId = `profile_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    const profile = {
      profile_id: profileId,
      user_id: userId,
      name,
      age: Number(age) || 0,
      gender: gender ?? "",
      photo_url: photoStoragePath ?? "",
      photo_download_url: photoDownloadUrl ?? "",
      avatar_url: "",
      avatar_jpeg_url: "",
      // "pending" → trigger picks it up → "generating" → "completed" | "failed"
      avatar_status: photoStoragePath ? "pending" : "none",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await db.collection("child_profiles").doc(profileId).set(profile);
    } catch (err) {
      logger.error("createChildProfile failed", err);
      throw new HttpsError("internal", "Failed to create profile.");
    }

    return {
      profile_id: profileId,
      user_id: userId,
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      photo_url: profile.photo_url,
      photo_download_url: profile.photo_download_url,
      avatar_url: "",
      avatar_jpeg_url: "",
      avatar_status: profile.avatar_status,
    };
  }
);
