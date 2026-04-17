"""
Drop-in replacement for emergentintegrations.llm.chat using the google-genai SDK directly.

Provides LlmChat, UserMessage, and ImageContent with the same interface
so agent code only needs to change its import line.
"""

import os
import base64
import logging
import threading
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Thread-local client — each thread (main API + worker) gets its own
_thread_local = threading.local()


def _get_client():
    if not hasattr(_thread_local, "client") or _thread_local.client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set in environment")
        _thread_local.client = genai.Client(api_key=api_key)
    return _thread_local.client


class ImageContent:
    """Wraps base64-encoded image data for inclusion in a message."""
    def __init__(self, b64_data: str):
        self.b64_data = b64_data


class UserMessage:
    """A user message with optional image attachments."""
    def __init__(self, text: str = "", file_contents: list = None):
        self.text = text
        self.file_contents = file_contents or []


class LlmChat:
    """Chat session backed by google-genai, matching the emergentintegrations interface."""

    def __init__(self, api_key: str = None, session_id: str = "", system_message: str = ""):
        self.session_id = session_id
        self.system_message = system_message
        self.model_name = "gemini-2.5-flash"
        self._extra_config = {}
        self._history = []  # list of Content objects for multi-turn

    def with_model(self, provider: str, model: str):
        """Set the model name. Provider is ignored (always Gemini)."""
        self.model_name = model
        return self

    def with_params(self, **kwargs):
        """Set extra generation config parameters (modalities, aspect_ratio, etc.)."""
        self._extra_config.update(kwargs)
        return self

    def _build_parts(self, msg: UserMessage):
        """Convert a UserMessage into a list of genai Parts."""
        parts = []
        # Add image contents first
        for ic in msg.file_contents:
            if isinstance(ic, ImageContent):
                raw_bytes = base64.b64decode(ic.b64_data)
                parts.append(types.Part.from_bytes(data=raw_bytes, mime_type="image/png"))
        # Add text
        if msg.text:
            parts.append(types.Part.from_text(text=msg.text))
        return parts

    def _build_config(self):
        """Build GenerateContentConfig from stored params."""
        config_kwargs = {}

        if self.system_message:
            config_kwargs["system_instruction"] = self.system_message

        modalities = self._extra_config.get("modalities")
        if modalities:
            # Convert to uppercase for the API: ["image", "text"] -> ["IMAGE", "TEXT"]
            config_kwargs["response_modalities"] = [m.upper() for m in modalities]

        aspect_ratio = self._extra_config.get("aspect_ratio")
        if aspect_ratio:
            config_kwargs["image_generation_config"] = types.ImageGenerationConfig(
                aspect_ratio=aspect_ratio
            )

        return types.GenerateContentConfig(**config_kwargs)

    async def send_message(self, msg: UserMessage) -> str:
        """Send a message and return the text response."""
        client = _get_client()
        parts = self._build_parts(msg)

        # Build contents with history
        contents = list(self._history) + [
            types.Content(role="user", parts=parts)
        ]

        config = self._build_config()

        response = await client.aio.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config,
        )

        # Extract text from response
        text = ""
        if response.candidates and response.candidates[0].content:
            for part in response.candidates[0].content.parts:
                if part.text:
                    text += part.text

        # Append to history for multi-turn
        self._history.append(types.Content(role="user", parts=parts))
        if text:
            self._history.append(types.Content(
                role="model",
                parts=[types.Part.from_text(text=text)]
            ))

        return text

    async def send_message_multimodal_response(self, msg: UserMessage):
        """Send a message and return (text, images) where images is a list of {"data": b64_str}."""
        client = _get_client()
        parts = self._build_parts(msg)

        contents = list(self._history) + [
            types.Content(role="user", parts=parts)
        ]

        config = self._build_config()

        response = await client.aio.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config,
        )

        text = ""
        images = []
        response_parts = []

        if response.candidates and response.candidates[0].content:
            for part in response.candidates[0].content.parts:
                if part.text:
                    text += part.text
                    response_parts.append(types.Part.from_text(text=part.text))
                elif part.inline_data:
                    b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                    images.append({"data": b64})
                    # Keep image in history for consistency
                    response_parts.append(types.Part.from_bytes(
                        data=part.inline_data.data,
                        mime_type=part.inline_data.mime_type or "image/png"
                    ))

        # Append to history for multi-turn
        self._history.append(types.Content(role="user", parts=parts))
        if response_parts:
            self._history.append(types.Content(role="model", parts=response_parts))

        return text, images
