"""Independent student signup, plus the parent invitation that follows it.

A student registers on their own and gets immediate access -- no parent approval gate.
Their account is real and usable the moment they submit the form.

Registration also records the parent's email and sends that address an *invitation* to
join as a Parent and connect to the child (see email_service.send_parent_invite_email).
Accepting it links the two accounts (parents.py); ignoring it changes nothing about the
student's access. The student can resend the invitation from their own portal for as
long as they remain unlinked.

Note there is deliberately no reversible copy of the student's password anywhere: the
student owns their credential, and a parent who accepts an invitation is linking to an
existing account rather than creating one, so they never need to see or set it.
"""
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db
from auth import _hash, _sign, require_role, user_out, AuthOut
from email_service import send_parent_invite_email

router = APIRouter(prefix="/auth", tags=["registrations"])

# Long-lived: this is an invitation a parent may act on whenever they get round to it,
# not a security challenge that needs to expire quickly. The student can resend anyway.
INVITE_TTL_DAYS = 30
RESEND_COOLDOWN_MINUTES = 5
MAX_INVITES_PER_PARENT_PER_DAY = 5

USERNAME_RE = re.compile(r"^[a-z0-9._-]{4,24}$")
MIN_BIRTH_YEAR_AGE = 4
MAX_BIRTH_YEAR_AGE = 100


def normalize_username(raw: str) -> str:
    username = (raw or "").strip().lower()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(
            status_code=422,
            detail="Student ID must be 4-24 characters, using only letters, numbers, dot, dash or underscore.",
        )
    return username


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(doc: dict) -> bool:
    try:
        return datetime.fromisoformat(doc["expires_at"]) < _now()
    except (KeyError, ValueError):
        return True


async def assert_username_available(username: str) -> None:
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="That student ID is already taken")


def validate_birth_year(year: int) -> int:
    current = _now().year
    if not (current - MAX_BIRTH_YEAR_AGE <= year <= current - MIN_BIRTH_YEAR_AGE):
        raise HTTPException(status_code=422, detail="Please enter a valid year of birth")
    return year


async def _create_invite(student: dict, parent_email: str) -> tuple[str, bool]:
    """Issues a fresh invitation, superseding any outstanding one for this student so an
    older link can't also be redeemed. Returns (token, email_sent)."""
    parent_email = parent_email.lower()
    day_ago = (_now() - timedelta(days=1)).isoformat()
    recent = await db.parent_invites.count_documents(
        {"parent_email": parent_email, "created_at": {"$gte": day_ago}}
    )
    if recent >= MAX_INVITES_PER_PARENT_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="This parent has been sent several invitations today already. Please try again tomorrow.",
        )

    await db.parent_invites.delete_many({"student_id": student["id"], "status": "pending"})
    raw_token = secrets.token_urlsafe(32)
    await db.parent_invites.insert_one({
        "id": str(uuid.uuid4()),
        "student_id": student["id"],
        "student_name": student["name"],
        "parent_email": parent_email,
        "token_hash": hash_token(raw_token),
        "status": "pending",
        "created_at": _now().isoformat(),
        "expires_at": (_now() + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
    })
    sent = send_parent_invite_email(parent_email, student["name"], raw_token)
    return raw_token, sent


class StudentRegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    username: str
    password: str = Field(min_length=8)
    parent_email: EmailStr
    birth_year: int
    grade: str = Field(min_length=1, max_length=40)


class StudentRegisterOut(AuthOut):
    """Returns a token like any other registration -- the student is signed in and has
    full access immediately; the parent invitation is a side effect, not a gate."""
    parent_email: str
    invite_email_sent: bool


@router.post("/register-student", response_model=StudentRegisterOut)
async def register_student(payload: StudentRegisterIn):
    username = normalize_username(payload.username)
    await assert_username_available(username)
    birth_year = validate_birth_year(payload.birth_year)
    parent_email = payload.parent_email.lower()

    clash = await db.users.find_one({"email": parent_email}, {"_id": 0, "role": 1})
    if clash and clash.get("role") == "student":
        raise HTTPException(
            status_code=400,
            detail="That address is already in use by a student account. Please use your parent's own email.",
        )

    from accounts import is_blocked
    if await is_blocked(username, parent_email):
        # Covers both halves of this flow: a blocked student ID, and a blocked guardian
        # trying to get back in by having a child request an account for them.
        raise HTTPException(status_code=403, detail="This account cannot be registered")

    now = _now().isoformat()
    student = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": payload.name.strip(),
        "role": "student",
        # No parent_id yet -- set only if the parent accepts the invitation.
        "parent_invite_email": parent_email,
        "grade": payload.grade.strip(),
        "birth_year": birth_year,
        "password": _hash(payload.password),
        "must_change_password": False,
        "active": True,
        "created_at": now,
    }
    await db.users.insert_one(student)

    # A mail failure must not cost the student the account they just created, so invite
    # problems are reported in the response rather than raised.
    try:
        _, sent = await _create_invite(student, parent_email)
    except HTTPException:
        sent = False

    token = _sign({"sub": student["id"], "role": "student"})
    return StudentRegisterOut(
        token=token, user=user_out(student), parent_email=parent_email, invite_email_sent=sent
    )


# ---------- Student-side view of the link ----------

class LinkStatusOut(BaseModel):
    linked: bool
    parent_name: Optional[str] = None
    parent_invite_email: Optional[str] = None
    invite_sent_at: Optional[str] = None
    can_resend_at: Optional[str] = None


@router.get("/link-status", response_model=LinkStatusOut)
async def link_status(student: dict = Depends(require_role("student"))):
    """Drives the "your parent hasn't joined yet" prompt in the student portal. Once
    linked, `linked` goes true and the portal stops offering to resend."""
    if student.get("parent_id"):
        parent = await db.users.find_one({"id": student["parent_id"]}, {"_id": 0, "name": 1})
        return LinkStatusOut(linked=True, parent_name=(parent or {}).get("name"))

    invite = await db.parent_invites.find_one(
        {"student_id": student["id"], "status": "pending"}, {"_id": 0}, sort=[("created_at", -1)]
    )
    sent_at = invite["created_at"] if invite else None
    can_resend_at = None
    if sent_at:
        try:
            can_resend_at = (
                datetime.fromisoformat(sent_at) + timedelta(minutes=RESEND_COOLDOWN_MINUTES)
            ).isoformat()
        except ValueError:
            can_resend_at = None
    return LinkStatusOut(
        linked=False,
        parent_invite_email=student.get("parent_invite_email") or (invite or {}).get("parent_email"),
        invite_sent_at=sent_at,
        can_resend_at=can_resend_at,
    )


class ResendInviteIn(BaseModel):
    # Lets a student correct a mistyped address, which would otherwise make the
    # invitation permanently undeliverable with no way to recover.
    parent_email: Optional[EmailStr] = None


class ResendInviteOut(BaseModel):
    ok: bool
    parent_email: str
    email_sent: bool


@router.post("/resend-parent-invite", response_model=ResendInviteOut)
async def resend_parent_invite(payload: ResendInviteIn, student: dict = Depends(require_role("student"))):
    if student.get("parent_id"):
        raise HTTPException(status_code=409, detail="Your parent has already joined and connected with you.")

    parent_email = (payload.parent_email or student.get("parent_invite_email") or "").lower()
    if not parent_email:
        raise HTTPException(status_code=422, detail="Enter your parent's email address")

    last = await db.parent_invites.find_one(
        {"student_id": student["id"], "status": "pending"}, {"_id": 0, "created_at": 1},
        sort=[("created_at", -1)],
    )
    if last and payload.parent_email is None:
        try:
            ready = datetime.fromisoformat(last["created_at"]) + timedelta(minutes=RESEND_COOLDOWN_MINUTES)
            if _now() < ready:
                raise HTTPException(
                    status_code=429,
                    detail=f"An invitation was just sent. You can send another in a few minutes.",
                )
        except ValueError:
            pass

    if payload.parent_email:
        await db.users.update_one({"id": student["id"]}, {"$set": {"parent_invite_email": parent_email}})

    _, sent = await _create_invite(student, parent_email)
    return ResendInviteOut(ok=True, parent_email=parent_email, email_sent=sent)


# ---------- Public, token-scoped preview for the invitation landing page ----------

class ParentInvitePreview(BaseModel):
    student_name: str
    parent_email: str
    grade: Optional[str] = None
    expires_at: str
    parent_has_account: bool
    already_linked: bool
    # True when the address exists but belongs to an admin or student account. Such an
    # account can never accept the invitation, and registering with the address would
    # fail as already-taken, so the landing page has to say so rather than offer either.
    email_taken_by_other_role: bool = False


async def load_invite_by_token(token: str) -> dict:
    doc = await db.parent_invites.find_one({"token_hash": hash_token(token)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="This invitation link is not valid")
    if doc["status"] != "pending":
        raise HTTPException(status_code=409, detail="This invitation has already been used")
    if _is_expired(doc):
        raise HTTPException(
            status_code=410,
            detail="This invitation has expired. Ask your child to send a new one from their portal.",
        )
    return doc


@router.get("/parent-invite/{token}", response_model=ParentInvitePreview)
async def preview_parent_invite(token: str):
    doc = await load_invite_by_token(token)
    student = await db.users.find_one({"id": doc["student_id"]}, {"_id": 0, "grade": 1, "parent_id": 1})
    if not student:
        raise HTTPException(status_code=404, detail="This invitation link is not valid")
    # Only a parent account can accept an invitation -- matching on email alone would
    # offer a sign-in form for an admin or student account that can never complete it.
    existing = await db.users.find_one({"email": doc["parent_email"]}, {"_id": 0, "id": 1, "role": 1})
    is_parent = bool(existing) and existing.get("role") == "parent"
    return ParentInvitePreview(
        email_taken_by_other_role=bool(existing) and not is_parent,
        student_name=doc["student_name"],
        parent_email=doc["parent_email"],
        grade=student.get("grade"),
        expires_at=doc["expires_at"],
        parent_has_account=is_parent,
        already_linked=bool(student.get("parent_id")),
    )
