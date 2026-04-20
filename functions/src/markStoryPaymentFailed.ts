import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {MarkStoryPaymentFailedRequest} from "./_storyPaymentsHelpers.js";

export const markStoryPaymentFailed = onCall<MarkStoryPaymentFailedRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const paymentDocId = String(request.data?.paymentDocId || "").trim();
    const reason = String(request.data?.reason || "payment_failed").trim().slice(0, 300);

    if (!paymentDocId) {
      throw new HttpsError("invalid-argument", "paymentDocId is required.");
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
    if (payment.status === "paid" || payment.status === "refunded") {
      return {success: true, ignored: true};
    }

    await paymentRef.update({
      status: "failed",
      failure_reason: reason || "payment_failed",
      updated_at: new Date().toISOString(),
      server_updated_at: FieldValue.serverTimestamp(),
    });

    return {success: true};
  },
);
