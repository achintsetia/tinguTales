import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "./admin.js";
import {notifySlackError} from "./_slack.js";

export type Provider = "gemini" | "sarvam";

export interface TokenConsumptionRecord {
  task: string;
  provider: Provider;
  /** Total tokens / characters consumed (integer). */
  tokens: number;
  /** Input tokens (Gemini only). */
  input_tokens?: number;
  /** Output tokens (Gemini only). */
  output_tokens?: number;
  timestamp: FirebaseFirestore.FieldValue;
}

/**
 * Write one token-consumption record to Firestore.
 *
 * Path: token_consumption/{userId}/{auto_id}
 *
 * @param {string} userId - Firebase Auth UID of the consuming user.
 * @param {string} task - Short descriptor, e.g. "avatar_generation".
 * @param {Provider} provider - "gemini" | "sarvam"
 * @param {number} tokens - Total tokens (Gemini) or input characters (Sarvam).
 * @param {object} [extra] - Optional breakdown (input/output tokens).
 */
export async function recordTokenConsumption(
  userId: string,
  task: string,
  provider: Provider,
  tokens: number,
  extra?: {input_tokens?: number; output_tokens?: number}
): Promise<void> {
  try {
    const record: TokenConsumptionRecord = {
      task,
      provider,
      tokens,
      timestamp: FieldValue.serverTimestamp(),
      ...extra,
    };
    // Remove undefined keys so Firestore doesn't complain
    (Object.keys(record) as (keyof TokenConsumptionRecord)[]).forEach((k) => {
      if (record[k] === undefined) delete record[k];
    });

    await db
      .collection("token_consumption")
      .doc(userId)
      .collection("usage")
      .add(record);

    logger.info("[tokenConsumption] recorded", {userId, task, provider, tokens});
  } catch (err) {
    // Never fail the parent operation because of a logging write
    logger.error("[tokenConsumption] failed to write record", err);
    notifySlackError("tokenConsumption", err, {userId, task, provider});
  }
}
