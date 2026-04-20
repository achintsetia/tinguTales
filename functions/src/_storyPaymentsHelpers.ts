import {HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin.js";

export const FALLBACK_PRICING_TABLE: Record<number, number> = {6: 79, 8: 99, 10: 129, 12: 149};

export interface CreateStoryPaymentOrderRequest {
  storyId: string;
  couponCode?: string;
  discountPercent?: number;
}

export interface VerifyStoryPaymentRequest {
  paymentDocId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface MarkStoryPaymentFailedRequest {
  paymentDocId: string;
  reason?: string;
}

export const getBookPrice = async (pageCount: number): Promise<number> => {
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

export const isPaymentsEnabled = async (): Promise<boolean> => {
  const pricingSnap = await db.collection("pricing").doc("public").get();
  if (!pricingSnap.exists) return false;
  const data = pricingSnap.data() ?? {};
  return data.payments_enabled === true;
};

export const requireRazorpayCredentials = () => {
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
