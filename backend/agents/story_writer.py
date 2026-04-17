import os
import json
import logging
from gemini_chat import LlmChat, UserMessage
from .story_planner import _age_writing_guide

logger = logging.getLogger(__name__)


class StoryWriterAgent:
    """Writes the story natively in the target language (not translation)."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, story_outline, language_code, language_name, child_name, child_age=5, num_pages=8, custom_incident=""):
        writing_guide = _age_writing_guide(child_age)
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"writer_{os.urandom(8).hex()}",
            system_message=f"""You are a master children's storyteller who writes natively in {language_name}.
You create stories DIRECTLY in {language_name} - not translating from English.
Your writing uses natural {language_name} phrasing and cultural context.
For Hindi use Devanagari script, for Kannada use Kannada script, for Tamil use Tamil script, for Telugu use Telugu script, for Bengali use Bengali script, for Marathi use Devanagari script.
If language is English, write in simple engaging English.

CRITICAL — VOCABULARY AND READING LEVEL FOR THIS STORY:
{writing_guide}
You MUST follow these rules on every single page. Do NOT use words or sentence structures above this level."""
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        pages_desc = json.dumps(story_outline.get("pages", []), ensure_ascii=False)

        # Build a dynamic JSON template showing all page entries
        json_template_lines = []
        for i in range(num_pages):
            if i == 0:
                label = "Cover text"
            elif i == num_pages - 1:
                label = "Back cover text"
            else:
                label = f"Page {i} text"
            json_template_lines.append(f'  {{"page": {i}, "text": "{label} in {language_name}"}}')
        json_template = "[\n" + ",\n".join(json_template_lines) + "\n]"

        incident_note = ""
        if custom_incident:
            incident_note = (
                f"\n\nIMPORTANT — A real moment to honour: \"{custom_incident}\"\n"
                "Weave this into the story naturally. It should be the central challenge or\n"
                "inciting event. Resolve it with warmth and encouragement so the child feels\n"
                "brave, resilient, or proud. Keep the tone gentle and empowering."
            )

        msg = UserMessage(
            text=f"""Write a complete children's storybook natively in {language_name}.

Child: {child_name}, Age: {child_age}

AGE-APPROPRIATE LANGUAGE REQUIREMENT (MANDATORY):
{writing_guide}
Every page MUST strictly follow the sentence count, word length, and vocabulary level above.

Story Outline:
Title: {story_outline.get('title', '')}
Synopsis: {story_outline.get('synopsis', '')}
Pages: {pages_desc}
{incident_note}
Write text for ALL {num_pages} pages. Follow the sentence-count rule per page from the writing guide.
Text MUST be written in {language_name} script (not transliteration).
Page 0 is the cover (title + a tagline about {child_name}).
Page {num_pages - 1} is the back cover (moral or closing message).

Return ONLY a valid JSON array (no markdown):
{json_template}"""
        )

        response = await chat.send_message(msg)

        try:
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]
            pages = json.loads(cleaned.strip())
            if isinstance(pages, list):
                return pages
        except Exception as e:
            logger.error(f"Failed to parse story text: {e}")

        return [{"page": i, "text": f"Page {i}"} for i in range(num_pages)]
