"""Content generation & storage endpoints."""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, ValidationError

from db import db
from auth import require_role, get_current_user
from model_router import call_router

router = APIRouter(prefix="/content", tags=["content"])

ContentType = Literal["summary", "quiz", "flashcards", "mindmap", "notes"]
PROMPT_KEY = {
    "summary": "chapter_summary",
    "quiz": "quiz_generation",
    "flashcards": "flashcard_generation",
    "mindmap": "mindmap_generation",
    "notes": "notes_generation",
}


class GenerateIn(BaseModel):
    pack_id: str
    title: str = Field(min_length=1)
    content_type: ContentType
    source_text: str = Field(min_length=10)
    language: Literal["en", "bm"] = "en"


class ContentOut(BaseModel):
    id: str
    pack_id: Optional[str] = None
    chapter_id: Optional[str] = None
    course_id: Optional[str] = None
    title: Optional[str] = None
    content_type: ContentType
    language: str
    body: Optional[str] = None
    payload: Optional[dict] = None
    status: Optional[str] = None
    draft_index: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    published: bool
    created_at: str


@router.post("/generate", response_model=ContentOut)
async def generate(payload: GenerateIn, user: dict = Depends(require_role("admin"))):
    lang_hint = "Respond in Bahasa Melayu." if payload.language == "bm" else "Respond in English."
    user_text = f"{lang_hint}\n\nTitle: {payload.title}\n\nSource material:\n{payload.source_text}"
    result = await call_router(PROMPT_KEY[payload.content_type], user_text)
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "title": payload.title,
        "content_type": payload.content_type,
        "language": payload.language,
        "body": result["text"],
        "provider": result["provider"],
        "model": result["model"],
        "published": False,
        "source_text": payload.source_text,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contents.insert_one(doc)
    return ContentOut(**{k: doc.get(k) for k in ContentOut.model_fields.keys()})


# ---------- Manual content (chapter-based, typed payload, draft/confirm) ----------

QuestionType = Literal["mcq", "true_false", "short_answer"]


class QuizQuestion(BaseModel):
    type: QuestionType
    question: str = Field(min_length=1)
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None

    def validate_shape(self, index: int):
        if self.type == "mcq":
            if not self.options or len(self.options) < 2:
                raise ValueError(f"Question {index}: MCQ needs at least 2 options")
            if self.correct_answer not in self.options:
                raise ValueError(f"Question {index}: correct_answer must match one of the options")
        elif self.type == "true_false":
            if self.correct_answer not in ("true", "false"):
                raise ValueError(f"Question {index}: true_false correct_answer must be 'true' or 'false'")


class QuizPayload(BaseModel):
    questions: List[QuizQuestion] = Field(min_length=1, max_length=40)


class FlashCard(BaseModel):
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)


class FlashcardsPayload(BaseModel):
    cards: List[FlashCard] = Field(min_length=1, max_length=200)


class MindmapPayload(BaseModel):
    image_url: str = Field(min_length=1)
    caption: Optional[str] = None


class TextPayload(BaseModel):
    body: str = Field(min_length=1)


def _validate_payload(content_type: str, payload: dict) -> dict:
    try:
        if content_type == "quiz":
            parsed = QuizPayload(**payload)
            for i, q in enumerate(parsed.questions, start=1):
                q.validate_shape(i)
            return parsed.model_dump()
        if content_type == "flashcards":
            return FlashcardsPayload(**payload).model_dump()
        if content_type == "mindmap":
            return MindmapPayload(**payload).model_dump()
        # summary / notes
        return TextPayload(**payload).model_dump()
    except (ValidationError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload for {content_type}: {e}")


class ManualContentIn(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: Literal["en", "bm"] = "en"
    payload: dict


@router.post("/manual", response_model=ContentOut)
async def manual(payload: ManualContentIn, user: dict = Depends(require_role("admin"))):
    chapter = await db.chapters.find_one({"id": payload.chapter_id}, {"_id": 0})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    course = await db.courses.find_one({"id": chapter["course_id"]}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    validated_payload = _validate_payload(payload.content_type, payload.payload)

    existing_count = await db.contents.count_documents({
        "chapter_id": payload.chapter_id,
        "content_type": payload.content_type,
        "language": payload.language,
    })

    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": course["pack_id"],
        "course_id": course["id"],
        "chapter_id": payload.chapter_id,
        "title": chapter["title"],
        "content_type": payload.content_type,
        "language": payload.language,
        "payload": validated_payload,
        "status": "draft",
        "draft_index": existing_count + 1,
        "provider": None,
        "model": None,
        "published": False,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contents.insert_one(doc)
    return ContentOut(**{k: doc.get(k) for k in ContentOut.model_fields.keys()})


@router.get("/drafts", response_model=List[ContentOut])
async def list_drafts(
    chapter_id: str,
    content_type: ContentType,
    language: Literal["en", "bm"] = "en",
    _: dict = Depends(require_role("admin")),
):
    docs = await db.contents.find(
        {"chapter_id": chapter_id, "content_type": content_type, "language": language},
        {"_id": 0},
    ).sort("draft_index", 1).to_list(200)
    return [ContentOut(**{k: d.get(k) for k in ContentOut.model_fields.keys()}) for d in docs]


@router.post("/{content_id}/confirm", response_model=ContentOut)
async def confirm(content_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.contents.find_one_and_update(
        {"id": content_id}, {"$set": {"status": "confirmed"}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    return ContentOut(**{k: res.get(k) for k in ContentOut.model_fields.keys()})


UPLOAD_DIR = Path(__file__).parent / "uploads" / "mindmaps"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), _: dict = Depends(require_role("admin"))):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, WEBP, or GIF.")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    ext = Path(file.filename or "").suffix or ".png"
    fname = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / fname).write_bytes(data)
    return {"url": f"/api/uploads/mindmaps/{fname}"}


# ---------- Shared list / publish / stats ----------

@router.get("/list", response_model=List[ContentOut])
async def list_content(pack_id: Optional[str] = None, only_published: bool = False, user: dict = Depends(get_current_user)):
    q: dict = {}
    if pack_id:
        q["pack_id"] = pack_id
    if only_published or user["role"] != "admin":
        q["published"] = True
    docs = await db.contents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ContentOut(**{k: d.get(k) for k in ContentOut.model_fields.keys()}) for d in docs]


@router.post("/{content_id}/publish")
async def publish(content_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.contents.update_one({"id": content_id}, {"$set": {"published": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/{content_id}")
async def delete_content(content_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.contents.delete_one({"id": content_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/stats")
async def stats(_: dict = Depends(require_role("admin"))):
    total = await db.contents.count_documents({})
    published = await db.contents.count_documents({"published": True})
    students = await db.users.count_documents({"role": "student"})
    parents = await db.users.count_documents({"role": "parent"})
    packs = await db.packs.count_documents({})
    return {
        "total_content": total,
        "published_content": published,
        "students": students,
        "parents": parents,
        "packs": packs,
    }
