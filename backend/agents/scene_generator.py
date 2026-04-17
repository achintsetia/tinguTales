import os
import json
import logging
from gemini_chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


class SceneGeneratorAgent:
    """Generates image prompts for each story page (language-independent)."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, story_outline, pages_text, child_name, child_age, num_pages=8):
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"scene_{os.urandom(8).hex()}",
            system_message="You are an art director for children's picture books with expertise in Indian cultural aesthetics. Create detailed, vivid image generation prompts. Style: colorful, warm, whimsical children's book illustrations with Indian cultural elements."
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        pages_info = json.dumps(story_outline.get("pages", []), ensure_ascii=False)
        back_cover_index = num_pages - 1
        story_page_range = f"1–{num_pages - 2}" if num_pages > 3 else "1"

        msg = UserMessage(
            text=f"""Create image generation prompts for a children's storybook.

Story: {story_outline.get('title_english', story_outline.get('title', 'Adventure'))}
Synopsis: {story_outline.get('synopsis', '')}
Child: {child_name}, age {child_age} (Indian child character)
Pages outline: {pages_info}

Create exactly {num_pages} detailed image prompts following these rules:

CRITICAL CHARACTER CONSISTENCY RULE: {child_name} must wear the SAME outfit (colour, style, accessories) and have the EXACT same hairstyle in every single page — do not change their clothes or hair between pages.

Page 0 (COVER): A stunning full-page portrait-style cover illustration. The child protagonist ({child_name}) is the HERO of the cover — render them large, centred, and heroic, dressed in vibrant Indian attire, surrounded by warm ornate Indian storybook motifs (marigolds, rangoli patterns, starry sky or golden sunrise). The child's face and features must be rendered clearly and expressively. Leave a clear band at the top of the image for the title text.

Pages {story_page_range} (STORY pages): Each prompt should vividly describe the scene, feature the Indian child protagonist as the visual focus wearing the same outfit and hairstyle as on the cover, use warm colourful children's book illustration style with Indian cultural elements (architecture, nature, clothing). Leave open space in the upper third or centre for story text rendered as artwork.

Page {back_cover_index} (BACK COVER): A warm, elegant back-cover background in Indian storybook style — sunset colours, soft floral or starry motifs. Include a small cheerful portrait of the child protagonist in one corner wearing the same outfit and hairstyle. Leave clear central space for the TinguTales brand name, "Bangalore, India", and "TinguTales.com" to be displayed prominently.

Return ONLY a JSON array of exactly {num_pages} strings (index 0 = cover, index {back_cover_index} = back cover):
{json.dumps([f"Page {i} prompt..." for i in range(num_pages)])}"""
        )

        response = await chat.send_message(msg)

        try:
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]
            prompts = json.loads(cleaned.strip())
            if isinstance(prompts, list) and len(prompts) >= num_pages:
                return prompts[:num_pages]
            if isinstance(prompts, list) and len(prompts) > 0:
                # Pad with fallback if fewer returned
                while len(prompts) < num_pages:
                    prompts.append(f"{child_name} in a colourful Indian storybook scene")
                return prompts
        except Exception as e:
            logger.error(f"Failed to parse scene prompts: {e}")

        # Fallback: build a list of the right length
        fallback = [
            f"Children's book cover illustration featuring {child_name}, colorful Indian style",
        ]
        for i in range(1, num_pages - 1):
            fallback.append(f"{child_name} in a vibrant Indian storybook scene, page {i}")
        fallback.append(f"A warm sunset scene with {child_name} smiling, Indian landscape")
        return fallback
