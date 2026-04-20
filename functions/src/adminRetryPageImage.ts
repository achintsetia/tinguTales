import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFunctions} from "firebase-admin/functions";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";

interface RetryPageRequest {
  storyId: string;
  pageId: string;
}

export const adminRetryPageImage = onCall<RetryPageRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {storyId, pageId} = request.data;
    if (!storyId || !pageId) throw new HttpsError("invalid-argument", "storyId and pageId required.");

    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = storySnap.data() ?? {};

    const pageRef = db.collection("stories").doc(storyId).collection("pages").doc(pageId);
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) throw new HttpsError("not-found", "Page not found.");
    const page = pageSnap.data() ?? {};

    const userId: string = story.user_id ?? "";
    const profileId: string = story.profile_id ?? "";
    const avatarUrl = `${userId}/${profileId}/avatar/avatar.jpg`;
    const characterCardJson = JSON.stringify(story.character_card ?? {});
    const supportingCharactersJson = JSON.stringify(story.supporting_characters ?? []);
    const totalPages: number = story.page_count ?? 8;

    const payload = {
      storyId,
      pageId,
      pageIndex: page.page as number,
      pageType: page.page_type as string,
      text: (page.text as string) ?? "",
      scenePrompt: (page.scene_prompt as string) ?? "",
      coverTitle: page.cover_title as string | undefined,
      coverSubtitle: page.cover_subtitle as string | undefined,
      userId,
      avatarUrl,
      characterCardJson,
      supportingCharactersJson,
      totalPages,
    };

    await pageRef.update({
      status: "pending",
      updated_at: FieldValue.serverTimestamp(),
    });

    const queue = getFunctions().taskQueue("locations/asia-south1/functions/processPageImage");
    await queue.enqueue(payload, {dispatchDeadlineSeconds: 600});

    logger.info(`[adminRetryPageImage] re-enqueued page ${page.page} of story ${storyId} by admin ${request.auth.uid}`);
    return {storyId, pageId, status: "queued"};
  }
);
