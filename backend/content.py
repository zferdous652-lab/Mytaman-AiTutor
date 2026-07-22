"""Content generation & storage endpoints."""
import json
import re
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


class NotesPayload(BaseModel):
    notes: List[str] = Field(min_length=1, max_length=200)

    def validate_shape(self):
        if any(not n.strip() for n in self.notes):
            raise ValueError("Notes cannot be empty")


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
        if content_type == "notes":
            parsed = NotesPayload(**payload)
            parsed.validate_shape()
            return parsed.model_dump()
        # summary
        return TextPayload(**payload).model_dump()
    except (ValidationError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload for {content_type}: {e}")


def _extract_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]
    return json.loads(text)


class AiDraftItemIn(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: Literal["en", "bm"] = "en"
    source_text: str = Field(min_length=10)


class AiDraftItemOut(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: str
    payload: dict
    provider: str
    model: str


@router.post("/ai-draft", response_model=AiDraftItemOut)
async def ai_generate_draft_item(payload: AiDraftItemIn, _: dict = Depends(require_role("admin"))):
    """Generates a single chapter's content via the Model Router, validated against the same
    typed payload shapes as Manual Content, so the result can be edited and saved through the
    same /content/drafts pipeline (draft -> confirm -> publish)."""
    if payload.content_type == "mindmap":
        raise HTTPException(status_code=400, detail="Mind maps need an uploaded image and can't be AI-generated yet.")

    chapter = await db.chapters.find_one({"id": payload.chapter_id}, {"_id": 0})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    lang_hint = "Respond in Bahasa Melayu." if payload.language == "bm" else "Respond in English."
    user_text = f"{lang_hint}\n\nChapter: {chapter['title']}\n\nSource material:\n{payload.source_text}"
    result = await call_router(PROMPT_KEY[payload.content_type], user_text)

    if payload.content_type == "summary":
        raw_payload = {"body": result["text"].strip()}
    else:
        try:
            raw_payload = _extract_json(result["text"])
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(
                status_code=502,
                detail="AI did not return valid JSON. Try again, or adjust the prompt in Model Router.",
            )

    validated = _validate_payload(payload.content_type, raw_payload)
    return AiDraftItemOut(
        chapter_id=payload.chapter_id,
        content_type=payload.content_type,
        language=payload.language,
        payload=validated,
        provider=result["provider"],
        model=result["model"],
    )


class DraftItemIn(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: Literal["en", "bm"] = "en"
    payload: dict


DraftSource = Literal["manual", "ai"]


class SaveDraftIn(BaseModel):
    pack_id: str
    items: List[DraftItemIn] = Field(min_length=1)
    source: DraftSource = "manual"


class DraftItemOut(BaseModel):
    chapter_id: str
    course_id: str
    course_title: str
    chapter_title: str
    content_type: ContentType
    language: str
    payload: dict


class PackDraftOut(BaseModel):
    id: str
    pack_id: str
    draft_index: int
    status: str
    name: Optional[str] = None
    source: DraftSource = "manual"
    items: List[DraftItemOut]
    created_at: str


def _draft_out(doc: dict) -> PackDraftOut:
    """Builds a PackDraftOut from a raw pack_drafts document, defaulting `source` to
    "manual" for drafts saved before the Manual Content / Generate with AI split existed."""
    d = {k: doc.get(k) for k in PackDraftOut.model_fields.keys()}
    d["source"] = doc.get("source") or "manual"
    return PackDraftOut(**d)


@router.post("/drafts", response_model=PackDraftOut)
async def save_draft(payload: SaveDraftIn, user: dict = Depends(require_role("admin"))):
    pack = await db.packs.find_one({"id": payload.pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Tutor Pack not found")

    items_out = []
    for item in payload.items:
        chapter = await db.chapters.find_one({"id": item.chapter_id}, {"_id": 0})
        if not chapter:
            raise HTTPException(status_code=404, detail=f"Chapter {item.chapter_id} not found")
        course = await db.courses.find_one({"id": chapter["course_id"]}, {"_id": 0})
        if not course or course["pack_id"] != payload.pack_id:
            raise HTTPException(status_code=400, detail=f"Chapter {item.chapter_id} does not belong to this Tutor Pack")
        validated_payload = _validate_payload(item.content_type, item.payload)
        items_out.append({
            "chapter_id": item.chapter_id,
            "course_id": course["id"],
            "course_title": course["title"],
            "chapter_title": chapter["title"],
            "content_type": item.content_type,
            "language": item.language,
            "payload": validated_payload,
        })

    last = await db.pack_drafts.find_one(
        {"pack_id": payload.pack_id}, {"_id": 0, "draft_index": 1}, sort=[("draft_index", -1)]
    )
    next_index = (last["draft_index"] if last else 0) + 1
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "draft_index": next_index,
        "status": "draft",
        "source": payload.source,
        "items": items_out,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pack_drafts.insert_one(doc)
    return _draft_out(doc)


@router.get("/drafts", response_model=List[PackDraftOut])
async def list_pack_drafts(pack_id: str, source: Optional[DraftSource] = None, _: dict = Depends(require_role("admin"))):
    q: dict = {"pack_id": pack_id}
    if source == "manual":
        # Drafts saved before the source field existed are all Manual Content drafts.
        q["$or"] = [{"source": "manual"}, {"source": {"$exists": False}}]
    elif source == "ai":
        q["source"] = "ai"
    docs = await db.pack_drafts.find(q, {"_id": 0}).sort("draft_index", 1).to_list(200)
    return [_draft_out(d) for d in docs]


@router.post("/drafts/{draft_id}/confirm", response_model=PackDraftOut)
async def confirm_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"status": "confirmed"}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


@router.post("/drafts/{draft_id}/deny", response_model=PackDraftOut)
async def deny_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    """Reverts a confirmed draft back to draft status -- the inverse of Confirm."""
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"status": "draft"}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


@router.post("/drafts/{draft_id}/duplicate", response_model=PackDraftOut)
async def duplicate_pack_draft(draft_id: str, user: dict = Depends(require_role("admin"))):
    source = await db.pack_drafts.find_one({"id": draft_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Draft not found")
    last = await db.pack_drafts.find_one(
        {"pack_id": source["pack_id"]}, {"_id": 0, "draft_index": 1}, sort=[("draft_index", -1)]
    )
    next_index = (last["draft_index"] if last else 0) + 1
    source_label = source.get("name") or f"Draft {source['draft_index']}"
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": source["pack_id"],
        "draft_index": next_index,
        "status": "draft",
        "name": f"{source_label} (copy)",
        "source": source.get("source") or "manual",
        "items": source["items"],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pack_drafts.insert_one(doc)
    return _draft_out(doc)


class RenameDraftIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)


@router.patch("/drafts/{draft_id}", response_model=PackDraftOut)
async def rename_pack_draft(draft_id: str, payload: RenameDraftIn, _: dict = Depends(require_role("admin"))):
    name = payload.name.strip() if payload.name and payload.name.strip() else None
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"name": name}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


@router.delete("/drafts/{draft_id}")
async def delete_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.pack_drafts.delete_one({"id": draft_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


class BulkDeleteDraftsIn(BaseModel):
    ids: List[str] = Field(min_length=1)


@router.post("/drafts/bulk-delete")
async def bulk_delete_pack_drafts(payload: BulkDeleteDraftsIn, _: dict = Depends(require_role("admin"))):
    res = await db.pack_drafts.delete_many({"id": {"$in": payload.ids}})
    return {"ok": True, "deleted_count": res.deleted_count}


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


@router.post("/{content_id}/complete")
async def mark_complete(content_id: str, user: dict = Depends(get_current_user)):
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Not found")
    await db.progress.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {"$setOnInsert": {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pack_id": content["pack_id"],
            "content_id": content_id,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/{content_id}/complete")
async def mark_incomplete(content_id: str, user: dict = Depends(get_current_user)):
    await db.progress.delete_one({"user_id": user["id"], "content_id": content_id})
    return {"ok": True}


class QuizResultIn(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=0)


@router.post("/{content_id}/quiz-result")
async def submit_quiz_result(content_id: str, payload: QuizResultIn, user: dict = Depends(get_current_user)):
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Not found")
    if content["content_type"] != "quiz":
        raise HTTPException(status_code=400, detail="Not a quiz")
    now = datetime.now(timezone.utc).isoformat()
    await db.quiz_results.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {
            "$set": {"score": payload.score, "total": payload.total, "submitted_at": now},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "pack_id": content["pack_id"],
                "content_id": content_id,
            },
            "$inc": {"attempts": 1},
        },
        upsert=True,
    )
    # A submitted quiz counts as completed, same as mark_complete.
    await db.progress.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {"$setOnInsert": {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pack_id": content["pack_id"],
            "content_id": content_id,
            "completed_at": now,
        }},
        upsert=True,
    )
    return {"ok": True}


@router.get("/progress")
async def get_progress(pack_id: str, user: dict = Depends(get_current_user)):
    docs = await db.progress.find({"user_id": user["id"], "pack_id": pack_id}, {"_id": 0, "content_id": 1}).to_list(500)
    quiz_docs = await db.quiz_results.find(
        {"user_id": user["id"], "pack_id": pack_id}, {"_id": 0, "content_id": 1, "score": 1, "total": 1, "attempts": 1}
    ).to_list(500)
    return {
        "completed_ids": [d["content_id"] for d in docs],
        "quiz_scores": {d["content_id"]: {"score": d["score"], "total": d["total"], "attempts": d.get("attempts", 1)} for d in quiz_docs},
    }


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
