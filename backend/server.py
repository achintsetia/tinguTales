from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form, Depends, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import json
import asyncio
import requests as http_requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from io import BytesIO

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Object Storage
from storage import init_storage, put_object, get_object, delete_object, async_delete_object, async_get_object, async_put_object


# ============= AUTH HELPERS =============

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


async def get_current_user(request: Request) -> dict:
    """Extract and validate user from session cookie or Authorization header."""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


# ============= AUTH ROUTES =============

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    try:
        auth_response = http_requests.get(
            EMERGENT_AUTH_URL,
            headers={"X-Session-ID": session_id},
            timeout=10
        )
        auth_response.raise_for_status()
        auth_data = auth_response.json()
    except Exception as e:
        logger.error(f"Auth exchange failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    email = auth_data["email"]
    name = auth_data.get("name", "")
    picture = auth_data.get("picture", "")
    session_token = auth_data.get("session_token", str(uuid.uuid4()))

    ADMIN_EMAILS = {"setia.achint@gmail.com"}

    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        update_fields = {"name": name, "picture": picture}
        if email in ADMIN_EMAILS:
            update_fields["is_admin"] = True
        await db.users.update_one(
            {"email": email},
            {"$set": update_fields}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        if email in ADMIN_EMAILS:
            user_doc["is_admin"] = True
        await db.users.insert_one(user_doc)

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    # Return session_token in body so frontend can store it (avoids CORS cookie issues)
    user_data = dict(user)
    user_data["session_token"] = session_token
    return user_data


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out"}


# ============= CHILD PROFILES =============

@api_router.post("/profiles")
async def create_profile(
    name: str = Form(...),
    age: int = Form(...),
    gender: str = Form(""),
    photo: UploadFile = File(None),
    user: dict = Depends(get_current_user)
):
    profile_id = f"profile_{uuid.uuid4().hex[:12]}"
    photo_url = ""

    if photo and photo.filename:
        ext = photo.filename.rsplit(".", 1)[-1] if "." in photo.filename else "png"
        storage_path = f"tingutales/photos/{user['user_id']}/{profile_id}.{ext}"
        photo_data = await photo.read()
        try:
            result = await async_put_object(storage_path, photo_data, photo.content_type or "image/png")
            photo_url = result["path"]
        except Exception as e:
            logger.error(f"Photo upload failed: {e}")

    profile = {
        "profile_id": profile_id,
        "user_id": user["user_id"],
        "name": name,
        "age": age,
        "gender": gender,
        "photo_url": photo_url,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.child_profiles.insert_one(profile)
    profile.pop("_id", None)

    # If photo uploaded, trigger avatar generation in background
    if photo_url:
        asyncio.create_task(_generate_avatar(profile_id, photo_url, name, user["user_id"]))

    return profile


async def _generate_avatar(profile_id, photo_url, child_name, user_id):
    """Background task to generate avatar from child photo."""
    try:
        from agents.avatar_agent import AvatarAgent
        api_key = os.environ.get("GEMINI_API_KEY")
        agent = AvatarAgent(api_key)
        result = await agent.run(photo_url, child_name, profile_id, user_id)
        if result.get("png"):
            update = {"avatar_url": result["png"]}
            if result.get("jpeg"):
                update["avatar_jpeg_url"] = result["jpeg"]
            await db.child_profiles.update_one(
                {"profile_id": profile_id},
                {"$set": update}
            )
            logger.info(f"Avatar saved for profile {profile_id}")
    except Exception as e:
        logger.error(f"Background avatar generation failed: {e}")


@api_router.post("/profiles/{profile_id}/generate-avatar")
async def generate_avatar(profile_id: str, user: dict = Depends(get_current_user)):
    """Manually trigger avatar generation for a profile."""
    profile = await db.child_profiles.find_one(
        {"profile_id": profile_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("photo_url"):
        raise HTTPException(status_code=400, detail="No photo uploaded for this profile")

    from agents.avatar_agent import AvatarAgent
    api_key = os.environ.get("GEMINI_API_KEY")
    agent = AvatarAgent(api_key)
    result = await agent.run(
        profile["photo_url"], profile["name"], profile_id, user["user_id"]
    )

    if result.get("png"):
        update = {"avatar_url": result["png"]}
        if result.get("jpeg"):
            update["avatar_jpeg_url"] = result["jpeg"]
        await db.child_profiles.update_one(
            {"profile_id": profile_id},
            {"$set": update}
        )
        profile["avatar_url"] = result["png"]
        if result.get("jpeg"):
            profile["avatar_jpeg_url"] = result["jpeg"]
        return profile
    else:
        raise HTTPException(status_code=500, detail="Avatar generation failed")


@api_router.get("/profiles")
async def list_profiles(user: dict = Depends(get_current_user)):
    profiles = await db.child_profiles.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    return profiles


@api_router.get("/profiles/{profile_id}")
async def get_profile(profile_id: str, user: dict = Depends(get_current_user)):
    profile = await db.child_profiles.find_one(
        {"profile_id": profile_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@api_router.delete("/profiles/{profile_id}/photo")
async def delete_profile_photo(profile_id: str, user: dict = Depends(get_current_user)):
    """Delete a child's photo and avatar from storage, then delete the entire profile."""
    profile = await db.child_profiles.find_one(
        {"profile_id": profile_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    for url_field in ("photo_url", "avatar_url", "avatar_jpeg_url"):
        path = profile.get(url_field)
        if path:
            try:
                await async_delete_object(path)
            except Exception as e:
                logger.warning(f"Could not delete object {path}: {e}")

    await db.child_profiles.delete_one(
        {"profile_id": profile_id, "user_id": user["user_id"]}
    )
    return {"message": "Profile deleted"}


@api_router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user: dict = Depends(get_current_user)):
    result = await db.child_profiles.delete_one(
        {"profile_id": profile_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"message": "Profile deleted"}


# ============= STORIES =============

LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "kn": "Kannada",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "bn": "Bengali"
}


@api_router.get("/languages")
async def get_languages():
    return [
        {"code": "en", "name": "English", "native": "English"},
        {"code": "hi", "name": "Hindi", "native": "\u0939\u093f\u0928\u094d\u0926\u0940"},
        {"code": "kn", "name": "Kannada", "native": "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1"},
        {"code": "ta", "name": "Tamil", "native": "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"},
        {"code": "te", "name": "Telugu", "native": "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41"},
        {"code": "mr", "name": "Marathi", "native": "\u092e\u0930\u093e\u0920\u0940"},
        {"code": "bn", "name": "Bengali", "native": "\u09ac\u09be\u0982\u09b2\u09be"},
    ]


@api_router.post("/transliterate")
async def transliterate_name(request: Request):
    """Use LLM to transliterate a child's name into the target language script."""
    body = await request.json()
    name = body.get("name", "").strip()
    language_code = body.get("language_code", "")
    language_name = body.get("language_name", "")

    if not name or not language_code or language_code == "en":
        return {"transliterated": name}

    try:
        from gemini_chat import LlmChat, UserMessage
        api_key = os.environ.get("GEMINI_API_KEY")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"translit_{uuid.uuid4().hex[:8]}",
            system_message=(
                f"You are an expert transliterator. Convert the given name from English/Latin script "
                f"into {language_name} ({language_code}) script. Return ONLY the transliterated name "
                f"in the native script — no explanation, no quotes, no extra text."
            )
        )
        chat.with_model("gemini", "gemini-2.5-flash")

        msg = UserMessage(
            text=f"Transliterate this name into {language_name} script: {name}"
        )
        result = await chat.send_message(msg)
        transliterated = result.strip().strip('"').strip("'").strip()

        return {"transliterated": transliterated, "language_code": language_code}
    except Exception as e:
        logger.error(f"Transliteration failed: {e}")
        return {"transliterated": name, "error": str(e)}


@api_router.post("/stories/draft")
async def create_story_draft(request: Request, user: dict = Depends(get_current_user)):
    """Create a story text draft for user review before generating images."""
    body = await request.json()
    profile_id = body.get("profile_id")
    language = body.get("language")
    language_code = body.get("language_code")
    interests = body.get("interests", [])
    custom_incident = body.get("custom_incident") or ""
    page_count = max(6, min(16, int(body.get("page_count", 8))))
    native_child_name = (body.get("native_child_name") or "").strip()

    if not all([profile_id, language, language_code]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    profile = await db.child_profiles.find_one(
        {"profile_id": profile_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Child profile not found")

    child_name = native_child_name if native_child_name else profile["name"]

    story_id = f"story_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    story = {
        "story_id": story_id,
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "child_name": child_name,
        "language": language,
        "language_code": language_code,
        "interests": interests,
        "custom_incident": custom_incident,
        "page_count": page_count,
        "avatar_url": profile.get("avatar_url", "") or profile.get("photo_url", ""),
        "status": "drafting",
        "title": "",
        "draft_pages": [],
        "pages": [],
        "cover_image_url": "",
        "back_cover_image_url": "",
        "pdf_url": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.stories.insert_one(story)
    story.pop("_id", None)

    from task_queue import enqueue_job
    await enqueue_job(db, "draft", {
        "story_id": story_id,
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "child_name": child_name,
        "child_age": profile.get("age", 5),
        "child_photo_url": profile.get("photo_url", ""),
        "language": language,
        "language_code": language_code,
        "interests": interests,
        "num_pages": page_count,
        "custom_incident": custom_incident,
    })
    return story


@api_router.post("/stories/{story_id}/approve")
async def approve_story_draft(story_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Accept edited pages_text and kick off image/PDF generation."""
    body = await request.json()
    pages_text = body.get("pages_text", [])

    if not pages_text or not isinstance(pages_text, list):
        raise HTTPException(status_code=400, detail="pages_text must be a non-empty list")

    story = await db.stories.find_one(
        {"story_id": story_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.get("status") != "draft_ready":
        raise HTTPException(status_code=400, detail="Story must be in draft_ready state to approve")

    await db.stories.update_one(
        {"story_id": story_id},
        {"$set": {"draft_pages": pages_text, "status": "generating"}}
    )

    profile = await db.child_profiles.find_one(
        {"profile_id": story["profile_id"]}, {"age": 1, "_id": 0}
    )
    child_age = profile.get("age", 5) if profile else 5

    from task_queue import enqueue_job
    await enqueue_job(db, "approve", {
        "story_id": story_id,
        "user_id": story["user_id"],
        "profile_id": story["profile_id"],
        "child_name": story["child_name"],
        "child_age": child_age,
        "child_photo_url": story.get("avatar_url", ""),
        "language": story["language"],
        "language_code": story["language_code"],
        "pages_text": pages_text,
        "num_pages": story.get("page_count", 8),
        "story_title": story.get("title", ""),
    })
    return {"story_id": story_id, "status": "generating"}


@api_router.post("/stories/generate")
async def generate_story(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    profile_id = body.get("profile_id")
    language = body.get("language")
    language_code = body.get("language_code")
    interests = body.get("interests", [])
    custom_incident = body.get("custom_incident") or ""
    # Clamp page count: must include cover + at least 2 story pages + back cover
    page_count = max(6, min(16, int(body.get("page_count", 8))))

    if not all([profile_id, language, language_code]):
        raise HTTPException(status_code=400, detail="Missing required fields: profile_id, language, language_code")

    profile = await db.child_profiles.find_one(
        {"profile_id": profile_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Child profile not found")

    story_id = f"story_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    story = {
        "story_id": story_id,
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "child_name": profile["name"],
        "language": language,
        "language_code": language_code,
        "interests": interests,
        "custom_incident": custom_incident,
        "page_count": page_count,
        "avatar_url": profile.get("avatar_url", "") or profile.get("photo_url", ""),
        "status": "generating",
        "title": "",
        "pages": [],
        "cover_image_url": "",
        "back_cover_image_url": "",
        "pdf_url": "",
        "created_at": now,
        "updated_at": now
    }

    await db.stories.insert_one(story)
    story.pop("_id", None)

    # Enqueue for background processing via task queue
    from task_queue import enqueue_job
    await enqueue_job(db, "generate", {
        "story_id": story_id,
        "user_id": user["user_id"],
        "profile_id": profile_id,
        "child_name": profile["name"],
        "child_age": profile.get("age", 5),
        "child_photo_url": profile.get("photo_url", ""),
        "language": language,
        "language_code": language_code,
        "interests": interests,
        "num_pages": page_count,
        "custom_incident": custom_incident,
    })

    return story


@api_router.get("/stories")
async def list_stories(user: dict = Depends(get_current_user)):
    stories = await db.stories.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return stories


@api_router.get("/stories/{story_id}")
async def get_story(story_id: str, user: dict = Depends(get_current_user)):
    story = await db.stories.find_one(
        {"story_id": story_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


@api_router.delete("/stories/{story_id}")
async def delete_story(story_id: str, user: dict = Depends(get_current_user)):
    result = await db.stories.delete_one(
        {"story_id": story_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Story not found")
    return {"message": "Story deleted"}


# ============= FILES =============

@api_router.get("/files/{path:path}")
async def serve_file(path: str, auth: str = Query(None), request: Request = None):
    """Serve files from object storage. Supports cookie, header, and query param auth."""
    try:
        data, content_type = await async_get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"File serve error for {path}: {e}")
        raise HTTPException(status_code=404, detail="File not found")


# ============= PDF EXPORT =============

@api_router.get("/stories/{story_id}/pdf")
async def export_story_pdf(story_id: str, user: dict = Depends(get_current_user)):
    story = await db.stories.find_one(
        {"story_id": story_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story["status"] not in ("completed", "creating_pdf"):
        raise HTTPException(status_code=400, detail="Story not ready yet")

    # Serve the pre-generated PDF from storage when available
    pdf_url = story.get("pdf_url", "")
    if pdf_url:
        try:
            pdf_data, _ = await async_get_object(pdf_url)
            return Response(
                content=pdf_data,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="tingu_tales_{story_id}.pdf"'
                }
            )
        except Exception as e:
            logger.error(f"Stored PDF serve error: {e}")

    # Fallback: build PDF on-the-fly from page images
    from fpdf import FPDF
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)

    for page in sorted(story.get("pages", []), key=lambda p: p.get("page_number", 0)):
        pdf.add_page()
        if page.get("image_url"):
            try:
                img_data, _ = await async_get_object(page["image_url"])
                temp_path = f"/tmp/{uuid.uuid4()}.png"
                with open(temp_path, "wb") as f:
                    f.write(img_data)
                pdf.image(temp_path, 0, 0, 210, 297)
                os.remove(temp_path)
            except Exception as e:
                logger.error(f"PDF image error page {page.get('page_number')}: {e}")

    pdf_bytes = pdf.output()
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="tingu_tales_{story_id}.pdf"'
        }
    )


# ============= RAZORPAY PAYMENTS =============

PRICE_PER_PAGE = 13  # ₹13 per page

# Pricing tiers with friendly rounding
PRICING_TABLE = {
    6: 79,    # ₹79 for 6 pages (₹13.2/page)
    8: 99,    # ₹99 for 8 pages (₹12.4/page)
    10: 129,  # ₹129 for 10 pages (₹12.9/page)
    12: 149,  # ₹149 for 12 pages (₹12.4/page)
}


def get_price(page_count):
    """Get price in INR for a given page count."""
    return PRICING_TABLE.get(page_count, page_count * PRICE_PER_PAGE)


@api_router.get("/pricing")
async def get_pricing():
    """Return pricing table."""
    tiers = []
    for pages, price in sorted(PRICING_TABLE.items()):
        tiers.append({
            "pages": pages,
            "price": price,
            "per_page": round(price / pages, 1),
            "price_paise": price * 100,
        })
    return {"tiers": tiers, "per_page_rate": PRICE_PER_PAGE, "currency": "INR"}


@api_router.post("/payments/create-order")
async def create_payment_order(request: Request, user: dict = Depends(get_current_user)):
    """Create a Razorpay order for story generation."""
    import razorpay

    body = await request.json()
    page_count = body.get("page_count", 8)
    story_id = body.get("story_id", "")

    price_inr = get_price(page_count)
    amount_paise = price_inr * 100

    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")

    if not key_id or not key_secret:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")

    client = razorpay.Client(auth=(key_id, key_secret))

    try:
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"tt_{story_id[:30]}" if story_id else f"tt_{uuid.uuid4().hex[:12]}",
            "payment_capture": 1,
            "notes": {
                "user_id": user["user_id"],
                "story_id": story_id,
                "page_count": str(page_count),
                "product": "tingu_tales_storybook",
            }
        })
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=500, detail="Payment order creation failed")

    # Save order in DB
    payment_record = {
        "order_id": order["id"],
        "user_id": user["user_id"],
        "story_id": story_id,
        "page_count": page_count,
        "amount": price_inr,
        "amount_paise": amount_paise,
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(payment_record)

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "price_inr": price_inr,
        "key_id": key_id,
    }


@api_router.post("/payments/verify")
async def verify_payment(request: Request, user: dict = Depends(get_current_user)):
    """Verify Razorpay payment signature and mark as paid."""
    import razorpay

    body = await request.json()
    order_id = body.get("razorpay_order_id")
    payment_id = body.get("razorpay_payment_id")
    signature = body.get("razorpay_signature")

    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")

    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    client = razorpay.Client(auth=(key_id, key_secret))

    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        await db.payments.update_one(
            {"order_id": order_id},
            {"$set": {"status": "failed", "error": str(e)}}
        )
        raise HTTPException(status_code=400, detail="Payment verification failed")

    # Mark payment as paid
    await db.payments.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "paid",
            "payment_id": payment_id,
            "signature": signature,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Get the associated story_id
    payment = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
    story_id = payment.get("story_id", "") if payment else ""

    # Mark story as paid
    if story_id:
        await db.stories.update_one(
            {"story_id": story_id},
            {"$set": {"paid": True, "payment_id": payment_id}}
        )

    return {
        "status": "paid",
        "payment_id": payment_id,
        "story_id": story_id,
    }


@api_router.get("/payments/check/{story_id}")
async def check_payment(story_id: str, user: dict = Depends(get_current_user)):
    """Check if a story has been paid for."""
    payment = await db.payments.find_one(
        {"story_id": story_id, "user_id": user["user_id"], "status": "paid"},
        {"_id": 0}
    )
    return {"paid": payment is not None, "payment": payment}


@api_router.get("/payments/history")
async def payment_history(user: dict = Depends(get_current_user)):
    """Get payment history for the current user."""
    payments = await db.payments.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return payments


# ============= ADMIN =============

async def get_admin_user(request: Request) -> dict:
    """Verify user is an admin."""
    user = await get_current_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@api_router.get("/admin/jobs")
async def admin_list_jobs(user: dict = Depends(get_admin_user)):
    """List all story generation jobs."""
    jobs = await db.story_jobs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return jobs


@api_router.get("/admin/stories")
async def admin_list_stories(user: dict = Depends(get_admin_user)):
    """List all stories across all users (admin only)."""
    stories = await db.stories.find(
        {}, {"_id": 0, "story_id": 1, "user_id": 1, "title": 1, "status": 1,
             "language": 1, "child_name": 1, "created_at": 1, "page_count": 1,
             "paid": 1, "payment_id": 1}
    ).sort("created_at", -1).to_list(500)
    return stories


@api_router.delete("/admin/jobs/stale")
async def admin_delete_stale_jobs(user: dict = Depends(get_admin_user)):
    """Delete all stale (failed/done) jobs and mark stuck stories as failed."""
    # Delete completed and failed jobs
    del_result = await db.story_jobs.delete_many(
        {"status": {"$in": ["done", "failed"]}}
    )

    # Mark stuck stories as failed
    IN_PROGRESS = [
        "understanding_input", "planning_story", "writing_story",
        "quality_check", "creating_scenes", "generating_images",
        "creating_pdf", "generating", "drafting"
    ]
    stuck_result = await db.stories.update_many(
        {"status": {"$in": IN_PROGRESS}},
        {"$set": {"status": "failed", "error_message": "Cleared by admin",
                  "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Cancel pending jobs
    cancel_result = await db.story_jobs.delete_many(
        {"status": "pending"}
    )

    return {
        "deleted_jobs": del_result.deleted_count + cancel_result.deleted_count,
        "stuck_stories_failed": stuck_result.modified_count,
    }


@api_router.delete("/admin/jobs/{job_status}")
async def admin_delete_jobs_by_status(job_status: str, user: dict = Depends(get_admin_user)):
    """Delete jobs by status (pending, processing, done, failed)."""
    result = await db.story_jobs.delete_many({"status": job_status})
    return {"deleted": result.deleted_count, "status": job_status}


@api_router.post("/admin/refund")
async def admin_refund_payment(request: Request, user: dict = Depends(get_admin_user)):
    """Initiate a refund for a payment."""
    import razorpay

    body = await request.json()
    payment_id = body.get("payment_id")

    if not payment_id:
        raise HTTPException(status_code=400, detail="payment_id required")

    payment = await db.payments.find_one({"payment_id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.get("status") == "refunded":
        raise HTTPException(status_code=400, detail="Already refunded")

    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    client = razorpay.Client(auth=(key_id, key_secret))

    try:
        refund = client.payment.refund(payment_id, {
            "amount": payment.get("amount_paise", 0),
            "speed": "normal",
            "notes": {"reason": "Admin refund", "admin": user["user_id"]}
        })

        await db.payments.update_one(
            {"payment_id": payment_id},
            {"$set": {
                "status": "refunded",
                "refund_id": refund.get("id", ""),
                "refunded_at": datetime.now(timezone.utc).isoformat(),
                "refunded_by": user["user_id"],
            }}
        )

        return {"status": "refunded", "refund_id": refund.get("id", ""), "payment_id": payment_id}
    except Exception as e:
        logger.error(f"Refund failed: {e}")
        raise HTTPException(status_code=500, detail=f"Refund failed: {str(e)}")


@api_router.get("/admin/payments")
async def admin_list_payments(user: dict = Depends(get_admin_user)):
    """List all payments across all users."""
    payments = await db.payments.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return payments


@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(get_admin_user)):
    """Get dashboard stats for admin."""
    total_users = await db.users.count_documents({})
    total_stories = await db.stories.count_documents({})
    completed_stories = await db.stories.count_documents({"status": "completed"})
    total_payments = await db.payments.count_documents({"status": "paid"})
    total_revenue_cursor = db.payments.aggregate([
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ])
    total_revenue_list = await total_revenue_cursor.to_list(1)
    total_revenue = total_revenue_list[0]["total"] if total_revenue_list else 0

    pending_jobs = await db.story_jobs.count_documents({"status": "pending"})
    processing_jobs = await db.story_jobs.count_documents({"status": "processing"})

    return {
        "total_users": total_users,
        "total_stories": total_stories,
        "completed_stories": completed_stories,
        "total_payments": total_payments,
        "total_revenue": total_revenue,
        "pending_jobs": pending_jobs,
        "processing_jobs": processing_jobs,
    }


# ============= APP SETTINGS =============

@api_router.get("/settings/public")
async def get_public_settings():
    """Return public app settings (no auth required)."""
    settings = await db.app_settings.find_one({"key": "global"}, {"_id": 0})
    return {"payments_enabled": settings.get("payments_enabled", True) if settings else True}


@api_router.put("/admin/settings")
async def update_settings(request: Request, user: dict = Depends(get_admin_user)):
    """Update app settings (admin only)."""
    body = await request.json()
    allowed_keys = {"payments_enabled"}
    update = {k: v for k, v in body.items() if k in allowed_keys}
    if not update:
        raise HTTPException(status_code=400, detail="No valid settings to update")

    update["updated_by"] = user["user_id"]
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.app_settings.update_one(
        {"key": "global"},
        {"$set": update},
        upsert=True
    )
    settings = await db.app_settings.find_one({"key": "global"}, {"_id": 0})
    return settings


# ============= EXPORT / IMPORT =============

@api_router.get("/export")
async def export_all_data(user: dict = Depends(get_current_user)):
    """Export all user data (profiles, stories, images) as a ZIP file."""
    import zipfile
    from io import BytesIO

    user_id = user["user_id"]
    buf = BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Export user profile
        zf.writestr("user.json", json.dumps(user, ensure_ascii=False, indent=2))

        # 2. Export child profiles
        profiles = await db.child_profiles.find({"user_id": user_id}, {"_id": 0}).to_list(100)
        zf.writestr("profiles.json", json.dumps(profiles, ensure_ascii=False, indent=2))

        # 3. Export each profile's photo and avatar
        for profile in profiles:
            for key in ["photo_url", "avatar_url"]:
                path = profile.get(key, "")
                if path:
                    try:
                        data, ct = get_object(path)
                        zf.writestr(f"files/{path}", data)
                    except Exception as e:
                        logger.warning(f"Export: could not fetch {path}: {e}")

        # 4. Export stories + images
        stories = await db.stories.find({"user_id": user_id}, {"_id": 0}).to_list(500)
        zf.writestr("stories.json", json.dumps(stories, ensure_ascii=False, indent=2, default=str))

        for story in stories:
            # Fetch page images
            for page in story.get("pages", []):
                for key in ["image_url", "jpeg_url"]:
                    path = page.get(key, "")
                    if path:
                        try:
                            data, ct = get_object(path)
                            zf.writestr(f"files/{path}", data)
                        except Exception as e:
                            logger.warning(f"Export: could not fetch {path}: {e}")

            # Fetch cover/back cover
            for key in ["cover_image_url", "back_cover_image_url", "pdf_url"]:
                path = story.get(key, "")
                if path:
                    try:
                        data, ct = get_object(path)
                        zf.writestr(f"files/{path}", data)
                    except Exception as e:
                        logger.warning(f"Export: could not fetch {path}: {e}")

    buf.seek(0)
    user_name = user.get("name", "user").replace(" ", "_")
    filename = f"tingu_tales_{user_name}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip"

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@api_router.post("/import")
async def import_all_data(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Import user data from a previously exported ZIP file."""
    import zipfile
    from io import BytesIO

    user_id = user["user_id"]
    content = await file.read()
    buf = BytesIO(content)

    if not zipfile.is_zipfile(buf):
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    buf.seek(0)
    imported = {"profiles": 0, "stories": 0, "files": 0}

    with zipfile.ZipFile(buf, "r") as zf:
        # 1. Import child profiles
        if "profiles.json" in zf.namelist():
            profiles_data = json.loads(zf.read("profiles.json"))
            for profile in profiles_data:
                profile["user_id"] = user_id  # Remap to current user
                existing = await db.child_profiles.find_one(
                    {"profile_id": profile["profile_id"]}, {"_id": 0}
                )
                if not existing:
                    await db.child_profiles.insert_one(profile)
                    imported["profiles"] += 1
                else:
                    await db.child_profiles.update_one(
                        {"profile_id": profile["profile_id"]},
                        {"$set": profile}
                    )
                    imported["profiles"] += 1

        # 2. Import stories
        if "stories.json" in zf.namelist():
            stories_data = json.loads(zf.read("stories.json"))
            for story in stories_data:
                story["user_id"] = user_id  # Remap to current user
                existing = await db.stories.find_one(
                    {"story_id": story["story_id"]}, {"_id": 0}
                )
                if not existing:
                    await db.stories.insert_one(story)
                    imported["stories"] += 1
                else:
                    await db.stories.update_one(
                        {"story_id": story["story_id"]},
                        {"$set": story}
                    )
                    imported["stories"] += 1

        # 3. Import files to object storage
        for name in zf.namelist():
            if name.startswith("files/") and not name.endswith("/"):
                storage_path = name[6:]  # Remove "files/" prefix
                file_data = zf.read(name)
                # Determine content type
                ct = "application/octet-stream"
                if storage_path.endswith(".png"):
                    ct = "image/png"
                elif storage_path.endswith(".jpg") or storage_path.endswith(".jpeg"):
                    ct = "image/jpeg"
                elif storage_path.endswith(".pdf"):
                    ct = "application/pdf"
                try:
                    put_object(storage_path, file_data, ct)
                    imported["files"] += 1
                except Exception as e:
                    logger.warning(f"Import: could not upload {storage_path}: {e}")

    return {
        "message": "Import complete",
        "imported": imported
    }


# ============= HEALTH CHECK =============

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Tingu Tales API"}


# ============= APP SETUP =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Object storage initialized successfully")
    except Exception as e:
        logger.error(f"Storage init failed (non-fatal): {e}")

    # ── Start task queue worker in a SEPARATE THREAD ────────────────────
    # The worker gets its own event loop + MongoDB connection so heavy AI
    # work never blocks the API event loop.
    from task_queue import start_worker
    start_worker()
    logger.info("[Startup] Task queue worker thread started.")


async def _resume_interrupted_stories():
    """Find stories stuck in intermediate states and re-queue their generation."""
    try:
        # Small delay so the rest of startup finishes first
        await asyncio.sleep(3)

        # States where text generation was in progress — restart from scratch
        TEXT_GEN_STATES = {
            "drafting", "understanding_input", "planning_story",
            "writing_story", "quality_check",
        }
        # States where images were being generated — restart from approved pages
        IMAGE_GEN_STATES = {
            "generating", "creating_scenes", "generating_images", "creating_pdf",
        }
        all_stuck_states = TEXT_GEN_STATES | IMAGE_GEN_STATES

        stuck_stories = await db.stories.find(
            {"status": {"$in": list(all_stuck_states)}},
            {"_id": 0}
        ).to_list(100)

        if not stuck_stories:
            logger.info("[Startup] No interrupted stories to resume.")
            return

        logger.info(f"[Startup] Found {len(stuck_stories)} interrupted story/stories — resuming...")

        from agents.orchestrator import MasterOrchestrator
        orchestrator = MasterOrchestrator(db)

        for story in stuck_stories:
            story_id = story["story_id"]
            status = story["status"]

            # Look up child age from profile
            profile = await db.child_profiles.find_one(
                {"profile_id": story.get("profile_id")}, {"age": 1, "_id": 0}
            )
            child_age = (profile.get("age", 5) if profile else 5)

            if status in IMAGE_GEN_STATES:
                # Prefer draft_pages (set by the approve endpoint) then pages
                # (set by the orchestrator as placeholders once text is written)
                raw_pages = story.get("draft_pages") or story.get("pages")

                if raw_pages:
                    # Text is available — resume from scene/image generation
                    normalised = []
                    for i, p in enumerate(raw_pages):
                        if isinstance(p, dict):
                            normalised.append({"page": p.get("page", i), "text": p.get("text", "")})
                        else:
                            normalised.append({"page": i, "text": str(p)})

                    logger.info(f"[Startup] Resuming image generation for story {story_id} (was: {status})")
                    await db.stories.update_one(
                        {"story_id": story_id},
                        {"$set": {"status": "generating", "error_message": ""}}
                    )
                    asyncio.create_task(orchestrator.generate_story_from_approved(
                        story_id=story_id,
                        user_id=story["user_id"],
                        profile_id=story.get("profile_id", ""),
                        child_name=story.get("child_name", ""),
                        child_age=child_age,
                        child_photo_url=story.get("avatar_url", ""),
                        language=story.get("language", "English"),
                        language_code=story.get("language_code", "en"),
                        pages_text=normalised,
                        num_pages=story.get("page_count", len(normalised)),
                        story_title=story.get("title", ""),
                    ))
                else:
                    # No text found — story was stuck before text was written to DB
                    # (e.g. /stories/generate stuck at 'generating' or 'creating_scenes').
                    # Restart the full pipeline using the stored story parameters.
                    logger.info(f"[Startup] Restarting full pipeline for story {story_id} (was: {status}, no pages found)")
                    await db.stories.update_one(
                        {"story_id": story_id},
                        {"$set": {"status": "understanding_input", "error_message": ""}}
                    )
                    asyncio.create_task(orchestrator.generate_story(
                        story_id=story_id,
                        user_id=story["user_id"],
                        profile_id=story.get("profile_id", ""),
                        child_name=story.get("child_name", ""),
                        child_age=child_age,
                        child_photo_url=story.get("avatar_url", ""),
                        language=story.get("language", "English"),
                        language_code=story.get("language_code", "en"),
                        interests=story.get("interests", []),
                        num_pages=story.get("page_count", 8),
                        custom_incident=story.get("custom_incident", ""),
                    ))

            else:
                # Text generation was interrupted — restart draft from the beginning
                logger.info(f"[Startup] Resuming text draft for story {story_id} (was: {status})")
                await db.stories.update_one(
                    {"story_id": story_id},
                    {"$set": {"status": "drafting", "error_message": ""}}
                )
                asyncio.create_task(orchestrator.generate_story_draft(
                    story_id=story_id,
                    user_id=story["user_id"],
                    profile_id=story.get("profile_id", ""),
                    child_name=story.get("child_name", ""),
                    child_age=child_age,
                    child_photo_url=story.get("avatar_url", ""),
                    language=story.get("language", "English"),
                    language_code=story.get("language_code", "en"),
                    interests=story.get("interests", []),
                    num_pages=story.get("page_count", 8),
                    custom_incident=story.get("custom_incident", ""),
                ))

        logger.info(f"[Startup] Resumed {len(stuck_stories)} interrupted story/stories.")

    except Exception as e:
        logger.error(f"[Startup] Failed to resume interrupted stories: {e}", exc_info=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
