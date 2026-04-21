import {Resend} from "resend";
import * as logger from "firebase-functions/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Client — lazily initialised so the module can be imported without crashing
// when RESEND_API_KEY is not set in local dev.
// ─────────────────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;

/**
 * Returns the lazily-initialised Resend client, creating it on first call.
 * @return {Resend} The Resend email client.
 */
function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY env variable is not set.");
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// The verified "from" address configured in your Resend domain.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@tingutales.com";

// Admin inbox that receives operational alerts.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Low-level helper that delivers a single email via Resend.
 * @param {object} opts - Email options (to, subject, html).
 * @return {Promise<void>} Resolves when the send attempt completes.
 */
async function send(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (!opts.to || (Array.isArray(opts.to) && opts.to.length === 0)) {
    logger.warn("[emailService] send() called with empty recipient — skipping");
    return;
  }
  try {
    const {error} = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      logger.error("[emailService] Resend error", error);
    } else {
      logger.info("[emailService] email sent", {to: opts.to, subject: opts.subject});
    }
  } catch (err) {
    logger.error("[emailService] unexpected error sending email", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional email templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acknowledge the user's refund request with next-steps messaging.
 * @param {object} opts - The function options.
 */
export async function sendRefundAcknowledgmentEmail(opts: {
  userEmail: string;
  storyTitle: string;
  childName: string;
  storyId: string;
}): Promise<void> {
  if (!opts.userEmail) {
    logger.warn("[emailService] sendRefundAcknowledgmentEmail called with empty userEmail — skipping");
    return;
  }

  const {userEmail, storyTitle, childName, storyId} = opts;
  const viewerUrl = `https://app.tingutales.com/story/${storyId}`;

  await send({
    to: userEmail,
    subject: `We've received your request for "${storyTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#FF9F1C">We've received your request 📬</h2>
        <p>Hi there,</p>
        <p>
          Thanks for reaching out about <strong>${escapeHtml(storyTitle)}</strong> for
          ${escapeHtml(childName)}. Our team will review your request and, only if defects are
          found, will process a refund for you.
        </p>
        <p>
          Since the pages are AI-generated, we understand that AI can sometimes make mistakes.
          If there are any defective pages, we will correct them and resend you an updated
          storybook link — so your little one gets the perfect story they deserve!
        </p>
        <p style="margin-top:24px">
          In the meantime, you can still view your storybook online:
        </p>
        <div style="text-align:center;margin:24px 0">
          <a href="${viewerUrl}"
             style="background:#FF9F1C;color:#1E1B4B;font-weight:bold;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">
            View Storybook →
          </a>
        </div>
        <hr style="border:0;border-top:1px solid #F3E8FF;margin:28px 0" />
        <p style="color:#888;font-size:12px;text-align:center">
          TinguTales — personalised storybooks for your little one.<br/>
          If you didn't submit this request, please ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Notify the admin when a user submits a refund request.
 * @param {object} opts - The function options.
 */
export async function sendRefundRequestAdminEmail(opts: {
  userId: string;
  userEmail: string;
  storyId: string;
  storyTitle: string;
  issue: string;
}): Promise<void> {
  if (!ADMIN_EMAIL) {
    logger.warn("[emailService] ADMIN_EMAIL not set — skipping refund admin notification");
    return;
  }

  const {userId, userEmail, storyId, storyTitle, issue} = opts;

  await send({
    to: ADMIN_EMAIL,
    subject: `[TinguTales] Refund Request — "${storyTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#E76F51">New Refund Request</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 0;font-weight:bold;width:140px">Story</td><td>${escapeHtml(storyTitle)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">Story ID</td><td><code>${escapeHtml(storyId)}</code></td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">User</td><td>${escapeHtml(userEmail || userId)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:bold">User ID</td><td><code>${escapeHtml(userId)}</code></td></tr>
        </table>
        <h3 style="margin-top:20px">Issue Description</h3>
        <div style="background:#FFF8F0;border-left:4px solid #E76F51;padding:12px 16px;border-radius:4px;white-space:pre-wrap">${escapeHtml(issue)}</div>
        <p style="margin-top:24px;color:#888;font-size:12px">
          Review this request in the Admin Panel → Refund Requests tab.
        </p>
      </div>
    `,
  });
}

/**
 * Notify the user when their storybook PDF is ready for download.
 * @param {object} opts - The function options.
 */
export async function sendPdfReadyEmail(opts: {
  userEmail: string;
  storyTitle: string;
  childName: string;
  pdfUrl: string;
  storyId: string;
  coverImageUrl?: string | null;
}): Promise<void> {
  if (!opts.userEmail) {
    logger.warn("[emailService] sendPdfReadyEmail called with empty userEmail — skipping");
    return;
  }

  const {userEmail, storyTitle, childName, storyId, coverImageUrl} = opts;
  const viewerUrl = `https://tingutales.com/story/${storyId}`;
  const coverImgHtml = coverImageUrl ?
    `<div style="text-align:center;margin:20px 0">
        <img src="${coverImageUrl}" alt="Story cover" width="260"
             style="border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.12);max-width:100%" />
       </div>` :
    "";

  await send({
    to: userEmail,
    subject: "Your TinguTales storybook is ready! 📖",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#FF9F1C">🎉 ${escapeHtml(storyTitle)} is ready!</h2>
        <p>Hi there,</p>
        <p>
          ${escapeHtml(childName)}'s personalised storybook has been created and is ready to read!
        </p>
        ${coverImgHtml}
        <div style="text-align:center;margin:28px 0">
          <a href="${viewerUrl}"
             style="background:#FF9F1C;color:#1E1B4B;font-weight:bold;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">
            View Storybook →
          </a>
        </div>
        <hr style="border:0;border-top:1px solid #F3E8FF;margin:28px 0" />
        <p style="color:#888;font-size:12px;text-align:center">
          TinguTales — personalised storybooks for your little one.<br/>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Notify the user that their storybook defect has been corrected and a new PDF is ready.
 * @param {object} opts - The function options.
 */
export async function sendCorrectedStorybookEmail(opts: {
  userEmail: string;
  storyTitle: string;
  childName: string;
  pdfUrl: string;
  storyId: string;
  coverImageUrl?: string | null;
}): Promise<void> {
  if (!opts.userEmail) {
    logger.warn("[emailService] sendCorrectedStorybookEmail called with empty userEmail — skipping");
    return;
  }

  const {userEmail, storyTitle, childName, storyId, coverImageUrl} = opts;
  const viewerUrl = `https://tingutales.com/story/${storyId}`;
  const coverImgHtml = coverImageUrl ?
    `<div style="text-align:center;margin:20px 0">
        <img src="${coverImageUrl}" alt="Story cover" width="260"
             style="border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.12);max-width:100%" />
       </div>` :
    "";

  await send({
    to: userEmail,
    subject: "Your updated TinguTales storybook is ready! 📖",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#2A9D8F">✅ ${escapeHtml(storyTitle)} has been updated!</h2>
        <p>Hi there,</p>
        <p>
          We have reviewed your storybook and corrected the defect you reported.
          ${escapeHtml(childName)}'s updated storybook is now ready to download!
        </p>
        ${coverImgHtml}
        <div style="text-align:center;margin:28px 0">
          <a href="${viewerUrl}"
             style="background:#2A9D8F;color:#fff;font-weight:bold;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">
            View Updated Storybook →
          </a>
        </div>
        <p style="color:#555;font-size:13px">
          We apologise for any inconvenience and hope you and ${escapeHtml(childName)} enjoy the story!
        </p>
        <hr style="border:0;border-top:1px solid #F3E8FF;margin:28px 0" />
        <p style="color:#888;font-size:12px;text-align:center">
          TinguTales — personalised storybooks for your little one.<br/>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Notify the user that their refund has been processed.
 * @param {object} opts - The function options.
 */
export async function sendRefundIssuedEmail(opts: {
  userEmail: string;
  storyTitle: string;
  childName: string;
  amountInr: number;
  razorpayRefundId: string;
}): Promise<void> {
  if (!opts.userEmail) {
    logger.warn("[emailService] sendRefundIssuedEmail called with empty userEmail — skipping");
    return;
  }

  const {userEmail, storyTitle, childName, amountInr, razorpayRefundId} = opts;

  await send({
    to: userEmail,
    subject: "Your TinguTales refund has been processed ✅",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#2A9D8F">✅ Refund Processed</h2>
        <p>Hi there,</p>
        <p>
          We have processed your refund for <strong>${escapeHtml(storyTitle)}</strong>
          (${escapeHtml(childName)}'s storybook).
        </p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 12px;border:1px solid #F3E8FF;color:#1E1B4B/60;font-size:13px">Amount</td>
            <td style="padding:8px 12px;border:1px solid #F3E8FF;font-weight:bold">₹${amountInr.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #F3E8FF;color:#1E1B4B/60;font-size:13px">Refund ID</td>
            <td style="padding:8px 12px;border:1px solid #F3E8FF;font-family:monospace;font-size:12px">${escapeHtml(razorpayRefundId)}</td>
          </tr>
        </table>
        <p style="color:#555;font-size:13px">
          The refund will appear in your bank account within 5–7 business days depending on your bank.
          If you have any questions, please reply to this email.
        </p>
        <hr style="border:0;border-top:1px solid #F3E8FF;margin:28px 0" />
        <p style="color:#888;font-size:12px;text-align:center">
          TinguTales — personalised storybooks for your little one.
        </p>
      </div>
    `,
  });
}

/**
 * Escapes special HTML characters to prevent injection in email templates.
 * @param {string} str - The raw string to escape.
 * @return {string} The HTML-escaped string.
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
