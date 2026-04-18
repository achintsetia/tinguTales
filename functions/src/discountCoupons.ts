import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {v4 as uuidv4} from "uuid";
import {db} from "./admin.js";

interface RedeemCouponRequest {
  code: string;
}

/**
 * Redeem a discount coupon and atomically decrement remaining uses.
 * Called by authenticated end-users when applying a coupon.
 */
export const redeemDiscountCoupon = onCall<RedeemCouponRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const rawCode = String(request.data?.code || "").trim();
    const normalizedCode = rawCode.toUpperCase();
    if (!normalizedCode) {
      throw new HttpsError("invalid-argument", "Coupon code is required.");
    }

    const userId = request.auth.uid;
    const couponRef = db.collection("discount_coupons").doc(normalizedCode);

    const couponResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(couponRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Coupon not found.");
      }

      const data = snap.data() ?? {};
      if (data.active === false) {
        throw new HttpsError("failed-precondition", "Coupon is inactive.");
      }

      const remaining = Number(data.remaining_uses ?? 0);
      if (!Number.isFinite(remaining) || remaining <= 0) {
        throw new HttpsError("failed-precondition", "Coupon usage limit reached.");
      }

      const discountPercent = Number(data.discount_percent ?? 0);
      if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        throw new HttpsError("failed-precondition", "Coupon discount is invalid.");
      }

      const nextRemaining = remaining - 1;
      tx.update(couponRef, {
        remaining_uses: nextRemaining,
        updated_at: FieldValue.serverTimestamp(),
        last_redeemed_at: FieldValue.serverTimestamp(),
      });

      const usageRef = db.collection("discount_coupon_uses").doc(uuidv4());
      tx.set(usageRef, {
        coupon_code: normalizedCode,
        discount_percent: discountPercent,
        user_id: userId,
        created_at: FieldValue.serverTimestamp(),
      });

      return {
        discountPercent,
        remainingUses: nextRemaining,
      };
    });

    return {
      code: normalizedCode,
      discountPercent: couponResult.discountPercent,
      remainingUses: couponResult.remainingUses,
      success: true,
    };
  }
);
