"""Admin-facing student roster -- enrollment + progress + quiz performance per student."""
from collections import Counter, defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from db import db
from auth import require_role

router = APIRouter(prefix="/students", tags=["students"])


class RosterPackEntry(BaseModel):
    pack_id: str
    pack_title: str
    enrolled_at: str
    completed_count: int
    total_count: int
    completion_pct: int
    quiz_avg_pct: Optional[int] = None
    last_active: Optional[str] = None


class RosterStudent(BaseModel):
    id: str
    name: str
    email: str
    joined_at: str
    packs: List[RosterPackEntry]
    overall_completion_pct: int
    last_active: Optional[str] = None


@router.get("/roster", response_model=List[RosterStudent])
async def roster(_: dict = Depends(require_role("admin"))):
    students = await db.users.find({"role": "student"}, {"_id": 0, "password": 0}).sort("created_at", 1).to_list(1000)
    if not students:
        return []
    student_ids = [s["id"] for s in students]

    enrollments = await db.enrollments.find({"user_id": {"$in": student_ids}}, {"_id": 0}).to_list(5000)
    pack_ids = list({e["pack_id"] for e in enrollments})
    packs = await db.packs.find({"id": {"$in": pack_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(1000)
    pack_titles = {p["id"]: p["title"] for p in packs}

    published_counts = Counter(
        c["pack_id"]
        for c in await db.contents.find(
            {"pack_id": {"$in": pack_ids}, "published": True}, {"_id": 0, "pack_id": 1}
        ).to_list(20000)
    )

    progress_docs = await db.progress.find({"user_id": {"$in": student_ids}}, {"_id": 0}).to_list(20000)
    quiz_docs = await db.quiz_results.find({"user_id": {"$in": student_ids}}, {"_id": 0}).to_list(20000)

    progress_by_up = defaultdict(list)
    for p in progress_docs:
        progress_by_up[(p["user_id"], p["pack_id"])].append(p.get("completed_at"))

    quiz_by_up = defaultdict(list)
    for q in quiz_docs:
        quiz_by_up[(q["user_id"], q["pack_id"])].append(q)

    enrollments_by_user = defaultdict(list)
    for e in enrollments:
        enrollments_by_user[e["user_id"]].append(e)

    result = []
    for s in students:
        entries = []
        overall_completed = 0
        overall_total = 0
        last_active_all = None
        for e in enrollments_by_user.get(s["id"], []):
            pid = e["pack_id"]
            total = published_counts.get(pid, 0)
            completions = [d for d in progress_by_up.get((s["id"], pid), []) if d]
            completed = len(completions)
            quizzes = quiz_by_up.get((s["id"], pid), [])
            quiz_avg = None
            if quizzes:
                pcts = [(q["score"] / q["total"] * 100) if q.get("total") else 0 for q in quizzes]
                quiz_avg = round(sum(pcts) / len(pcts))
            submit_dates = [q.get("submitted_at") for q in quizzes if q.get("submitted_at")]
            last_active = max(completions + submit_dates) if (completions or submit_dates) else None
            if last_active and (not last_active_all or last_active > last_active_all):
                last_active_all = last_active

            entries.append(RosterPackEntry(
                pack_id=pid,
                pack_title=pack_titles.get(pid, "Unknown pack"),
                enrolled_at=e["created_at"],
                completed_count=completed,
                total_count=total,
                completion_pct=round(completed / total * 100) if total else 0,
                quiz_avg_pct=quiz_avg,
                last_active=last_active,
            ))
            overall_completed += completed
            overall_total += total

        result.append(RosterStudent(
            id=s["id"],
            name=s["name"],
            email=s["email"],
            joined_at=s["created_at"],
            packs=entries,
            overall_completion_pct=round(overall_completed / overall_total * 100) if overall_total else 0,
            last_active=last_active_all,
        ))
    return result
