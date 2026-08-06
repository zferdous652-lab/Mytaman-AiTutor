"""Account Manager -- admin-side password and access control across all three portals.

One page for every account in the system (admin / parent / student) rather than a
password reset buried in each portal's own screens, because the person doing the reset
is always an administrator and the question they are answering ("who is locked out?")
spans roles.

What this module deliberately does NOT do:

  * It never reveals an existing password. Passwords are stored as bcrypt hashes, so
    they are not recoverable -- an admin can only replace one. Any UI that appeared to
    "show" a password would be lying.
  * A generated password is returned exactly once, in the response to the request that
    created it. It is never stored in plaintext and never appears in the audit trail,
    so re-reading history cannot leak it.
  * The audit trail records who did what to whom and when. That is what makes an admin
    password reset accountable rather than invisible.

Two lockout guards exist because both failures are unrecoverable from inside the app:
an admin cannot deactivate their own account, and the last active admin cannot be
deactivated by anyone.
"""
import logging
import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from db import db
from auth import require_role, _hash

log = logging.getLogger("accounts")

router = APIRouter(prefix="/accounts", tags=["accounts"])

MIN_PASSWORD_LENGTH = 8
GENERATED_PASSWORD_LENGTH = 16

# Ambiguous glyphs are left out: a generated password is usually read off one screen and
# typed into another, where I/l/1 and O/0 are a support ticket waiting to happen.
_ALPHABET = (
    "".join(c for c in string.ascii_letters if c not in "lIO")
    + "".join(c for c in string.digits if c not in "01")
    + "!@#$%^&*?-_"
)


def generate_password(length: int = GENERATED_PASSWORD_LENGTH) -> str:
    """A random password from a CSPRNG. Length does the work here -- 16 characters from
    this alphabet is far past anything a human would choose, so no composition rules are
    imposed on top."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def validate_password(pw: str) -> None:
    if len(pw) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )


async def ensure_indexes(target_db):
    await target_db.account_audit.create_index([("created_at", -1)])
    await target_db.account_audit.create_index([("target_user_id", 1), ("created_at", -1)])


async def _audit(actor: dict, action: str, target: dict, detail: Optional[str] = None) -> None:
    """Records an administrative action. Never receives a password -- callers pass a
    description of what happened, not the secret itself."""
    await db.account_audit.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": actor["id"],
        "actor_name": actor.get("name"),
        "actor_login": actor.get("email") or actor.get("username"),
        "action": action,
        "target_user_id": target["id"],
        "target_name": target.get("name"),
        "target_login": target.get("email") or target.get("username"),
        "target_role": target.get("role"),
        "detail": detail,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _get_target(user_id: str) -> dict:
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    return doc


# ---------- API models ----------
class AccountOut(BaseModel):
    id: str
    name: str
    role: str
    # Admins and parents sign in with an email, students with a username. The UI shows
    # whichever one this account actually logs in with, which is what an admin needs to
    # read out to the person who is locked out.
    login: str
    login_type: Literal["email", "username"]
    active: bool
    must_change_password: bool
    created_at: Optional[str] = None
    password_changed_at: Optional[str] = None
    password_changed_by: Optional[str] = None


class SetPasswordIn(BaseModel):
    new_password: Optional[str] = Field(default=None, min_length=MIN_PASSWORD_LENGTH)
    generate: bool = False
    # Default on: a password the admin knows is a temporary credential, not the
    # account holder's password. Forcing a change at next login makes that true in fact.
    require_change: bool = True

    @model_validator(mode="after")
    def _one_source(self):
        if self.generate == bool(self.new_password):
            raise ValueError("Provide either new_password or generate=true, not both")
        return self


class SetPasswordOut(BaseModel):
    ok: bool
    # Present only for a generated password, and only in this one response.
    generated_password: Optional[str] = None
    require_change: bool


class SetActiveIn(BaseModel):
    active: bool


class AuditEntryOut(BaseModel):
    id: str
    actor_name: Optional[str] = None
    actor_login: Optional[str] = None
    action: str
    target_name: Optional[str] = None
    target_login: Optional[str] = None
    target_role: Optional[str] = None
    detail: Optional[str] = None
    created_at: str


# ---------- Endpoints ----------
@router.get("/list", response_model=List[AccountOut])
async def list_accounts(
    role: Optional[Literal["admin", "parent", "student"]] = None,
    q: Optional[str] = None,
    _: dict = Depends(require_role("admin")),
):
    """Every account in the system, across all three portals.

    The password hash is projected out at the query rather than dropped afterwards, so
    it cannot reach the response by way of a future edit to this function.
    """
    query: dict = {}
    if role:
        query["role"] = role
    if q:
        # Anchored on neither side: an admin searching "ali" should find "Khalid" too,
        # since they are usually working from a half-remembered name.
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"username": rx}]

    docs = await db.users.find(query, {"_id": 0, "password": 0}).sort("created_at", 1).to_list(2000)
    out = []
    for d in docs:
        login = d.get("email") or d.get("username") or ""
        out.append(AccountOut(
            id=d["id"],
            name=d.get("name") or login,
            role=d.get("role", "student"),
            login=login,
            login_type="email" if d.get("email") else "username",
            active=d.get("active", True) is not False,
            must_change_password=bool(d.get("must_change_password")),
            created_at=d.get("created_at"),
            password_changed_at=d.get("password_changed_at"),
            password_changed_by=d.get("password_changed_by"),
        ))
    return out


@router.post("/{user_id}/password", response_model=SetPasswordOut)
async def set_password(user_id: str, payload: SetPasswordIn, actor: dict = Depends(require_role("admin"))):
    """Replaces an account's password. Works for any role -- this is the reset path for
    a locked-out student, parent or fellow admin.

    An admin resetting their OWN password here still goes through the same flow, but
    without require_change: forcing yourself to change a password you just chose is
    busywork. Use /auth/change-password to rotate your own with your current password.
    """
    target = await _get_target(user_id)

    if payload.generate:
        new_password = generate_password()
    else:
        new_password = payload.new_password
        validate_password(new_password)

    self_service = target["id"] == actor["id"]
    require_change = payload.require_change and not self_service
    now = datetime.now(timezone.utc).isoformat()

    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password": _hash(new_password),
            "must_change_password": require_change,
            "password_changed_at": now,
            "password_changed_by": actor.get("email") or actor.get("username"),
        }},
    )
    await _audit(
        actor,
        "password_reset",
        target,
        detail=("generated" if payload.generate else "set by admin")
        + (", must change at next sign-in" if require_change else ""),
    )
    return SetPasswordOut(
        ok=True,
        generated_password=new_password if payload.generate else None,
        require_change=require_change,
    )


@router.post("/{user_id}/active")
async def set_active(user_id: str, payload: SetActiveIn, actor: dict = Depends(require_role("admin"))):
    """Suspends or restores an account. Deactivated accounts cannot sign in.

    Both guards below protect against a lockout that cannot be undone from inside the
    app -- recovering would mean editing the database by hand.
    """
    target = await _get_target(user_id)

    if not payload.active:
        if target["id"] == actor["id"]:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        if target.get("role") == "admin":
            remaining = await db.users.count_documents({
                "role": "admin", "active": {"$ne": False}, "id": {"$ne": user_id},
            })
            if remaining == 0:
                raise HTTPException(
                    status_code=400,
                    detail="This is the last active admin — deactivating it would lock everyone out",
                )

    await db.users.update_one({"id": user_id}, {"$set": {"active": payload.active}})
    await _audit(actor, "activated" if payload.active else "deactivated", target)
    return {"ok": True, "active": payload.active}


@router.get("/audit", response_model=List[AuditEntryOut])
async def audit_log(limit: int = 50, _: dict = Depends(require_role("admin"))):
    """Recent administrative actions. Passwords never appear here -- only the fact that
    one was changed, by whom, and when."""
    docs = await db.account_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return [AuditEntryOut(**d) for d in docs]
