import os
import logging
import asyncio
from datetime import datetime, timezone
from .input_agent import InputAgent
from .story_planner import StoryPlannerAgent
from .story_writer import StoryWriterAgent
from .scene_generator import SceneGeneratorAgent
from .image_generator import ImageGeneratorAgent
from .quality_agent import QualityAgent
from .pdf_agent import PdfAgent

logger = logging.getLogger(__name__)


class MasterOrchestrator:
    """Coordinates all agents for story generation.
    Pages are generated in parallel. Text is baked into images.
    A PDF is created as the final deliverable."""

    def __init__(self, db):
        self.db = db
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.input_agent = InputAgent(self.api_key)
        self.story_planner = StoryPlannerAgent(self.api_key)
        self.story_writer = StoryWriterAgent(self.api_key)
        self.scene_generator = SceneGeneratorAgent(self.api_key)
        self.image_generator = ImageGeneratorAgent(self.api_key, db)
        self.quality_agent = QualityAgent(self.api_key)
        self.pdf_agent = PdfAgent()

    async def update_story(self, story_id, updates):
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await self.db.stories.update_one(
            {"story_id": story_id},
            {"$set": updates}
        )

    async def generate_story(self, story_id, user_id, profile_id, child_name, child_age,
                             child_photo_url, language, language_code, interests,
                             num_pages=8, custom_incident=""):
        try:
            logger.info(f"[Orchestrator] Starting story generation: {story_id}")

            # Load any previously saved intermediate state (for resume)
            saved = await self.db.stories.find_one({"story_id": story_id}, {"_id": 0})
            saved_step = saved.get("_step_completed", "") if saved else ""
            saved_themes = saved.get("_themes") if saved else None
            saved_outline = saved.get("_story_outline") if saved else None
            saved_pages_text = saved.get("_pages_text") if saved else None
            saved_scene_prompts = saved.get("_scene_prompts") if saved else None

            if saved_step:
                logger.info(f"[Orchestrator] Resuming from step: {saved_step}")

            # === Agent 1: Input Understanding ===
            if saved_themes and saved_step >= "1_themes":
                themes = saved_themes
                logger.info(f"[Agent 1] Reusing saved themes: {themes}")
            else:
                logger.info("[Agent 1] Input Understanding - normalizing interests...")
                await self.update_story(story_id, {"status": "understanding_input"})
                themes = await self.input_agent.run(interests, language_code)
                logger.info(f"[Agent 1] Themes extracted: {themes}")
                await self.update_story(story_id, {"_themes": themes, "_step_completed": "1_themes"})

            # === Agent 2: Story Planning ===
            if saved_outline and saved_step >= "2_outline":
                story_outline = saved_outline
                logger.info(f"[Agent 2] Reusing saved outline: {story_outline.get('title', '?')}")
            else:
                logger.info("[Agent 2] Story Planning - creating outline...")
                await self.update_story(story_id, {"status": "planning_story"})
                story_outline = await self.story_planner.run(
                    child_name=child_name, child_age=child_age, themes=themes,
                    language_code=language_code, language_name=language,
                    num_pages=num_pages, custom_incident=custom_incident
                )
                logger.info(f"[Agent 2] Outline created: {story_outline.get('title', 'Untitled')}")
                await self.update_story(story_id, {
                    "title": story_outline.get("title", "Untitled Story"),
                    "_story_outline": story_outline, "_step_completed": "2_outline"
                })

            # === Agent 3: Story Writing (Language-Specific) ===
            if saved_pages_text and saved_step >= "3_pages_text":
                pages_text = saved_pages_text
                logger.info(f"[Agent 3] Reusing saved pages_text: {len(pages_text)} pages")
            else:
                logger.info(f"[Agent 3] Story Writing in {language}...")
                await self.update_story(story_id, {"status": "writing_story"})
                pages_text = await self.story_writer.run(
                    story_outline=story_outline, language_code=language_code,
                    language_name=language, child_name=child_name,
                    child_age=child_age, num_pages=num_pages, custom_incident=custom_incident
                )
                logger.info(f"[Agent 3] Story written: {len(pages_text)} pages")
                await self.update_story(story_id, {
                    "_pages_text": pages_text, "_step_completed": "3_pages_text"
                })

            # === Agent 4: Quality & Safety Check ===
            if saved_step >= "4_quality":
                logger.info("[Agent 4] Quality check already done, skipping")
            else:
                logger.info("[Agent 4] Quality & Safety check...")
                await self.update_story(story_id, {"status": "quality_check"})
                quality_result = await self.quality_agent.run(
                    pages_text=pages_text, language_code=language_code,
                    language_name=language, child_name=child_name,
                    story_title=story_outline.get("title", ""), num_pages=num_pages,
                    child_age=child_age
                )
                logger.info(f"[Agent 4] Quality: {quality_result.get('status', 'unknown')}")

                corrected_pages = quality_result.get("corrected_pages")
                if corrected_pages and isinstance(corrected_pages, list) and len(corrected_pages) == len(pages_text):
                    pages_text = corrected_pages
                    logger.info("[Agent 4] Using corrected pages from quality agent")
                corrected_title = quality_result.get("corrected_title") or story_outline.get("title", "Untitled Story")
                story_outline["title"] = corrected_title

                # Override cover text
                for pt in pages_text:
                    if isinstance(pt, dict) and pt.get("page") == 0:
                        pt["text"] = corrected_title
                        break
                # Override back cover text
                back_cover_index = num_pages - 1
                for pt in pages_text:
                    if isinstance(pt, dict) and pt.get("page") == back_cover_index:
                        pt["text"] = "TinguTales\nBangalore, India\nTinguTales.com"
                        break

                await self.update_story(story_id, {
                    "title": corrected_title,
                    "_pages_text": pages_text, "_story_outline": story_outline,
                    "_step_completed": "4_quality"
                })

            # === Agent 5: Scene Generation ===
            if saved_scene_prompts and saved_step >= "5_scenes":
                scene_prompts = saved_scene_prompts
                logger.info(f"[Agent 5] Reusing saved scene prompts: {len(scene_prompts)}")
            else:
                logger.info("[Agent 5] Scene Generation - creating image prompts...")
                await self.update_story(story_id, {"status": "creating_scenes"})
                scene_prompts = await self.scene_generator.run(
                    story_outline=story_outline, pages_text=pages_text,
                    child_name=child_name, child_age=child_age, num_pages=num_pages
                )
                logger.info(f"[Agent 5] Scene prompts: {len(scene_prompts)}")
                await self.update_story(story_id, {
                    "_scene_prompts": scene_prompts, "_step_completed": "5_scenes"
                })

            # === Look up child avatar for visual consistency ===
            avatar_url = child_photo_url
            if profile_id:
                try:
                    profile_record = await self.db.child_profiles.find_one(
                        {"profile_id": profile_id}, {"avatar_url": 1, "photo_url": 1}
                    )
                    if profile_record:
                        avatar_url = profile_record.get("avatar_url") or profile_record.get("photo_url") or child_photo_url
                        logger.info(f"[Orchestrator] Using avatar for consistency: {bool(avatar_url)}")
                except Exception as e:
                    logger.warning(f"[Orchestrator] Could not fetch profile avatar: {e}")

            # === Agent 6: Image Generation ===
            logger.info("[Agent 6] Image Generation - creating illustrations...")

            # Check which pages already have images (for resume)
            existing_pages = saved.get("pages", []) if saved else []
            pages_with_images = {p["page_number"] for p in existing_pages if p.get("image_url")}
            if pages_with_images:
                logger.info(f"[Agent 6] Pages already done: {sorted(pages_with_images)}")

            # Write placeholder pages to DB
            placeholder_pages = []
            for i, page_text_obj in enumerate(pages_text):
                existing = next((p for p in existing_pages if p.get("page_number") == i), None)
                placeholder_pages.append({
                    "page_number": i,
                    "text": page_text_obj.get("text", "") if isinstance(page_text_obj, dict) else str(page_text_obj),
                    "image_url": existing.get("image_url", "") if existing else "",
                    "jpeg_url": existing.get("jpeg_url", "") if existing else "",
                    "scene_description": scene_prompts[i] if i < len(scene_prompts) else ""
                })

            await self.update_story(story_id, {
                "status": "generating_images",
                "pages": placeholder_pages,
            })

            # Callback for live progress
            async def on_page_done(page_index, image_path, jpeg_path=""):
                update = {f"pages.{page_index}.image_url": image_path}
                if jpeg_path:
                    update[f"pages.{page_index}.jpeg_url"] = jpeg_path
                await self.db.stories.update_one({"story_id": story_id}, {"$set": update})
                logger.info(f"[Orchestrator] Page {page_index} image saved")

            image_urls = await self.image_generator.run(
                scene_prompts=scene_prompts, story_id=story_id, user_id=user_id,
                pages_text=pages_text, avatar_url=avatar_url, on_page_done=on_page_done
            )
            logger.info(f"[Agent 6] Images generated: {len([u for u in image_urls if u])}/{len(image_urls)}")

            await self.update_story(story_id, {"_step_completed": "6_images"})

            # === Assemble final pages ===
            pages = []
            for i, page_text_obj in enumerate(pages_text):
                result = image_urls[i] if i < len(image_urls) else {}
                png_url = result.get("png", "") if isinstance(result, dict) else (result or "")
                jpeg_url = result.get("jpeg", "") if isinstance(result, dict) else ""
                pages.append({
                    "page_number": i,
                    "text": page_text_obj.get("text", "") if isinstance(page_text_obj, dict) else str(page_text_obj),
                    "image_url": png_url, "jpeg_url": jpeg_url,
                    "scene_description": scene_prompts[i] if i < len(scene_prompts) else ""
                })

            def _png(r): return r.get("png", "") if isinstance(r, dict) else (r or "")
            cover_url = _png(image_urls[0]) if image_urls else ""
            back_cover_url = _png(image_urls[-1]) if len(image_urls) > 1 else ""

            await self.update_story(story_id, {
                "status": "creating_pdf",
                "title": story_outline.get("title", "Untitled"),
                "pages": pages,
                "cover_image_url": cover_url,
                "back_cover_image_url": back_cover_url,
            })

            # === Agent 7: PDF Creation ===
            logger.info("[Agent 7] PDF Creation - assembling storybook PDF...")
            pdf_url = await self.pdf_agent.run(pages=pages, story_id=story_id)
            logger.info(f"[Agent 7] PDF created: {bool(pdf_url)}")

            await self.update_story(story_id, {
                "status": "completed",
                "pdf_url": pdf_url,
                "_step_completed": "7_done"
            })

            logger.info(f"[Orchestrator] Story {story_id} completed successfully!")

        except Exception as e:
            logger.error(f"[Orchestrator] Story generation FAILED for {story_id}: {e}", exc_info=True)
            await self.update_story(story_id, {
                "status": "failed",
                "error_message": str(e)
            })

    # -----------------------------------------------------------------------
    # Draft flow: generate text only → user reviews/edits → approve → images
    # -----------------------------------------------------------------------

    async def generate_story_draft(self, story_id, user_id, profile_id, child_name, child_age,
                                   child_photo_url, language, language_code, interests,
                                   num_pages=8, custom_incident=""):
        """Runs agents 1-4 (text only) and saves the result as a draft for user review."""
        try:
            logger.info(f"[Orchestrator] Starting draft generation: {story_id}")

            await self.update_story(story_id, {"status": "understanding_input"})
            themes = await self.input_agent.run(interests, language_code)

            await self.update_story(story_id, {"status": "planning_story"})
            story_outline = await self.story_planner.run(
                child_name=child_name, child_age=child_age, themes=themes,
                language_code=language_code, language_name=language,
                num_pages=num_pages, custom_incident=custom_incident
            )

            await self.update_story(story_id, {
                "title": story_outline.get("title", "Untitled Story"),
                "status": "writing_story"
            })

            pages_text = await self.story_writer.run(
                story_outline=story_outline, language_code=language_code,
                language_name=language, child_name=child_name,
                child_age=child_age, num_pages=num_pages, custom_incident=custom_incident
            )

            await self.update_story(story_id, {"status": "quality_check"})
            quality_result = await self.quality_agent.run(
                pages_text=pages_text, language_code=language_code,
                language_name=language, child_name=child_name,
                story_title=story_outline.get("title", ""), num_pages=num_pages,
                child_age=child_age
            )

            corrected_pages = quality_result.get("corrected_pages")
            if corrected_pages and isinstance(corrected_pages, list) and len(corrected_pages) == len(pages_text):
                pages_text = corrected_pages
            corrected_title = quality_result.get("corrected_title") or story_outline.get("title", "Untitled Story")

            # Override cover/back-cover text
            for pt in pages_text:
                if isinstance(pt, dict) and pt.get("page") == 0:
                    pt["text"] = corrected_title
                    break
            back_cover_index = num_pages - 1
            for pt in pages_text:
                if isinstance(pt, dict) and pt.get("page") == back_cover_index:
                    pt["text"] = "TinguTales\nBangalore, India\nTinguTales.com"
                    break

            await self.update_story(story_id, {
                "title": corrected_title,
                "draft_pages": pages_text,
                "status": "draft_ready"
            })
            logger.info(f"[Orchestrator] Draft ready: {story_id}")

        except Exception as e:
            logger.error(f"[Orchestrator] Draft generation FAILED for {story_id}: {e}", exc_info=True)
            await self.update_story(story_id, {"status": "draft_failed", "error_message": str(e)})

    async def generate_story_from_approved(self, story_id, user_id, profile_id, child_name, child_age,
                                           child_photo_url, language, language_code, pages_text,
                                           num_pages, story_title=""):
        """Runs agents 5-7 (scenes → images → PDF) from pre-approved pages_text."""
        try:
            logger.info(f"[Orchestrator] Starting image generation from approved draft: {story_id}")

            # Reconstruct a minimal story_outline so SceneGenerator has context
            story_outline = {
                "title": story_title,
                "title_english": story_title,
                "synopsis": "",
                "pages": [
                    {"page": pt.get("page", i) if isinstance(pt, dict) else i,
                     "description": pt.get("text", "")[:80] if isinstance(pt, dict) else ""}
                    for i, pt in enumerate(pages_text)
                ]
            }

            await self.update_story(story_id, {"status": "creating_scenes"})
            scene_prompts = await self.scene_generator.run(
                story_outline=story_outline,
                pages_text=pages_text,
                child_name=child_name,
                child_age=child_age,
                num_pages=num_pages
            )

            # Look up avatar
            avatar_url = child_photo_url
            if profile_id:
                try:
                    profile_record = await self.db.child_profiles.find_one(
                        {"profile_id": profile_id}, {"avatar_url": 1, "photo_url": 1}
                    )
                    if profile_record:
                        avatar_url = profile_record.get("avatar_url") or profile_record.get("photo_url") or child_photo_url
                except Exception as e:
                    logger.warning(f"[Orchestrator] Could not fetch avatar: {e}")

            # Write placeholder pages for real-time progress display
            placeholder_pages = [
                {
                    "page_number": i,
                    "text": pt.get("text", "") if isinstance(pt, dict) else str(pt),
                    "image_url": "",
                    "scene_description": scene_prompts[i] if i < len(scene_prompts) else ""
                }
                for i, pt in enumerate(pages_text)
            ]
            await self.update_story(story_id, {"status": "generating_images", "pages": placeholder_pages})

            async def on_page_done(page_index, image_path, jpeg_path=""):
                update = {f"pages.{page_index}.image_url": image_path}
                if jpeg_path:
                    update[f"pages.{page_index}.jpeg_url"] = jpeg_path
                await self.db.stories.update_one({"story_id": story_id}, {"$set": update})

            image_urls = await self.image_generator.run(
                scene_prompts=scene_prompts, story_id=story_id, user_id=user_id,
                pages_text=pages_text, avatar_url=avatar_url, on_page_done=on_page_done
            )

            pages = [
                {
                    "page_number": i,
                    "text": pt.get("text", "") if isinstance(pt, dict) else str(pt),
                    "image_url": (image_urls[i].get("png", "") if isinstance(image_urls[i], dict) else image_urls[i]) if i < len(image_urls) else "",
                    "jpeg_url": (image_urls[i].get("jpeg", "") if isinstance(image_urls[i], dict) else "") if i < len(image_urls) else "",
                    "scene_description": scene_prompts[i] if i < len(scene_prompts) else ""
                }
                for i, pt in enumerate(pages_text)
            ]
            def _png(r): return r.get("png", "") if isinstance(r, dict) else (r or "")
            cover_url = _png(image_urls[0]) if image_urls else ""
            back_cover_url = _png(image_urls[-1]) if len(image_urls) > 1 else ""

            await self.update_story(story_id, {
                "status": "creating_pdf",
                "pages": pages,
                "cover_image_url": cover_url,
                "back_cover_image_url": back_cover_url,
            })

            pdf_url = await self.pdf_agent.run(pages=pages, story_id=story_id)
            await self.update_story(story_id, {"status": "completed", "pdf_url": pdf_url})
            logger.info(f"[Orchestrator] Story {story_id} completed from approved draft!")

        except Exception as e:
            logger.error(f"[Orchestrator] Image generation FAILED for {story_id}: {e}", exc_info=True)
            await self.update_story(story_id, {"status": "failed", "error_message": str(e)})

