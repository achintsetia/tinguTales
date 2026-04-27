import * as logger from "firebase-functions/logger";
import {GoogleGenAI} from "@google/genai";
import {db} from "./admin.js";

const DEFAULT_TEXT_TIMEOUT_MS = 90000;
const DEFAULT_AVATAR_TIMEOUT_MS = 90000;
const DEFAULT_IMAGE_TIMEOUT_MS = 120000;
const DEFAULT_QA_TIMEOUT_MS = 45000;

export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const DEFAULT_GEMINI_QA_MODEL = "gemini-2.0-flash";

export const GEMINI_MODEL_CONFIG_KEYS = {
  avatarGeneration: "avatar_generation_model",
  storyGeneration: "story_generation_model",
  storyIllustration: "story_illustration_model",
  imageQa: "image_qa_model",
} as const;

/**
 * Reads a positive integer timeout override from the environment.
 * @param {string} name - Environment variable name.
 * @param {number} fallback - Fallback timeout in milliseconds.
 * @return {number} Positive integer timeout in milliseconds.
 */
function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const GEMINI_TEXT_TIMEOUT_MS = readPositiveIntegerEnv(
  "GEMINI_TEXT_TIMEOUT_MS",
  DEFAULT_TEXT_TIMEOUT_MS
);
export const GEMINI_AVATAR_TIMEOUT_MS = readPositiveIntegerEnv(
  "GEMINI_AVATAR_TIMEOUT_MS",
  DEFAULT_AVATAR_TIMEOUT_MS
);
export const GEMINI_IMAGE_TIMEOUT_MS = readPositiveIntegerEnv(
  "GEMINI_IMAGE_TIMEOUT_MS",
  DEFAULT_IMAGE_TIMEOUT_MS
);
export const GEMINI_QA_TIMEOUT_MS = readPositiveIntegerEnv(
  "GEMINI_QA_TIMEOUT_MS",
  DEFAULT_QA_TIMEOUT_MS
);

/**
 * Creates a Gemini client with a hard per-request timeout.
 * @param {string} apiKey - Gemini API key.
 * @param {number} timeoutMs - HTTP timeout in milliseconds.
 * @return {GoogleGenAI} Configured Gemini client.
 */
export function createGeminiClient(apiKey: string, timeoutMs: number): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {timeout: timeoutMs},
  });
}

/**
 * Reads a Gemini model name from Firestore model configuration.
 * @param {string} configKey - Document ID in the `models` collection.
 * @param {string} fallbackModel - Fallback model when no config exists.
 * @return {Promise<string>} Configured or fallback model name.
 */
export async function getConfiguredGeminiModel(
  configKey: string,
  fallbackModel: string
): Promise<string> {
  const modelDoc = await db.collection("models").doc(configKey).get();
  const configuredModel = modelDoc.exists ? String(modelDoc.data()?.name ?? "").trim() : "";
  if (configuredModel) return configuredModel;

  logger.warn(
    `[geminiConfig] models/${configKey} missing or empty; falling back to ${fallbackModel}`
  );
  return fallbackModel;
}
