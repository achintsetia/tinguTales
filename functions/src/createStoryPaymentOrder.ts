import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {
  CreateStoryPaymentOrderRequest,
  getBookPrice,
  isPaymentsEnabled,
  requireRazorpayCredentials,
} from "./_storyPaymentsHelpers.js";

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

    const paymentsEnabled = await isPaymentsEnabled();
    const baseAmount = await getBookPrice(pageCount);
    const discountPercent = Number.isFinite(discountPercentRaw) ?
      Math.min(100, Math.max(0, discountPercentRaw)) :
      0;
    const discountAmount = Math.round((baseAmount * discountPercent) / 100);
    const payableAmount = Math.max(0, baseAmount - discountAmount);

    const paymentRef = db.collection("payments").doc();
    const nowIso = new Date().toISOString();

    if (!paymentsEnabled) {
      return {
        requiresPayment: false,
        paymentDocId: "",
        amountBeforeDiscount: baseAmount,
        discountAmount,
        discountPercent,
        amount: 0,
        currency: "INR",
      };
    }

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
