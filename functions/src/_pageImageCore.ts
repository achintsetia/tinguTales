import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import {v4 as uuidv4} from "uuid";
import {db, bucket} from "./admin.js";
import {GEMINI_QA_TIMEOUT_MS} from "./geminiConfig.js";
import {notifySlackError} from "./_slack.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageImageTaskPayload {
  storyId: string;
  pageId: string;
  pageIndex: number;
  pageType: string;
  text: string;
  scenePrompt: string;
  coverTitle?: string;
  coverSubtitle?: string;
  userId: string;
  avatarUrl: string;
  characterCardJson: string;
  commonContextEntitiesJson: string;
  supportingCharactersJson: string;
  totalPages: number;
}

export interface ImageQaInput {
  pageType: string;
  requiredText: string[];
  requiredVisualElements?: string[];
  forbidText?: boolean;
}

export interface ImageQaResult {
  passed: boolean;
  reason: string;
}

export interface FailedImageGenerationRecord {
  story_id: string;
  page_id: string;
  page_index: number;
  page_type: string;
  user_id: string;
  status: string;
  failure_count: number;
  last_error: string;
  payload: PageImageTaskPayload;
  first_failed_at: string;
  last_failed_at: string;
  server_updated_at: FieldValue;
  server_created_at?: FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves a buffer to Cloud Storage and returns a public download URL with a pre-signed token.
 * @param {string} filePath - The destination path within the bucket.
 * @param {Buffer} data - The file contents to save.
 * @param {string} contentType - The MIME type of the file.
 * @return {Promise<string>} The permanent download URL.
 */
export async function saveWithDownloadUrl(
  filePath: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const token = uuidv4();
  await bucket.file(filePath).save(data, {
    contentType,
    metadata: {
      metadata: {firebaseStorageDownloadTokens: token},
      cacheControl: "public, max-age=31536000",
    },
  });
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

const VISUAL_ELEMENT_RULES: Array<{patterns: RegExp[]; label: string}> = [
  {
    patterns: [/\bmango cake\b/i],
    label: "a large, clearly visible mango cake",
  },
  {
    patterns: [/\bbirthday cake\b/i],
    label: "a clearly visible birthday cake",
  },
  {
    patterns: [/\bcake\b/i],
    label: "a clearly visible cake",
  },
  {
    patterns: [/\btoy plane\b/i, /\btoy airplane\b/i],
    label: "a clearly visible toy plane",
  },
  {
    patterns: [/\bairplane\b/i, /\bplane\b/i],
    label: "a clearly visible plane",
  },
  {
    patterns: [/\briver\b/i],
    label: "a clearly visible river",
  },
  {
    patterns: [/\bleaf\b/i, /\bleaves\b/i],
    label: "clearly visible leaves",
  },
  {
    patterns: [/\bbanyan tree\b/i],
    label: "a clearly visible banyan tree",
  },
];

/**
 * Infers important story objects that should be visible in the illustration.
 * @param {PageImageTaskPayload} payload - Page image task payload.
 * @return {string[]} Required visual anchors.
 */
export function inferRequiredVisualElements(payload: PageImageTaskPayload): string[] {
  if (payload.pageType !== "story") return [];

  const source = `${payload.text || ""}\n${payload.scenePrompt || ""}`;
  const elements: string[] = [];

  for (const rule of VISUAL_ELEMENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(source))) {
      elements.push(rule.label);
    }
  }

  try {
    const entities = JSON.parse(payload.commonContextEntitiesJson) as Array<{
      name?: string;
      category?: string;
      role?: string;
      appearance?: string;
    }>;
    if (Array.isArray(entities)) {
      for (const entity of entities) {
        const name = String(entity.name || "").trim();
        const category = String(entity.category || "").trim();
        if (!name || !/(object|animal|vehicle|place|other)/i.test(category)) continue;
        if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(source)) continue;
        elements.push(`clearly visible ${name}${entity.appearance ? ` (${entity.appearance})` : ""}`);
      }
    }
  } catch {
    // Ignore malformed context metadata; keyword rules still cover common props.
  }

  return Array.from(new Set(elements)).slice(0, 5);
}

/**
 * Builds the full Imagen illustration prompt for a single story page.
 * @param {PageImageTaskPayload} payload - The page image task payload.
 * @return {string} The assembled prompt string.
 */
export function buildIllustrationPrompt(payload: PageImageTaskPayload): string {
  const card = (() => {
    try {
      return JSON.parse(payload.characterCardJson);
    } catch {
      return null;
    }
  })();

  const supportingChars: Array<{name: string; role: string; appearance: string}> = (() => {
    try {
      const parsed = JSON.parse(payload.supportingCharactersJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const commonContextEntities: Array<{
    name: string;
    category: string;
    role: string;
    appearance: string;
    consistency_notes?: string;
  }> = (() => {
    try {
      const parsed = JSON.parse(payload.commonContextEntitiesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const characterDesc = card ? (
    "PROTAGONIST — must look IDENTICAL on every single page of this storybook. " +
    "Use the provided reference avatar image as the ground truth for this character's appearance. " +
    `Gender: ${card.gender || "child"}. Skin tone: ${card.skin_tone}. ` +
    `Face: ${card.face} — do NOT change eye shape, eye colour, nose, or mouth. ` +
    `Hair: ${card.hair} — EXACT same hair length, colour, style, and any accessories (clips/ribbons/ties) on every page. Do NOT shorten, lengthen, loosen, curl, or otherwise alter the hair. ` +
    `Accessories: ${card.accessories} — always present, never removed or swapped. ` +
    `Top garment: ${card.default_outfit} — same colour, cut, and pattern on every page. ` +
    `Bottom garment: ${card.lower_garment || "as shown in avatar reference"} — same colour, cut, and pattern on every page. ` +
    "Footwear: same shoes/sandals/chappals/bare feet as the reference avatar — never change style or colour. " +
    "STRICT RULE: Do not modify any aspect of this character's appearance — face, hair, skin, outfit, or footwear — between pages."
  ) : "";

  const supportingCharDesc = supportingChars.length > 0 ?
    "SUPPORTING CHARACTERS — draw each with their exact consistent appearance whenever they appear in this scene: " +
    supportingChars.map((sc) => `${sc.name} (${sc.role}): ${sc.appearance}`).join(" | ") +
    " CRITICAL: Never change the appearance of any supporting character between pages. " :
    "";

  const commonContextDesc = commonContextEntities.length > 0 ?
    "COMMON CONTEXT ENTITIES — every recurring animal/person/vehicle/object must look IDENTICAL to its first appearance: " +
    commonContextEntities.map((entity) =>
      `${entity.name} [${entity.category}] (${entity.role}): ${entity.appearance}` +
      (entity.consistency_notes ? ` Consistency: ${entity.consistency_notes}` : "")
    ).join(" | ") +
    " CRITICAL — FOR ANIMALS ESPECIALLY: the exact skin/fur/feather colour must never shift between pages. " +
    "Do not reinterpret colour tones — reproduce the exact shade described above on every page. " +
    "Do not change body size, markings, accessories, or any defining trait of any recurring entity. " :
    "";

  if (payload.pageType === "cover") {
    const title = payload.coverTitle || "";
    const subtitle = payload.coverSubtitle || "";
    return (
      "Create a beautiful children's storybook COVER illustration in a warm, vibrant Indian style. " +
      `${characterDesc} ` +
      `${commonContextDesc}` +
      `${supportingCharDesc}` +
      `Scene: ${payload.scenePrompt} ` +
      "Make it feel magical, joyful, and inviting. Full 3:4 portrait format. " +
      (title ? (
        `IMPORTANT: Render the book title "${title}" prominently in the illustration — ` +
        "large decorative lettering, centered, near the top or bottom of the image. " +
        (subtitle ? `Also render the subtitle "${subtitle}" in smaller text just below the title. ` : "") +
        "The text must be clearly legible and styled as an official book cover title. " +
        "Do not render any other text anywhere on the cover besides the title and subtitle. " +
        "No author names, logos, badges, captions, quotes, page numbers, or extra wording."
      ) : "")
    );
  }

  if (payload.pageType === "back_cover") {
    const blurb = payload.text || "";
    return (
      "Create a warm, magical children's storybook BACK COVER illustration in vibrant Indian style. " +
      "Full 3:4 portrait format. " +
      "Background: a beautiful warm gradient from peach/orange at the bottom to soft lavender/purple at the top. " +
      "Border: an elegant floral border made of lotus flowers, jasmine, and leaves framing the entire page. " +
      "Scatter golden sparkle stars and soft light bokeh throughout the background. " +
      "CENTER BRANDING (most important element): " +
      "In the center of the image, render the text \"TinguTales.com\" in large, elegant decorative " +
      "cursive/script lettering — the same style and size as the title on the front cover. " +
      "Add a small ornamental golden divider (lotus or paisley motif) above and below this text. " +
      (blurb ? (
        "BLURB: In a calm area above the branding, render this short blurb text " +
        "in a clean, readable child-friendly font: " +
        `"${blurb}" ` +
        "The blurb text must be fully legible. "
      ) : "") +
      "AVATAR: Place the child character (from the reference avatar image) in a warm ornate circular frame " +
      "in the bottom-right corner, like a publisher's portrait medallion. " +
      "Do NOT render this branding on any other page type."
    );
  }

  const storyText = payload.text || "";
  const requiredVisualElements = inferRequiredVisualElements(payload);
  return (
    "Create a vibrant children's storybook interior PAGE illustration in warm Indian style. " +
    `${characterDesc} ` +
    `${commonContextDesc}` +
    `${supportingCharDesc}` +
    `Scene: ${payload.scenePrompt} ` +
    "Full 3:4 portrait format, bright and joyful colours. " +
    (requiredVisualElements.length > 0 ? (
      "REQUIRED VISUAL STORY ANCHORS — these must be clearly visible, recognizable, and not hidden, cropped, " +
      "or covered by the bottom text-safe area: " +
      requiredVisualElements.map((item) => `"${item}"`).join(", ") + ". "
    ) : "") +
    (storyText ? (
      "IMPORTANT TEXT-SAFE COMPOSITION RULE: our app will typeset the story text after generation. " +
      "Leave the bottom 35% of the page visually calm and uncluttered, with only natural background " +
      "such as grass, sky, wall, floor, water, or soft scenery texture. " +
      "The child protagonist must be FULLY VISIBLE from head to toe — their feet, legs, and entire lower body must be completely visible and must NOT be cropped or cut off. " +
      "Position the ground/floor line at or above 65% from the top of the image so all characters stand fully above the text-safe area. " +
      "Keep all characters, important character details, key objects, and main action completely within the top 65% of the image. " +
      "Do NOT draw or imply any text box, banner, parchment, plaque, scroll, rounded rectangle, speech bubble, " +
      "caption panel, frame, label area, blank card, or decorative writing area anywhere in the image. " +
      "Do not render the story sentence visually. " +
      "Do NOT render any letters, words, numbers, watermarks, or pseudo-text anywhere in the image. " +
      "Do not repeat, duplicate, echo, or restate the sentence visually."
    ) : "")
  );
}

/**
 * Uses Gemini Vision to verify that a generated image meets quality requirements.
 * @param {Buffer} imageBuffer - The image data to inspect.
 * @param {ImageQaInput} qaInput - Quality-assurance parameters.
 * @param {GoogleGenAI} ai - The Gemini AI client.
 * @param {string} qaModelName - The Gemini model to use for QA.
 * @return {Promise<ImageQaResult>} Whether the image passed QA and the reason.
 */
export async function verifyGeneratedImageQuality(
  imageBuffer: Buffer,
  qaInput: ImageQaInput,
  ai: GoogleGenAI,
  qaModelName: string
): Promise<ImageQaResult> {
  const requiredText = qaInput.requiredText.map((item) => item.trim()).filter(Boolean);
  const requiredVisualElements = (qaInput.requiredVisualElements ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  try {
    const imgB64 = imageBuffer.toString("base64");
    const requiredTextSection = qaInput.forbidText ?
      "- None allowed. The image must contain zero letters, words, numbers, pseudo-text, signs, captions, or labels." :
      requiredText.length > 0 ?
        requiredText.map((item) => `- "${item}"`).join("\n") :
        "- None";
    const requiredVisualSection = requiredVisualElements.length > 0 ?
      requiredVisualElements.map((item) => `- ${item}`).join("\n") :
      "- None";
    const extraTextRule = qaInput.forbidText ?
      "FAIL if any visible text, pseudo-text, watermark, stray letters, numbers, signs, labels, " +
      "or fake writing appears anywhere in the image." :
      qaInput.pageType === "story" ?
        "For story pages, FAIL if any visible text, pseudo-text, watermark, stray letters, repeated words, " +
        "or extra text block appears beyond the required story text." :
        "FAIL if any visible text appears beyond the required text.";
    const duplicateTextRule = !qaInput.forbidText && qaInput.pageType === "story" ?
      "For story pages, FAIL if the required story text is duplicated, split into multiple repeated blocks, " +
      "or shown more than once." :
      "";
    const storyOverlayRule = !qaInput.forbidText && qaInput.pageType === "story" ?
      "For story pages, FAIL if there is more than one caption/text panel, or if there are empty decorative " +
      "text boxes, banners, scrolls, plaques, speech bubbles, blank label areas, or unused writing panels anywhere. " +
      "Also FAIL if the story text or its background panel covers the protagonist's face, torso, hands, " +
      "legs, feet, clothing, important character details, key object, or main action." :
      "";
    const visualElementsRule = requiredVisualElements.length > 0 ?
      "FAIL if any required visual story anchor is missing, hidden, too tiny/ambiguous to recognize, cropped, " +
      "covered by the caption panel, or contradicted by the image." :
      "";
    const response = await ai.models.generateContent({
      model: qaModelName,
      contents: [{
        role: "user",
        parts: [
          {inlineData: {mimeType: "image/png", data: imgB64}},
          {
            text:
              "You are a strict production QA reviewer for children's storybook images. " +
              "Decide whether this image is safe to deliver to the customer.\n\n" +
              `Page type: ${qaInput.pageType}\n\n` +
              "FAIL the image if ANY of the following is true:\n" +
              "1. The image looks partially generated, unfinished, corrupted, or malformed.\n" +
              "2. Any edge, especially the top area, has an abrupt blank, flat, unpainted, duplicated, cropped, or broken strip/band/block.\n" +
              "3. Important artwork or text is cut off, clipped, malformed, or only partly visible.\n" +
              (qaInput.forbidText ?
                "4. Any text, pseudo-text, letters, words, numbers, signs, labels, or watermark is visible.\n" :
                "4. Required text is missing, illegible, or only partially readable.\n") +
              `5. ${extraTextRule}\n` +
              (duplicateTextRule ? `6. ${duplicateTextRule}\n` : "") +
              (storyOverlayRule ? `7. ${storyOverlayRule}\n` : "") +
              (visualElementsRule ? `8. ${visualElementsRule}\n` : "") +
              "9. The composition does not look like a complete, intentional full-page illustration.\n\n" +
              "Required visible text:\n" +
              `${requiredTextSection}\n\n` +
              "Required visual story anchors:\n" +
              `${requiredVisualSection}\n\n` +
              "Be strict. If you are uncertain, respond FAIL.\n" +
              "Respond in exactly one line using one of these formats only:\n" +
              "PASS\n" +
              "FAIL: <short reason>",
          },
        ],
      }],
      config: {
        httpOptions: {timeout: GEMINI_QA_TIMEOUT_MS},
      },
    });
    const answer = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const normalizedAnswer = answer.trim();
    const passed = normalizedAnswer.toUpperCase() === "PASS";
    const reason = passed ? "ok" : (normalizedAnswer || "FAIL: unknown QA response");
    logger.info(`[verifyGeneratedImageQuality] QA result: "${normalizedAnswer.slice(0, 160)}" → ${passed ? "PASS" : "FAIL"}`);
    return {passed, reason};
  } catch (err) {
    logger.warn("[verifyGeneratedImageQuality] QA check error — failing open", err);
    notifySlackError("verifyGeneratedImageQuality", err);
    return {passed: true, reason: "qa_error_fail_open"};
  }
}

/**
 * Returns a deterministic Firestore document ID for a failed-image-generation record.
 * @param {string} storyId - The story ID.
 * @param {string} pageId - The page ID.
 * @return {string} The composite document ID.
 */
export function failedImageDocId(storyId: string, pageId: string): string {
  return `${storyId}__${pageId}`;
}

/**
 * Creates or updates a failed-image-generation document in Firestore.
 * @param {PageImageTaskPayload} payload - The page image task payload.
 * @param {number} failureCount - The cumulative failure count for this page.
 * @param {string} errorMessage - A human-readable description of the failure.
 * @return {Promise<void>} Resolves when the document has been written.
 */
export async function upsertFailedImageGeneration(
  payload: PageImageTaskPayload,
  failureCount: number,
  errorMessage: string
): Promise<void> {
  const failedRef = db.collection("_failed_image_generation").doc(failedImageDocId(payload.storyId, payload.pageId));
  const snap = await failedRef.get();
  const nowIso = new Date().toISOString();

  const record: FailedImageGenerationRecord = {
    story_id: payload.storyId,
    page_id: payload.pageId,
    page_index: payload.pageIndex,
    page_type: payload.pageType,
    user_id: payload.userId,
    status: "failed",
    failure_count: failureCount,
    last_error: errorMessage,
    payload,
    first_failed_at: snap.exists ? (snap.data()?.first_failed_at as string) || nowIso : nowIso,
    last_failed_at: nowIso,
    server_updated_at: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : {server_created_at: FieldValue.serverTimestamp()}),
  };

  await failedRef.set(record, {merge: true});
}
