import os
import uuid
import base64
import asyncio
import io
import logging
from gemini_chat import LlmChat, UserMessage, ImageContent
from storage import async_put_object, async_get_object

logger = logging.getLogger(__name__)


def _make_avatar_jpeg(png_data: bytes, quality: int = 85) -> bytes:
    """Convert PNG bytes to JPEG bytes (runs in a thread)."""
    from PIL import Image
    img = Image.open(io.BytesIO(png_data)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


class AvatarAgent:
    """Generates a stylized cartoon avatar from a child's photo using Gemini Nano Banana."""

    def __init__(self, api_key):
        self.api_key = api_key

    async def run(self, photo_storage_path, child_name, profile_id, user_id):
        """
        Takes a child's uploaded photo and generates a cute cartoon avatar.
        Returns the storage path of the generated avatar.
        """
        try:
            logger.info(f"[AvatarAgent] Generating avatar for {child_name} (profile: {profile_id})")

            # Fetch the original photo from object storage
            photo_bytes, content_type = await async_get_object(photo_storage_path)
            image_base_64 = base64.b64encode(photo_bytes).decode('utf-8')

            # Use Gemini Nano Banana to generate a cartoon avatar from the photo
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"avatar_{profile_id}_{uuid.uuid4().hex[:6]}",
                system_message="You are a children's book character designer. Create adorable cartoon avatars from photos, faithfully preserving the child's face, hairstyle, clothing, and body proportions from the source image."
            )
            chat.with_model("gemini", "gemini-3.1-flash-image-preview")
            chat.with_params(modalities=["image", "text"])

            prompt = (
                f"Transform this child's photo into a cute, adorable cartoon avatar for a children's storybook. "
                f"The avatar should: "
                f"- Look like the child in the photo but in a charming cartoon/illustrated style "
                f"- EXACTLY preserve the child's face shape, skin tone, eye color, and facial features from the photo "
                f"- EXACTLY preserve the child's hairstyle, hair color, and hair length from the photo "
                f"- EXACTLY preserve the outfit and clothing colors/patterns shown in the photo "
                f"- EXACTLY preserve the child's body build and proportions from the photo "
                f"- Have big expressive eyes and a warm smile "
                f"- Use warm, vibrant colors (marigold, teal, indigo accents) "
                f"- Have a clean circular portrait composition "
                f"- Be suitable for a children's book character "
                f"- Indian cultural style, cheerful and magical "
                f"The child's name is {child_name}. Make them look like a storybook hero!"
            )

            msg = UserMessage(
                text=prompt,
                file_contents=[ImageContent(image_base_64)]
            )

            text_response, images = await chat.send_message_multimodal_response(msg)

            if images and len(images) > 0:
                avatar_data = base64.b64decode(images[0]['data'])
                png_path = f"tingutales/avatars/{user_id}/{profile_id}_avatar.png"
                result = await async_put_object(png_path, avatar_data, "image/png")

                # Also save a JPEG for fast browser display
                jpeg_path = ""
                try:
                    jpeg_data = await asyncio.to_thread(_make_avatar_jpeg, avatar_data)
                    jpeg_result = await async_put_object(
                        f"tingutales/avatars/{user_id}/{profile_id}_avatar.jpg",
                        jpeg_data,
                        "image/jpeg",
                    )
                    jpeg_path = jpeg_result["path"]
                except Exception as je:
                    logger.warning(f"[AvatarAgent] JPEG conversion failed for {child_name}: {je}")

                logger.info(f"[AvatarAgent] Avatar generated and saved for {child_name}")
                return {"png": result["path"], "jpeg": jpeg_path}
            else:
                logger.warning(f"[AvatarAgent] No avatar image generated for {child_name}")
                return {"png": "", "jpeg": ""}

        except Exception as e:
            logger.error(f"[AvatarAgent] Avatar generation failed for {child_name}: {e}")
            return {"png": "", "jpeg": ""}
