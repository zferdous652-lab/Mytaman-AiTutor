"""XP Phase 3 -- the remaining motivation features: daily rewards calendar, mystery
chest, weekly missions, monthly challenges, lucky spin, and the season pass. (The weekend
XP multiplier lives in xp.py, next to the awards it scales.)

Everything here is derived from xp_events (progress/claim checks) plus one small new
collection, xp_chests, for the suspense of an unopened mystery chest. All rewards are
granted idempotently via xp._award_xp, keyed so a given reward can only ever be claimed
once per its natural period (day/week/month/season/level).

This module intentionally imports from xp.py but not vice versa, so content.py -- which
calls both after a lesson/quiz completion -- is the only thing that knows about both.
"""
import calendar
import random
import uuid
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth import get_current_user
from xp import _award_xp, _daily_xp_totals, _iso_week_key, compute_streak

router = APIRouter(prefix="/rewards", tags=["rewards"])

# ---------------------------------------------------------------------------
# Daily rewards calendar: escalating reward for each consecutive day the daily
# goal is met, on a repeating 7-day cycle (day 7 is the big one).
# ---------------------------------------------------------------------------
DAILY_REWARD_CYCLE = [5, 8, 10, 12, 15, 20, 40]


async def _maybe_award_daily_reward(user_id: str, pack_id: str) -> int:
    streak_info = await compute_streak(user_id)
    if not streak_info["today_goal_met"]:
        return 0
    cycle_day = (streak_info["current_streak"] - 1) % 7
    amount = DAILY_REWARD_CYCLE[cycle_day]
    today_key = datetime.now(timezone.utc).date().isoformat()
    return await _award_xp(user_id, pack_id, today_key, "daily_reward", amount, f"Daily reward (day {cycle_day + 1})")


# ---------------------------------------------------------------------------
# Mystery chest: granted (not yet opened) once per level the student reaches;
# opening it rolls a random XP amount. Catches up any levels crossed at once.
# ---------------------------------------------------------------------------
CHEST_AMOUNTS = [(10, 35), (15, 25), (20, 20), (30, 12), (50, 6), (100, 2)]


async def _grant_level_chests(user_id: str, pack_id: str, total_xp: int) -> None:
    from xp import level_from_xp

    current_level = level_from_xp(total_xp)["level"]
    existing = await db.xp_chests.find(
        {"user_id": user_id, "source_kind": "level_up"}, {"_id": 0, "source_key": 1}
    ).to_list(500)
    granted_levels = {int(e["source_key"]) for e in existing}
    for lvl in range(2, current_level + 1):
        if lvl in granted_levels:
            continue
        await db.xp_chests.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "pack_id": pack_id,
            "source_kind": "level_up",
            "source_key": str(lvl),
            "status": "pending",
            "amount": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "opened_at": None,
        })


async def on_xp_earned(user_id: str, pack_id: str) -> dict:
    """Called after any lesson/quiz XP award to run the passive Phase 3 hooks
    (daily reward + level-up chest granting). Missions/challenges/spin/season are
    pull-based (their own GET/POST endpoints) since they don't need to fire on
    every award."""
    daily_bonus = await _maybe_award_daily_reward(user_id, pack_id)
    agg = await db.xp_events.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    total_xp = agg[0]["total"] if agg else 0
    await _grant_level_chests(user_id, pack_id, total_xp)
    return {"xp_awarded": daily_bonus}


# ---------------------------------------------------------------------------
# Weekly missions / monthly challenges: static templates, progress computed from
# xp_events counts/sums over the current period, reward claimed idempotently the
# first time a GET is made after the target is hit.
# ---------------------------------------------------------------------------
WEEKLY_MISSIONS = [
    {"id": "complete_3_lessons", "label": "Complete 3 lessons this week", "metric": "lesson_count", "target": 3, "reward": 25},
    {"id": "pass_2_quizzes", "label": "Pass 2 quizzes this week", "metric": "quiz_count", "target": 2, "reward": 30},
    {"id": "earn_150_xp", "label": "Earn 150 XP this week", "metric": "xp_sum", "target": 150, "reward": 40},
]

MONTHLY_CHALLENGES = [
    {"id": "complete_12_lessons", "label": "Complete 12 lessons this month", "metric": "lesson_count", "target": 12, "reward": 100},
    {"id": "pass_8_quizzes", "label": "Pass 8 quizzes this month", "metric": "quiz_count", "target": 8, "reward": 120},
    {"id": "earn_600_xp", "label": "Earn 600 XP this month", "metric": "xp_sum", "target": 600, "reward": 150},
]


async def _count_events(user_id: str, kind: str, start: date, end: date) -> int:
    return await db.xp_events.count_documents({
        "user_id": user_id,
        "kind": kind,
        "created_at": {"$gte": start.isoformat(), "$lt": (end + timedelta(days=1)).isoformat()},
    })


async def _sum_xp(user_id: str, start: date, end: date) -> int:
    agg = await db.xp_events.aggregate([
        {"$match": {"user_id": user_id, "created_at": {"$gte": start.isoformat(), "$lt": (end + timedelta(days=1)).isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    return agg[0]["total"] if agg else 0


async def _metric_progress(user_id: str, metric: str, start: date, end: date) -> int:
    if metric == "lesson_count":
        return await _count_events(user_id, "lesson", start, end)
    if metric == "quiz_count":
        return await _count_events(user_id, "quiz", start, end)
    if metric == "xp_sum":
        return await _sum_xp(user_id, start, end)
    return 0


async def _evaluate_period_rewards(user_id: str, templates: list, period_key: str, start: date, end: date, kind: str) -> list:
    out = []
    for tmpl in templates:
        progress = await _metric_progress(user_id, tmpl["metric"], start, end)
        completed = progress >= tmpl["target"]
        key = f"{period_key}:{tmpl['id']}"
        if completed:
            await _award_xp(user_id, None, key, kind, tmpl["reward"], f"{tmpl['label']}")
        existing = await db.xp_events.find_one({"user_id": user_id, "key": key, "kind": kind})
        out.append({
            "id": tmpl["id"],
            "label": tmpl["label"],
            "target": tmpl["target"],
            "progress": min(progress, tmpl["target"]),
            "reward": tmpl["reward"],
            "completed": completed,
            "claimed": existing is not None,
        })
    return out


@router.get("/missions/weekly")
async def weekly_missions(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return await _evaluate_period_rewards(user["id"], WEEKLY_MISSIONS, _iso_week_key(today), week_start, week_end, "weekly_mission")


@router.get("/challenges/monthly")
async def monthly_challenges(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    start = today.replace(day=1)
    end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    month_key = f"{today.year}-{today.month:02d}"
    return await _evaluate_period_rewards(user["id"], MONTHLY_CHALLENGES, month_key, start, end, "monthly_challenge")


# ---------------------------------------------------------------------------
# Chests: list + open.
# ---------------------------------------------------------------------------
@router.get("/chests")
async def list_chests(user: dict = Depends(get_current_user)):
    return await db.xp_chests.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/chests/{chest_id}/open")
async def open_chest(chest_id: str, user: dict = Depends(get_current_user)):
    chest = await db.xp_chests.find_one({"id": chest_id, "user_id": user["id"]})
    if not chest:
        raise HTTPException(404, "Chest not found")
    if chest["status"] == "opened":
        return {"already_opened": True, "amount": chest["amount"]}
    amounts, weights = zip(*CHEST_AMOUNTS)
    amount = random.choices(amounts, weights=weights, k=1)[0]
    await db.xp_chests.update_one(
        {"id": chest_id},
        {"$set": {"status": "opened", "amount": amount, "opened_at": datetime.now(timezone.utc).isoformat()}},
    )
    awarded = await _award_xp(user["id"], chest.get("pack_id"), f"chest:{chest_id}", "chest", amount, "Mystery chest")
    return {"already_opened": False, "amount": awarded}


# ---------------------------------------------------------------------------
# Lucky spin: one free spin per day, weighted random payout.
# ---------------------------------------------------------------------------
SPIN_OUTCOMES = [(5, 40), (10, 25), (15, 15), (25, 10), (50, 7), (100, 3)]


@router.get("/spin/status")
async def spin_status(user: dict = Depends(get_current_user)):
    today_key = datetime.now(timezone.utc).date().isoformat()
    existing = await db.xp_events.find_one({"user_id": user["id"], "key": today_key, "kind": "lucky_spin"})
    return {"available": existing is None, "last_amount": existing["amount"] if existing else None}


@router.post("/spin")
async def spin(user: dict = Depends(get_current_user)):
    today_key = datetime.now(timezone.utc).date().isoformat()
    existing = await db.xp_events.find_one({"user_id": user["id"], "key": today_key, "kind": "lucky_spin"})
    if existing:
        return {"already_spun": True, "amount": existing["amount"]}
    amounts, weights = zip(*SPIN_OUTCOMES)
    amount = random.choices(amounts, weights=weights, k=1)[0]
    awarded = await _award_xp(user["id"], None, today_key, "lucky_spin", amount, "Lucky spin")
    return {"already_spun": False, "amount": awarded}


# ---------------------------------------------------------------------------
# Season pass: fixed 90-day seasons from a shared epoch, tiers unlocked by XP
# earned within the season window, claimed one at a time.
# ---------------------------------------------------------------------------
SEASON_EPOCH = date(2025, 1, 1)
SEASON_LENGTH_DAYS = 90
SEASON_TIERS = [
    {"tier": 1, "xp_required": 0, "reward": 0},
    {"tier": 2, "xp_required": 150, "reward": 30},
    {"tier": 3, "xp_required": 350, "reward": 40},
    {"tier": 4, "xp_required": 600, "reward": 50},
    {"tier": 5, "xp_required": 900, "reward": 60},
    {"tier": 6, "xp_required": 1300, "reward": 75},
    {"tier": 7, "xp_required": 1800, "reward": 90},
    {"tier": 8, "xp_required": 2400, "reward": 110},
    {"tier": 9, "xp_required": 3100, "reward": 130},
    {"tier": 10, "xp_required": 4000, "reward": 200},
]


def _season_bounds(today: date):
    days_since_epoch = (today - SEASON_EPOCH).days
    season_number = days_since_epoch // SEASON_LENGTH_DAYS
    season_start = SEASON_EPOCH + timedelta(days=season_number * SEASON_LENGTH_DAYS)
    season_end = season_start + timedelta(days=SEASON_LENGTH_DAYS - 1)
    return season_number, season_start, season_end


@router.get("/season")
async def season_pass(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    season_number, season_start, season_end = _season_bounds(today)
    season_xp = await _sum_xp(user["id"], season_start, min(season_end, today))
    tiers = []
    for t in SEASON_TIERS:
        unlocked = season_xp >= t["xp_required"]
        key = f"s{season_number}:t{t['tier']}"
        existing = await db.xp_events.find_one({"user_id": user["id"], "key": key, "kind": "season_reward"})
        tiers.append({**t, "unlocked": unlocked, "claimed": existing is not None})
    current_tier = max([t["tier"] for t in tiers if t["unlocked"]], default=1)
    return {
        "season_number": season_number,
        "season_start": season_start.isoformat(),
        "season_end": season_end.isoformat(),
        "season_xp": season_xp,
        "current_tier": current_tier,
        "tiers": tiers,
    }


@router.post("/season/claim/{tier_num}")
async def season_claim(tier_num: int, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    season_number, season_start, season_end = _season_bounds(today)
    tier = next((t for t in SEASON_TIERS if t["tier"] == tier_num), None)
    if not tier:
        raise HTTPException(400, "Invalid tier")
    season_xp = await _sum_xp(user["id"], season_start, min(season_end, today))
    if season_xp < tier["xp_required"]:
        raise HTTPException(400, "Tier not unlocked yet")
    key = f"s{season_number}:t{tier_num}"
    awarded = await _award_xp(user["id"], None, key, "season_reward", tier["reward"], f"Season {season_number} tier {tier_num} reward")
    return {"ok": True, "xp_awarded": awarded}
