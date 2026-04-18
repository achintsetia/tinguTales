import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {admin, db} from "./admin.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pricing constants (USD per 1 million tokens)
//
// Sources (fetched April 2026):
//   Gemini — https://ai.google.dev/gemini-api/docs/pricing
//   Sarvam  — https://www.sarvam.ai/pricing  (sarvam-30b)
// ─────────────────────────────────────────────────────────────────────────────

// gemini-2.5-flash  (used for story_draft_generation)
const GEMINI_25_FLASH_INPUT_PER_M = 0.30;
const GEMINI_25_FLASH_OUTPUT_PER_M = 2.50;

// gemini-2.0-flash-preview-image-generation  (used for avatar_generation)
// Image output tokens are priced at $30/1M; text input at $0.10/1M
const GEMINI_20_FLASH_IMG_INPUT_PER_M = 0.10;
const GEMINI_20_FLASH_IMG_OUTPUT_PER_M = 30.0;

// sarvam-30b  (used for story_qa_naturalize)
const SARVAM_30B_INPUT_PER_M = 0.40;
const SARVAM_30B_OUTPUT_PER_M = 1.60;

// Sarvam transliteration  (per 1,000 characters)
const SARVAM_TRANS_PER_1K_CHARS = 0.005;

// Exchange rate used for INR conversion
const USD_TO_INR = 96;

// ─────────────────────────────────────────────────────────────────────────────
// Cost calculation per token-consumption record
// ─────────────────────────────────────────────────────────────────────────────
interface UsageRecord {
  task: string;
  provider: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
}

interface RawUsageRecord {
  task?: unknown;
  provider?: unknown;
  tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
}

/**
 * Normalizes a Firestore usage document into a strongly typed camelCase shape.
 * @param {RawUsageRecord} raw - Raw Firestore data from token_consumption usage docs.
 * @return {UsageRecord} Normalized usage record.
 */
function toUsageRecord(raw: RawUsageRecord): UsageRecord {
  return {
    task: typeof raw.task === "string" ? raw.task : "unknown",
    provider: typeof raw.provider === "string" ? raw.provider : "unknown",
    tokens: typeof raw.tokens === "number" ? raw.tokens : 0,
    inputTokens: typeof raw.input_tokens === "number" ? raw.input_tokens : undefined,
    outputTokens: typeof raw.output_tokens === "number" ? raw.output_tokens : undefined,
  };
}

/**
 * Calculates estimated USD cost for one normalized usage record.
 * @param {UsageRecord} record - Token consumption record for one task execution.
 * @return {number} Estimated USD cost.
 */
function calcCostUsd(record: UsageRecord): number {
  const {task, provider, tokens, inputTokens = 0, outputTokens = 0} = record;

  if (provider === "gemini") {
    if (task === "avatar_generation") {
      // avatar_generation stores input/output breakdown; output includes image tokens
      return (
        (inputTokens / 1_000_000) * GEMINI_20_FLASH_IMG_INPUT_PER_M +
        (outputTokens / 1_000_000) * GEMINI_20_FLASH_IMG_OUTPUT_PER_M
      );
    }
    // story_draft_generation: only total tokens recorded → estimate 70% input / 30% output
    const estInput = inputTokens > 0 ? inputTokens : Math.floor(tokens * 0.7);
    const estOutput = outputTokens > 0 ? outputTokens : Math.floor(tokens * 0.3);
    return (
      (estInput / 1_000_000) * GEMINI_25_FLASH_INPUT_PER_M +
      (estOutput / 1_000_000) * GEMINI_25_FLASH_OUTPUT_PER_M
    );
  }

  if (provider === "sarvam") {
    if (task === "transliterate_name") {
      // tokens = character count of the input name
      return (tokens / 1000) * SARVAM_TRANS_PER_1K_CHARS;
    }
    // story_qa_naturalize: has input/output breakdown
    const inp = inputTokens > 0 ? inputTokens : Math.floor(tokens * 0.6);
    const out = outputTokens > 0 ? outputTokens : Math.floor(tokens * 0.4);
    return (
      (inp / 1_000_000) * SARVAM_30B_INPUT_PER_M +
      (out / 1_000_000) * SARVAM_30B_OUTPUT_PER_M
    );
  }

  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function
// ─────────────────────────────────────────────────────────────────────────────
export interface TaskBreakdown {
  tokens: number;
  costUsd: number;
  costInr: number;
}

export interface UserCostEntry {
  userId: string;
  email: string;
  totalCostUsd: number;
  totalCostInr: number;
  byTask: Record<string, TaskBreakdown>;
}

export const getAdminCostReport = onCall(
  {timeoutSeconds: 120},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Not signed in.");
    }

    // Admin guard ─────────────────────────────────────────────────────────────
    const userDoc = await db
      .collection("user_profile")
      .doc(request.auth.uid)
      .get();
    if (!userDoc.exists || !userDoc.data()?.is_admin) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    // Fetch all token-consumption records via collection group query ──────────
    const snap = await db.collectionGroup("usage").get();
    logger.info(`[getAdminCostReport] total usage records: ${snap.size}`);

    // Aggregate by userId ─────────────────────────────────────────────────────
    const userCosts: Record<string, {
      totalCostUsd: number;
      byTask: Record<string, {tokens: number; costUsd: number}>;
    }> = {};

    for (const docSnap of snap.docs) {
      // Path: token_consumption/{userId}/usage/{docId}
      const pathParts = docSnap.ref.path.split("/");
      if (pathParts.length < 2) continue;
      const userId = pathParts[1];

      const data = toUsageRecord(docSnap.data() as RawUsageRecord);
      const costUsd = calcCostUsd(data);
      const task = data.task ?? "unknown";

      if (!userCosts[userId]) {
        userCosts[userId] = {totalCostUsd: 0, byTask: {}};
      }
      userCosts[userId].totalCostUsd += costUsd;

      if (!userCosts[userId].byTask[task]) {
        userCosts[userId].byTask[task] = {tokens: 0, costUsd: 0};
      }
      userCosts[userId].byTask[task].tokens += data.tokens ?? 0;
      userCosts[userId].byTask[task].costUsd += costUsd;
    }

    // Resolve user emails via Firebase Auth ───────────────────────────────────
    const userIds = Object.keys(userCosts);
    const emailMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        try {
          const {users} = await admin.auth().getUsers(
            chunk.map((uid) => ({uid}))
          );
          for (const u of users) {
            emailMap[u.uid] = u.email ?? u.displayName ?? u.uid;
          }
        } catch (err) {
          logger.warn("[getAdminCostReport] failed to resolve some user emails", err);
        }
      }
    }

    // Build final result ───────────────────────────────────────────────────────
    const users: UserCostEntry[] = userIds.map((uid) => {
      const {totalCostUsd, byTask} = userCosts[uid];
      const enrichedByTask: Record<string, TaskBreakdown> = {};
      for (const [task, val] of Object.entries(byTask)) {
        enrichedByTask[task] = {
          tokens: val.tokens,
          costUsd: val.costUsd,
          costInr: val.costUsd * USD_TO_INR,
        };
      }
      return {
        userId: uid,
        email: emailMap[uid] ?? uid,
        totalCostUsd,
        totalCostInr: totalCostUsd * USD_TO_INR,
        byTask: enrichedByTask,
      };
    });

    users.sort((a, b) => b.totalCostInr - a.totalCostInr);

    return {
      users,
      usdToInr: USD_TO_INR,
      pricingAsOf: "April 2026",
      pricingSources: {
        gemini: "https://ai.google.dev/gemini-api/docs/pricing",
        sarvam: "https://www.sarvam.ai/pricing",
      },
    };
  }
);
