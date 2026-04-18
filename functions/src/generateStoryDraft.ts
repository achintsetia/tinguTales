import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";
import {GoogleGenAI} from "@google/genai";
import {v4 as uuidv4} from "uuid";
import {db} from "./admin.js";
import {recordTokenConsumption} from "./tokenConsumption.js";

// ─────────────────────────────────────────────────────────────────────────────
// Age-appropriate writing level guidance  (mirrors story_planner.py)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns age-appropriate writing level guidance for the given child age.
 * @param {number} age - The child's age in years.
 * @return {string} Writing level instruction string.
 */
function ageWritingGuide(age: number): string {
  if (age <= 2) {
    return "WRITING LEVEL — Age 2: Use only the simplest nouns and action verbs a toddler knows " +
      "(cat, dog, run, jump, eat, sleep, big, small). " +
      "Max 1 sentence per page. No subordinate clauses. Lots of sound words (moo, splash, boom).";
  } else if (age === 3) {
    return "WRITING LEVEL — Age 3: Very short, simple sentences (5-7 words each). " +
      "1-2 sentences per page. Use repetitive, rhythmic patterns children can memorise. " +
      "Only everyday concrete words — no abstract concepts. " +
      "Examples of good vocabulary: happy, hungry, small, big, fast, friend, home.";
  } else if (age === 4) {
    return "WRITING LEVEL — Age 4: Short sentences (6-9 words each). 2 sentences per page. " +
      "Simple cause-and-effect ('He was hungry, so he ate'). " +
      "Introduce 1-2 new vocabulary words per story page, explained by context. " +
      "Repetition and rhyme are encouraged. Avoid complex tenses.";
  } else if (age === 5) {
    return "WRITING LEVEL — Age 5: Sentences of 8-10 words. 2-3 sentences per page. " +
      "Simple compound sentences joined with 'and', 'but', 'so'. " +
      "Can include mild emotions (excited, nervous, proud). " +
      "Short dialogue is great. Avoid multi-syllable abstract words.";
  } else if (age === 6) {
    return "WRITING LEVEL — Age 6 (early reader): Sentences of 8-12 words. 2-3 sentences per page. " +
      "Compound and simple complex sentences. Introduce descriptive adjectives. " +
      "Short dialogue with attribution ('said', 'asked', 'replied'). " +
      "Word difficulty: Grade 1 reading level.";
  } else if (age === 7) {
    return "WRITING LEVEL — Age 7 (first-grade reader): Sentences of 10-14 words. 3 sentences per page. " +
      "Richer descriptive language, simple similes ('as fast as the wind'). " +
      "Short paragraphs. Dialogue with some expression ('whispered', 'shouted'). " +
      "Word difficulty: Grade 1-2 reading level.";
  } else if (age === 8) {
    return "WRITING LEVEL — Age 8 (second-grade reader): Sentences of 10-16 words. 3-4 sentences per page. " +
      "Vivid descriptions, varied sentence starters, simple metaphors. " +
      "Expressive dialogue. Can introduce a mild subplot. " +
      "Word difficulty: Grade 2 reading level — challenge with 1-2 richer words per page.";
  } else {
    return `WRITING LEVEL — Age ${age} (confident reader): Sentences of 12-18 words. 3-5 sentences per page. ` +
      "Rich vocabulary, figurative language, varied sentence structure. " +
      "Multi-layered emotions, expressive dialogue, mild irony or humour. " +
      "Word difficulty: Grade 3+ — stretch vocabulary purposefully.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Story beats spread across the page count  (mirrors story_planner.py)
// ─────────────────────────────────────────────────────────────────────────────
const ALL_BEATS = [
  "Introduction — meet the child and the world around them",
  "The adventure begins — child discovers something new or faces a situation",
  "Rising action — first attempt; the child tries but finds it tricky",
  "A new discovery — child notices a clue or gets an idea that hints at the lesson",
  "The big challenge — the obstacle that makes the lesson necessary",
  "A helping hand — a friend, elder, or small creature models the lesson in action",
  "The child tries again — applying what was just observed or learned",
  "Rising tension — almost there, but one last hurdle remains",
  "The turning point — the child uses the lesson and it works!",
  "Resolution — everything comes together; the world is a little better",
  "Celebration — child is proud; friends/family celebrate the learning",
  "Reflection — quiet moment where the child thinks about what they now know",
];

/**
 * Returns an array of story beat descriptions spread across the given page count.
 * @param {number} storyPageCount - Number of story pages (excluding cover/back-cover).
 * @return {string[]} Array of beat description strings.
 */
function storyBeats(storyPageCount: number): string[] {
  if (storyPageCount <= 0) return [];
  if (storyPageCount === 1) return [ALL_BEATS[0]];
  if (storyPageCount <= ALL_BEATS.length) {
    return Array.from({length: storyPageCount}, (_, i) =>
      ALL_BEATS[Math.round(i * (ALL_BEATS.length - 1) / (storyPageCount - 1))]
    );
  }
  const result = [...ALL_BEATS];
  while (result.length < storyPageCount) result.push(...ALL_BEATS.slice(1, -1));
  return result.slice(0, storyPageCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse JSON that Gemini may wrap in a markdown code block
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Parses JSON from Gemini output, stripping any markdown code-block fences.
 * @param {string} text - Raw text output from Gemini.
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
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface StoryPage {
  page: number;
  type: string;
  description: string;
}

interface StoryOutline {
  title: string;
  titleEnglish: string;
  synopsis: string;
  moral: string;
  lessonPhrase?: string;
  pages: StoryPage[];
}

interface PageText {
  page: number;
  text: string;
  avatar_url?: string;
  page_type?: string;
}

interface GenerateStoryDraftRequest {
  profileId: string;
  /** Display name of the language, e.g. "Hindi" */
  language: string;
  /** 2-letter code, e.g. "hi" */
  languageCode: string;
  interests: string[];
  pageCount?: number;
  customIncident?: string;
  nativeChildName?: string;
  /** Title of the selected story template, e.g. "Chhath Puja" */
  templateTitle?: string;
  /** Description of the selected story template */
  templateDesc?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 1 — Normalize interests to clean story themes  (mirrors input_agent.py)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Agent 1 — normalizes raw interest tags into clean story themes.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Model name to use.
 * @param {string[]} interests - Raw interest tags from the user.
 * @param {string} languageCode - Target language code.
 * @return {Promise<object>} Normalized themes and token count.
 */
async function normalizeInterests(
  ai: GoogleGenAI,
  model: string,
  interests: string[],
  languageCode: string
): Promise<{themes: string[]; tokens: number}> {
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [{
        text: "Normalize these children's interests into 2-4 clear story themes.\n" +
          `Interests: ${interests.join(", ")}\n` +
          `Language context: ${languageCode}\n` +
          "Return ONLY a JSON array of theme strings, e.g. [\"space exploration\", \"friendship\", \"courage\"]",
      }],
    }],
    config: {
      systemInstruction:
        "You are an input understanding agent for a children's storybook platform. " +
        "Parse user interests into structured, normalized English themes suitable for story generation. " +
        "Handle mixed-language input (Hinglish, Tanglish, etc.).",
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    const parsed = parseGeminiJson(text);
    if (Array.isArray(parsed)) return {themes: parsed as string[], tokens};
  } catch {/* fall through */}

  return {
    themes: text.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4),
    tokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 2 — Create page-by-page story outline  (mirrors story_planner.py)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Agent 2 — creates a page-by-page story outline with a learning arc.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Model name to use.
 * @param {string} childName - The child's name.
 * @param {number} childAge - The child's age.
 * @param {string[]} themes - Normalized story themes.
 * @param {string} languageCode - Target language code.
 * @param {string} languageName - Target language display name.
 * @param {number} numPages - Total page count including cover and back cover.
 * @param {string} customIncident - Optional real-life incident to weave in.
 * @param {string} templateTitle - Optional template title (e.g. "Chhath Puja").
 * @param {string} templateDesc - Optional template description.
 * @return {Promise<object>} Story outline and token count.
 */
async function planStory(
  ai: GoogleGenAI,
  model: string,
  childName: string,
  childAge: number,
  themes: string[],
  languageCode: string,
  languageName: string,
  numPages: number,
  customIncident: string,
  templateTitle = "",
  templateDesc = ""
): Promise<{outline: StoryOutline; tokens: number}> {
  const writingGuide = ageWritingGuide(childAge);
  // Page layout: 0=cover, 1..N-3=story, N-2=back_cover, N-1=branding
  const storyPageCount = numPages - 3;
  const beats = storyBeats(storyPageCount);

  const incidentInstruction = customIncident ?
    `\n\nSPECIAL MOMENT TO WEAVE IN: The child experienced this today — "${customIncident}"\n` +
    "Build the story arc so that this moment is the central challenge or inciting event.\n" +
    "Resolve it constructively: show resilience, learning, or kindness so the child feels\n" +
    "validated and empowered by the end. Keep it age-appropriate and emotionally warm." :
    "";

  const templateInstruction = templateTitle ?
    `\n\nTEMPLATE THEME (MANDATORY): This story MUST be specifically about "${templateTitle}".\n` +
    (templateDesc ? `Theme description: ${templateDesc}\n` : "") +
    "The central event, setting, and story arc MUST revolve around this theme. " +
    "Do NOT substitute with a different festival, event, or topic. " +
    "Use the themes/interests only to enrich details within this specific story." :
    "";

  const pagesJson = [
    "    {\"page\": 0, \"type\": \"cover\", \"description\": \"What the cover shows\"}",
    ...beats.map((beat, i) => `    {"page": ${i + 1}, "type": "story", "description": "${beat}"}`),
    `    {"page": ${numPages - 2}, "type": "back_cover", "description": "Warm closing message with lesson summary"}`,
    `    {"page": ${numPages - 1}, "type": "branding", "description": "TinguTales.com branding page"}`,
  ].join(",\n");

  const prompt =
    "Create a story outline for a personalized children's storybook.\n\n" +
    `Child: ${childName}, Age: ${childAge}\n` +
    `Themes/Interests: ${themes.join(", ")}\n` +
    `Target Language: ${languageName} (${languageCode})\n` +
    `AGE-APPROPRIATE LANGUAGE REQUIREMENT:\n${writingGuide}\n` +
    "Every page description MUST note the vocabulary level so the writer follows it exactly.\n\n" +
    "LEARNING THEME REQUIREMENT:\n" +
    `Choose ONE concrete lesson that a ${childAge}-year-old can understand and apply in daily life.\n` +
    "Examples: sharing, patience, trying again after failing, asking for help, being kind, " +
    "courage, honesty, respecting nature, teamwork, standing up for others.\n" +
    "The lesson must be SHOWN through the child's actions — never stated as a lecture.\n\n" +
    `Create a story with exactly ${numPages} pages:\n` +
    `- Page 0: FRONT COVER — title prominently featuring ${childName}'s name and a subtitle hinting at the adventure\n` +
    `- Pages 1-${numPages - 3}: Story pages (${beats.join(", ")}) — the learning arc builds gradually across these pages\n` +
    `- Page ${numPages - 2}: BACK COVER — a warm closing message summarising what ${childName} learned today\n` +
    `- Page ${numPages - 1}: BRANDING — always "TinguTales.com" branding, fixed text (see rules below)\n\n` +
    "The story must:\n" +
    `- Feature ${childName} as the brave, curious main character\n` +
    `- Show ${childName} NOT knowing the lesson → encountering a challenge → learning by doing\n` +
    "- Be culturally relevant with Indian elements where natural\n" +
    `- Be age-appropriate for a ${childAge}-year-old\n` +
    `- End with the child feeling proud and capable, not lectured${templateInstruction}${incidentInstruction}\n\n` +
    "Return ONLY valid JSON (no markdown):\n" +
    "{\n" +
    `  "title": "Story title in ${languageName}",\n` +
    "  \"titleEnglish\": \"English translation of title\",\n" +
    "  \"synopsis\": \"Brief 2-line synopsis in English\",\n" +
    `  "moral": "One concrete lesson ${childName} will take away (e.g. 'Sharing makes everyone happy')",\n` +
    `  "lessonPhrase": "One short phrase (5-8 words) for the back cover, e.g. '${childName} learned that sharing is caring'",\n` +
    `  "pages": [\n${pagesJson}\n  ]\n}`;

  const response = await ai.models.generateContent({
    model,
    contents: [{role: "user", parts: [{text: prompt}]}],
    config: {
      systemInstruction:
        "You are a children's story planner specializing in Indian storytelling traditions. " +
        "Create engaging story outlines for children's picture books. " +
        "Every story must have a clear learning arc: the child starts without knowing the lesson, " +
        "faces a challenge where the lesson is needed, learns it through experience (not lecture), " +
        "and ends feeling proud and capable. " +
        `Stories will be written in ${languageName}.\n\n${writingGuide}`,
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    return {outline: parseGeminiJson(text) as StoryOutline, tokens};
  } catch {
    return {
      outline: {
        title: `${childName}'s Adventure`,
        titleEnglish: `${childName}'s Adventure`,
        synopsis: `An adventure story about ${childName} exploring ${themes.join(", ")}`,
        moral: "Be brave and kind",
        pages: Array.from({length: numPages}, (_, i) => ({
          page: i,
          type: i === 0 ? "cover" : i === numPages - 1 ? "branding" : i === numPages - 2 ? "back_cover" : "story",
          description: `Page ${i}`,
        })),
      },
      tokens,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 3 — Write the full story natively in the target language
//           (mirrors story_writer.py)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Agent 3 — writes the full story natively in the target language.
 * @param {GoogleGenAI} ai - GoogleGenAI instance.
 * @param {string} model - Model name to use.
 * @param {StoryOutline} outline - Story outline from Agent 2.
 * @param {string} languageName - Target language display name.
 * @param {string} childName - The child's name.
 * @param {number} childAge - The child's age.
 * @param {number} numPages - Total page count.
 * @param {string} customIncident - Optional real-life incident to weave in.
 * @return {Promise<object>} Written pages and token count.
 */
async function writeStory(
  ai: GoogleGenAI,
  model: string,
  outline: StoryOutline,
  languageName: string,
  childName: string,
  childAge: number,
  numPages: number,
  customIncident: string
): Promise<{pages: PageText[]; tokens: number}> {
  const writingGuide = ageWritingGuide(childAge);

  const jsonTemplate = "[\n" +
    Array.from({length: numPages}, (_, i) => {
      let label: string;
      if (i === 0) label = "Cover text";
      else if (i === numPages - 2) label = "Back cover text";
      else if (i === numPages - 1) label = "TinguTales branding (always in English, see rules)";
      else label = `Page ${i} text`;
      return `  {"page": ${i}, "text": "${label} in ${i === numPages - 1 ? "English" : languageName}"}`;
    }).join(",\n") +
    "\n]";

  const incidentNote = customIncident ?
    `\n\nIMPORTANT — A real moment to honour: "${customIncident}"\n` +
    "Weave this into the story naturally. It should be the central challenge or\n" +
    "inciting event. Resolve it with warmth and encouragement so the child feels\n" +
    "brave, resilient, or proud. Keep the tone gentle and empowering." :
    "";

  const lessonPhrase = outline.lessonPhrase ||
    `${childName} learned something wonderful today!`;

  const prompt =
    `Write a complete children's storybook natively in ${languageName}.\n\n` +
    `Child: ${childName}, Age: ${childAge}\n` +
    `Moral / Lesson: ${outline.moral}\n\n` +
    `AGE-APPROPRIATE LANGUAGE REQUIREMENT (MANDATORY):\n${writingGuide}\n` +
    "Every page MUST strictly follow the sentence count, word length, and vocabulary level above.\n\n" +
    "LEARNING ARC REQUIREMENT (MANDATORY):\n" +
    `The story must show ${childName} learning "${outline.moral}" through EXPERIENCE, not explanation.\n` +
    `Early pages: ${childName} does NOT know the lesson — show naivety or struggle naturally.\n` +
    "Middle pages: a friend, elder, or small creature models or hints at the lesson.\n" +
    `Climax page: ${childName} applies the lesson and it works — small triumph!\n` +
    "Throughout: weave the learning theme into actions, dialogue and small details.\n\n" +
    "COVER, BACK COVER & BRANDING RULES:\n" +
    "- Page 0 (Front Cover): Title text = story title. Below it, a short tagline (max 8 words) that\n" +
    `  names ${childName} and hints at the adventure. Example: "${childName} and the Magic Garden".\n` +
    `- Page ${numPages - 2} (Back Cover): Warm, celebratory closing. Start with the lesson phrase:\n` +
    `  "${lessonPhrase}". Then 1-2 sentences inviting the reader to try the lesson too.\n` +
    `- Page ${numPages - 1} (Branding): ALWAYS write in English. Creative, magical, child-friendly sentence\n` +
    "  that mentions TinguTales.com. Examples:\n" +
    "  \"Every child has a story. Create yours at TinguTales.com ✨\"\n" +
    `  "This story was made just for ${childName} with love at TinguTales.com 🌟"\n` +
    "  \"Your next adventure is waiting... TinguTales.com 🚀\"\n" +
    "  Make it feel magical and personal. Always end with TinguTales.com on its own line.\n\n" +
    "Story Outline:\n" +
    `Title: ${outline.title}\n` +
    `Synopsis: ${outline.synopsis}\n` +
    `Pages: ${JSON.stringify(outline.pages)}\n` +
    `${incidentNote}\n\n` +
    `Write text for ALL ${numPages} pages. Follow the sentence-count rule per page from the writing guide.\n` +
    `Text MUST be written in ${languageName} script (not transliteration).\n\n` +
    `Return ONLY a valid JSON array (no markdown):\n${jsonTemplate}`;

  const response = await ai.models.generateContent({
    model,
    contents: [{role: "user", parts: [{text: prompt}]}],
    config: {
      systemInstruction:
        `You are a master children's storyteller who writes natively in ${languageName}. ` +
        `You create stories DIRECTLY in ${languageName} — not translating from English. ` +
        `Your writing uses natural ${languageName} phrasing and cultural context. ` +
        "For Hindi/Marathi use Devanagari script, Kannada use Kannada script, Tamil use Tamil script, " +
        "Telugu use Telugu script, Bengali use Bengali script, Gujarati use Gujarati script, " +
        "Malayalam use Malayalam script. If language is English, write in simple engaging English.\n\n" +
        "CORE STORYTELLING PRINCIPLE: Every story MUST have a learning arc. The child character " +
        "starts without knowing the lesson, faces a real challenge, learns through experience " +
        "(shown — never told), and ends feeling proud and capable. The reader should close the " +
        "book having vicariously experienced the lesson alongside the child.\n\n" +
        `CRITICAL — VOCABULARY AND READING LEVEL FOR THIS STORY:\n${writingGuide}\n` +
        "You MUST follow these rules on every single page.",
    },
  });

  const text = response.text ?? "";
  const tokens = response.usageMetadata?.totalTokenCount ?? 0;

  try {
    const parsed = parseGeminiJson(text);
    if (Array.isArray(parsed)) return {pages: parsed as PageText[], tokens};
  } catch {/* fall through */}

  return {
    pages: Array.from({length: numPages}, (_, i) => ({page: i, text: `Page ${i}`})),
    tokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 4 — QA & Naturalize  (Sarvam sarvam-30b)
// Rewrites textbook-ish prose into spoken, colloquial Indian language and runs
// quality checks: name spelling, age-appropriate vocabulary, cultural tone.
// Falls back to original pages if the Sarvam call fails.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Agent 4 — QA and naturalize story pages using the Sarvam sarvam-30b model.
 * @param {PageText[]} pages - Draft pages from the story writer agent.
 * @param {string} languageName - Target language display name.
 * @param {string} languageCode - 2-letter language code.
 * @param {string} childName - The child's name.
 * @param {number} childAge - The child's age.
 * @param {string} storyTitle - Current story title.
 * @param {string} sarvamApiKey - Sarvam API subscription key.
 * @return {Promise<object>} QA-corrected pages, corrected title, and issues list.
 */
async function qaAndNaturalize(
  pages: PageText[],
  languageName: string,
  languageCode: string,
  childName: string,
  childAge: number,
  storyTitle: string,
  sarvamApiKey: string
): Promise<{pages: PageText[]; title: string; issues: string[]; tokens: number; inputTokens?: number; outputTokens?: number}> {
  const writingGuide = ageWritingGuide(childAge);
  const numPages = pages.length;
  const storyOnlyPages = pages.filter((p) => p.page_type === "story" || p.page_type === "cover" || p.page_type === "back_cover");
  const brandingPages = pages.filter((p) => p.page_type === "branding");

  logger.info("[qaAndNaturalize] starting", {
    languageCode,
    languageName,
    childAge,
    totalPages: numPages,
    storyPages: storyOnlyPages.length,
    brandingPages: brandingPages.length,
  });

  // Build a compact JSON representation for the prompt
  const pagesJson = JSON.stringify(
    storyOnlyPages.map((p) => ({page: p.page, type: p.page_type ?? "story", text: p.text})),
    null,
    2
  );

  const systemPrompt =
    "You are a master editor for Indian children's storybooks. " +
    "Your job is to transform textbook-style prose into warm, spoken, colloquial Indian storytelling. " +
    `The story is written in ${languageName} for a ${childAge}-year-old child named ${childName}.\n\n` +
    "SPOKEN LANGUAGE RULES (apply to EVERY page):\n" +
    "1. Replace formal/passive constructions with direct, active, conversational phrasing.\n" +
    "2. Use natural Indian storytelling rhythm — short punchy sentences, sound words (dhoom!, splash!, wow!), " +
    "   direct quotes from characters using everyday speech patterns.\n" +
    "3. Avoid English textbook clichés like \"Suddenly he realized\", \"It was a beautiful day\", " +
    `   "The protagonist felt". Instead: "Oh! He stopped.", "What a sunny morning!", "${childName} smiled."\n` +
    "4. For Indian languages: use natural spoken forms — contractions, common expressions, " +
    "   particles and interjections used in everyday speech (e.g. \"अरे!\", \"वाह!\", \"enna?\" etc.).\n" +
    "5. Keep cultural references warm and authentic — mention familiar Indian sounds, smells, textures.\n\n" +
    "QUALITY CHECKS (fix any issues found):\n" +
    `- Name consistency: "${childName}" must be spelled exactly the same on every page.\n` +
    `- Language consistency: all story pages MUST be in ${languageName} only.\n` +
    `- Reading level compliance:\n${writingGuide}\n` +
    `- Safety: no fear, violence, or content inappropriate for a ${childAge}-year-old.\n` +
    `- Title must feature ${childName}'s name.\n\n` +
    "Return ONLY valid JSON — no markdown fences, no extra text.";

  const userPrompt =
    `Story title: "${storyTitle}"\n` +
    `Language: ${languageName} (${languageCode})\n` +
    `Child: ${childName}, Age: ${childAge}\n` +
    `Total pages including branding: ${numPages}\n\n` +
    `Pages to review and rewrite:\n${pagesJson}\n\n` +
    "Return this exact JSON shape:\n" +
    "{\n" +
    `  "corrected_title": "<improved title, must include ${childName}'s name>",\n` +
    "  \"issues\": [\"<issue 1>\", \"<issue 2>\"],\n" +
    "  \"pages\": [\n" +
    storyOnlyPages.map((p) =>
      `    {"page": ${p.page}, "text": "<naturalized ${p.page_type ?? "story"} text>"}`
    ).join(",\n") +
    "\n  ]\n}";

  logger.info("[qaAndNaturalize] calling Sarvam chat completions", {
    model: "sarvam-30b",
    temperature: 0.3,
    maxTokens: 6000,
    storyPages: storyOnlyPages.length,
  });

  const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sarvamApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sarvam-30b",
      messages: [
        {role: "system", content: systemPrompt},
        {role: "user", content: userPrompt},
      ],
      temperature: 0.3,
      max_tokens: 6000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    logger.error("[qaAndNaturalize] Sarvam HTTP error", {
      status: response.status,
      statusText: response.statusText,
      errText,
    });
    throw new Error(`Sarvam QA agent HTTP ${response.status}: ${errText}`);
  }

  const json = await response.json() as {
    choices?: {message?: {content?: string}}[];
    usage?: {total_tokens?: number; prompt_tokens?: number; completion_tokens?: number};
  };

  logger.info("[qaAndNaturalize] Sarvam response received", {
    totalTokens: json.usage?.total_tokens ?? 0,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    choices: json.choices?.length ?? 0,
  });

  const raw = json.choices?.[0]?.message?.content ?? "";

  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = firstNewline >= 0 ? cleaned.slice(firstNewline + 1) : cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

  let parsed: {
    corrected_title?: string;
    issues?: string[];
    pages?: {page: number; text: string}[];
  };
  try {
    parsed = JSON.parse(cleaned.trim()) as {
      corrected_title?: string;
      issues?: string[];
      pages?: {page: number; text: string}[];
    };
  } catch (parseErr) {
    logger.error("[qaAndNaturalize] failed to parse Sarvam JSON", {
      rawLength: raw.length,
      cleanedLength: cleaned.length,
      preview: cleaned.slice(0, 400),
      parseErr,
    });
    throw parseErr;
  }

  // Merge corrected texts back into the original page objects (preserving metadata)
  const correctedMap = new Map<number, string>(
    (parsed.pages ?? []).map((p) => [p.page, p.text])
  );
  const mergedPages: PageText[] = pages.map((p) => ({
    ...p,
    text: correctedMap.has(p.page) ? (correctedMap.get(p.page) ?? p.text) : p.text,
  }));
  // Branding pages are always kept as-is
  brandingPages.forEach((bp) => {
    const idx = mergedPages.findIndex((p) => p.page === bp.page);
    if (idx >= 0) mergedPages[idx] = bp;
  });

  const sarvamTokens = json.usage?.total_tokens ?? 0;

  logger.info("[qaAndNaturalize] completed", {
    correctedPages: parsed.pages?.length ?? 0,
    issuesCount: parsed.issues?.length ?? 0,
    titleChanged: Boolean(parsed.corrected_title && parsed.corrected_title !== storyTitle),
    totalTokens: sarvamTokens,
  });

  return {
    pages: mergedPages,
    title: parsed.corrected_title ?? storyTitle,
    issues: parsed.issues ?? [],
    tokens: sarvamTokens,
    inputTokens: json.usage?.prompt_tokens,
    outputTokens: json.usage?.completion_tokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateStoryDraft — main onCall handler
// Runs the three-agent pipeline and returns draft pages synchronously.
// Also persists the story to Firestore  stories/{storyId}.
// ─────────────────────────────────────────────────────────────────────────────
export const generateStoryDraft = onCall<GenerateStoryDraftRequest>(
  {region: "asia-south1", timeoutSeconds: 540, memory: "512MiB"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const userId = request.auth.uid;

    const {
      profileId,
      language,
      languageCode,
      interests,
      pageCount: rawPageCount,
      customIncident = "",
      nativeChildName = "",
      templateTitle = "",
      templateDesc = "",
    } = request.data;

    if (!profileId || !language || !languageCode || !Array.isArray(interests) || interests.length === 0) {
      throw new HttpsError("invalid-argument", "profileId, language, languageCode, and interests are required.");
    }

    const pageCount = Math.max(6, Math.min(16, rawPageCount ?? 8));

    // ── Fetch and validate child profile ──────────────────────────────────
    const profileSnap = await db.collection("child_profiles").doc(profileId).get();
    if (!profileSnap.exists) throw new HttpsError("not-found", "Child profile not found.");
    const profile = profileSnap.data();
    if (!profile) throw new HttpsError("not-found", "Child profile data missing.");
    if (profile.user_id !== userId) throw new HttpsError("permission-denied", "Profile does not belong to this user.");

    // Use native name when provided (e.g. "अर्जुन"), otherwise English name
    const childName = nativeChildName.trim() || (profile.name as string);
    const childAge = (profile.age as number) ?? 5;

    // ── Read model name from Firestore ────────────────────────────────────
    const modelDoc = await db.collection("models").doc("story_generation_model").get();
    const modelDocData = modelDoc.data();
    const modelName: string = (modelDoc.exists && modelDocData?.name) ?
      modelDocData.name as string :
      "gemini-2.5-flash";
    logger.info(`[generateStoryDraft] using model=${modelName} for userId=${userId}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpsError("internal", "GEMINI_API_KEY is not configured.");
    const sarvamApiKey = process.env.SARVAM_API_KEY ?? "";

    const ai = new GoogleGenAI({apiKey});

    // ── Create story document with "drafting" status ──────────────────────
    const storyId = `story_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const storyRef = db.collection("stories").doc(storyId);
    await storyRef.set({
      story_id: storyId,
      user_id: userId,
      profile_id: profileId,
      child_name: childName,
      language,
      language_code: languageCode,
      interests,
      custom_incident: customIncident,
      page_count: pageCount,
      avatar_url: profile.avatar_jpeg_url || profile.avatar_url || "",
      template_title: templateTitle || null,
      template_desc: templateDesc || null,
      status: "drafting",
      title: "",
      draft_pages: [],
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    try {
      let totalTokens = 0;

      // === Agent 1: Normalize interests → themes ===
      logger.info(`[generateStoryDraft] [${storyId}] step 1/3 — normalizing interests`);
      const {themes, tokens: t1} = await normalizeInterests(ai, modelName, interests, languageCode);
      totalTokens += t1;
      logger.info(`[generateStoryDraft] [${storyId}] themes: ${themes.join(", ")}`);

      // === Agent 2: Plan the story ===
      logger.info(`[generateStoryDraft] [${storyId}] step 2/3 — planning story outline`);
      const {outline, tokens: t2} = await planStory(
        ai, modelName, childName, childAge, themes, languageCode, language, pageCount, customIncident,
        templateTitle, templateDesc
      );
      totalTokens += t2;
      logger.info(`[generateStoryDraft] [${storyId}] outline title: "${outline.title}"`);

      // === Agent 3: Write the story ===
      logger.info(`[generateStoryDraft] [${storyId}] step 3/4 — writing story`);
      const {pages: rawPages, tokens: t3} = await writeStory(
        ai, modelName, outline, language, childName, childAge, pageCount, customIncident
      );
      totalTokens += t3;
      logger.info(`[generateStoryDraft] [${storyId}] wrote ${rawPages.length} pages, totalTokens=${totalTokens}`);

      // Annotate each page with its type from the outline, and inject avatar
      // URL into the branding page so the viewer can render it
      const childAvatarUrl: string = profile.avatar_jpeg_url || profile.avatar_url || "";
      const pageTypeMap = new Map<number, string>(
        outline.pages.map((p) => [p.page, p.type])
      );
      for (const page of rawPages) {
        page.page_type = pageTypeMap.get(page.page) ?? "story";
      }
      const brandingPage = rawPages.find((p) => p.page_type === "branding");
      if (brandingPage && childAvatarUrl) {
        brandingPage.avatar_url = childAvatarUrl;
      }

      // === Agent 4: QA & Naturalize (Sarvam sarvam-30b) ===
      let draftPages = rawPages;
      let finalTitle = outline.title;
      if (sarvamApiKey) {
        logger.info(`[generateStoryDraft] [${storyId}] step 4/4 — QA & naturalizing with Sarvam`);
        try {
          const qaResult = await qaAndNaturalize(
            rawPages, language, languageCode, childName, childAge, outline.title, sarvamApiKey
          );
          draftPages = qaResult.pages;
          if (qaResult.title) finalTitle = qaResult.title;
          if (qaResult.issues.length > 0) {
            logger.info(`[generateStoryDraft] [${storyId}] QA issues fixed: ${qaResult.issues.join("; ")}`);
          }
          logger.info(`[generateStoryDraft] [${storyId}] QA complete, title="${finalTitle}", sarvamTokens=${qaResult.tokens}`);
          void recordTokenConsumption(userId, "story_qa_naturalize", "sarvam", qaResult.tokens, {
            input_tokens: qaResult.inputTokens,
            output_tokens: qaResult.outputTokens,
          });
        } catch (qaErr) {
          // QA is best-effort — fall back to raw Gemini pages if Sarvam fails
          logger.warn(`[generateStoryDraft] [${storyId}] Sarvam QA failed, using raw pages: ${qaErr}`);
        }
      } else {
        logger.info(`[generateStoryDraft] [${storyId}] SARVAM_API_KEY not set — skipping QA step`);
      }

      // Record token consumption
      void recordTokenConsumption(userId, "story_draft_generation", "gemini", totalTokens);

      // Persist completed draft
      await storyRef.update({
        status: "draft_ready",
        title: finalTitle,
        title_english: outline.titleEnglish ?? finalTitle,
        synopsis: outline.synopsis ?? "",
        moral: outline.moral ?? "",
        draft_pages: draftPages,
        updated_at: FieldValue.serverTimestamp(),
      });

      return {
        storyId,
        title: finalTitle,
        titleEnglish: outline.titleEnglish ?? finalTitle,
        draftPages,
        status: "draft_ready",
      };
    } catch (err) {
      await storyRef.update({
        status: "draft_failed",
        updated_at: FieldValue.serverTimestamp(),
      }).catch(() => {/* best-effort status update */});
      logger.error(`[generateStoryDraft] [${storyId}] failed`, err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "Story generation failed. Please try again.");
    }
  }
);
