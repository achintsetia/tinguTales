import { logEvent } from "firebase/analytics";
import { analytics } from "../firebase";

function track(name: string, params?: Record<string, unknown>) {
  if (!analytics) return;
  try {
    logEvent(analytics, name, params as Record<string, string | number | boolean>);
  } catch {
    // Never let analytics errors surface to the user
  }
}

export const Analytics = {
  // Auth
  login: (method: "google" | "email") => track("login", { method }),
  signUp: (method: "google" | "email") => track("sign_up", { method }),

  // Landing page
  getStartedClicked: () => track("get_started_clicked"),
  contactFormSubmitted: () => track("contact_form_submitted"),

  // Story creation wizard
  profileCreated: () => track("profile_created"),
  wizardStepAdvanced: (step: number) => track("wizard_step_advanced", { step }),
  storyDraftGenerated: (params: {
    pageCount: number;
    language: string;
    templateId?: string | null;
  }) =>
    track("story_draft_generated", {
      page_count: params.pageCount,
      language: params.language,
      ...(params.templateId ? { template_id: params.templateId } : {}),
    }),
  storyApproved: (storyId: string) =>
    track("story_approved", { story_id: storyId }),

  // Payments
  couponApplied: (discountPercent: number) =>
    track("coupon_applied", { discount_percent: discountPercent }),
  checkoutInitiated: (amount: number, currency: string) =>
    track("begin_checkout", { value: amount, currency }),
  paymentCompleted: (amount: number, currency: string, storyId: string) =>
    track("purchase", { value: amount, currency, transaction_id: storyId }),
  paymentFailed: (reason: string) => track("payment_failed", { reason }),
  paymentDismissed: () => track("payment_dismissed"),

  // Story viewer
  storyViewed: (storyId: string) => track("story_viewed", { story_id: storyId }),
  pdfDownloaded: (storyId: string) =>
    track("pdf_downloaded", { story_id: storyId }),
};
