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
}): Promise<void> {
  if (!opts.userEmail) {
    logger.warn("[emailService] sendPdfReadyEmail called with empty userEmail — skipping");
    return;
  }

  const {userEmail, storyTitle, childName, pdfUrl, storyId} = opts;
  const viewerUrl = `https://app.tingutales.com/story/${storyId}`;

  await send({
    to: userEmail,
    subject: "Your TinguTales storybook is ready! 📖",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1E1B4B">
        <h2 style="color:#FF9F1C">🎉 ${escapeHtml(storyTitle)} is ready!</h2>
        <p>Hi there,</p>
        <p>
          ${escapeHtml(childName)}'s personalised storybook has been created and is ready for you to download.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="${pdfUrl}"
             style="background:#FF9F1C;color:#1E1B4B;font-weight:bold;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">
            Download PDF
          </a>
        </div>
        <p style="text-align:center">
          <a href="${viewerUrl}" style="color:#3730A3;font-size:14px">
            Or view the storybook online →
          </a>
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

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

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
