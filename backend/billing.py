"""Course unlocks — what a learner has paid for, and what stays locked.

Replaces the old pack tiers (basic / premium / xpoints). Access is now per COURSE and per
learner rather than a property of the pack itself. The course is the unit a learner
recognises and buys ("Sejarah Tingkatan 1"), not the pack that happens to contain it:

  * NOTES are free on every chapter of every course -- the sample that shows the course is
    worth buying.
  * Every other content type (mind map, summary, flashcards, quiz) and the Socratic tutor
    are locked until the learner holds an entitlement for that course.

Pricing: MYR 15 unlocks one course, every chapter and every content type in it. Additional
courses bought in the same order are MYR 5 each.

PAYMENT IS NOT INTEGRATED. There is no gateway in this stack, so `POST /billing/checkout`
records a PENDING order and returns payment_required -- it deliberately does NOT grant
access, because silently treating an unpaid order as paid would be a revenue hole that
looks like a working feature. Two things close the loop today:

  * an admin can grant a course to a learner (`POST /billing/grant`), which is what makes the
    whole flow testable end to end right now, and
  * `_fulfil_order()` is the single function a real gateway's webhook needs to call once
    payment clears.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import require_role, get_current_user

log = logging.getLogger("billing")

router = APIRouter(prefix="/billing", tags=["billing"])

CURRENCY = "MYR"
PRICE_FIRST_COURSE = 15
PRICE_ADDITIONAL_COURSE = 5

# The one content type that is readable without paying, on every chapter of every course.
FREE_CONTENT_TYPES = {"notes"}


def is_free_type(content_type: str) -> bool:
    return content_type in FREE_CONTENT_TYPES


async def ensure_indexes(target_db):
    await target_db.entitlements.create_index([("user_id", 1), ("course_id", 1)], unique=True)
    await target_db.billing_orders.create_index([("user_id", 1), ("created_at", -1)])


async def entitled_course_ids(user_id: str) -> set:
    """Every course this learner has unlocked. One query, so callers can check many courses
    without a round trip each."""
    docs = await db.entitlements.find({"user_id": user_id}, {"_id": 0, "course_id": 1}).to_list(500)
    return {d["course_id"] for d in docs if d.get("course_id")}


async def has_entitlement(user_id: str, course_id: Optional[str]) -> bool:
    if not course_id:
        return False
    return await db.entitlements.find_one({"user_id": user_id, "course_id": course_id}) is not None


async def can_access(user: dict, course_id: Optional[str], content_type: str) -> bool:
    """The single access rule, so every endpoint answers the question the same way.

    Admins see everything (they author it). A parent is checked against their own
    entitlements -- the parent portal is a window onto the same locked/unlocked state the
    child sees, not a way around it.
    """
    if user.get("role") == "admin":
        return True
    if is_free_type(content_type):
        return True
    return await has_entitlement(user["id"], course_id)


def price_for(course_count: int) -> int:
    """First course MYR 15, each additional course in the same order MYR 5."""
    if course_count <= 0:
        return 0
    return PRICE_FIRST_COURSE + (course_count - 1) * PRICE_ADDITIONAL_COURSE


async def _fulfil_order(order_id: str) -> int:
    """Grants every course on an order and marks it paid. THIS is the function a payment
    gateway webhook calls once it has verified the payment; nothing else in this module
    grants access as a side effect.

    The entitlement upsert is idempotent, so a gateway retrying its webhook (they all do)
    cannot double-grant or error.
    """
    order = await db.billing_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "paid":
        return 0

    now = datetime.now(timezone.utc).isoformat()
    granted = 0
    for course_id in order.get("course_ids", []):
        res = await db.entitlements.update_one(
            {"user_id": order["user_id"], "course_id": course_id},
            {"$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": order["user_id"],
                "course_id": course_id,
                "source": "purchase",
                "order_id": order_id,
                "created_at": now,
            }},
            upsert=True,
        )
        if res.upserted_id is not None:
            granted += 1
    await db.billing_orders.update_one({"id": order_id}, {"$set": {"status": "paid", "paid_at": now}})
    return granted


# ---------- API models ----------
class PricingOut(BaseModel):
    currency: str
    first_course: int
    additional_course: int
    free_content_types: List[str]


class EntitlementsOut(BaseModel):
    course_ids: List[str]
    free_content_types: List[str]


class CheckoutIn(BaseModel):
    # The course being unlocked, plus any extra courses bundled into the same order at the
    # add-on price.
    course_ids: List[str] = Field(min_length=1, max_length=20)


class CheckoutOut(BaseModel):
    order_id: str
    currency: str
    course_ids: List[str]
    amount: int
    status: str
    payment_required: bool
    message: str


class CatalogCourseOut(BaseModel):
    id: str
    title: str
    pack_id: Optional[str] = None
    pack_title: Optional[str] = None


class GrantIn(BaseModel):
    user_id: str
    course_ids: List[str] = Field(min_length=1, max_length=50)


# ---------- Endpoints ----------
@router.get("/pricing", response_model=PricingOut)
async def get_pricing(_: dict = Depends(get_current_user)):
    return PricingOut(
        currency=CURRENCY,
        first_course=PRICE_FIRST_COURSE,
        additional_course=PRICE_ADDITIONAL_COURSE,
        free_content_types=sorted(FREE_CONTENT_TYPES),
    )


@router.get("/entitlements", response_model=EntitlementsOut)
async def my_entitlements(user: dict = Depends(get_current_user)):
    return EntitlementsOut(
        course_ids=sorted(await entitled_course_ids(user["id"])),
        free_content_types=sorted(FREE_CONTENT_TYPES),
    )


@router.get("/catalog", response_model=List[CatalogCourseOut])
async def catalog(exclude_course_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Every course a learner could add on at checkout — across all packs, not just the one
    they happen to be reading.

    Two filters keep the list honest: a course only appears if it has published content
    (otherwise the add-on buys an empty shelf), and courses the learner already owns are
    dropped so nobody is offered something they've paid for. Archived packs are excluded for
    the same reason `GET /packs/list` excludes them — they aren't on sale any more.
    """
    with_content = [c for c in await db.contents.distinct("course_id", {"published": True}) if c]
    owned = await entitled_course_ids(user["id"])
    candidates = [c for c in with_content if c not in owned and c != exclude_course_id]
    if not candidates:
        return []

    docs = await db.courses.find(
        {"id": {"$in": candidates}}, {"_id": 0, "id": 1, "title": 1, "pack_id": 1}
    ).to_list(500)
    pack_ids = list({d.get("pack_id") for d in docs if d.get("pack_id")})
    packs = await db.packs.find(
        {"id": {"$in": pack_ids}, "archived": {"$ne": True}}, {"_id": 0, "id": 1, "title": 1}
    ).to_list(500)
    pack_titles = {p["id"]: p["title"] for p in packs}

    out = [
        CatalogCourseOut(
            id=d["id"], title=d["title"], pack_id=d.get("pack_id"),
            pack_title=pack_titles.get(d.get("pack_id")),
        )
        for d in docs
        if d.get("pack_id") in pack_titles
    ]
    return sorted(out, key=lambda c: ((c.pack_title or "").lower(), c.title.lower()))


@router.post("/checkout", response_model=CheckoutOut)
async def checkout(payload: CheckoutIn, user: dict = Depends(get_current_user)):
    """Prices an unlock and records a PENDING order. Deliberately grants nothing: without a
    payment gateway there is no way to know the learner actually paid, and an endpoint that
    unlocked content on request would simply be a free unlock button."""
    unique = list(dict.fromkeys(payload.course_ids))  # de-dupe, keep order
    found = await db.courses.count_documents({"id": {"$in": unique}})
    if found != len(unique):
        raise HTTPException(status_code=404, detail="One or more courses no longer exist")

    already = await entitled_course_ids(user["id"])
    to_buy = [p for p in unique if p not in already]
    if not to_buy:
        raise HTTPException(status_code=400, detail="You already have access to these courses")

    order_id = str(uuid.uuid4())
    amount = price_for(len(to_buy))
    await db.billing_orders.insert_one({
        "id": order_id,
        "user_id": user["id"],
        "course_ids": to_buy,
        "amount": amount,
        "currency": CURRENCY,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "paid_at": None,
    })
    return CheckoutOut(
        order_id=order_id,
        currency=CURRENCY,
        course_ids=to_buy,
        amount=amount,
        status="pending",
        payment_required=True,
        message=(
            "Order recorded. Online payment isn't connected yet — an administrator can "
            "activate this order, or connect a payment gateway to complete it automatically."
        ),
    )


@router.post("/grant")
async def grant(payload: GrantIn, _: dict = Depends(require_role("admin"))):
    """Admin-side unlock, by course. Covers manual/offline payment and makes the
    locked-content flow testable end to end before a gateway exists."""
    now = datetime.now(timezone.utc).isoformat()
    granted = 0
    for course_id in dict.fromkeys(payload.course_ids):
        res = await db.entitlements.update_one(
            {"user_id": payload.user_id, "course_id": course_id},
            {"$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": payload.user_id,
                "course_id": course_id,
                "source": "grant",
                "order_id": None,
                "created_at": now,
            }},
            upsert=True,
        )
        if res.upserted_id is not None:
            granted += 1
    return {"ok": True, "granted": granted}


@router.post("/orders/{order_id}/mark-paid")
async def mark_paid(order_id: str, _: dict = Depends(require_role("admin"))):
    """Marks an offline/manual payment as received and fulfils the order."""
    granted = await _fulfil_order(order_id)
    return {"ok": True, "granted": granted}


@router.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    q = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    return await db.billing_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
