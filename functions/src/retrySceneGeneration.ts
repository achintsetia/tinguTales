import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {runScenePipeline} from "./_generateScenesCore.js";

export const retrySceneGeneration = onCall<{storyId: string}>(
  {region: "asia-south1", timeoutSeconds: 300, memory: "512MiB"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const userId = request.auth.uid;
    const {storyId} = request.data;

    if (!storyId) throw new HttpsError("invalid-argument", "storyId is required.");

    const storyRef = db.collection("stories").doc(storyId);
    const snap = await storyRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = snap.data() ?? {};
    if (story["user_id"] !== userId) throw new HttpsError("permission-denied", "Not your story.");
    if (story["status"] !== "scenes_failed") {
      throw new HttpsError(
        "failed-precondition",
        `Story must be in scenes_failed state (current: ${story["status"]}).`
      );
    }

    await storyRef.update({
      status: "generating_scenes",
      error_message: null,
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info(`[retrySceneGeneration] storyId=${storyId} userId=${userId}`);

    try {
      await runScenePipeline(storyId);
    } catch (err) {
      await storyRef.update({
        status: "scenes_failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "Scene generation failed. Please try again.");
    }

    return {storyId, status: "generating_images"};
  }
);
