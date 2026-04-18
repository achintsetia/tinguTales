import {createHmac, timingSafeEqual} from "crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";

const FALLBACK_PRICING_TABLE: Record<number, number> = {6: 79, 8: 99, 10: 129, 12: 149};

interface CreateStoryPaymentOrderRequest {
  storyId: string;
  couponCode?: string;
  discountPercent?: number;
}

interface VerifyStoryPaymentRequest {
  paymentDocId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

interface MarkStoryPaymentFailedRequest {
  paymentDocId: string;
  reason?: string;
}

const getBookPrice = async (pageCount: number): Promise<number> => {
  const pricingSnap = await db.collection("pricing").doc("public").get();
  if (pricingSnap.exists) {
    const data = pricingSnap.data() ?? {};
    if (Array.isArray(data.tiers)) {
      for (const rawTier of data.tiers as Array<{pages?: number; price?: number; enabled?: boolean}>) {
        if (rawTier.enabled === false) continue;
        const tierPages = Number(rawTier.pages ?? 0);
        const tierPrice = Number(rawTier.price ?? 0);
        if (tierPages === pageCount && Number.isFinite(tierPrice) && tierPrice > 0) {
          return Math.round(tierPrice);
        }
      }
    }
  }

  return FALLBACK_PRICING_TABLE[pageCount] ?? Math.max(1, Math.round(pageCount * 13));
};

const requireRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpsError(
      "failed-precondition",
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in functions/.env.",
    );
  }
  return {keyId, keySecret};
};

export const createStoryPaymentOrder = onCall<CreateStoryPaymentOrderRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const userId = request.auth.uid;
    const storyId = String(request.data?.storyId || "").trim();
    const couponCode = String(request.data?.couponCode || "").trim().toUpperCase();
    const discountPercentRaw = Number(request.data?.discountPercent ?? 0);

    if (!storyId) {
      throw new HttpsError("invalid-argument", "storyId is required.");
    }

    const storyRef = db.collection("stories").doc(storyId);
    const storySnap = await storyRef.get();
    if (!storySnap.exists) {
      throw new HttpsError("not-found", "Story not found.");
    }

    const story = storySnap.data() ?? {};
    if (story.user_id !== userId) {
      throw new HttpsError("permission-denied", "Story does not belong to this user.");
    }
    if (story.status !== "draft_ready") {
      throw new HttpsError("failed-precondition", "Story is not ready for payment.");
    }

    const pageCount = Number(story.page_count ?? 0);
    if (!Number.isFinite(pageCount) || pageCount <= 0) {
      throw new HttpsError("failed-precondition", "Invalid page count on story.");
    }

    const baseAmount = await getBookPrice(pageCount);
    const discountPercent = Number.isFinite(discountPercentRaw) ?
      Math.min(100, Math.max(0, discountPercentRaw)) :
      0;
    const discountAmount = Math.round((baseAmount * discountPercent) / 100);
    const payableAmount = Math.max(0, baseAmount - discountAmount);

    const paymentRef = db.collection("payments").doc();
    const nowIso = new Date().toISOString();

    if (payableAmount <= 0) {
      await paymentRef.set({
        user_id: userId,
        story_id: storyId,
        page_count: pageCount,
        amount_before_discount: baseAmount,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        amount: 0,
        currency: "INR",
        coupon_code: couponCode || null,
        status: "paid",
        provider: "free",
        order_id: "",
        payment_id: `FREE_${paymentRef.id}`,
        created_at: nowIso,
        updated_at: nowIso,
        paid_at: nowIso,
        server_created_at: FieldValue.serverTimestamp(),
        server_updated_at: FieldValue.serverTimestamp(),
      });

      return {
        requiresPayment: false,
        paymentDocId: paymentRef.id,
        amountBeforeDiscount: baseAmount,
        discountAmount,
        discountPercent,
        amount: 0,
        currency: "INR",
      };
    }

    const {keyId, keySecret} = requireRazorpayCredentials();
    const orderPayload = {
      amount: payableAmount * 100,
      currency: "INR",
      receipt: paymentRef.id.slice(0, 40),
      notes: {
        story_id: storyId,
        user_id: userId,
        payment_doc_id: paymentRef.id,
        coupon_code: couponCode || "",
      },
    };

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const details = await orderResponse.text();
      throw new HttpsError("internal", `Razorpay order creation failed: ${details}`);
    }

    const order = await orderResponse.json() as {id: string};

    await paymentRef.set({
      user_id: userId,
      story_id: storyId,
      page_count: pageCount,
      amount_before_discount: baseAmount,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      amount: payableAmount,
      currency: "INR",
      coupon_code: couponCode || null,
      status: "created",
      provider: "razorpay",
      order_id: order.id,
      payment_id: "",
      created_at: nowIso,
      updated_at: nowIso,
      server_created_at: FieldValue.serverTimestamp(),
      server_updated_at: FieldValue.serverTimestamp(),
    });

    return {
      requiresPayment: true,
      paymentDocId: paymentRef.id,
      orderId: order.id,
      razorpayKeyId: keyId,
      amountBeforeDiscount: baseAmount,
      discountAmount,
      discountPercent,
      amount: payableAmount,
      currency: "INR",
    };
  },
);

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
