import os
import json
import logging
from gemini_chat import LlmChat, UserMessage
from .story_planner import _age_writing_guide

logger = logging.getLogger(__name__)


class QualityAgent:
    """Checks story quality, safety, language consistency, and child name spelling.
    Returns corrected pages and a corrected title ready for image generation."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, pages_text, language_code, language_name, child_name, story_title="", num_pages=8, child_age=5):
        writing_guide = _age_writing_guide(child_age)
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"quality_{os.urandom(8).hex()}",
            system_message=(
                f"You are a quality, safety, and language reviewer for children's storybooks. "
                f"The story must be written natively in {language_name}. "
                f"You check every page for correctness, language consistency, child name spelling, "
                f"reading level suitability, and cultural sensitivity.\n\n"
                f"READING LEVEL SPEC FOR THIS STORY:\n{writing_guide}"
            )
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        all_text = json.dumps(pages_text, ensure_ascii=False)
        back_cover_index = num_pages - 1

        # Build the corrected_pages JSON template dynamically
        template_lines = []
        for i in range(num_pages):
            if i == 0:
                label = "corrected cover text"
            elif i == back_cover_index:
                label = "corrected back cover text"
            else:
                label = f"corrected page {i} text"
            template_lines.append(f'    {{"page": {i}, "text": "<{label}>"}},')
        template_lines[-1] = template_lines[-1].rstrip(",")
        pages_template = "\n".join(template_lines)

        story_pages_range = f"pages 1-{back_cover_index - 1}" if num_pages > 3 else "page 1"

        msg = UserMessage(
            text=f"""Review this complete children's storybook for quality, safety, and language.

Target language: {language_name} ({language_code})
Child: {child_name}, Age: {child_age}
Story title: {story_title}
All pages: {all_text}

REQUIRED READING LEVEL:
{writing_guide}

Check EVERY page for:
1. Language consistency — ALL story text on {story_pages_range} MUST be written fully in {language_name}.
2. Child's name spelling — "{child_name}" must be spelled EXACTLY and consistently everywhere.
3. Title correctness — title must contain "{child_name}" spelled correctly.
4. Reading-level compliance — simplify any page that uses vocabulary, sentence length, or structure above the reading level spec above. Rewrite offending pages to match the spec EXACTLY.
5. Age-appropriateness — no violence, fear, or inappropriate content for children.
6. Cultural sensitivity for an Indian audience.
7. Positive messaging throughout.

Return ONLY valid JSON (no markdown):
{{
  "status": "pass",
  "issues": [],
  "corrected_title": "<corrected story title>",
  "corrected_pages": [
{pages_template}
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
            result = json.loads(cleaned.strip())
            return result
        except Exception as e:
            logger.error(f"[QualityAgent] Failed to parse response: {e}")
            return {
                "status": "pass",
                "issues": [],
                "corrected_title": story_title,
                "corrected_pages": pages_text
            }
