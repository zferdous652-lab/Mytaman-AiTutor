"""XP / leveling system.

Phase 1 (core loop): lesson + quiz XP, anti-farming, level progression, and endpoints for
the student dashboard.

Phase 2: a daily goal, streak tracking off that goal, and a weekly consistency bonus.

Phase 3 (see rewards.py for the rest): this module now also applies the weekend XP
multiplier to the base lesson/quiz awards. The remaining motivation features (daily
rewards calendar, mystery chest, weekly missions, monthly challenges, lucky spin, season
pass) live in rewards.py to avoid a circular import -- they build on _award_xp and
level_from_xp from here, and content.py calls both modules after each XP-earning action.
"""
import uuid
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, Depends

from db import db
from auth import get_current_user

router = APIRouter(prefix="/xp", tags=["xp"])

LESSON_XP = 20
QUIZ_XP = 30
FIRST_LESSON_OF_DAY_BONUS = 8
PERFECT_QUIZ_BONUS = 15
QUIZ_PASS_THRESHOLD = 0.8  # quiz XP only pays out at >=80%

# Daily goal / streak: a day "counts" once the student has earned this much XP that day --
# roughly one completed lesson. Streak is derived from xp_events on read, not stored, so
# there's no separate state to keep in sync.
DAILY_GOAL_XP = 20
STREAK_LOOKBACK_DAYS = 60

# Weekly consistency bonus: hit the daily goal on this many days within the current
# Mon-Sun week and get a one-time bonus for that week.
WEEKLY_CONSISTENCY_DAYS = 5
WEEKLY_CONSISTENCY_BONUS = 50

# XP multiplier weekend: base lesson/quiz XP (not the bonuses) pays out extra on Sat/Sun UTC.
WEEKEND_XP_MULTIPLIER = 1.5


def _current_xp_multiplier() -> float:
    return WEEKEND_XP_MULTIPLIER if datetime.now(timezone.utc).weekday() >= 5 else 1.0

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


def _iso_week_key(d: date) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


async def _daily_xp_totals(user_id: str, start_date: date, end_date: date) -> dict:
    """Sum of amount per calendar day (UTC), for days in [start_date, end_date]."""
    start_iso = start_date.isoformat()
    end_iso = (end_date + timedelta(days=1)).isoformat()
    docs = await db.xp_events.aggregate([
        {"$match": {"user_id": user_id, "created_at": {"$gte": start_iso, "$lt": end_iso}}},
        {"$group": {"_id": {"$substrCP": ["$created_at", 0, 10]}, "total": {"$sum": "$amount"}}},
    ]).to_list(STREAK_LOOKBACK_DAYS + 7)
    return {d["_id"]: d["total"] for d in docs}


async def _maybe_award_weekly_consistency_bonus(user_id: str, pack_id: str) -> int:
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())  # Monday
    totals = await _daily_xp_totals(user_id, week_start, today)
    days_met = sum(
        1 for i in range((today - week_start).days + 1)
        if totals.get((week_start + timedelta(days=i)).isoformat(), 0) >= DAILY_GOAL_XP
    )
    if days_met < WEEKLY_CONSISTENCY_DAYS:
        return 0
    return await _award_xp(
        user_id, pack_id, _iso_week_key(today), "weekly_consistency", WEEKLY_CONSISTENCY_BONUS, "Weekly consistency bonus"
    )


async def compute_streak(user_id: str) -> dict:
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=STREAK_LOOKBACK_DAYS)
    totals = await _daily_xp_totals(user_id, start, today)

    def met(d: date) -> bool:
        return totals.get(d.isoformat(), 0) >= DAILY_GOAL_XP

    today_met = met(today)
    cursor = today if today_met else today - timedelta(days=1)
    streak = 0
    while met(cursor):
        streak += 1
        cursor -= timedelta(days=1)

    return {
        "current_streak": streak,
        "today_goal_met": today_met,
        "today_xp": totals.get(today.isoformat(), 0),
        "daily_goal_xp": DAILY_GOAL_XP,
    }


async def award_lesson_xp(user_id: str, pack_id: str, content_id: str, title: str) -> dict:
    base_amount = round(LESSON_XP * _current_xp_multiplier())
    awarded = await _award_xp(user_id, pack_id, content_id, "lesson", base_amount, f"Lesson completed: {title}")
    bonus = 0
    weekly_bonus = 0
    if awarded:
        today = datetime.now(timezone.utc).date().isoformat()
        bonus = await _award_xp(user_id, pack_id, today, "lesson_first_of_day", FIRST_LESSON_OF_DAY_BONUS, "First lesson of the day")
        weekly_bonus = await _maybe_award_weekly_consistency_bonus(user_id, pack_id)
    return {"xp_awarded": awarded + bonus + weekly_bonus}


async def award_quiz_xp(user_id: str, pack_id: str, content_id: str, title: str, score: int, total: int, is_first_attempt: bool) -> dict:
    # Diminishing returns, simplified for Phase 1: only the very first attempt at a given
    # quiz can earn XP at all. Retakes are for learning, not for re-earning the reward.
    if not is_first_attempt or total == 0 or (score / total) < QUIZ_PASS_THRESHOLD:
        return {"xp_awarded": 0}
    base_amount = round(QUIZ_XP * _current_xp_multiplier())
    awarded = await _award_xp(user_id, pack_id, content_id, "quiz", base_amount, f"Quiz completed: {title}")
    bonus = 0
    weekly_bonus = 0
    if awarded:
        if score == total:
            bonus = await _award_xp(user_id, pack_id, content_id, "quiz_perfect", PERFECT_QUIZ_BONUS, f"Perfect quiz bonus: {title}")
        weekly_bonus = await _maybe_award_weekly_consistency_bonus(user_id, pack_id)
    return {"xp_awarded": awarded + bonus + weekly_bonus}


@router.get("/me")
async def my_xp(user: dict = Depends(get_current_user)):
    agg = await db.xp_events.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_xp = agg[0]["total"] if agg else 0
    return {
        **level_from_xp(total_xp),
        **(await compute_streak(user["id"])),
        "weekend_multiplier_active": _current_xp_multiplier() > 1.0,
    }


@router.get("/history")
async def my_xp_history(limit: int = 50, user: dict = Depends(get_current_user)):
    docs = await db.xp_events.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
    return docs
