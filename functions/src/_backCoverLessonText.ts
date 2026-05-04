const GENERIC_BACK_COVER_LESSON_RE =
  /\blearned\s+(?:(?:a|an|the)\s+)?(?:(?:important|valuable|big|great|beautiful|wonderful|special|good|new)\s+)?lesson(?:\s+today)?\b|\blearned\s+something\s+(?:important|valuable|wonderful|special|new)(?:\s+today)?\b|\blearned\s+a\s+lot(?:\s+today)?\b/i;

const ACTION_LESSON_START_RE =
  /^(ask|be|care|choose|clean|follow|forgive|help|include|keep|listen|look|plant|practice|protect|respect|say|save|share|speak|stand|tell|thank|try|use|wait|work)\b/i;

/**
 * Removes terminal sentence punctuation from generated lesson text.
 * @param {string} text - Lesson text.
 * @return {string} Text without final punctuation.
 */
function stripEndingPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/g, "").trim();
}

/**
 * Lowercases the first character while preserving the rest of the phrase.
 * @param {string} text - Phrase to adjust.
 * @return {string} Phrase with a lowercase first character.
 */
function lowercaseFirstLetter(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Normalizes text into a single sentence.
 * @param {string} text - Raw sentence or phrase.
 * @return {string} A sentence ending with a period.
 */
function ensureSentence(text: string): string {
  const clean = stripEndingPunctuation(text);
  return clean ? `${clean}.` : "";
}

/**
 * Converts a moral into a clause that follows "learned".
 * @param {string} moral - Moral or lesson phrase.
 * @return {string} A clause beginning with "that" or "to".
 */
function lessonClauseFromMoral(moral: string): string {
  const cleanMoral = stripEndingPunctuation(moral)
    .replace(/^the\s+lesson\s+(?:is|was)\s+(?:that\s+)?/i, "")
    .replace(/^learn(?:s|ed)?\s+(?:that|to)\s+/i, "")
    .trim();

  if (!cleanMoral) return "that kindness makes every adventure brighter";

  if (/^(that|to)\s+/i.test(cleanMoral)) {
    return lowercaseFirstLetter(cleanMoral);
  }

  if (ACTION_LESSON_START_RE.test(cleanMoral)) {
    return `to ${lowercaseFirstLetter(cleanMoral)}`;
  }

  return `that ${lowercaseFirstLetter(cleanMoral)}`;
}

/**
 * Detects the old generic back-cover lesson wording.
 * @param {string} text - Back-cover text.
 * @return {boolean} Whether the text uses generic lesson copy.
 */
export function hasGenericBackCoverLesson(text: string): boolean {
  return GENERIC_BACK_COVER_LESSON_RE.test(text);
}

/**
 * Builds a short back-cover sentence that names the actual lesson learned.
 * @param {string} childEnglishName - Child's name in English script.
 * @param {string} moral - Story moral.
 * @param {string} candidateLessonPhrase - Optional model-generated sentence.
 * @return {string} A specific lesson sentence.
 */
export function buildBackCoverLessonSentence(
  childEnglishName: string,
  moral: string,
  candidateLessonPhrase = ""
): string {
  const childName = childEnglishName.trim() || "The child";
  const cleanCandidate = ensureSentence(candidateLessonPhrase);
  const candidateLower = cleanCandidate.toLowerCase();
  const childLower = childName.toLowerCase();

  if (
    cleanCandidate &&
    !hasGenericBackCoverLesson(cleanCandidate) &&
    candidateLower.includes(childLower) &&
    /\blearned\s+(?:that|to)\b/i.test(cleanCandidate)
  ) {
    return cleanCandidate;
  }

  return `${childName} learned ${lessonClauseFromMoral(moral)}.`;
}
