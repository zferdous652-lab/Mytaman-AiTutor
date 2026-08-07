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

Removal is a real deletion, not a flag: the user document and everything keyed to it are
erased, so the person can sign up again from scratch. Blocking is the same deletion plus
an entry on `blocked_identifiers`, which registration and sign-in both consult -- that is
what makes a block permanent rather than something a new signup walks around.

Two lockout guards exist because both failures are unrecoverable from inside the app:
an admin cannot remove or deactivate their own account, and the last active admin cannot
be removed or deactivated by anyone.
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
from notifications import notify

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
    # The blocklist is read on every sign-in and every registration, so the identifier
    # is indexed and unique -- blocking the same address twice is a no-op, not a
    # duplicate row that a later unblock would half-remove.
    await target_db.blocked_identifiers.create_index([("identifier", 1)], unique=True)


# Everything a learner or guardian accumulates, keyed by the field that points back at
# them. Deleting an account walks this table, so a collection added later is one line
# here rather than a silent leftover.
USER_OWNED_COLLECTIONS = [
    ("enrollments", "user_id"),
    ("progress", "user_id"),
    ("quiz_results", "user_id"),
    ("xp_events", "user_id"),
    ("xp_chests", "user_id"),
    ("socratic_sessions", "user_id"),
]


async def purge_user(user_id: str) -> dict:
    """Erases an account and everything it owns. There is no recovery.

    Socratic turns are keyed by session rather than by user, so the sessions are read
    first and their turns deleted by id -- deleting the sessions alone would leave the
    conversation text behind, which is exactly the data a deletion request is about.
    """
    removed = {}

    session_ids = [
        s["id"] for s in await db.socratic_sessions.find(
            {"user_id": user_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]
    if session_ids:
        r = await db.socratic_turns.delete_many({"session_id": {"$in": session_ids}})
        removed["socratic_turns"] = r.deleted_count

    for collection, field in USER_OWNED_COLLECTIONS:
        r = await db[collection].delete_many({field: user_id})
        if r.deleted_count:
            removed[collection] = r.deleted_count

    # Pending parent invitations name the student directly.
    r = await db.parent_invites.delete_many({"student_id": user_id})
    if r.deleted_count:
        removed["parent_invites"] = r.deleted_count

    r = await db.users.delete_one({"id": user_id})
    removed["users"] = r.deleted_count
    return removed


async def _blocked_identifiers_for(doc: dict) -> List[str]:
    """What blocking this account should bar. Parents and admins sign in with an email;
    students with a username, so that is what gets blocked for them -- blocking "by
    email" alone would leave a student account trivially re-creatable."""
    return [v.lower() for v in (doc.get("email"), doc.get("username")) if v]


async def is_blocked(*identifiers) -> bool:
    wanted = [i.strip().lower() for i in identifiers if i and i.strip()]
    if not wanted:
        return False
    return await db.blocked_identifiers.find_one({"identifier": {"$in": wanted}}) is not None


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


class DeleteAccountOut(BaseModel):
    ok: bool
    deleted_users: int
    removed: dict
    blocked: List[str] = Field(default_factory=list)
    # Children left in place, unlinked, and prompted to reconnect with a guardian.
    orphaned_children: int = 0


class BlockIn(BaseModel):
    """Blocking an account also deletes it -- a block that left the account signed-in
    would not be a block. `reason` is for the admin who reads the list a year later."""
    reason: Optional[str] = Field(default=None, max_length=300)
    cascade_children: bool = False


class BlockIdentifierIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    reason: Optional[str] = Field(default=None, max_length=300)


class BlockedOut(BaseModel):
    id: str
    identifier: str
    reason: Optional[str] = None
    blocked_by: Optional[str] = None
    created_at: str


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


async def _guard_removable(target: dict, actor: dict) -> None:
    """The two ways an admin could lock everyone out of the product permanently."""
    if target["id"] == actor["id"]:
        raise HTTPException(status_code=400, detail="You cannot remove your own account")
    if target.get("role") == "admin":
        remaining = await db.users.count_documents({
            "role": "admin", "active": {"$ne": False}, "id": {"$ne": target["id"]},
        })
        if remaining == 0:
            raise HTTPException(
                status_code=400,
                detail="This is the last active admin — removing it would lock everyone out",
            )


async def _children_of(user: dict) -> List[dict]:
    if user.get("role") != "parent":
        return []
    return await db.users.find({"parent_id": user["id"]}, {"_id": 0}).to_list(200)


async def _remove_account(target: dict, actor: dict, cascade_children: bool, block: bool,
                          reason: Optional[str]) -> DeleteAccountOut:
    """Shared body of Remove and Block: the two differ only in whether the identifiers
    are added to the blocklist afterwards."""
    await _guard_removable(target, actor)

    children = await _children_of(target)
    orphaned = 0
    if children and not cascade_children:
        # The children keep their accounts, progress and enrolments; only the link dies.
        # Clearing parent_id is what re-arms the existing invite flow -- /auth/link-status
        # reports them unlinked again, so the student portal offers to invite a guardian
        # instead of the account silently belonging to nobody.
        res = await db.users.update_many(
            {"parent_id": target["id"]},
            {
                "$unset": {"parent_id": ""},
                "$set": {
                    "guardian_removed_at": datetime.now(timezone.utc).isoformat(),
                    "former_parent_name": target.get("name"),
                },
            },
        )
        orphaned = res.modified_count
        for child in children:
            await notify(
                child["id"],
                "guardian_removed",
                "Reconnect with a parent or guardian",
                f"{target.get('name')}'s account was removed, so you're no longer connected "
                "to a guardian. Invite a parent below so they can follow your progress again.",
            )

    removed: dict = {}
    blocked: List[str] = []
    victims = [target] + (children if cascade_children else [])

    # A removed child leaves its guardian with a portal that has silently lost a learner.
    # Told before the purge, while parent_id is still readable.
    for victim in victims:
        if victim.get("role") == "student" and victim.get("parent_id"):
            await notify(
                victim["parent_id"],
                "child_removed",
                f"{victim.get('name')}'s account was removed",
                "An administrator removed this learner's account and its progress. To follow "
                "them again, add them from your portal or have them invite you once they "
                "sign up.",
            )

    for victim in victims:
        if block:
            now = datetime.now(timezone.utc).isoformat()
            for ident in await _blocked_identifiers_for(victim):
                # Upsert: blocking an address that is already blocked keeps the original
                # record rather than erroring or duplicating it.
                await db.blocked_identifiers.update_one(
                    {"identifier": ident},
                    {"$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "identifier": ident,
                        "reason": reason,
                        "blocked_by": actor.get("email") or actor.get("username"),
                        "created_at": now,
                    }},
                    upsert=True,
                )
                blocked.append(ident)

        counts = await purge_user(victim["id"])
        for k, v in counts.items():
            removed[k] = removed.get(k, 0) + v

        # Audited AFTER the purge, and deliberately kept when the user's own records are
        # not: this entry is the record of an administrator's action, which is what makes
        # an irreversible deletion accountable. It holds a name and login, never a
        # password, and never any of the deleted content.
        await _audit(
            actor,
            "blocked" if block else "removed",
            victim,
            detail=(reason or None) if block else (
                "removed with parent" if victim is not target else None
            ),
        )

    return DeleteAccountOut(
        ok=True,
        deleted_users=len(victims),
        removed=removed,
        blocked=sorted(set(blocked)),
        orphaned_children=orphaned,
    )


@router.delete("/{user_id}", response_model=DeleteAccountOut)
async def remove_account(user_id: str, cascade_children: bool = False,
                         actor: dict = Depends(require_role("admin"))):
    """Deletes an account and everything it owns — permanently, with no restore.

    The person can sign up again afterwards with the same email; nothing bars them. Use
    Block for the case where they should not be able to.
    """
    target = await _get_target(user_id)
    return await _remove_account(target, actor, cascade_children, block=False, reason=None)


@router.post("/{user_id}/block", response_model=DeleteAccountOut)
async def block_account(user_id: str, payload: BlockIn,
                        actor: dict = Depends(require_role("admin"))):
    """Deletes the account exactly like Remove, and additionally bars its identifiers
    from ever registering again. Reversible only by an admin unblocking the address."""
    target = await _get_target(user_id)
    return await _remove_account(target, actor, payload.cascade_children, block=True,
                                 reason=payload.reason)


@router.get("/blocked/list", response_model=List[BlockedOut])
async def list_blocked(_: dict = Depends(require_role("admin"))):
    docs = await db.blocked_identifiers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [BlockedOut(**d) for d in docs]


@router.post("/blocked/add", response_model=BlockedOut)
async def block_identifier(payload: BlockIdentifierIn, actor: dict = Depends(require_role("admin"))):
    """Blocks an address that has no account here — someone who should never be able to
    sign up in the first place."""
    ident = payload.identifier.strip().lower()
    existing = await db.blocked_identifiers.find_one({"identifier": ident}, {"_id": 0})
    if existing:
        return BlockedOut(**existing)
    doc = {
        "id": str(uuid.uuid4()),
        "identifier": ident,
        "reason": payload.reason,
        "blocked_by": actor.get("email") or actor.get("username"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.blocked_identifiers.insert_one(doc)
    await db.account_audit.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": actor["id"],
        "actor_name": actor.get("name"),
        "actor_login": actor.get("email") or actor.get("username"),
        "action": "blocked_identifier",
        "target_user_id": None,
        "target_name": None,
        "target_login": ident,
        "target_role": None,
        "detail": payload.reason,
        "created_at": doc["created_at"],
    })
    return BlockedOut(**doc)


@router.delete("/blocked/{block_id}")
async def unblock_identifier(block_id: str, actor: dict = Depends(require_role("admin"))):
    """Lifts a block. The deleted account does not come back — this only allows the
    address to register again."""
    doc = await db.blocked_identifiers.find_one({"id": block_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not on the blocklist")
    await db.blocked_identifiers.delete_one({"id": block_id})
    await db.account_audit.insert_one({
        "id": str(uuid.uuid4()),
        "actor_id": actor["id"],
        "actor_name": actor.get("name"),
        "actor_login": actor.get("email") or actor.get("username"),
        "action": "unblocked_identifier",
        "target_user_id": None,
        "target_name": None,
        "target_login": doc["identifier"],
        "target_role": None,
        "detail": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@router.get("/audit", response_model=List[AuditEntryOut])
async def audit_log(limit: int = 50, _: dict = Depends(require_role("admin"))):
    """Recent administrative actions. Passwords never appear here -- only the fact that
    one was changed, by whom, and when."""
    docs = await db.account_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return [AuditEntryOut(**d) for d in docs]
