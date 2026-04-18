import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export {admin};
export const db = admin.firestore();
export const bucket = admin.storage().bucket();
