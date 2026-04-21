import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import * as https from "https";
import {admin, db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";
import {requireRazorpayCredentials} from "./_storyPaymentsHelpers.js";
import {sendRefundIssuedEmail} from "./emailService.js";

interface IssueRefundRequest {
  /** Firestore refund_request doc ID */
  refundRequestId: string;
}

/**
 * Call Razorpay refunds API and return parsed response.
 * @param {string} paymentId - Razorpay payment ID to refund.
 * @param {number} amountPaise - Refund amount in paise.
 * @param {string} keyId - Razorpay key ID.
 * @param {string} keySecret - Razorpay key secret.
 * @return {Promise<Record<string, unknown>>} Parsed Razorpay refund response.
 */
function razorpayRefund(
  paymentId: string,
  amountPaise: number,
  keyId: string,
  keySecret: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({amount: amountPaise});
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const options: https.RequestOptions = {
      hostname: "api.razorpay.com",
      path: `/v1/payments/${paymentId}/refund`,
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Razorpay error ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse Razorpay response: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export const adminIssueRefund = onCall<IssueRefundRequest>(
  {region: "asia-south1", timeoutSeconds: 60},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {refundRequestId} = request.data;
    if (!refundRequestId) throw new HttpsError("invalid-argument", "refundRequestId required.");

    // Load the refund request
    const refundRef = db.collection("refund_requests").doc(refundRequestId);
    const refundSnap = await refundRef.get();
    if (!refundSnap.exists) throw new HttpsError("not-found", "Refund request not found.");
    const refundData = refundSnap.data() ?? {};

    if (refundData.status === "refunded") {
      throw new HttpsError("already-exists", "This refund request has already been refunded.");
    }

    const storyId: string = refundData.story_id ?? "";
    if (!storyId) throw new HttpsError("failed-precondition", "No story_id on refund request.");

    // Find the paid payment for this story
    const paymentsSnap = await db
      .collection("payments")
      .where("story_id", "==", storyId)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (paymentsSnap.empty) {
      throw new HttpsError(
        "not-found",
        "No paid payment found for this story. Cannot issue refund."
      );
    }

    const paymentDoc = paymentsSnap.docs[0];
    const payment = paymentDoc.data();
    const razorpayPaymentId: string = payment.payment_id ?? "";
    const amountInr = Number(payment.amount ?? 0);

    if (!razorpayPaymentId) {
      throw new HttpsError("failed-precondition", "Payment record has no Razorpay payment ID.");
    }
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      throw new HttpsError("failed-precondition", "Payment has an invalid amount.");
    }

    const {keyId, keySecret} = requireRazorpayCredentials();
    const amountPaise = Math.round(amountInr * 100);

    logger.info(
      `[adminIssueRefund] Issuing Razorpay refund: payment=${razorpayPaymentId} amount=${amountPaise} paise`
    );

    const refundResult = await razorpayRefund(razorpayPaymentId, amountPaise, keyId, keySecret);

    const now = FieldValue.serverTimestamp();

    // Mark payment as refunded
    await paymentDoc.ref.update({
      status: "refunded",
      razorpay_refund_id: refundResult.id ?? "",
      refunded_at: now,
      updated_at: now,
    });

    // Mark refund request as refunded
    await refundRef.update({
      status: "refunded",
      razorpay_refund_id: refundResult.id ?? "",
      resolved_by: request.auth.uid,
      resolved_at: now,
      updated_at: now,
    });

    // Send refund notification email to the user (best-effort, non-fatal)
    try {
      const storySnap = await db.collection("stories").doc(storyId).get();
      const story = storySnap.data() ?? {};
      const authUser = await admin.auth().getUser(refundData.user_id);
      const userEmail = authUser.email ?? "";
      if (userEmail) {
        await sendRefundIssuedEmail({
          userEmail,
          storyTitle: story.title ?? refundData.story_title ?? "Your Storybook",
          childName: story.child_name ?? "your child",
          amountInr,
          razorpayRefundId: String(refundResult.id ?? ""),
        });
      }
    } catch (emailErr) {
      logger.warn("[adminIssueRefund] refund email failed (non-fatal)", emailErr);
    }

    logger.info(
      `[adminIssueRefund] Refund issued: refundRequestId=${refundRequestId} razorpayRefundId=${refundResult.id}`
    );
    return {success: true, razorpayRefundId: refundResult.id};
  }
);
