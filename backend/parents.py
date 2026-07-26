"""Parent portal endpoints — child linking, per-child progress, parent-initiated enrollment.

Linking model: a single `parent_id` field on the student's user doc (one parent per
child for now — see PARENT_PORTAL.md). A parent links a child by creating the child's
account directly from the parent portal; there's no separate child self-signup path
for a linked child.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth import require_role, _hash

router = APIRouter(prefix="/parents", tags=["parents"])


class ChildOut(BaseModel):
    id: str
    email: str
    name: str


class CreateChildIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


@router.post("/children", response_model=ChildOut)
async def create_child(payload: CreateChildIn, parent: dict = Depends(require_role("parent"))):
    exists = await db.users.find_one({"email": payload.email})
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email,
        "name": payload.name,
        "role": "student",
        "parent_id": parent["id"],
        "password": _hash(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return ChildOut(id=doc["id"], email=doc["email"], name=doc["name"])


@router.get("/children", response_model=List[ChildOut])
async def list_children(parent: dict = Depends(require_role("parent"))):
    docs = await db.users.find(
        {"role": "student", "parent_id": parent["id"]}, {"_id": 0, "id": 1, "email": 1, "name": 1}
    ).to_list(50)
    return [ChildOut(**d) for d in docs]


async def _require_child(parent_id: str, student_id: str) -> dict:
    child = await db.users.find_one(
        {"id": student_id, "role": "student", "parent_id": parent_id}, {"_id": 0, "password": 0}
    )
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


class ChildPackOut(BaseModel):
    id: str
    title: str
    grade: str
    tier: str
    language: str
    completed: int
    total: int
    percent: int
    quiz_average: Optional[int] = None
    last_active: Optional[str] = None


@router.get("/children/{student_id}/packs", response_model=List[ChildPackOut])
async def child_packs(student_id: str, parent: dict = Depends(require_role("parent"))):
    await _require_child(parent["id"], student_id)

    enrolls = await db.enrollments.find({"user_id": student_id}, {"_id": 0, "pack_id": 1}).to_list(500)
    pack_ids = [e["pack_id"] for e in enrolls]
    if not pack_ids:
        return []
    packs = await db.packs.find({"id": {"$in": pack_ids}}, {"_id": 0}).to_list(500)

    out = []
    for pack in packs:
        contents = await db.contents.find(
            {"pack_id": pack["id"], "published": True}, {"_id": 0, "id": 1}
        ).to_list(500)
        content_ids = [c["id"] for c in contents]
        total = len(content_ids)

        progress_docs = (
            await db.progress.find(
                {"user_id": student_id, "content_id": {"$in": content_ids}},
                {"_id": 0, "completed_at": 1},
            ).to_list(500)
            if content_ids
            else []
        )
        completed = len(progress_docs)
        percent = round(completed / total * 100) if total else 0
        last_active = max((p["completed_at"] for p in progress_docs), default=None)

        quiz_docs = await db.quiz_results.find(
            {"user_id": student_id, "pack_id": pack["id"]}, {"_id": 0, "score": 1, "total": 1}
        ).to_list(500)
        ratios = [q["score"] / q["total"] for q in quiz_docs if q.get("total")]
        quiz_average = round(sum(ratios) / len(ratios) * 100) if ratios else None

        out.append(ChildPackOut(
            id=pack["id"],
            title=pack["title"],
            grade=pack["grade"],
            tier=pack["tier"],
            language=pack["language"],
            completed=completed,
            total=total,
            percent=percent,
            quiz_average=quiz_average,
            last_active=last_active,
        ))
    return out


@router.delete("/children/{student_id}")
async def remove_child(student_id: str, parent: dict = Depends(require_role("parent"))):
    """Unlinks a child from this parent -- unsets parent_id rather than deleting the
    student account, so the child's enrollments/progress aren't destroyed by an
    accidental click. The account becomes an ordinary unlinked student until re-linked
    (there's no re-link flow yet -- see PARENT_PORTAL.md)."""
    await _require_child(parent["id"], student_id)
    await db.users.update_one({"id": student_id}, {"$unset": {"parent_id": ""}})
    return {"ok": True}


class EnrollChildIn(BaseModel):
    pack_id: str


@router.post("/children/{student_id}/enroll")
async def enroll_child(student_id: str, payload: EnrollChildIn, parent: dict = Depends(require_role("parent"))):
    await _require_child(parent["id"], student_id)
    exists = await db.enrollments.find_one({"user_id": student_id, "pack_id": payload.pack_id})
    if exists:
        return {"ok": True, "already": True}
    await db.enrollments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": student_id,
        "pack_id": payload.pack_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "progress": 0,
    })
    return {"ok": True}
