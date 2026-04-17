import os
import json
import logging
from gemini_chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


def _age_writing_guide(age: int) -> str:
    """Return concrete vocabulary and sentence-length rules for the child's age."""
    if age <= 2:
        return (
            "WRITING LEVEL — Age 2: Use only the simplest nouns and action verbs a toddler knows "
            "(cat, dog, run, jump, eat, sleep, big, small). "
            "Max 1 sentence per page. No subordinate clauses. Lots of sound words (moo, splash, boom)."
        )
    elif age == 3:
        return (
            "WRITING LEVEL — Age 3: Very short, simple sentences (5-7 words each). "
            "1-2 sentences per page. Use repetitive, rhythmic patterns children can memorise. "
            "Only everyday concrete words — no abstract concepts. "
            "Examples of good vocabulary: happy, hungry, small, big, fast, friend, home."
        )
    elif age == 4:
        return (
            "WRITING LEVEL — Age 4: Short sentences (6-9 words each). 2 sentences per page. "
            "Simple cause-and-effect ('He was hungry, so he ate'). "
            "Introduce 1-2 new vocabulary words per story page, explained by context. "
            "Repetition and rhyme are encouraged. Avoid complex tenses."
        )
    elif age == 5:
        return (
            "WRITING LEVEL — Age 5: Sentences of 8-10 words. 2-3 sentences per page. "
            "Simple compound sentences joined with 'and', 'but', 'so'. "
            "Can include mild emotions (excited, nervous, proud). "
            "Short dialogue is great. Avoid multi-syllable abstract words."
        )
    elif age == 6:
        return (
            "WRITING LEVEL — Age 6 (early reader): Sentences of 8-12 words. 2-3 sentences per page. "
            "Compound and simple complex sentences. Introduce descriptive adjectives. "
            "Short dialogue with attribution ('said', 'asked', 'replied'). "
            "Word difficulty: Grade 1 reading level."
        )
    elif age == 7:
        return (
            "WRITING LEVEL — Age 7 (first-grade reader): Sentences of 10-14 words. 3 sentences per page. "
            "Richer descriptive language, simple similes ('as fast as the wind'). "
            "Short paragraphs. Dialogue with some expression ('whispered', 'shouted'). "
            "Word difficulty: Grade 1-2 reading level."
        )
    elif age == 8:
        return (
            "WRITING LEVEL — Age 8 (second-grade reader): Sentences of 10-16 words. 3-4 sentences per page. "
            "Vivid descriptions, varied sentence starters, simple metaphors. "
            "Expressive dialogue. Can introduce a mild subplot. "
            "Word difficulty: Grade 2 reading level — challenge with 1-2 richer words per page."
        )
    else:  # 9+
        return (
            f"WRITING LEVEL — Age {age} (confident reader): Sentences of 12-18 words. 3-5 sentences per page. "
            "Rich vocabulary, figurative language, varied sentence structure. "
            "Multi-layered emotions, expressive dialogue, mild irony or humour. "
            "Word difficulty: Grade 3+ — stretch vocabulary purposefully."
        )


def _story_beats(story_page_count):
    """Return a list of story beat descriptions for the given number of story pages."""
    all_beats = [
        "Introduction - setting and character",
        "The adventure begins",
        "Rising action",
        "A new discovery",
        "The big challenge",
        "Overcoming obstacles",
        "A helping hand",
        "Rising tension",
        "The turning point",
        "Resolution",
        "Celebration and lesson",
        "Reflection and farewell",
    ]
    if story_page_count <= 0:
        return []
    if story_page_count <= len(all_beats):
        # Evenly pick beats spread across the full list
        indices = [round(i * (len(all_beats) - 1) / (story_page_count - 1)) for i in range(story_page_count)] \
            if story_page_count > 1 else [0]
        return [all_beats[idx] for idx in indices]
    # More pages than beats: repeat middle beats as needed
    return (all_beats + all_beats[1:-1] * ((story_page_count // len(all_beats)) + 1))[:story_page_count]


class StoryPlannerAgent:
    """Creates a page-by-page story outline (language-neutral structure)."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, child_name, child_age, themes, language_code, language_name, num_pages=8, custom_incident=""):
        writing_guide = _age_writing_guide(child_age)
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"planner_{os.urandom(8).hex()}",
            system_message=(
                f"You are a children's story planner specializing in Indian storytelling traditions. "
                f"Create engaging story outlines for children's picture books. "
                f"Stories will be written in {language_name}.\n\n{writing_guide}"
            )
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        themes_str = ", ".join(themes)
        story_page_count = num_pages - 2  # exclude cover (0) and back cover (last)

        incident_instruction = ""
        if custom_incident:
            incident_instruction = f"""

SPECIAL MOMENT TO WEAVE IN: The child experienced this today — "{custom_incident}"
Build the story arc so that this moment is the central challenge or inciting event.
Resolve it constructively: show resilience, learning, or kindness so the child feels
validated and empowered by the end. Keep it age-appropriate and emotionally warm."""

        # Build dynamic page descriptions for the prompt
        page_beats = _story_beats(story_page_count)
        pages_json_lines = []
        pages_json_lines.append('    {{"page": 0, "type": "cover", "description": "What the cover shows"}}')
        for i, beat in enumerate(page_beats, start=1):
            pages_json_lines.append(f'    {{"page": {i}, "type": "story", "description": "{beat}"}}')
        pages_json_lines.append(f'    {{"page": {num_pages - 1}, "type": "back_cover", "description": "Closing message"}}')
        pages_json = ",\n".join(pages_json_lines)

        msg = UserMessage(
            text=f"""Create a story outline for a personalized children's storybook.

Child: {child_name}, Age: {child_age}
Themes/Interests: {themes_str}
Target Language: {language_name} ({language_code})
AGE-APPROPRIATE LANGUAGE REQUIREMENT:
{writing_guide}
Every page description MUST note the vocabulary level so the writer follows it exactly.
Create a story with exactly {num_pages} pages:
- Page 0: Front Cover (title and subtitle)
- Pages 1-{num_pages - 2}: Story pages ({", ".join(page_beats)})
- Page {num_pages - 1}: Back Cover (moral or closing message)

The story should:
- Feature {child_name} as the main character
- Be culturally relevant with Indian elements where natural
- Be age-appropriate for a {child_age}-year-old
- Have a positive moral{incident_instruction}

Return ONLY valid JSON (no markdown):
{{
  "title": "Story title in {language_name}",
  "title_english": "English translation of title",
  "synopsis": "Brief 2-line synopsis in English",
  "moral": "The moral of the story",
  "pages": [
{pages_json}
  ]
}}"""
        )

        response = await chat.send_message(msg)

        try:
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]
            return json.loads(cleaned.strip())
        except Exception as e:
            logger.error(f"Failed to parse story outline: {e}")
            return {
                "title": f"{child_name}'s Adventure",
                "title_english": f"{child_name}'s Adventure",
                "synopsis": f"An adventure story about {child_name} exploring {themes_str}",
                "moral": "Be brave and kind",
                "pages": [
                    {"page": i, "type": "cover" if i == 0 else ("back_cover" if i == num_pages - 1 else "story"),
                     "description": f"Page {i}"}
                    for i in range(num_pages)
                ]
            }
