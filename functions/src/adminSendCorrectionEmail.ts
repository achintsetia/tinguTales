import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";
import {sendCorrectedStorybookEmail} from "./emailService.js";

interface SendCorrectionEmailRequest {
  storyId: string;
}

export const adminSendCorrectionEmail = onCall<SendCorrectionEmailRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {storyId} = request.data;
    if (!storyId) throw new HttpsError("invalid-argument", "storyId required.");

    const storySnap = await db.collection("stories").doc(storyId).get();
    if (!storySnap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = storySnap.data() ?? {};

    const pdfUrl: string = story.pdf_url ?? "";
    if (!pdfUrl) throw new HttpsError("failed-precondition", "Story has no PDF yet. Generate the PDF first.");

    const userId: string = story.user_id ?? "";
    const authUser = await admin.auth().getUser(userId);
    const userEmail = authUser.email ?? "";
    if (!userEmail) throw new HttpsError("not-found", "No email address found for this user.");

    const coverPage = Array.isArray(story.pages) ?
      story.pages.find((p: {page_number: number}) => p.page_number === 0) :
      null;
    const coverImageUrl: string | null = coverPage?.jpeg_url || coverPage?.image_url || null;

    await sendCorrectedStorybookEmail({
      userEmail,
      storyTitle: story.title ?? "Your Storybook",
      childName: story.child_name ?? "your child",
      pdfUrl,
      storyId,
      coverImageUrl,
    });

    logger.info(`[adminSendCorrectionEmail] correction email sent for storyId=${storyId} to ${userEmail} by admin ${request.auth.uid}`);
    return {success: true, userEmail};
  }
);
