"""XP / leveling system -- Phase 1 (core loop): lesson + quiz XP, anti-farming, level
progression, and endpoints for the student dashboard. Daily goals, streaks, and the
motivation features (mystery chest, missions, season pass, etc.) are deliberately out of
scope here -- they need new stateful concepts (a daily-goal target, streak tracking) and
product decisions (reward contents) that this phase doesn't make.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from db import db
from auth import get_current_user

router = APIRouter(prefix="/xp", tags=["xp"])

LESSON_XP = 20
QUIZ_XP = 30
FIRST_LESSON_OF_DAY_BONUS = 8
PERFECT_QUIZ_BONUS = 15
QUIZ_PASS_THRESHOLD = 0.8  # quiz XP only pays out at >=80%

# Tiered growth: XP needed for level L (from L-1) = rate(L) * L, rate stepping up per tier.
# Matches the spec's Level 1-50 table exactly; the same top-tier rate (150) continues past
# level 50 rather than hitting a hard wall, since progression shouldn't just stop.
_MAX_LEVEL = 200


def _tier_rate(level: int) -> int:
    if level <= 10:
        return 50
    if level <= 25:
        return 100
    return 150


def _build_level_thresholds() -> list:
    thresholds = [0, 0]  # index 0 unused; index 1 = level 1 = 0 cumulative XP
    cumulative = 0
    for level in range(2, _MAX_LEVEL + 1):
        cumulative += _tier_rate(level) * level
        thresholds.append(cumulative)
    return thresholds


LEVEL_THRESHOLDS = _build_level_thresholds()


def level_from_xp(total_xp: int) -> dict:
    level = 1
    for lvl in range(1, len(LEVEL_THRESHOLDS)):
        if total_xp >= LEVEL_THRESHOLDS[lvl]:
            level = lvl
        else:
            break
    max_level = len(LEVEL_THRESHOLDS) - 1
    current_threshold = LEVEL_THRESHOLDS[level]
    next_threshold = LEVEL_THRESHOLDS[level + 1] if level < max_level else None
    return {
        "level": level,
        "total_xp": total_xp,
        "xp_into_level": total_xp - current_threshold,
        "xp_for_next_level": (next_threshold - current_threshold) if next_threshold is not None else None,
        "xp_to_next_level": (next_threshold - total_xp) if next_threshold is not None else None,
        "progress_pct": round(((total_xp - current_threshold) / (next_threshold - current_threshold)) * 100)
        if next_threshold
        else 100,
    }


async def _award_xp(user_id: str, pack_id: str, key: str, kind: str, amount: int, label: str) -> int:
    """Idempotent award: one event per (user_id, key, kind) -- key is normally a content_id,
    but for the once-a-day bonus it's the calendar date instead, reusing the same uniqueness
    check rather than a bespoke one. Returns the amount actually awarded (0 if this exact
    award already exists)."""
    existing = await db.xp_events.find_one({"user_id": user_id, "key": key, "kind": kind})
    if existing:
        return 0
    await db.xp_events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "pack_id": pack_id,
        "key": key,
        "kind": kind,
        "amount": amount,
        "label": label,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return amount


async def award_lesson_xp(user_id: str, pack_id: str, content_id: str, title: str) -> dict:
    awarded = await _award_xp(user_id, pack_id, content_id, "lesson", LESSON_XP, f"Lesson completed: {title}")
    bonus = 0
    if awarded:
        today = datetime.now(timezone.utc).date().isoformat()
        bonus = await _award_xp(user_id, pack_id, today, "lesson_first_of_day", FIRST_LESSON_OF_DAY_BONUS, "First lesson of the day")
    return {"xp_awarded": awarded + bonus}


async def award_quiz_xp(user_id: str, pack_id: str, content_id: str, title: str, score: int, total: int, is_first_attempt: bool) -> dict:
    # Diminishing returns, simplified for Phase 1: only the very first attempt at a given
    # quiz can earn XP at all. Retakes are for learning, not for re-earning the reward.
    if not is_first_attempt or total == 0 or (score / total) < QUIZ_PASS_THRESHOLD:
        return {"xp_awarded": 0}
    awarded = await _award_xp(user_id, pack_id, content_id, "quiz", QUIZ_XP, f"Quiz completed: {title}")
    bonus = 0
    if awarded and score == total:
        bonus = await _award_xp(user_id, pack_id, content_id, "quiz_perfect", PERFECT_QUIZ_BONUS, f"Perfect quiz bonus: {title}")
    return {"xp_awarded": awarded + bonus}


@router.get("/me")
async def my_xp(user: dict = Depends(get_current_user)):
    agg = await db.xp_events.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_xp = agg[0]["total"] if agg else 0
    return level_from_xp(total_xp)


@router.get("/history")
async def my_xp_history(limit: int = 50, user: dict = Depends(get_current_user)):
    docs = await db.xp_events.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return docs
