import {createHmac, timingSafeEqual} from "crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {
  VerifyStoryPaymentRequest,
  requireRazorpayCredentials,
} from "./_storyPaymentsHelpers.js";

export const verifyStoryPayment = onCall<VerifyStoryPaymentRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const {keySecret} = requireRazorpayCredentials();

    const userId = request.auth.uid;
    const paymentDocId = String(request.data?.paymentDocId || "").trim();
    const razorpayOrderId = String(request.data?.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(request.data?.razorpayPaymentId || "").trim();
    const razorpaySignature = String(request.data?.razorpaySignature || "").trim();

    if (!paymentDocId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new HttpsError("invalid-argument", "Missing payment verification fields.");
    }

    const paymentRef = db.collection("payments").doc(paymentDocId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new HttpsError("not-found", "Payment record not found.");
    }

    const payment = paymentSnap.data() ?? {};
    if (payment.user_id !== userId) {
      throw new HttpsError("permission-denied", "Payment does not belong to this user.");
    }
    if (payment.order_id !== razorpayOrderId) {
      throw new HttpsError("failed-precondition", "Order mismatch.");
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = createHmac("sha256", keySecret).update(payload).digest("hex");

    const expectedBuf = Buffer.from(expected, "utf8");
    const gotBuf = Buffer.from(razorpaySignature, "utf8");
    const isValid = expectedBuf.length === gotBuf.length && timingSafeEqual(expectedBuf, gotBuf);

    if (!isValid) {
      await paymentRef.update({
        status: "failed",
        failure_reason: "invalid_signature",
        updated_at: new Date().toISOString(),
        server_updated_at: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("permission-denied", "Payment signature validation failed.");
    }

    await paymentRef.update({
      status: "paid",
      payment_id: razorpayPaymentId,
      updated_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      paymentDocId,
    };
  },
);
