"""Content generation & storage endpoints."""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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
    pack_id: str
    title: str
    content_type: ContentType
    language: str
    body: str
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
    return ContentOut(**{k: doc[k] for k in ContentOut.model_fields.keys()})


class ManualIn(BaseModel):
    pack_id: str
    title: str
    content_type: ContentType
    body: str
    language: Literal["en", "bm"] = "en"


@router.post("/manual", response_model=ContentOut)
async def manual(payload: ManualIn, user: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "title": payload.title,
        "content_type": payload.content_type,
        "language": payload.language,
        "body": payload.body,
        "provider": None,
        "model": None,
        "published": False,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contents.insert_one(doc)
    return ContentOut(**{k: doc[k] for k in ContentOut.model_fields.keys()})


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
