import * as logger from "firebase-functions/logger";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {runScenePipeline} from "./_generateScenesCore.js";
import {notifySlackError} from "./_slack.js";

export const generateScenes = onDocumentUpdated(
  {
    document: "stories/{storyId}",
    region: "asia-south1",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    if (before?.status === after.status || after.status !== "approved") return;

    const storyId = event.params.storyId;
    const storyRef = db.collection("stories").doc(storyId);

    logger.info(`[generateScenes] triggered storyId=${storyId}`);

    await storyRef.update({
      status: "generating_scenes",
      updated_at: FieldValue.serverTimestamp(),
    });

    try {
      await runScenePipeline(storyId);
    } catch (err) {
      logger.error(`[generateScenes] FAILED storyId=${storyId}`, err);
      notifySlackError("generateScenes", err, {storyId});
      await storyRef.update({
        status: "scenes_failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  }
);
