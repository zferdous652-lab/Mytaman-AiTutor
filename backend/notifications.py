"""In-app notifications -- the portal's way of telling a user something happened to them
while they were not looking.

This exists because some administrative actions change what a user sees without them
doing anything: a guardian's account is removed and their learner is suddenly
unconnected; a learner is removed and their guardian's portal quietly loses a child.
Both are confusing to discover by absence, so each one leaves a message behind.

Notifications are per user, unread until dismissed, and carry no privileged detail --
they say what changed and what to do about it, not who did it.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def ensure_indexes(target_db):
    await target_db.notifications.create_index([("user_id", 1), ("read_at", 1), ("created_at", -1)])


async def notify(user_id: str, kind: str, title: str, body: str) -> None:
    """Leaves a message for a user. Deliberately never raises: a notification failing
    must not roll back the account action that prompted it."""
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": kind,
            "title": title,
            "body": body,
            "read_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # pragma: no cover -- best effort by design
        pass


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    created_at: str
    read_at: Optional[str] = None


@router.get("/list", response_model=List[NotificationOut])
async def list_notifications(include_read: bool = False, user: dict = Depends(get_current_user)):
    q: dict = {"user_id": user["id"]}
    if not include_read:
        q["read_at"] = None
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [NotificationOut(**d) for d in docs]


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    # Scoped to the caller, so one user cannot dismiss another's notifications.
    res = await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"], "read_at": None},
        {"$set": {"read_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read_at": None},
        {"$set": {"read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "marked": res.modified_count}
