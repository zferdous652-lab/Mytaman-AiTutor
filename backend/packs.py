"""Tutor packs — courses/subjects users can enroll in."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
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
    published: bool = False
    published_at: Optional[str] = None


@router.get("/list", response_model=List[PackOut])
async def list_packs(_: dict = Depends(get_current_user)):
    docs = await db.packs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [PackOut(**d) for d in docs]


@router.post("/create", response_model=PackOut)
async def create_pack(payload: PackIn, _: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "published": False,
        "published_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.packs.insert_one(doc)
    return PackOut(**doc)


@router.delete("/{pack_id}")
async def delete_pack(pack_id: str, _: dict = Depends(require_role("admin"))):
    pack = await db.packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Tutor Pack not found")

    courses = await db.courses.find({"pack_id": pack_id}, {"_id": 0, "id": 1}).to_list(1000)
    course_ids = [c["id"] for c in courses]

    await db.packs.delete_one({"id": pack_id})
    await db.courses.delete_many({"pack_id": pack_id})
    if course_ids:
        await db.chapters.delete_many({"course_id": {"$in": course_ids}})
    await db.contents.delete_many({"pack_id": pack_id})
    await db.pack_drafts.delete_many({"pack_id": pack_id})
    await db.enrollments.delete_many({"pack_id": pack_id})
    return {"ok": True}


@router.post("/{pack_id}/publish")
async def publish_pack(pack_id: str, user: dict = Depends(require_role("admin"))):
    """Publish a Tutor Pack's confirmed manual content to students/parents.

    Takes every confirmed draft bundle for this pack and, per (chapter, content type,
    language) slot, keeps only the item from the highest draft_index -- i.e. the latest
    confirmed version of each piece of content -- then upserts those into the contents
    collection with published=True, which is what the student/parent-facing content
    listing already filters on.
    """
    pack = await db.packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Tutor Pack not found")

    confirmed = await db.pack_drafts.find(
        {"pack_id": pack_id, "status": "confirmed"}, {"_id": 0}
    ).sort("draft_index", 1).to_list(500)
    if not confirmed:
        raise HTTPException(
            status_code=400,
            detail="No confirmed drafts to publish. Confirm a draft in Manual Content first.",
        )

    resolved = {}
    for draft in confirmed:
        for item in draft["items"]:
            key = (item["chapter_id"], item["content_type"], item["language"])
            resolved[key] = item  # later (higher draft_index) overwrites earlier

    now = datetime.now(timezone.utc).isoformat()
    published_count = 0
    for (chapter_id, content_type, language), item in resolved.items():
        existing = await db.contents.find_one({
            "pack_id": pack_id,
            "chapter_id": chapter_id,
            "content_type": content_type,
            "language": language,
        })
        if existing:
            await db.contents.update_one(
                {"id": existing["id"]},
                {"$set": {"payload": item["payload"], "title": item["chapter_title"], "published": True}},
            )
        else:
            await db.contents.insert_one({
                "id": str(uuid.uuid4()),
                "pack_id": pack_id,
                "course_id": item["course_id"],
                "chapter_id": chapter_id,
                "title": item["chapter_title"],
                "content_type": content_type,
                "language": language,
                "payload": item["payload"],
                "status": "confirmed",
                "draft_index": None,
                "provider": None,
                "model": None,
                "published": True,
                "created_by": user["id"],
                "created_at": now,
            })
        published_count += 1

    await db.packs.update_one({"id": pack_id}, {"$set": {"published": True, "published_at": now}})
    return {"ok": True, "published_count": published_count}


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
