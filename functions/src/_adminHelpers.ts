import {HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin.js";

/**
 * Verify the calling user has admin privileges.
 * @param {string} uid - Firebase Auth UID to check.
 * @return {Promise<void>}
 */
export async function assertAdmin(uid: string): Promise<void> {
  const userDoc = await db.collection("user_profile").doc(uid).get();
  if (!userDoc.exists || !userDoc.data()?.is_admin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
}
