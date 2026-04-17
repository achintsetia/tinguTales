"""
MongoDB-backed task queue for story generation.

Jobs run in a SEPARATE THREAD with their own asyncio event loop,
so the main API event loop is NEVER blocked — even during heavy
AI image generation. This completely isolates the API from generation work.
"""

import os
import asyncio
import threading
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

_worker_thread = None
_stop_event = threading.Event()


async def enqueue_job(db, job_type, payload):
    """Insert a job into the queue. Returns the job document."""
    job = {
        "job_type": job_type,
        "payload": payload,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "finished_at": None,
        "error": None,
    }
    await db.story_jobs.insert_one(job)
    job.pop("_id", None)
    logger.info(f"[Queue] Enqueued {job_type} job for story {payload.get('story_id', '?')}")
    return job


def start_worker():
    """Start the worker in a separate daemon thread (idempotent)."""
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _stop_event.clear()
    _worker_thread = threading.Thread(target=_run_worker_thread, daemon=True)
    _worker_thread.start()
    logger.info("[Queue] Worker thread started")


def _run_worker_thread():
    """Entry point for the worker thread — creates its own event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_worker_loop())
    except Exception as e:
        logger.error(f"[Queue] Worker thread crashed: {e}")
    finally:
        loop.close()


async def _worker_loop():
    """Continuously poll for pending jobs and process one at a time."""
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent / '.env')

    # Create a NEW MongoDB connection for this thread (motor clients are not thread-safe)
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    from agents.orchestrator import MasterOrchestrator

    # Reset stuck jobs AND re-enqueue interrupted stories
    await db.story_jobs.update_many(
        {"status": "processing"},
        {"$set": {"status": "pending"}}
    )

    # Find stories stuck in intermediate states (server crashed mid-generation)
    # and create new jobs for them so they resume from their saved checkpoint
    IN_PROGRESS_STATES = [
        "understanding_input", "planning_story", "writing_story",
        "quality_check", "creating_scenes", "generating_images",
        "creating_pdf", "generating", "drafting"
    ]
    stuck_stories = await db.stories.find(
        {"status": {"$in": IN_PROGRESS_STATES}},
        {"_id": 0, "story_id": 1}
    ).to_list(50)

    for stuck in stuck_stories:
        sid = stuck["story_id"]
        # Check if there's already a pending/processing job for this story
        existing_job = await db.story_jobs.find_one(
            {"payload.story_id": sid, "status": {"$in": ["pending", "processing"]}}
        )
        if not existing_job:
            # Re-enqueue — the orchestrator will resume from its saved _step_completed
            full_story = await db.stories.find_one({"story_id": sid}, {"_id": 0})
            if full_story:
                job_payload = {
                    "story_id": sid,
                    "user_id": full_story.get("user_id", ""),
                    "profile_id": full_story.get("profile_id", ""),
                    "child_name": full_story.get("child_name", ""),
                    "child_age": 5,
                    "child_photo_url": full_story.get("avatar_url", ""),
                    "language": full_story.get("language", "English"),
                    "language_code": full_story.get("language_code", "en"),
                    "interests": full_story.get("interests", []),
                    "num_pages": full_story.get("page_count", 8),
                    "custom_incident": full_story.get("custom_incident", ""),
                }
                await db.story_jobs.insert_one({
                    "job_type": "generate",
                    "payload": job_payload,
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "started_at": None, "finished_at": None, "error": None,
                })
                logger.info(f"[Queue] Re-enqueued interrupted story {sid} for resume")

    if stuck_stories:
        logger.info(f"[Queue] Re-enqueued {len(stuck_stories)} interrupted stories")

    logger.info("[Queue] Worker loop ready, polling for jobs...")

    while not _stop_event.is_set():
        try:
            # Atomically claim the oldest pending job
            job = await db.story_jobs.find_one_and_update(
                {"status": "pending"},
                {"$set": {"status": "processing",
                          "started_at": datetime.now(timezone.utc).isoformat()}},
                sort=[("created_at", 1)],
                return_document=True
            )

            if not job:
                await asyncio.sleep(2)
                continue

            job_type = job["job_type"]
            payload = job["payload"]
            story_id = payload.get("story_id", "unknown")
            logger.info(f"[Queue] Processing {job_type} job for story {story_id}")

            orchestrator = MasterOrchestrator(db)

            try:
                if job_type == "generate":
                    await orchestrator.generate_story(**payload)
                elif job_type == "draft":
                    await orchestrator.generate_story_draft(**payload)
                elif job_type == "approve":
                    await orchestrator.generate_story_from_approved(**payload)
                else:
                    logger.error(f"[Queue] Unknown job type: {job_type}")

                await db.story_jobs.update_one(
                    {"_id": job["_id"]},
                    {"$set": {"status": "done",
                              "finished_at": datetime.now(timezone.utc).isoformat()}}
                )
                logger.info(f"[Queue] Job done for story {story_id}")

            except Exception as e:
                logger.error(f"[Queue] Job failed for story {story_id}: {e}")
                await db.story_jobs.update_one(
                    {"_id": job["_id"]},
                    {"$set": {"status": "failed", "error": str(e),
                              "finished_at": datetime.now(timezone.utc).isoformat()}}
                )
                # Also mark the story as failed
                await db.stories.update_one(
                    {"story_id": story_id},
                    {"$set": {"status": "failed", "error_message": str(e),
                              "updated_at": datetime.now(timezone.utc).isoformat()}}
                )

            await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"[Queue] Worker loop error: {e}")
            await asyncio.sleep(5)

    client.close()
