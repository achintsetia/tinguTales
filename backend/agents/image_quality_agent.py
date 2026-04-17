import asyncio
import base64
import io
import json
import logging
import os
import re
from gemini_chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)

# Limit concurrent LLM quality-check calls so all pages calling this in parallel
# don't simultaneously send large payloads to Gemini and crash the server.
_QC_SEMAPHORE = asyncio.Semaphore(2)


def _to_downscaled_jpeg(image_data: bytes, max_side: int = 512) -> bytes:
    """Resize to max_side on longest axis and return JPEG bytes. Runs in a thread."""
    from PIL import Image
    img = Image.open(io.BytesIO(image_data)).convert("RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()


class ImageQualityAgent:
    """Uses Gemini vision to inspect a generated storybook page image.

    Checks:
    - Image is complete (no cut-off edges, no partially rendered subject)
    - No obvious visual artifacts, corruption, solid-color output, or extreme blur
    - Required story text is legible and present (when page_text is provided)
    - Scene contains a recognisable illustrated subject (not blank / near-blank)
    - Suitable as a children's storybook illustration

    Returns ``{"pass": bool, "issues": list[str]}``.
    Defaults to ``pass=True`` on any error so a transient API failure never
    silently drops a page.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def check(self, image_data: bytes, page_index: int, page_text: str = "") -> dict:
        """
        Parameters
        ----------
        image_data  : raw PNG/JPEG bytes of the generated image
        page_index  : used only for logging
        page_text   : the story text that should appear in the image (may be empty)

        Returns
        -------
        {"pass": bool, "issues": list[str]}
        """
        try:
            # Downscale to 512px JPEG before sending — reduces payload from ~3-5 MB to ~50-150 KB
            small_data = await asyncio.to_thread(_to_downscaled_jpeg, image_data)
            image_b64 = base64.b64encode(small_data).decode("utf-8")

            text_check = ""
            if page_text and page_text.strip():
                # Only the first 120 chars matter — full text may be long
                excerpt = page_text.strip()[:120]
                text_check = (
                    f'\n5. Required text legibility: the following text (or a close '
                    f'equivalent) should be clearly readable inside the image: '
                    f'"{excerpt}". If it is absent or unreadable, flag it.'
                )

            prompt = (
                "You are a quality-control reviewer for a children's storybook app. "
                "Inspect the provided illustration and evaluate it on these criteria:\n"
                "1. Completeness: is the image fully rendered with no cut-off edges, "
                "missing limbs, or abruptly cropped subjects?\n"
                "2. No corruption: is the image free of heavy pixelation, solid grey/"
                "white/black output, or severe noise/artifacts?\n"
                "3. Subject clarity: is there a clear, identifiable illustrated subject "
                "(character, scene, or environment) that is not blank or near-blank?\n"
                "4. Style suitability: does it look like a colourful children's storybook "
                "illustration (not a photograph, sketch, or abstract image)?"
                f"{text_check}\n\n"
                "Respond with ONLY a JSON object in this exact format (no markdown, no prose):\n"
                '{"pass": true, "issues": []}\n'
                "or\n"
                '{"pass": false, "issues": ["short description of each problem"]}\n\n'
                "Be strict — a partially rendered or significantly flawed image should fail."
            )

            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"imgqc_p{page_index}_{os.urandom(4).hex()}",
                system_message=(
                    "You are a strict visual quality inspector for a children's storybook "
                    "app. Return only valid JSON."
                ),
            )
            chat.with_model("gemini", "gemini-2.0-flash")

            msg = UserMessage(
                text=prompt,
                file_contents=[ImageContent(image_b64)],
            )
            async with _QC_SEMAPHORE:
                text_response, _ = await chat.send_message_multimodal_response(msg)

            # Strip markdown code fences if the model wraps the JSON
            cleaned = re.sub(r"^```(?:json)?\s*", "", text_response.strip(), flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned).strip()
            result = json.loads(cleaned)

            passed = bool(result.get("pass", True))
            issues = result.get("issues", [])
            logger.info(
                f"[ImageQualityAgent] Page {page_index}: "
                f"{'PASS' if passed else 'FAIL'} — {issues}"
            )
            return {"pass": passed, "issues": issues}

        except Exception as e:
            # Never block generation on a quality-check error
            logger.warning(
                f"[ImageQualityAgent] Page {page_index}: quality check error (defaulting to pass): {e}"
            )
            return {"pass": True, "issues": []}
