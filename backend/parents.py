"""Parent portal endpoints — child accounts, per-child progress, parent-initiated enrollment.

Linking model: a single `parent_id` field on the student's user doc. A student account
only ever comes into existence through a parent, by one of two routes:

  1. the parent creates it directly here (`POST /parents/children`), or
  2. the student fills in the signup form themselves and the parent approves the
     resulting pending request (`POST /parents/child-requests/{token}/approve`).

Either way `parent_id` is set at creation, so an unparented student is not a state the
app can reach. Removing a child therefore deactivates the account rather than clearing
`parent_id`, which would orphan it permanently.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db, decrypt
from auth import require_role, _hash
from registrations import (
    assert_username_available,
    load_pending_by_token,
    normalize_username,
    validate_birth_year,
)

router = APIRouter(prefix="/parents", tags=["parents"])

Relationship = Literal["mother", "father", "guardian"]
ChildLanguage = Literal["en", "bm"]
MAX_CHILDREN = 6


class ChildOut(BaseModel):
    id: str
    name: str
    username: str
    grade: Optional[str] = None
    birth_year: Optional[int] = None
    relationship: Optional[str] = None
    language: Optional[str] = None
    must_change_password: bool = False


def _child_out(doc: dict) -> ChildOut:
    return ChildOut(
        id=doc["id"],
        name=doc["name"],
        # Children seeded/created before usernames existed fall back to their email.
        username=doc.get("username") or doc.get("email") or "",
        grade=doc.get("grade"),
        birth_year=doc.get("birth_year"),
        relationship=doc.get("relationship"),
        language=doc.get("language"),
        must_change_password=bool(doc.get("must_change_password")),
    )


async def _assert_room_for_another_child(parent_id: str) -> None:
    count = await db.users.count_documents({"role": "student", "parent_id": parent_id, "active": {"$ne": False}})
    if count >= MAX_CHILDREN:
        raise HTTPException(status_code=400, detail=f"You can have at most {MAX_CHILDREN} children on one account.")


def _new_student_doc(*, name: str, username: str, password: str, parent_id: str, grade: str,
                     birth_year: int, relationship: str, language: str, must_change_password: bool) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": name,
        "role": "student",
        "parent_id": parent_id,
        "grade": grade,
        "birth_year": birth_year,
        "relationship": relationship,
        "language": language,
        "password": _hash(password),
        "must_change_password": must_change_password,
        "active": True,
        "consented_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


class CreateChildIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    username: str
    password: str = Field(min_length=8)
    grade: str = Field(min_length=1, max_length=40)
    birth_year: int
    relationship: Relationship = "guardian"
    language: ChildLanguage = "en"


@router.post("/children", response_model=ChildOut)
async def create_child(payload: CreateChildIn, parent: dict = Depends(require_role("parent"))):
    """Parent-created child. The parent picks the initial password, so the child is
    forced to replace it on first sign-in."""
    await _assert_room_for_another_child(parent["id"])
    username = normalize_username(payload.username)
    await assert_username_available(username)
    doc = _new_student_doc(
        name=payload.name.strip(),
        username=username,
        password=payload.password,
        parent_id=parent["id"],
        grade=payload.grade.strip(),
        birth_year=validate_birth_year(payload.birth_year),
        relationship=payload.relationship,
        language=payload.language,
        must_change_password=True,
    )
    await db.users.insert_one(doc)
    return _child_out(doc)


@router.get("/children", response_model=List[ChildOut])
async def list_children(parent: dict = Depends(require_role("parent"))):
    docs = await db.users.find(
        {"role": "student", "parent_id": parent["id"], "active": {"$ne": False}}, {"_id": 0, "password": 0}
    ).sort("created_at", 1).to_list(50)
    return [_child_out(d) for d in docs]


async def _require_child(parent_id: str, student_id: str) -> dict:
    child = await db.users.find_one(
        {"id": student_id, "role": "student", "parent_id": parent_id}, {"_id": 0, "password": 0}
    )
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


# ---------- Approving a student-initiated signup ----------

async def _require_own_request(parent: dict, token: str) -> dict:
    """The token comes from the parent's own inbox, but check the signed-in account's
    email matches it too -- so a forwarded link can't be used to attach someone else's
    child to an unrelated account."""
    doc = await load_pending_by_token(token)
    if (parent.get("email") or "").lower() != doc["parent_email"]:
        raise HTTPException(
            status_code=403,
            detail=f"This request was sent to {doc['parent_email']}. Sign in with that account to approve it.",
        )
    return doc


class ChildRequestDetail(BaseModel):
    student_name: str
    username: str
    parent_email: str
    birth_year: int
    grade: str
    expires_at: str
    # Revealed only here, to the matching signed-in parent, so they can vet it and
    # replace it with something stronger before the account is created.
    chosen_password: str


@router.get("/child-requests/{token}", response_model=ChildRequestDetail)
async def get_child_request(token: str, parent: dict = Depends(require_role("parent"))):
    doc = await _require_own_request(parent, token)
    return ChildRequestDetail(
        student_name=doc["student_name"],
        username=doc["username"],
        parent_email=doc["parent_email"],
        birth_year=doc["birth_year"],
        grade=doc["grade"],
        expires_at=doc["expires_at"],
        chosen_password=decrypt(doc["password_enc"]),
    )


class ApproveChildIn(BaseModel):
    """Everything the parent confirms or overrides at approval time. Name/grade/birth
    year arrive prefilled from what the child submitted and can be corrected."""
    name: str = Field(min_length=1, max_length=80)
    grade: str = Field(min_length=1, max_length=40)
    birth_year: int
    relationship: Relationship = "guardian"
    language: ChildLanguage = "en"
    password: Optional[str] = Field(default=None, min_length=8)
    pack_ids: List[str] = Field(default_factory=list)


@router.post("/child-requests/{token}/approve", response_model=ChildOut)
async def approve_child_request(token: str, payload: ApproveChildIn, parent: dict = Depends(require_role("parent"))):
    doc = await _require_own_request(parent, token)
    await _assert_room_for_another_child(parent["id"])
    # Re-check at approval, not just at request time: another child may have claimed
    # this ID during the hours the request sat in an inbox. Skip this request's own
    # pending record, which is obviously still holding the name.
    await assert_username_available(doc["username"], exclude_pending_id=doc["id"])

    overridden = payload.password is not None
    child = _new_student_doc(
        name=payload.name.strip(),
        username=doc["username"],
        password=payload.password if overridden else decrypt(doc["password_enc"]),
        parent_id=parent["id"],
        grade=payload.grade.strip(),
        birth_year=validate_birth_year(payload.birth_year),
        relationship=payload.relationship,
        language=payload.language,
        # The child already knows the password they chose; only force a reset if the
        # parent swapped it for one the child hasn't been told.
        must_change_password=overridden,
    )
    await db.users.insert_one(child)

    for pack_id in payload.pack_ids:
        await _enroll(child["id"], pack_id)

    # The reversible copy of the password dies with the pending record.
    await db.pending_registrations.delete_one({"id": doc["id"]})
    return _child_out(child)


@router.post("/child-requests/{token}/reject")
async def reject_child_request(token: str, parent: dict = Depends(require_role("parent"))):
    doc = await _require_own_request(parent, token)
    await db.pending_registrations.delete_one({"id": doc["id"]})
    return {"ok": True}


# ---------- Progress ----------

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


# ---------- Lifecycle & enrollment ----------

@router.delete("/children/{student_id}")
async def deactivate_child(student_id: str, parent: dict = Depends(require_role("parent"))):
    """Soft-removes a child: the account, its link to this parent, and all enrollments
    and progress survive, but it stops appearing in the portal and can no longer sign
    in. Deliberately not an unlink -- clearing parent_id would orphan the account with
    no way back, since students can only be created by a parent."""
    await _require_child(parent["id"], student_id)
    await db.users.update_one({"id": student_id}, {"$set": {"active": False}})
    return {"ok": True}


@router.post("/children/{student_id}/reactivate")
async def reactivate_child(student_id: str, parent: dict = Depends(require_role("parent"))):
    await _require_child(parent["id"], student_id)
    await _assert_room_for_another_child(parent["id"])
    await db.users.update_one({"id": student_id}, {"$set": {"active": True}})
    return {"ok": True}


class ResetChildPasswordIn(BaseModel):
    password: str = Field(min_length=8)


@router.post("/children/{student_id}/password")
async def reset_child_password(student_id: str, payload: ResetChildPasswordIn,
                               parent: dict = Depends(require_role("parent"))):
    """A forgotten child password has no email to reset through, so the guardian is the
    recovery path."""
    await _require_child(parent["id"], student_id)
    await db.users.update_one(
        {"id": student_id}, {"$set": {"password": _hash(payload.password), "must_change_password": True}}
    )
    return {"ok": True}


async def _enroll(student_id: str, pack_id: str) -> bool:
    if await db.enrollments.find_one({"user_id": student_id, "pack_id": pack_id}):
        return False
    await db.enrollments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": student_id,
        "pack_id": pack_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "progress": 0,
    })
    return True


class EnrollChildIn(BaseModel):
    pack_id: str


@router.post("/children/{student_id}/enroll")
async def enroll_child(student_id: str, payload: EnrollChildIn, parent: dict = Depends(require_role("parent"))):
    await _require_child(parent["id"], student_id)
    created = await _enroll(student_id, payload.pack_id)
    return {"ok": True, "already": not created}
