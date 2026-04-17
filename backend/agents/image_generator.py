import os
import io
import uuid
import base64
import logging
import asyncio
from PIL import Image
from gemini_chat import LlmChat, UserMessage, ImageContent
from storage import async_put_object, async_get_object
from .image_quality_agent import ImageQualityAgent

logger = logging.getLogger(__name__)

# Limit concurrent Gemini image requests — keep at 1 to avoid starving the event loop
# so the server can still handle dashboard/polling requests during generation
_SEMAPHORE = asyncio.Semaphore(1)


TARGET_RATIO = 3 / 4  # width / height — portrait book page


def _make_jpeg(data: bytes) -> bytes:
    """Convert raw image bytes to JPEG. Runs in a thread via asyncio.to_thread."""
    buf = io.BytesIO()
    Image.open(io.BytesIO(data)).convert("RGB").save(buf, format="JPEG", quality=82, optimize=True)
    return buf.getvalue()


def _enforce_book_ratio(data: bytes) -> bytes:
    """Enforce 3:4 portrait aspect ratio on the image.
    Strategy: crop from center to 3:4, preserving as much content as possible.
    If the image is landscape, first rotate it to portrait."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size

    # Step 1: If landscape (wider than tall), rotate to portrait
    if w > h:
        img = img.rotate(-90, expand=True)
        w, h = img.size

    # Step 2: Calculate target crop for 3:4 ratio
    current_ratio = w / h

    if abs(current_ratio - TARGET_RATIO) < 0.02:
        # Already close enough to 3:4
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    if current_ratio > TARGET_RATIO:
        # Image is too wide — crop sides
        new_w = int(h * TARGET_RATIO)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        # Image is too tall — crop top and bottom (keep more of top for titles)
        new_h = int(w / TARGET_RATIO)
        # Bias crop toward bottom (keep top 40% untouched for text/titles)
        top = int((h - new_h) * 0.3)
        img = img.crop((0, top, w, top + new_h))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _get_orientation(data: bytes) -> str:
    """Returns 'portrait', 'landscape', or 'square'."""
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    if w > h:
        return "landscape"
    elif h > w:
        return "portrait"
    return "square"


def _get_aspect_info(data: bytes) -> dict:
    """Returns width, height, ratio and whether it matches 3:4."""
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    ratio = w / h if h > 0 else 1
    is_book = abs(ratio - TARGET_RATIO) < 0.05
    return {"w": w, "h": h, "ratio": round(ratio, 3), "is_book_ratio": is_book}


class ImageGeneratorAgent:
    """Generates full-page storybook illustrations with text baked in.
    Uses the child's avatar as a visual reference to keep the character consistent.
    All pages are generated in parallel."""

    def __init__(self, api_key, db):
        self.api_key = api_key
        self.db = db
        self.quality_agent = ImageQualityAgent(api_key)

    async def _describe_avatar(self, avatar_b64: str) -> str:
        """Use a vision model to extract a precise text description of the avatar character.
        This description is injected into every page prompt so Gemini has both a visual
        reference image AND matching text to maintain character consistency."""
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"desc_avatar_{uuid.uuid4().hex[:6]}",
                system_message="You are a character designer. Describe character appearances concisely and precisely."
            )
            chat.with_model("gemini", "gemini-2.5-flash")
            msg = UserMessage(
                text=(
                    "Describe this cartoon child character's visual appearance in 2-3 sentences. "
                    "Be very specific about: skin tone, eye colour and shape, hair colour and exact "
                    "style/length (e.g. two braids, short curls, single ponytail), clothing colours "
                    "and style, and any accessories. "
                    "This description will be used to keep the character identical across multiple "
                    "storybook illustrations — so precision is critical."
                ),
                file_contents=[ImageContent(avatar_b64)]
            )
            description = await chat.send_message(msg)
            return description.strip()
        except Exception as e:
            logger.warning(f"[ImageGenerator] Avatar description failed: {e}")
            return ""

    async def run(self, scene_prompts, story_id, user_id, pages_text=None, avatar_url=None, on_page_done=None):
        # Fetch avatar bytes once so every page generation can reference it
        avatar_b64 = None
        avatar_description = ""
        if avatar_url:
            try:
                avatar_bytes, _ = await async_get_object(avatar_url)
                avatar_b64 = base64.b64encode(avatar_bytes).decode("utf-8")
                logger.info(f"[ImageGenerator] Avatar loaded for story {story_id}")
                avatar_description = await self._describe_avatar(avatar_b64)
                if avatar_description:
                    logger.info(f"[ImageGenerator] Avatar described: {avatar_description[:120]}")
                else:
                    logger.warning("[ImageGenerator] Avatar description is EMPTY — consistency may suffer")
            except Exception as e:
                logger.warning(f"[ImageGenerator] Could not load avatar: {e}")

        if not avatar_b64:
            logger.warning(f"[ImageGenerator] No avatar available for story {story_id} — character will vary between pages")

        last_page = len(scene_prompts) - 1

        # ============================================================
        # SINGLE-SESSION approach: one LlmChat for ALL pages.
        # The model sees its own previous images in conversation history,
        # which dramatically improves character consistency.
        # ============================================================
        system_msg = (
            "You are a children's book illustrator creating a SINGLE consistent storybook. "
            "You will generate one page at a time. The SAME child character MUST appear "
            "on EVERY page with IDENTICAL appearance — same face, skin tone, eyes, hair, "
            "hairstyle, outfit, and accessories. Do NOT change ANY visual detail between pages."
        )
        if avatar_description:
            system_msg += (
                f"\n\nMAIN CHARACTER DESCRIPTION (must match on EVERY page): {avatar_description}"
            )

        shared_chat = LlmChat(
            api_key=self.api_key,
            session_id=f"storybook_{story_id}_{uuid.uuid4().hex[:6]}",
            system_message=system_msg
        )
        shared_chat.with_model("gemini", "gemini-3.1-flash-image-preview")
        shared_chat.with_params(
            modalities=["image", "text"],
            aspect_ratio="3:4",  # Enforce portrait book page ratio at generation level
        )

        logger.info(f"[ImageGenerator] Using single chat session for all {len(scene_prompts)} pages")

        results = []
        for i, prompt in enumerate(scene_prompts):
            await asyncio.sleep(0)  # yield to event loop between pages

            result = await self._generate_page_in_session(
                shared_chat, i, prompt, story_id, pages_text,
                avatar_b64, avatar_description, last_page
            )
            results.append(result)

            # Fire callback so frontend sees progress
            if result and on_page_done:
                png_path = result.get("png", "") if isinstance(result, dict) else result
                jpeg_path = result.get("jpeg", "") if isinstance(result, dict) else ""
                try:
                    await on_page_done(i, png_path, jpeg_path)
                except Exception as e:
                    logger.warning(f"[ImageGenerator] on_page_done callback failed for page {i}: {e}")

        image_urls = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"[ImageGenerator] Page {i} failed: {result}")
                image_urls.append({"png": "", "jpeg": ""})
            else:
                image_urls.append(result if isinstance(result, dict) else {"png": result or "", "jpeg": ""})
        return image_urls

    async def _generate_page_in_session(self, chat, i, prompt, story_id, pages_text,
                                         avatar_b64, avatar_description, last_page):
        """Generate a single page using the shared chat session for consistency."""
        MAX_ATTEMPTS = 3
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                logger.info(f"[ImageGenerator] Page {i}/{last_page} for {story_id} (attempt {attempt})")

                page_text = ""
                if pages_text and i < len(pages_text):
                    pt = pages_text[i]
                    page_text = pt.get("text", "") if isinstance(pt, dict) else str(pt)

                # Text rendering instruction
                text_instruction = ""
                if page_text:
                    text_instruction = (
                        f'\nCRITICAL: Render this exact text as beautiful hand-lettered typography '
                        f'integrated into the illustration: "{page_text}"'
                    )

                # Page-specific instruction
                if i == 0:
                    page_role = (
                        "This is PAGE 1 — the COVER. Show the main character as a large, "
                        "heroic, front-facing portrait in the centre. This sets the character's "
                        "look for the ENTIRE book — all future pages must match this exactly."
                    )
                elif i == last_page:
                    page_role = (
                        f"This is the FINAL PAGE — the back cover. Include a small cheerful "
                        f"portrait of the SAME character from all previous pages."
                    )
                else:
                    page_role = (
                        f"This is PAGE {i+1}. The main character MUST look EXACTLY the same "
                        f"as on the cover and all previous pages — same face, hair, outfit, everything."
                    )

                # Add landscape retry warning if this is a retry due to wrong orientation
                orientation_warning = ""
                if attempt > 1:
                    orientation_warning = (
                        "\nIMPORTANT: The previous attempt generated a LANDSCAPE image. "
                        "This MUST be PORTRAIT orientation (taller than wide). "
                        "Generate a TALL, VERTICAL image like a book page."
                    )

                full_prompt = (
                    f"{page_role}\n"
                    f"Scene: {prompt}\n"
                    f"ORIENTATION: Generate a PORTRAIT image with 3:4 aspect ratio (width:height = 3:4). "
                    f"The image MUST be taller than it is wide — exactly like a printed book page. "
                    f"Do NOT generate square or landscape images."
                    f"\nStyle: rich, colourful, warm, whimsical Indian cultural children's book illustration."
                    f"{orientation_warning}"
                    f"{text_instruction}"
                )

                # Attach avatar reference on EVERY page message
                file_contents = []
                if avatar_b64:
                    file_contents.append(ImageContent(avatar_b64))

                msg = UserMessage(
                    text=full_prompt,
                    file_contents=file_contents if file_contents else None
                )

                async with _SEMAPHORE:
                    _, images = await chat.send_message_multimodal_response(msg)

                if not images:
                    logger.warning(f"[ImageGenerator] No image for page {i} (attempt {attempt})")
                    if attempt < MAX_ATTEMPTS:
                        await asyncio.sleep(2)
                        continue
                    return {"png": "", "jpeg": ""}

                image_data = base64.b64decode(images[0]["data"])

                # === ENFORCE 3:4 BOOK PAGE RATIO ===
                aspect_before = await asyncio.to_thread(_get_aspect_info, image_data)
                logger.info(f"[ImageGenerator] Page {i} raw: {aspect_before['w']}x{aspect_before['h']} ratio={aspect_before['ratio']} book_ratio={aspect_before['is_book_ratio']}")

                if not aspect_before["is_book_ratio"]:
                    if aspect_before["w"] > aspect_before["h"] and attempt < MAX_ATTEMPTS:
                        # Landscape — retry with stronger portrait instruction
                        logger.warning(f"[ImageGenerator] Page {i} is LANDSCAPE ({aspect_before['w']}x{aspect_before['h']}), retrying...")
                        continue

                    # Crop/fix to 3:4 ratio
                    image_data = await asyncio.to_thread(_enforce_book_ratio, image_data)
                    aspect_after = await asyncio.to_thread(_get_aspect_info, image_data)
                    logger.info(f"[ImageGenerator] Page {i} fixed: {aspect_after['w']}x{aspect_after['h']} ratio={aspect_after['ratio']}")

                # Quality check
                qc = await self.quality_agent.check(image_data, i, page_text)
                if not qc["pass"] and attempt < MAX_ATTEMPTS:
                    logger.warning(f"[ImageGenerator] Page {i} QC fail: {qc['issues']}")
                    continue

                # Save PNG
                png_path = f"tingutales/stories/{story_id}/page_{i}.png"
                png_result = await async_put_object(png_path, image_data, "image/png")

                # Save JPEG
                jpeg_path = ""
                try:
                    jpeg_bytes = await asyncio.to_thread(_make_jpeg, image_data)
                    jpeg_storage = f"tingutales/stories/{story_id}/page_{i}.jpg"
                    jpeg_result = await async_put_object(jpeg_storage, jpeg_bytes, "image/jpeg")
                    jpeg_path = jpeg_result["path"]
                except Exception as jpeg_err:
                    logger.warning(f"[ImageGenerator] JPEG fail page {i}: {jpeg_err}")

                logger.info(f"[ImageGenerator] Page {i} saved ({aspect_before['w']}x{aspect_before['h']}→portrait)")
                return {"png": png_result["path"], "jpeg": jpeg_path}

            except Exception as e:
                logger.error(f"[ImageGenerator] Page {i} error (attempt {attempt}): {e}")
                if attempt < MAX_ATTEMPTS:
                    await asyncio.sleep(2)
                    continue
                return {"png": "", "jpeg": ""}

        return {"png": "", "jpeg": ""}
