import * as logger from "firebase-functions/logger";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import {db, bucket} from "./admin.js";
import {recordTokenConsumption} from "./tokenConsumption.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CharacterCard {
  gender: string;
  skin_tone: string;
  face: string;
  hair: string;
  accessories: string;
  default_outfit: string;
}

export interface StoryEntityContext {
  name: string;
  category: "person" | "animal" | "vehicle" | "object" | "place" | "other";
  role: string; // e.g. "grandmother", "best friend", "family dog", "school bus"
  appearance: string; // full prose description for consistent illustration
  consistency_notes: string; // specific constraints: colour, structure, style, repeated details
}

interface SceneData {
  page: number;
  page_type: string;
  text: string;
  scene_prompt: string;
  cover_title?: string;
  cover_subtitle?: string;
  status: "pending";
  created_at: FirebaseFirestore.FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the error is a retryable Gemini API error (503/429).
 * @param {unknown} err - The error to inspect.
 * @return {boolean} True if the error is retryable.
 */
function isRetryable(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as {status?: number}).status;
    if (code === 503 || code === 429) return true;
    const msg = String((err as {message?: string}).message ?? "");
    if (/503|429|unavailable|quota|rate.?limit|overloaded/i.test(msg)) return true;
  }
  return false;
}

/**
 * Calls fn with up to maxAttempts retries, exponential backoff starting at
 * baseDelayMs (doubles each attempt, capped at 30 s), only for retryable errors.
 * @param {Function} fn - Async function to call.
 * @param {number} maxAttempts - Maximum number of attempts (default 4).
 * @param {number} baseDelayMs - Initial delay in ms before first retry (default 5000).
 * @return {Promise<T>} Result of fn.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 5000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 30000);
      logger.warn(`[withRetry] attempt ${attempt}/${maxAttempts} failed (retryable), retrying in ${delay}ms`, err);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

/**
 * Parses JSON that Gemini may wrap in a markdown code block.
 * @param {string} text - Raw text output from Gemini, possibly wrapped in code fences.
 * @return {unknown} Parsed JSON value.
 */
function parseGeminiJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = firstNewline >= 0 ? cleaned.slice(firstNewline + 1) : cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return JSON.parse(cleaned.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent A — Describe avatar as a structured character card
// (mirrors image_generator._describe_avatar but returns JSON, not prose)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls Gemini vision to extract a structured CharacterCard from the avatar image.
 * Returns a card with consistent traits kept identical across all storybook pages.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Gemini model name.
 * @param {string} avatarB64 - Base64-encoded avatar image bytes.
 * @param {string} mimeType - MIME type of the avatar image.
 * @return {Promise<object>} Object with character card and total token count.
 */
async function describeAvatarAsCharacterCard(
  ai: GoogleGenAI,
  model: string,
  avatarB64: string,
  mimeType: string
): Promise<{card: CharacterCard; tokens: number}> {
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [
        {inlineData: {mimeType, data: avatarB64}},
        {
          text:
            "Describe this cartoon child character's visual appearance as a structured JSON object.\n" +
            "Be VERY specific — this will be used to keep the character IDENTICAL across " +
            "multiple storybook illustration pages.\n\n" +
            "Return ONLY this exact JSON (no markdown fences, no extra text):\n" +
            "{\n" +
            "  \"skin_tone\": \"e.g. warm medium brown / light golden / dark brown\",\n" +
            "  \"face\": \"e.g. round face, large dark brown almond eyes, button nose, wide cheerful smile\",\n" +
            "  \"hair\": \"e.g. black hair in two braids tied with red ribbons, neat middle parting\",\n" +
            "  \"accessories\": \"e.g. small gold stud earrings (or 'none')\",\n" +
            "  \"default_outfit\": \"e.g. bright blue kurta with white leggings and red dupatta\"\n" +
            "}",
        },
      ],
    }],
    config: {
      systemInstruction:
        "You are a character designer for children's storybooks. " +
        "Describe character appearances with extreme precision so an illustrator can reproduce " +
        "the same character on every single page without variation. " +
        "Return only valid JSON with no prose.",
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    const card = parseGeminiJson(text) as CharacterCard;
    return {card, tokens};
  } catch {
    logger.warn("[generateScenes] avatar card parse failed, using defaults");
    return {
      card: {
        gender: "",
        skin_tone: "natural Indian skin tone (refer to avatar image)",
        face: "round face, large expressive dark eyes, cheerful smile",
        hair: "black hair, neat style",
        accessories: "none",
        default_outfit: "colourful Indian attire",
      },
      tokens,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent B — Build common context entities from the story pages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all story pages and identifies recurring visual entities other than the main child,
 * including people, animals, vehicles, objects, and places. Produces consistent
 * visual descriptions so page illustrations stay coherent throughout the story.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Gemini model name.
 * @param {string} childName - The main child protagonist's name (to exclude).
 * @param {string} synopsis - Story synopsis.
 * @param {Array<object>} draftPages - Draft pages with text.
 * @return {Promise<object>} Object with common entity array and total token count.
 */
async function extractCommonContextEntities(
  ai: GoogleGenAI,
  model: string,
  childName: string,
  synopsis: string,
  draftPages: {page: number; text: string; page_type?: string}[]
): Promise<{entities: StoryEntityContext[]; tokens: number}> {
  const storyText = draftPages
    .filter((p) => p.page_type !== "back_cover" && p.page_type !== "cover")
    .map((p) => `[Page ${p.page}]: ${p.text}`)
    .join("\n");

  if (!storyText.trim()) return {entities: [], tokens: 0};

  const prompt =
    `You are reading a children's storybook. The main character is "${childName}".\n\n` +
    `Story synopsis: ${synopsis}\n\n` +
    "Story pages:\n" + storyText + "\n\n" +
    "Identify recurring visual entities that should stay consistent across pages.\n" +
    "Include not just people, but also animals, pets, vehicles, frequently used objects, and notable places.\n" +
    "Exclude the main child protagonist whose name is \"" + childName + "\".\n\n" +
    "For each entity, provide a DETAILED and SPECIFIC visual description and strict consistency notes.\n" +
    "For people: include age range, skin tone, face features, hair, top/bottom clothing, footwear, accessories.\n" +
    "For animals: include species/breed, fur/skin/feather colour, markings, collar/accessories, body build.\n" +
    "For vehicles/objects: include exact colour palette, structure/shape, material feel, and distinctive details.\n" +
    "For places: include architectural style, colours, motifs, recurring decor elements.\n" +
    "If details are missing, infer culturally appropriate Indian defaults and keep them plausible.\n\n" +
    "Return ONLY a JSON array (empty if no recurring entities):\n" +
    "[\n" +
    "  {\n" +
    "    \"name\": \"entity name as it appears in the story\",\n" +
    "    \"category\": \"person|animal|vehicle|object|place|other\",\n" +
    "    \"role\": \"e.g. grandmother, best friend, pet dog, school bus, toy train\",\n" +
    "    \"appearance\": \"full prose description with visual specifics\",\n" +
    "    \"consistency_notes\": \"strict do-not-change traits across pages\"\n" +
    "  }\n" +
    "]";

  const response = await ai.models.generateContent({
    model,
    contents: [{role: "user", parts: [{text: prompt}]}],
    config: {
      systemInstruction:
        "You are a visual continuity director for Indian children's picture books. " +
        "Extract all recurring entities that must remain visually consistent across pages. " +
        "Describe each with enough detail for consistent illustration. " +
        "Return only valid JSON.",
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    const parsed = parseGeminiJson(text);
    if (Array.isArray(parsed)) {
      return {entities: parsed as StoryEntityContext[], tokens};
    }
  } catch {
    logger.warn("[generateScenes] common context parse failed — using empty list");
  }
  return {entities: [], tokens};
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent C — Generate scene prompts for every page
// Focus: consistent character appearance, rich cultural scene context
// ─────────────────────────────────────────────────────────────────────────────

interface RawSceneItem {
  page: number;
  scene_prompt: string;
}

/**
 * Generates a detailed scene prompt for every page, keeping the character
 * visually identical on every page using the character card.
 * Returns one RawSceneItem per page in order 0…numPages-1.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Gemini model name.
 * @param {string} storyTitle - Story title in the target language.
 * @param {string} titleEnglish - English translation of the story title.
 * @param {string} synopsis - Brief story synopsis.
 * @param {string} childName - The child protagonist's name.
 * @param {number} childAge - The child's age in years.
 * @param {string} childGender - The child's gender ("boy", "girl", or "").
 * @param {Array<object>} draftPages - Draft page objects (page, text, page_type).
 * @param {CharacterCard} card - Structured character card from avatar description.
 * @param {number} numPages - Total page count including cover and branding.
 * @param {Array<object>} commonContextEntities - Story entities with consistent appearance descriptions.
 * @return {Promise<object>} Object with scene items array and total token count.
 */
async function generateScenePrompts(
  ai: GoogleGenAI,
  model: string,
  storyTitle: string,
  titleEnglish: string,
  synopsis: string,
  childName: string,
  childAge: number,
  childGender: string,
  draftPages: {page: number; text: string; page_type?: string}[],
  card: CharacterCard,
  numPages: number,
  commonContextEntities: StoryEntityContext[]
): Promise<{items: RawSceneItem[]; tokens: number}> {
  const backCoverIndex = numPages - 1;
  const storyPageRange = numPages > 3 ? `1–${numPages - 2}` : "1";


  // Derive pronouns from gender
  const g = childGender.toLowerCase();
  const pronoun = (g === "girl" || g === "female" || g === "f") ?
    {sub: "she", obj: "her", pos: "her"} :
    (g === "boy" || g === "male" || g === "m") ?
      {sub: "he", obj: "him", pos: "his"} :
      {sub: "they", obj: "them", pos: "their"};
  const genderLabel = g === "girl" || g === "female" || g === "f" ?
    "girl" : g === "boy" || g === "male" || g === "m" ? "boy" : "child";

  const pagesInfo = draftPages.map((p) => ({
    page: p.page,
    type: p.page_type ?? "story",
    text_excerpt: (p.text ?? "").slice(0, 120),
  }));

  const characterDesc = [
    `Gender: ${genderLabel}.`,
    `Skin: ${card.skin_tone}.`,
    `Face: ${card.face}.`,
    `Hair: ${card.hair}.`,
    `Accessories: ${card.accessories}.`,
    `Outfit: ${card.default_outfit}.`,
  ].join("  ");

  const commonContextSection = commonContextEntities.length > 0 ?
    "COMMON CONTEXT ENTITIES — maintain strict consistency across pages:\n" +
    commonContextEntities.map((entity, i) =>
      `${i + 1}. ${entity.name} [${entity.category}] (${entity.role}): ` +
      `${entity.appearance}. Consistency: ${entity.consistency_notes}`
    ).join("\n") +
    "\nFor each page: if an entity appears in the story text, reference these details explicitly. " +
    "Never change recurring appearance traits between pages.\n\n" :
    "";

  const exampleJson = JSON.stringify(
    Array.from({length: numPages}, (_, i) => ({
      page: i,
      scene_prompt: `Page ${i} prompt here`,
    }))
  );

  const prompt =
    "Create image generation prompts for a children's storybook.\n\n" +
    `Story title: "${titleEnglish || storyTitle}"\n` +
    `Synopsis: ${synopsis || "A children's adventure story."}\n` +
    `Child protagonist: ${childName}, age ${childAge}, ${genderLabel} (Indian child character). ` +
    `Pronouns: ${pronoun.sub}/${pronoun.obj}/${pronoun.pos}.\n\n` +
    `PAGES (${numPages} total):\n${JSON.stringify(pagesInfo, null, 2)}\n\n` +
    "CHARACTER CARD — these traits must appear IDENTICALLY on EVERY single page:\n" +
    `${characterDesc}\n\n` +
    "CRITICAL CONSISTENCY RULES (apply to every page without exception):\n" +
    `1. Face: ${card.face} — never alter shape, eye colour, or expression type.\n` +
    `2. Skin: ${card.skin_tone} — consistent across all lighting conditions.\n` +
    `3. Hair: ${card.hair} — same style, colour, and accessories every page.\n` +
    `4. Outfit: ${card.default_outfit} — keep this EXACT outfit on all pages; do NOT ` +
    "change clothing even for festivals or special events.\n" +
    `5. Accessories: ${card.accessories} — always present, never swapped.\n\n` +
    commonContextSection +
    "PAGE-SPECIFIC RULES:\n" +
    `- Page 0 (COVER): ${childName} as the HERO — large, centred portrait. ` +
    "Vibrant Indian storybook motifs (marigolds, rangoli, golden sunrise). " +
    "Clear band at top for title text.\n" +
    `- Pages ${storyPageRange} (STORY): vivid scene, ${childName} as visual focus. ` +
    `Use ${pronoun.sub}/${pronoun.obj} pronouns. ` +
    "Rich Indian cultural elements (architecture, nature, clothing). " +
    "Space in upper third for story text.\n" +
    `- Page ${backCoverIndex} (BACK COVER + BRANDING): warm sunset/floral Indian motifs. ` +
    `Small cheerful portrait of ${childName}` + "'s avatar in one corner. " +
    "Space in the centre for TinguTales.com branding.\n\n" +
    "Style: rich, colourful, warm, whimsical Indian cultural children's book illustration. " +
    "Portrait orientation (3:4).\n\n" +
    `Return ONLY a JSON array of exactly ${numPages} objects (no markdown, no prose):\n` +
    exampleJson;

  const response = await ai.models.generateContent({
    model,
    contents: [{role: "user", parts: [{text: prompt}]}],
    config: {
      systemInstruction:
        "You are an experienced art director for Indian children's picture books. " +
        "Create detailed, evocative image generation prompts that faithfully follow the " +
        "character card and scene context. " +
        "Always return a valid JSON array with exactly the requested number of elements.",
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    const parsed = parseGeminiJson(text) as RawSceneItem[];
    if (Array.isArray(parsed)) {
      // Pad if Gemini returned fewer items
      while (parsed.length < numPages) {
        const i = parsed.length;
        parsed.push({
          page: i,
          scene_prompt: `${childName} in a colourful Indian storybook scene, page ${i}`,
        });
      }
      return {items: parsed.slice(0, numPages), tokens};
    }
  } catch {/* fall through to fallback */}

  logger.warn("[generateScenes] scene prompt parse failed — using fallback");
  const fallback: RawSceneItem[] = draftPages.map((_, i) => ({
    page: i,
    scene_prompt:
      i === 0 ?
        `Children's book cover: ${childName} as the hero, large centred portrait, colourful Indian style` :
        i === backCoverIndex ?
          `Warm Indian sunset back cover, small cheerful portrait of ${childName} in corner, TinguTales.com branding space in centre, soft floral motifs` :
          `${childName} in a vibrant Indian storybook scene, page ${i}`,
  }));
  return {items: fallback, tokens};
}

// ─────────────────────────────────────────────────────────────────────────────
// Core pipeline — shared by the Firestore trigger and the retry callable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full scene-generation pipeline for a story.
 * Reads story data from Firestore, describes avatar, generates scene prompts,
 * writes pages subcollection, and advances status to "generating_cover".
 * @param {string} storyId - Firestore story document ID.
 * @return {Promise<void>}
 */
async function runScenePipeline(storyId: string): Promise<void> {
  const storyRef = db.collection("stories").doc(storyId);
  const storySnap = await storyRef.get();
  if (!storySnap.exists) throw new Error(`Story ${storyId} not found`);
  const data = storySnap.data() ?? {};

  const userId: string = data.user_id ?? "";
  const profileId: string = data.profile_id ?? "";
  const childName: string = data.child_name ?? "the child";
  const childAge: number = data.child_age ?? 5;
  const numPages: number = data.page_count ?? 8;
  const storyTitle: string = data.title ?? "";
  const titleEnglish: string = data.title_english ?? storyTitle;
  const subtitle: string = data.subtitle ?? "";
  const subtitleEnglish: string = data.subtitle_english ?? subtitle;
  const synopsis: string = data.synopsis ?? "";
  const draftPages: {page: number; text: string; page_type?: string}[] =
    Array.isArray(data.draft_pages) ? data.draft_pages : [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const ai = new GoogleGenAI({apiKey});

  const modelDoc = await db.collection("models").doc("story_generation_model").get();
  const modelName: string =
    modelDoc.exists && modelDoc.data()?.name ?
      (modelDoc.data()?.name as string) :
      "gemini-2.5-flash";

  let totalTokens = 0;

  // ── Step 1: Describe avatar → structured character card ──────────────────
  const childGender: string = data.child_gender ?? "";

  let characterCard: CharacterCard = {
    gender: childGender,
    skin_tone: "natural Indian skin tone (refer to avatar image)",
    face: "round face, large expressive dark eyes, cheerful smile",
    hair: "black hair, neat style",
    accessories: "none",
    default_outfit: "colourful Indian attire",
  };

  const avatarGcsPath = `${userId}/${profileId}/avatar/avatar.jpg`;
  try {
    logger.info(`[generateScenes] loading avatar gs://${bucket.name}/${avatarGcsPath}`);
    const [avatarBytes] = await bucket.file(avatarGcsPath).download();
    const avatarB64 = avatarBytes.toString("base64");
    logger.info(`[generateScenes] avatar loaded — ${avatarBytes.length}B`);

    const {card, tokens: t1} = await withRetry(() =>
      describeAvatarAsCharacterCard(ai, modelName, avatarB64, "image/jpeg")
    );
    characterCard = {...card, gender: childGender};
    totalTokens += t1;
    logger.info(`[generateScenes] character card: ${JSON.stringify(card)}`);
  } catch (avatarErr) {
    logger.warn(`[generateScenes] avatar describe failed (using defaults): ${avatarErr}`);
  }

  // ── Step 2: Build common context entities from story text ─────────────────
  logger.info("[generateScenes] extracting common context entities");
  let commonContextEntities: StoryEntityContext[] = [];
  try {
    const {entities, tokens: tCCE} = await withRetry(() =>
      extractCommonContextEntities(ai, modelName, childName, synopsis, draftPages)
    );
    commonContextEntities = entities;
    totalTokens += tCCE;
    const categoryCounts = commonContextEntities.reduce<Record<string, number>>((acc, entity) => {
      const key = entity.category || "other";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const sampleEntities = commonContextEntities.slice(0, 5).map((entity) => ({
      name: entity.name,
      category: entity.category,
      role: entity.role,
    }));
    logger.info(
      `[generateScenes] found ${commonContextEntities.length} common context entit(y/ies): ` +
      `${commonContextEntities.map((e) => e.name).join(", ")}`
    );
    logger.info("[generateScenes] common context entity breakdown", {
      total: commonContextEntities.length,
      categoryCounts,
      sampleEntities,
    });
  } catch (scErr) {
    logger.warn(`[generateScenes] common context extraction failed (skipping): ${scErr}`);
  }

  // Backward compatibility: keep person entities in supporting_characters.
  const supportingCharacters = commonContextEntities
    .filter((e) => e.category === "person")
    .map((e) => ({
      name: e.name,
      role: e.role,
      appearance: e.appearance,
    }));

  // ── Step 3: Generate scene prompts (with retry) ───────────────────────────
  logger.info(`[generateScenes] generating scene prompts for ${numPages} pages`);
  const {items: sceneItems, tokens: t2} = await withRetry(() =>
    generateScenePrompts(
      ai, modelName, storyTitle, titleEnglish, synopsis,
      childName, childAge, childGender, draftPages, characterCard, numPages,
      commonContextEntities
    )
  );
  totalTokens += t2;
  logger.info(`[generateScenes] got ${sceneItems.length} prompts, totalTokens=${totalTokens}`);

  // ── Step 4: Write pages subcollection ────────────────────────────────────
  const pagesColl = storyRef.collection("pages");
  const batch = db.batch();

  for (const item of sceneItems) {
    const idx = item.page;
    const draftPage = draftPages.find((p) => p.page === idx);

    const pageType: string =
      draftPage?.page_type ??
      (idx === 0 ?
        "cover" :
        idx === numPages - 1 ?
          "back_cover" :
          "story");

    const pageDoc: SceneData = {
      page: idx,
      page_type: pageType,
      text: draftPage?.text ?? "",
      scene_prompt: item.scene_prompt,
      ...(idx === 0 ? {
        cover_title: storyTitle,
        cover_subtitle: subtitle || subtitleEnglish,
      } : {}),
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
    };

    batch.set(pagesColl.doc(`page_${idx}`), pageDoc);
  }

  await batch.commit();
  logger.info(`[generateScenes] saved ${sceneItems.length} page docs`);

  void recordTokenConsumption(userId, "scene_generation", "gemini", totalTokens);

  // ── Step 5: Save character card + common context + advance to image generation ──
  await storyRef.update({
    character_card: characterCard,
    common_context_entities: commonContextEntities,
    supporting_characters: supportingCharacters,
    status: "generating_images",
    updated_at: FieldValue.serverTimestamp(),
  });

  logger.info("[generateScenes] persisted context metadata", {
    storyId,
    commonContextEntitiesCount: commonContextEntities.length,
    supportingCharactersCount: supportingCharacters.length,
  });

  logger.info(`[generateScenes] complete — storyId=${storyId} status=generating_images`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore trigger — fires when status → "approved"
// ─────────────────────────────────────────────────────────────────────────────
export const generateScenes = onDocumentUpdated(
  {
    document: "stories/{storyId}",
    region: "asia-south1",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    // Fire on "approved" transition only
    if (before?.status === after.status || after.status !== "approved") return;

    const storyId = event.params.storyId;
    const storyRef = db.collection("stories").doc(storyId);

    logger.info(`[generateScenes] triggered storyId=${storyId}`);

    // Claim immediately so concurrent triggers can't double-run
    await storyRef.update({
      status: "generating_scenes",
      updated_at: FieldValue.serverTimestamp(),
    });

    try {
      await runScenePipeline(storyId);
    } catch (err) {
      logger.error(`[generateScenes] FAILED storyId=${storyId}`, err);
      await storyRef.update({
        status: "scenes_failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Callable — retrySceneGeneration
// Called from the UI when status === "scenes_failed"
// ─────────────────────────────────────────────────────────────────────────────
export const retrySceneGeneration = onCall<{storyId: string}>(
  {region: "asia-south1", timeoutSeconds: 300, memory: "512MiB"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const userId = request.auth.uid;
    const {storyId} = request.data;

    if (!storyId) throw new HttpsError("invalid-argument", "storyId is required.");

    const storyRef = db.collection("stories").doc(storyId);
    const snap = await storyRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Story not found.");
    const story = snap.data() ?? {};
    if (story["user_id"] !== userId) throw new HttpsError("permission-denied", "Not your story.");
    if (story["status"] !== "scenes_failed") {
      throw new HttpsError(
        "failed-precondition",
        `Story must be in scenes_failed state (current: ${story["status"]}).`
      );
    }

    await storyRef.update({
      status: "generating_scenes",
      error_message: null,
      updated_at: FieldValue.serverTimestamp(),
    });

    logger.info(`[retrySceneGeneration] storyId=${storyId} userId=${userId}`);

    try {
      await runScenePipeline(storyId);
    } catch (err) {
      await storyRef.update({
        status: "scenes_failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "Scene generation failed. Please try again.");
    }

    return {storyId, status: "generating_images"};
  }
);
