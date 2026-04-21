import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {assertAdmin} from "./_adminHelpers.js";

interface CloseRefundRequestRequest {
  refundRequestId: string;
}

export const adminCloseRefundRequest = onCall<CloseRefundRequestRequest>(
  {region: "asia-south1", timeoutSeconds: 30},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    await assertAdmin(request.auth.uid);

    const {refundRequestId} = request.data;
    if (!refundRequestId) throw new HttpsError("invalid-argument", "refundRequestId required.");

    const refundRef = db.collection("refund_requests").doc(refundRequestId);
    const refundSnap = await refundRef.get();
    if (!refundSnap.exists) throw new HttpsError("not-found", "Refund request not found.");

    await refundRef.update({
      status: "closed",
      resolved_by: request.auth.uid,
      resolved_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info(
      `[adminCloseRefundRequest] refundRequestId=${refundRequestId} closed by admin ${request.auth.uid}`
    );
    return {success: true};
  }
);
