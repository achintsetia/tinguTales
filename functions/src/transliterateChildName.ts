import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {db} from "./admin.js";
import {FieldValue} from "firebase-admin/firestore";
import {recordTokenConsumption} from "./tokenConsumption.js";
import {notifySlackError} from "./_slack.js";

/** Map 2-letter language codes used in the webapp to Sarvam BCP-47 codes. */
const LANG_CODE_MAP: Record<string, string> = {
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  od: "od-IN",
};

interface TransliterateRequest {
  name: string;
  languageCode: string; // 2-letter code, e.g. "hi"
}

interface TransliterateResponse {
  transliterated: string;
  languageCode: string;
}

/**
 * Transliterates a child's name from English into the requested
 * Indian language script using the Sarvam AI transliteration API.
 */
export const transliterateChildName = onCall<TransliterateRequest, Promise<TransliterateResponse>>(
  {region: "asia-south1"},
  async (request) => {
    const {name, languageCode} = request.data;

    if (!name || typeof name !== "string" || name.trim() === "") {
      throw new HttpsError("invalid-argument", "name is required.");
    }

    if (!languageCode || languageCode === "en") {
      return {transliterated: name.trim(), languageCode: "en"};
    }

    const sarvamLangCode = LANG_CODE_MAP[languageCode];
    if (!sarvamLangCode) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported languageCode: ${languageCode}`
      );
    }

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      logger.error("[transliterateChildName] SARVAM_API_KEY is not set");
      throw new HttpsError("internal", "Transliteration service is not configured.");
    }

    const inputName = name.trim();

    // ── Cache lookup ─────────────────────────────────────────────────────
    // Document ID is deterministic: "<normalised_name>_<langCode>"
    const cacheKey = `${inputName.toLowerCase().replace(/\s+/g, "_")}_${languageCode}`;
    const cacheRef = db.collection("name_transliteration").doc(cacheKey);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cached = cacheSnap.data()?.transliterated as string | undefined;
      if (cached) {
        logger.info("[transliterateChildName] cache hit", {cacheKey, cached});
        return {transliterated: cached, languageCode};
      }
    }

    try {
      const response = await fetch("https://api.sarvam.ai/transliterate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": apiKey,
        },
        body: JSON.stringify({
          input: inputName,
          source_language_code: "en-IN",
          target_language_code: sarvamLangCode,
          numerals_format: "international",
          spoken_language_style: "formal",
          with_numerals: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("[transliterateChildName] Sarvam API error", {
          status: response.status,
          body: errorText,
        });
        throw new HttpsError("internal", "Transliteration API returned an error.");
      }

      const data = await response.json() as {transliterated_text?: string};
      const transliterated = (data.transliterated_text ?? "").trim();

      // Record Sarvam usage: character count of the input (fire-and-forget)
      const userId = request.auth?.uid ?? "anonymous";
      void recordTokenConsumption(userId, "transliterate_name", "sarvam", inputName.length);

      if (!transliterated || transliterated === inputName) {
        // Sarvam returned nothing useful — fall back to original name
        return {transliterated: inputName, languageCode};
      }

      // ── Write to cache ─────────────────────────────────────────────────
      await cacheRef.set({
        name: inputName,
        languageCode,
        transliterated,
        createdAt: FieldValue.serverTimestamp(),
      });

      logger.info("[transliterateChildName] success", {
        inputName,
        transliterated,
        lang: sarvamLangCode,
      });

      return {transliterated, languageCode};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("[transliterateChildName] unexpected error", err);
      notifySlackError("transliterateChildName", err);
      throw new HttpsError("internal", "Transliteration failed unexpectedly.");
    }
  }
);
