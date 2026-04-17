import os
import json
import logging
from gemini_chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


class InputAgent:
    """Parses user interests into structured themes for story generation.
    Handles mixed-language input (Hinglish, Tanglish, etc.)."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, interests, language_code):
        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"input_{os.urandom(8).hex()}",
            system_message="You are an input understanding agent for a children's storybook platform. Parse user interests into structured, normalized English themes suitable for story generation. Handle mixed-language input (Hinglish, Tanglish, etc.)."
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        interests_str = ", ".join(interests) if isinstance(interests, list) else str(interests)

        msg = UserMessage(
            text=f"Normalize these children's interests into 2-4 clear story themes.\nInterests: {interests_str}\nLanguage context: {language_code}\nReturn ONLY a JSON array of theme strings, e.g. [\"space exploration\", \"friendship\", \"courage\"]"
        )

        response = await chat.send_message(msg)

        try:
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]
            themes = json.loads(cleaned.strip())
            if isinstance(themes, list):
                return themes
        except Exception as e:
            logger.warning(f"Could not parse themes JSON: {e}")

        return [t.strip() for t in response.split(",") if t.strip()][:4]
