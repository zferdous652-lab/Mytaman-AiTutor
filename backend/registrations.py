"""Student-initiated signup, gated behind a parent's approval.

A student can fill in a signup form, but doing so does NOT create an account -- it
creates a `pending_registrations` record and emails the nominated parent a one-time
link. No `users` document exists until that parent approves it in the parent portal
(see parents.py), so an unapproved request can never log in, and an abandoned one
expires and frees the student ID it was holding.

The password the student picks is held Fernet-encrypted on the pending record rather
than bcrypt-hashed, because the approving parent is shown it and may replace it with
something stronger. It is re-hashed one-way onto the real user document at approval
and the pending record is destroyed, so the reversible copy only ever exists inside
this short-lived record.
"""
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from db import db, encrypt
from email_service import send_child_approval_email

router = APIRouter(prefix="/auth", tags=["registrations"])

REQUEST_TTL_HOURS = 72
# Caps on how many approval emails one address can be made to receive. Without these,
# the endpoint is an open relay for spamming a stranger's inbox.
MAX_PENDING_PER_PARENT = 5
MAX_REQUESTS_PER_HOUR = 3

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


def is_expired(doc: dict) -> bool:
    try:
        return datetime.fromisoformat(doc["expires_at"]) < _now()
    except (KeyError, ValueError):
        return True


async def assert_username_available(username: str, exclude_pending_id: Optional[str] = None) -> None:
    """A student ID is taken by a real account *or* by an approval still in flight --
    otherwise two children could claim the same ID while one waits on a parent.

    `exclude_pending_id` skips one request, so re-checking at approval time doesn't
    trip over the very record being approved.
    """
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="That student ID is already taken")
    q = {"username": username, "status": "pending"}
    if exclude_pending_id:
        q["id"] = {"$ne": exclude_pending_id}
    clash = await db.pending_registrations.find_one(q)
    if clash and not is_expired(clash):
        raise HTTPException(status_code=400, detail="That student ID is already awaiting approval")


def validate_birth_year(year: int) -> int:
    current = _now().year
    if not (current - MAX_BIRTH_YEAR_AGE <= year <= current - MIN_BIRTH_YEAR_AGE):
        raise HTTPException(status_code=422, detail="Please enter a valid year of birth")
    return year


class StudentRegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    username: str
    password: str = Field(min_length=8)
    parent_email: EmailStr
    birth_year: int
    grade: str = Field(min_length=1, max_length=40)


class StudentRegisterOut(BaseModel):
    ok: bool
    parent_email: str
    expires_at: str
    email_sent: bool


@router.post("/register-student", response_model=StudentRegisterOut)
async def register_student(payload: StudentRegisterIn):
    username = normalize_username(payload.username)
    await assert_username_available(username)
    birth_year = validate_birth_year(payload.birth_year)
    parent_email = payload.parent_email.lower()

    existing = await db.users.find_one({"email": parent_email}, {"_id": 0, "role": 1})
    if existing and existing.get("role") != "parent":
        raise HTTPException(
            status_code=400,
            detail="That email belongs to a non-parent account. Ask your parent for the address they use as a parent.",
        )

    live = await db.pending_registrations.find(
        {"parent_email": parent_email, "status": "pending"}, {"_id": 0, "created_at": 1, "expires_at": 1}
    ).to_list(50)
    live = [d for d in live if not is_expired(d)]
    if len(live) >= MAX_PENDING_PER_PARENT:
        raise HTTPException(status_code=429, detail="Too many requests are already awaiting this parent's approval.")
    hour_ago = (_now() - timedelta(hours=1)).isoformat()
    if len([d for d in live if d.get("created_at", "") > hour_ago]) >= MAX_REQUESTS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many requests sent recently. Please try again later.")

    raw_token = secrets.token_urlsafe(32)
    expires_at = (_now() + timedelta(hours=REQUEST_TTL_HOURS)).isoformat()
    await db.pending_registrations.insert_one({
        "id": str(uuid.uuid4()),
        "student_name": payload.name.strip(),
        "username": username,
        "password_enc": encrypt(payload.password),
        "parent_email": parent_email,
        "birth_year": birth_year,
        "grade": payload.grade.strip(),
        "token_hash": hash_token(raw_token),
        "status": "pending",
        "created_at": _now().isoformat(),
        "expires_at": expires_at,
    })

    sent = send_child_approval_email(parent_email, payload.name.strip(), username, raw_token)
    return StudentRegisterOut(ok=True, parent_email=parent_email, expires_at=expires_at, email_sent=sent)


class ChildRequestPreview(BaseModel):
    """Deliberately excludes the chosen password -- that is only ever returned to an
    authenticated parent whose email matches (see parents.py)."""
    student_name: str
    username: str
    parent_email: str
    birth_year: int
    grade: str
    status: str
    expires_at: str
    parent_has_account: bool


async def load_pending_by_token(token: str) -> dict:
    doc = await db.pending_registrations.find_one({"token_hash": hash_token(token)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="This approval link is not valid")
    if doc["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"This request has already been {doc['status']}")
    if is_expired(doc):
        raise HTTPException(status_code=410, detail="This approval link has expired. Ask your child to sign up again.")
    return doc


@router.get("/child-request/{token}", response_model=ChildRequestPreview)
async def preview_child_request(token: str):
    """Public, token-scoped: lets the approval landing page show who is asking and
    prefill the parent's email before they have signed in. The token itself is the
    secret -- it only exists in the parent's inbox."""
    doc = await load_pending_by_token(token)
    parent = await db.users.find_one({"email": doc["parent_email"]}, {"_id": 0, "id": 1})
    return ChildRequestPreview(
        student_name=doc["student_name"],
        username=doc["username"],
        parent_email=doc["parent_email"],
        birth_year=doc["birth_year"],
        grade=doc["grade"],
        status=doc["status"],
        expires_at=doc["expires_at"],
        parent_has_account=bool(parent),
    )
