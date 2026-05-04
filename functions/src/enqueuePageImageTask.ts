import * as logger from "firebase-functions/logger";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getFunctions} from "firebase-admin/functions";
import {db} from "./admin.js";
import {PageImageTaskPayload} from "./_pageImageCore.js";
import {notifySlackError} from "./_slack.js";

export const enqueuePageImageTask = onDocumentCreated(
  {
    document: "stories/{storyId}/pages/{pageId}",
    region: "asia-south1",
    timeoutSeconds: 60,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== "pending") return;

    const {storyId, pageId} = event.params;

    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) {
      logger.warn(`[enqueuePageImageTask] story ${storyId} not found — skipping`);
      return;
    }
    const story = storySnap.data() ?? {};
    const userId: string = story.user_id ?? "";
    const profileId: string = story.profile_id ?? "";
    const avatarUrl = `${userId}/${profileId}/avatar/avatar.jpg`;
    const characterCardJson = JSON.stringify(story.character_card ?? {});
    const commonContextEntitiesJson = JSON.stringify(story.common_context_entities ?? []);
    const supportingCharactersJson = JSON.stringify(story.supporting_characters ?? []);
    const totalPages: number = story.page_count ?? 8;
    const pageType = data.page_type as string;
    const rawText = (data.text as string) ?? "";
    const commonContextEntities: Array<{name?: string; category?: string}> =
      Array.isArray(story.common_context_entities) ? story.common_context_entities : [];

    logger.info("[enqueuePageImageTask] loaded story context", {
      storyId,
      pageId,
      page: data.page,
      commonContextEntitiesCount: commonContextEntities.length,
      commonContextEntityNames: commonContextEntities
        .map((entity) => entity.name)
        .filter(Boolean)
        .slice(0, 10),
      supportingCharactersCount: Array.isArray(story.supporting_characters) ? story.supporting_characters.length : 0,
    });

    const payload: PageImageTaskPayload = {
      storyId,
      pageId,
      pageIndex: data.page as number,
      pageType,
      text: rawText,
      scenePrompt: data.scene_prompt as string,
      coverTitle: data.cover_title,
      coverSubtitle: data.cover_subtitle,
      userId,
      avatarUrl,
      characterCardJson,
      commonContextEntitiesJson,
      supportingCharactersJson,
      totalPages,
    };

    try {
      const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
      await queue.enqueue(payload, {
        dispatchDeadlineSeconds: 600,
        uri: undefined,
      });
      logger.info(`[enqueuePageImageTask] enqueued page ${data.page} for story ${storyId}`);
    } catch (err) {
      logger.error(`[enqueuePageImageTask] failed to enqueue page ${data.page}`, err);
      notifySlackError("enqueuePageImageTask", err, {storyId, pageId, page: String(data.page)});
    }
  }
);
