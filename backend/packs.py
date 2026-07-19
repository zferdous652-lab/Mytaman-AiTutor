"""Tutor packs — courses/subjects users can enroll in."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from db import db
from auth import require_role, get_current_user


router = APIRouter(prefix="/packs", tags=["packs"])

Tier = Literal["basic", "premium", "xpoints"]


class PackIn(BaseModel):
    title: str
    description: str
    subject: str
    grade: str
    language: Literal["en", "bm", "both"] = "both"
    tier: Tier = "basic"


class PackOut(PackIn):
    id: str
    created_at: str


@router.get("/list", response_model=List[PackOut])
async def list_packs(_: dict = Depends(get_current_user)):
    docs = await db.packs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [PackOut(**d) for d in docs]


@router.post("/create", response_model=PackOut)
async def create_pack(payload: PackIn, _: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.packs.insert_one(doc)
    return PackOut(**doc)


class EnrollIn(BaseModel):
    pack_id: str


@router.post("/enroll")
async def enroll(payload: EnrollIn, user: dict = Depends(get_current_user)):
    exists = await db.enrollments.find_one({"user_id": user["id"], "pack_id": payload.pack_id})
    if exists:
        return {"ok": True, "already": True}
    await db.enrollments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "pack_id": payload.pack_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "progress": 0,
    })
    return {"ok": True}


@router.get("/mine", response_model=List[PackOut])
async def mine(user: dict = Depends(get_current_user)):
    enrolls = await db.enrollments.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    pack_ids = [e["pack_id"] for e in enrolls]
    if not pack_ids:
        return []
    docs = await db.packs.find({"id": {"$in": pack_ids}}, {"_id": 0}).to_list(500)
    return [PackOut(**d) for d in docs]


async def seed_packs(target_db):
    existing = await target_db.packs.count_documents({})
    if existing:
        return
    seed = [
        {
            "id": str(uuid.uuid4()),
            "title": "KSSM Form 1 Sejarah",
            "description": "Bab-bab utama sejarah tingkatan 1 dengan ringkasan, kuiz dan kad imbas.",
            "subject": "Sejarah",
            "grade": "Form 1",
            "language": "both",
            "tier": "basic",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "KSSM Form 2 Mathematics",
            "description": "Algebra, geometry, and statistics with AI-generated practice quizzes.",
            "subject": "Mathematics",
            "grade": "Form 2",
            "language": "en",
            "tier": "basic",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "KSSM Form 3 Science",
            "description": "Biology, chemistry, physics fundamentals with flashcards and mind maps.",
            "subject": "Science",
            "grade": "Form 3",
            "language": "both",
            "tier": "premium",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    await target_db.packs.insert_many(seed)
