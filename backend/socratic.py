"""Socratic Learning — a per-lesson AI tutor that guides instead of answering.

Shape of the feature (see the student course player's right-hand dock):
the tutor is NOT a standalone lesson in the course sidebar and NOT a floating
site-wide chatbot. It is a collapsible panel docked beside whatever lesson the
student currently has open, and every session is scoped to exactly one published
content item -- (pack, chapter, content type, language) -- so the tutor is always
talking about the thing on screen.

Availability is a Tutor Pack tier feature: only packs on a Socratic-eligible tier
expose it. That check lives here, server-side, on every endpoint -- the student
UI hiding the panel is a convenience, not the boundary.

Pedagogy is enforced by this module, not by trusting one long system prompt:
each turn asks the model for a small JSON object (reply / phase / hint_level /
concepts / mastery / done), and the server decides when hints escalate and when a
session counts as complete. That is also what gives progress, XP and the admin
oversight views something real to read instead of an opaque chat log.
"""
import json
import random
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import require_role, get_current_user
from model_router import call_router
from xp import award_socratic_xp

router = APIRouter(prefix="/socratic", tags=["socratic"])

# Which Tutor Pack tiers unlock the Socratic tutor. Premium is the tier the concept
# doc puts live Socratic chat behind; keeping it as a set means adding "xpoints"
# later (a strictly higher tier) is a one-word change rather than a hunt through
# call sites.
SOCRATIC_TIERS = {"premium"}

# How much of the conversation is replayed to the model each turn. The router builds
# a fresh LlmChat per call and can fail over to a different provider mid-conversation,
# so history has to be ours and has to be re-sent -- it is never held provider-side.
HISTORY_TURNS = 12

MAX_MESSAGE_CHARS = 1000

# Hint ladder: the student can ask to be unstuck, and each ask escalates one rung
# instead of the model deciding on its own to hand over the answer.
MAX_HINT_LEVEL = 3

# How many hints a student gets for one lesson, before "I'm stuck" stops working.
#
# The ladder alone was never a limit: it capped how *far* a hint could go (rung 3, a full
# walkthrough) but not how *many* times one could be asked for, so a student could hold the
# button down and be walked through the material indefinitely. This is the actual budget.
#
# A quiz gets one per question rather than one for the whole set -- 3 hints across 30
# questions would be no help at all, and 3 per question would be a free answer key.
HINT_BUDGET = {
    "summary": 3,
    "notes": 3,
    "flashcards": 3,
    "mindmap": 3,
    "quiz": 30,
}
DEFAULT_HINT_BUDGET = 3


def _hint_budget(content_type: str) -> int:
    return HINT_BUDGET.get(content_type, DEFAULT_HINT_BUDGET)

# A session counts as "mastered" (and pays XP, once) at or above this signal.
MASTERY_THRESHOLD = 0.7

# The tutor introduces itself by name so it reads as a person helping rather than a
# feature. One name is drawn per session and stored, so it stays stable for the whole
# conversation and only changes when the student starts a new chat.
TUTOR_NAMES = [
    "Zan", "Aina", "Rafi", "Mei", "Arif", "Nadia",
    "Hana", "Iqbal", "Sofia", "Danish", "Lina", "Adam",
]

DEFAULT_SETTINGS = {
    "enabled": True,
    "max_turns_per_session": 30,
    "daily_message_cap": 60,
    # Even at hint level 3 the tutor never states a quiz's correct answer. Left as a
    # setting because a teacher may want a revision mode later, but it defaults off
    # and the quiz context builder strips the answers regardless.
    "allow_quiz_answers": False,
}

# Crude first-pass distress/abuse screen. Not a safety system on its own -- it flags a
# turn for the admin review queue so a human sees it, which is the actual control for
# a product whose users are minors.
_FLAG_PATTERNS = re.compile(
    r"\b(kill myself|suicide|self[- ]harm|hurt myself|abuse|abused|molest|"
    r"bunuh diri|cederakan diri)\b",
    re.IGNORECASE,
)


# ---------- Settings ----------
async def _settings() -> dict:
    doc = await db.socratic_config.find_one({"id": "config"}, {"_id": 0})
    if not doc:
        doc = {"id": "config", **DEFAULT_SETTINGS}
        await db.socratic_config.insert_one(dict(doc))
    # Merge over defaults so a key added after this config was first persisted is
    # present instead of raising a KeyError at request time.
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k in DEFAULT_SETTINGS}}


class SettingsOut(BaseModel):
    enabled: bool
    max_turns_per_session: int
    daily_message_cap: int
    allow_quiz_answers: bool
    tiers: List[str]
    hint_budget: dict = Field(default_factory=lambda: dict(HINT_BUDGET))
    max_hint_level: int = MAX_HINT_LEVEL


class SettingsIn(BaseModel):
    enabled: Optional[bool] = None
    max_turns_per_session: Optional[int] = Field(default=None, ge=1, le=200)
    daily_message_cap: Optional[int] = Field(default=None, ge=1, le=1000)
    allow_quiz_answers: Optional[bool] = None


@router.get("/settings", response_model=SettingsOut)
async def get_settings(_: dict = Depends(require_role("admin"))):
    return SettingsOut(**await _settings(), tiers=sorted(SOCRATIC_TIERS))


@router.put("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsIn, _: dict = Depends(require_role("admin"))):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.socratic_config.update_one({"id": "config"}, {"$set": updates}, upsert=True)
    return SettingsOut(**await _settings(), tiers=sorted(SOCRATIC_TIERS))


# ---------- Eligibility ----------
async def _load_content_for_student(content_id: str, user: dict) -> tuple:
    """Resolves a published content item plus its pack, and enforces every access rule
    the tutor depends on: the item exists and is published, the student is enrolled in
    its pack, and that pack is on a Socratic-eligible tier. Returns (content, pack).

    This is the security boundary. The student UI only renders the panel for eligible
    packs, but that is cosmetic -- a caller can post any content_id they like."""
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Lesson not found")
    pack = await db.packs.find_one({"id": content["pack_id"]}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Tutor Pack not found")
    if pack.get("tier") not in SOCRATIC_TIERS:
        raise HTTPException(
            status_code=403,
            detail="Socratic Learning is only available on Premium Tutor Packs.",
        )
    if user["role"] == "student":
        enrolled = await db.enrollments.find_one({"user_id": user["id"], "pack_id": pack["id"]})
        if not enrolled:
            raise HTTPException(status_code=403, detail="You are not enrolled in this Tutor Pack")
    return content, pack


class EligibilityOut(BaseModel):
    available: bool
    reason: Optional[str] = None
    messages_used_today: int = 0
    daily_message_cap: int = 0


@router.get("/eligibility", response_model=EligibilityOut)
async def eligibility(content_id: str, user: dict = Depends(get_current_user)):
    """Lets the student panel show a precise reason ("not a Premium pack", "daily limit
    reached") instead of silently not appearing."""
    settings = await _settings()
    if not settings["enabled"]:
        return EligibilityOut(available=False, reason="Socratic Learning is currently turned off.")
    try:
        await _load_content_for_student(content_id, user)
    except HTTPException as e:
        return EligibilityOut(available=False, reason=str(e.detail))
    used = await _messages_today(user["id"])
    return EligibilityOut(
        available=True,
        messages_used_today=used,
        daily_message_cap=settings["daily_message_cap"],
    )


# ---------- Lesson context ----------
_TAG_RE = re.compile(r"<[^>]+>")


def _mindmap_to_text(html: str) -> str:
    return re.sub(r"\n{2,}", "\n", _TAG_RE.sub("\n", html or "")).strip()


def _lesson_context(content: dict, allow_quiz_answers: bool) -> str:
    """Renders the lesson the student is looking at as plain text for the tutor prompt.

    Built server-side from the stored content, never from anything the client sends --
    same reasoning as the short-answer grader in content.py: the client must not get to
    decide what the model is told it is tutoring.

    For a quiz this deliberately drops correct_answer. The whole point of the tutor next
    to a quiz is to help a student reason toward the answer, and a model cannot leak a
    fact it was never given."""
    ct = content.get("content_type")
    payload = content.get("payload") or {}

    if ct == "summary":
        return payload.get("body") or content.get("body") or ""
    if ct == "notes":
        return "\n".join(f"- {n}" for n in payload.get("notes", []))
    if ct == "flashcards":
        return "\n".join(
            f"- {c.get('front', '')} => {c.get('back', '')}" for c in payload.get("cards", [])
        )
    if ct == "mindmap":
        return _mindmap_to_text(payload.get("html") or "") or (payload.get("caption") or "")
    if ct == "quiz":
        lines = []
        for i, q in enumerate(payload.get("questions", []), start=1):
            lines.append(f"{i}. {q.get('question', '')}")
            for opt in q.get("options") or []:
                lines.append(f"   - {opt}")
            if allow_quiz_answers and q.get("correct_answer"):
                lines.append(f"   (reference answer: {q['correct_answer']})")
        return "\n".join(lines)
    return content.get("body") or ""


CONTENT_TYPE_LABEL = {
    "summary": "chapter summary",
    "notes": "study notes",
    "flashcards": "flashcard set",
    "mindmap": "mind map",
    "quiz": "quiz",
}


# ---------- Sessions ----------
class TurnOut(BaseModel):
    id: str
    role: Literal["student", "tutor"]
    text: str
    phase: Optional[str] = None
    hint_level: int = 0
    flagged: bool = False
    created_at: str


class SessionOut(BaseModel):
    id: str
    content_id: str
    content_type: str
    content_title: Optional[str] = None
    tutor_name: str = "Zan"
    language: str
    status: str
    turn_count: int
    hint_level: int
    hints_used: int = 0
    hints_allowed: int = DEFAULT_HINT_BUDGET
    mastery_signal: float = 0.0
    concepts_covered: List[str] = Field(default_factory=list)
    mastered: bool = False
    turns: List[TurnOut] = Field(default_factory=list)
    messages_used_today: int = 0
    daily_message_cap: int = 0
    max_turns_per_session: int = 0
    created_at: str


def _session_out(doc: dict, turns: List[dict], settings: dict, used_today: int) -> SessionOut:
    return SessionOut(
        id=doc["id"],
        content_id=doc["content_id"],
        content_type=doc["content_type"],
        content_title=doc.get("content_title"),
        # Sessions created before the tutor had a name fall back to the first one rather
        # than showing an empty header.
        tutor_name=doc.get("tutor_name") or TUTOR_NAMES[0],
        language=doc.get("language", "en"),
        status=doc.get("status", "active"),
        turn_count=doc.get("turn_count", 0),
        hint_level=doc.get("hint_level", 0),
        hints_used=doc.get("hints_used", 0),
        hints_allowed=_hint_budget(doc.get("content_type", "")),
        mastery_signal=doc.get("mastery_signal") or 0.0,
        concepts_covered=doc.get("concepts_covered") or [],
        mastered=bool(doc.get("mastered")),
        turns=[
            TurnOut(
                id=t["id"],
                role=t["role"],
                text=t["text"],
                phase=t.get("phase"),
                hint_level=t.get("hint_level", 0),
                flagged=bool(t.get("flagged")),
                created_at=t["created_at"],
            )
            for t in turns
        ],
        messages_used_today=used_today,
        daily_message_cap=settings["daily_message_cap"],
        max_turns_per_session=settings["max_turns_per_session"],
        created_at=doc["created_at"],
    )


async def _messages_today(user_id: str) -> int:
    start = datetime.now(timezone.utc).date().isoformat()
    return await db.socratic_turns.count_documents(
        {"user_id": user_id, "role": "student", "created_at": {"$gte": start}}
    )


class StartSessionIn(BaseModel):
    content_id: str
    # Which language the student is reading in. A conversation cannot be half BM and
    # half EN the way an authored bilingual lesson can, so the session picks one at
    # start and stays there; switching languages starts a separate session.
    language: Literal["en", "bm"] = "en"


@router.post("/session", response_model=SessionOut)
async def start_or_resume_session(payload: StartSessionIn, user: dict = Depends(get_current_user)):
    """Resumes this student's open session for the lesson, or opens one. Students get
    interrupted mid-conversation constantly; losing a ten-turn thread on a page reload
    would make the tutor feel disposable."""
    settings = await _settings()
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Socratic Learning is currently turned off.")
    content, _pack = await _load_content_for_student(payload.content_id, user)

    # Newest-first, so that if more than one active session somehow exists for this
    # lesson (two tabs open on the same lesson can both create one before either
    # finishes), resuming always lands on the same, most recent one -- rather than
    # picking arbitrarily and appearing to resurrect a conversation the student just
    # cleared.
    existing = await db.socratic_sessions.find_one(
        {"user_id": user["id"], "content_id": payload.content_id,
         "language": payload.language, "status": "active"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not existing:
        existing = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pack_id": content["pack_id"],
            "chapter_id": content.get("chapter_id"),
            "content_id": payload.content_id,
            "content_type": content["content_type"],
            "content_title": content.get("title"),
            "tutor_name": random.choice(TUTOR_NAMES),
            "language": payload.language,
            "status": "active",
            "turn_count": 0,
            "hint_level": 0,
            "hints_used": 0,
            "mastery_signal": 0.0,
            "concepts_covered": [],
            "mastered": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.socratic_sessions.insert_one(dict(existing))

    turns = await db.socratic_turns.find(
        {"session_id": existing["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return _session_out(existing, turns, settings, await _messages_today(user["id"]))


async def _require_own_session(session_id: str, user: dict) -> dict:
    doc = await db.socratic_sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return doc


@router.post("/session/{session_id}/reset", response_model=SessionOut)
async def reset_session(session_id: str, user: dict = Depends(get_current_user)):
    """The panel's "new chat" button. Ends the current thread and opens a fresh one for
    the same lesson -- the old transcript is kept, not deleted, since admin/parent
    oversight of a minor's conversations is the point.

    Ends *every* active session this student has for the lesson, not just the id passed
    in. Ending only that one leaves any sibling active session (two tabs on the same
    lesson can produce one) for the resume below to find, which would hand the student
    back a populated conversation immediately after they asked for an empty one."""
    doc = await _require_own_session(session_id, user)
    language = doc.get("language", "en")
    await db.socratic_sessions.update_many(
        {"user_id": user["id"], "content_id": doc["content_id"],
         "language": language, "status": "active"},
        {"$set": {"status": "ended", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await start_or_resume_session(
        StartSessionIn(content_id=doc["content_id"], language=language), user
    )


# ---------- The turn itself ----------
def _parse_turn(text: str) -> dict:
    """The tutor prompt asks for a small JSON object. A chat turn must never hard-fail
    on a model that answered in prose anyway -- in that case the raw text becomes the
    reply and the structured fields fall back to neutral values."""
    raw = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1)
    else:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            raw = raw[start:end + 1]
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or not data.get("reply"):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        return {"reply": text.strip(), "phase": "probe", "concepts_covered": [],
                "mastery_signal": None, "done": False}

    concepts = data.get("concepts_covered")
    mastery = data.get("mastery_signal")
    try:
        mastery = float(mastery) if mastery is not None else None
    except (TypeError, ValueError):
        mastery = None
    return {
        "reply": str(data["reply"]).strip(),
        "phase": data.get("phase") if data.get("phase") in ("probe", "hint", "challenge", "consolidate") else "probe",
        "concepts_covered": [str(c) for c in concepts][:12] if isinstance(concepts, list) else [],
        "mastery_signal": min(max(mastery, 0.0), 1.0) if mastery is not None else None,
        "done": bool(data.get("done")),
    }


def _build_prompt(session: dict, content: dict, history: List[dict], student_text: str,
                  hint_level: int, settings: dict) -> str:
    lesson = _lesson_context(content, settings["allow_quiz_answers"] and session["content_type"] == "quiz")
    lang_name = "Bahasa Melayu" if session.get("language") == "bm" else "English"
    kind = CONTENT_TYPE_LABEL.get(session["content_type"], "lesson")

    parts = [
        f"Respond in {lang_name}.",
        f"The student is studying the {kind} titled \"{session.get('content_title') or ''}\".",
        "",
        "LESSON MATERIAL (the only material you may tutor on):",
        lesson or "(no material available)",
        "",
        f"Current hint level: {hint_level} of {MAX_HINT_LEVEL}."
        " 0 means ask a guiding question and give nothing away."
        " 3 means walk through the reasoning step by step, but still stop short of"
        " simply stating the final answer.",
    ]
    if session["content_type"] == "quiz" and not settings["allow_quiz_answers"]:
        parts.append(
            "This is a quiz. You must NEVER state which option is correct or give the"
            " final answer, at any hint level -- help the student reason it out instead."
        )
    if history:
        parts += ["", "CONVERSATION SO FAR:"]
        parts += [f"{'Student' if h['role'] == 'student' else 'Tutor'}: {h['text']}" for h in history]
    parts += ["", f"Student: {student_text}"]
    return "\n".join(parts)


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    # The panel's "I'm stuck" button. Escalating the hint ladder is a deliberate,
    # student-initiated step -- without it a student can just keep asking the model to
    # give up the answer, which is exactly what a Socratic tutor must not do.
    request_hint: bool = False


class MessageOut(BaseModel):
    session: SessionOut
    xp_awarded: int = 0


@router.post("/session/{session_id}/message", response_model=MessageOut)
async def send_message(session_id: str, payload: MessageIn, user: dict = Depends(get_current_user)):
    settings = await _settings()
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Socratic Learning is currently turned off.")

    session = await _require_own_session(session_id, user)
    if session.get("status") != "active":
        raise HTTPException(status_code=400, detail="This session has ended. Start a new chat.")
    content, _pack = await _load_content_for_student(session["content_id"], user)

    if session.get("turn_count", 0) >= settings["max_turns_per_session"]:
        raise HTTPException(
            status_code=429,
            detail="This conversation has reached its length limit. Start a new chat to continue.",
        )
    if await _messages_today(user["id"]) >= settings["daily_message_cap"]:
        raise HTTPException(
            status_code=429,
            detail="You've reached today's tutor message limit. Come back tomorrow.",
        )

    now = datetime.now(timezone.utc).isoformat()

    # The hint budget is spent here, and refused outright once it runs out -- the ladder
    # capping at rung 3 only ever limited how far a single hint could go, never how many
    # a student could ask for.
    budget = _hint_budget(session["content_type"])
    hints_used = session.get("hints_used", 0)
    hint_level = session.get("hint_level", 0)
    if payload.request_hint:
        if hints_used >= budget:
            raise HTTPException(
                status_code=429,
                detail=f"You've used all {budget} hints for this lesson. Keep working it through "
                       f"with the tutor -- it will still help you reason it out.",
            )
        hints_used += 1
        hint_level = min(hint_level + 1, MAX_HINT_LEVEL)

    flagged = bool(_FLAG_PATTERNS.search(payload.text))

    await db.socratic_turns.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user["id"],
        "role": "student",
        "text": payload.text.strip(),
        "hint_level": hint_level,
        "flagged": flagged,
        "created_at": now,
    })

    history = await db.socratic_turns.find(
        {"session_id": session_id}, {"_id": 0, "role": 1, "text": 1}
    ).sort("created_at", 1).to_list(500)
    history = history[-(HISTORY_TURNS * 2):][:-1]  # drop the message just stored

    prompt = _build_prompt(session, content, history, payload.text.strip(), hint_level, settings)
    try:
        result = await call_router("socratic_tutor", prompt, session_id=session_id)
    except HTTPException as e:
        # The student's message is already stored; surface the router's failure rather
        # than pretending the tutor replied.
        raise HTTPException(status_code=503, detail=f"The tutor is unavailable right now. ({e.detail})")

    parsed = _parse_turn(result["text"])
    await db.socratic_turns.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "user_id": user["id"],
        "role": "tutor",
        "text": parsed["reply"],
        "phase": parsed["phase"],
        "hint_level": hint_level,
        "concepts_covered": parsed["concepts_covered"],
        "mastery_signal": parsed["mastery_signal"],
        "provider": result["provider"],
        "model": result["model"],
        "flagged": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    concepts = list(dict.fromkeys((session.get("concepts_covered") or []) + parsed["concepts_covered"]))
    mastery = parsed["mastery_signal"] if parsed["mastery_signal"] is not None else session.get("mastery_signal", 0.0)
    mastered = bool(session.get("mastered")) or (mastery >= MASTERY_THRESHOLD and parsed["done"])

    # Once the tutor reaches "consolidate" the student has produced the answer in their
    # own words, so the next thing they get stuck on starts the ladder over at a guiding
    # question. Without this the rung is sticky for the whole session: hit rung 3 on
    # question 2 of a quiz and every later hint opens with a full walkthrough.
    next_hint_level = 0 if parsed["phase"] == "consolidate" else hint_level

    await db.socratic_sessions.update_one(
        {"id": session_id},
        {"$set": {
            "turn_count": session.get("turn_count", 0) + 1,
            "hint_level": next_hint_level,
            "hints_used": hints_used,
            "concepts_covered": concepts[:24],
            "mastery_signal": mastery,
            "mastered": mastered,
            "status": "ended" if parsed["done"] else "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # Idempotent by (user, content_id, "socratic") -- a lesson's tutor session pays out
    # once, however many times the student comes back to it.
    xp_awarded = 0
    if mastered and not session.get("mastered"):
        xp_result = await award_socratic_xp(
            user["id"], session["pack_id"], session["content_id"],
            session.get("content_title") or "Lesson",
        )
        xp_awarded = xp_result["xp_awarded"]

    fresh = await db.socratic_sessions.find_one({"id": session_id}, {"_id": 0})
    turns = await db.socratic_turns.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return MessageOut(
        session=_session_out(fresh, turns, settings, await _messages_today(user["id"])),
        xp_awarded=xp_awarded,
    )


# ---------- Admin oversight ----------
class AdminSessionRow(BaseModel):
    id: str
    student_id: str
    student_name: str
    pack_title: Optional[str] = None
    content_title: Optional[str] = None
    content_type: str
    language: str
    status: str
    turn_count: int
    mastery_signal: float = 0.0
    mastered: bool = False
    flagged_count: int = 0
    created_at: str
    updated_at: Optional[str] = None


@router.get("/admin/sessions", response_model=List[AdminSessionRow])
async def admin_sessions(
    flagged_only: bool = False,
    student_id: Optional[str] = None,
    limit: int = 100,
    _: dict = Depends(require_role("admin")),
):
    """Transcript oversight is not a nice-to-have here -- these are open-ended AI
    conversations with school-age children, so an admin has to be able to read them."""
    q: dict = {}
    if student_id:
        q["user_id"] = student_id
    docs = await db.socratic_sessions.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    if not docs:
        return []

    session_ids = [d["id"] for d in docs]
    flagged = await db.socratic_turns.aggregate([
        {"$match": {"session_id": {"$in": session_ids}, "flagged": True}},
        {"$group": {"_id": "$session_id", "n": {"$sum": 1}}},
    ]).to_list(1000)
    flagged_by_session = {f["_id"]: f["n"] for f in flagged}

    user_ids = list({d["user_id"] for d in docs})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    names = {u["id"]: u["name"] for u in users}

    pack_ids = list({d["pack_id"] for d in docs})
    packs = await db.packs.find({"id": {"$in": pack_ids}}, {"_id": 0, "id": 1, "title": 1}).to_list(500)
    pack_titles = {p["id"]: p["title"] for p in packs}

    rows = [
        AdminSessionRow(
            id=d["id"],
            student_id=d["user_id"],
            student_name=names.get(d["user_id"], "Unknown"),
            pack_title=pack_titles.get(d["pack_id"]),
            content_title=d.get("content_title"),
            content_type=d["content_type"],
            language=d.get("language", "en"),
            status=d.get("status", "active"),
            turn_count=d.get("turn_count", 0),
            mastery_signal=d.get("mastery_signal") or 0.0,
            mastered=bool(d.get("mastered")),
            flagged_count=flagged_by_session.get(d["id"], 0),
            created_at=d["created_at"],
            updated_at=d.get("updated_at"),
        )
        for d in docs
    ]
    return [r for r in rows if r.flagged_count > 0] if flagged_only else rows


class AdminTranscriptOut(BaseModel):
    session: AdminSessionRow
    turns: List[TurnOut]


@router.get("/admin/sessions/{session_id}", response_model=AdminTranscriptOut)
async def admin_transcript(session_id: str, _: dict = Depends(require_role("admin"))):
    doc = await db.socratic_sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    turns = await db.socratic_turns.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    student = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "name": 1})
    pack = await db.packs.find_one({"id": doc["pack_id"]}, {"_id": 0, "title": 1})
    row = AdminSessionRow(
        id=doc["id"],
        student_id=doc["user_id"],
        student_name=(student or {}).get("name", "Unknown"),
        pack_title=(pack or {}).get("title"),
        content_title=doc.get("content_title"),
        content_type=doc["content_type"],
        language=doc.get("language", "en"),
        status=doc.get("status", "active"),
        turn_count=doc.get("turn_count", 0),
        mastery_signal=doc.get("mastery_signal") or 0.0,
        mastered=bool(doc.get("mastered")),
        flagged_count=sum(1 for t in turns if t.get("flagged")),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at"),
    )
    return AdminTranscriptOut(
        session=row,
        turns=[
            TurnOut(
                id=t["id"], role=t["role"], text=t["text"], phase=t.get("phase"),
                hint_level=t.get("hint_level", 0), flagged=bool(t.get("flagged")),
                created_at=t["created_at"],
            )
            for t in turns
        ],
    )


@router.post("/admin/sessions/{session_id}/reset")
async def admin_reset_session(session_id: str, _: dict = Depends(require_role("admin"))):
    """Ends a session without destroying it: the student gets a clean slate next time
    they open that lesson, while the transcript stays readable here. This is the safe
    option -- oversight of a minor's conversations shouldn't be discarded just to give
    them a fresh start."""
    res = await db.socratic_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "ended", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.delete("/admin/sessions/{session_id}")
async def admin_delete_session(session_id: str, _: dict = Depends(require_role("admin"))):
    """Destroys a session and its transcript outright. Unlike reset this is not
    recoverable, and it removes evidence -- prefer reset unless the record genuinely
    needs to be gone (a test run, or content the student asked to have removed)."""
    session = await db.socratic_sessions.find_one({"id": session_id}, {"_id": 0, "id": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    turns = await db.socratic_turns.delete_many({"session_id": session_id})
    await db.socratic_sessions.delete_one({"id": session_id})
    return {"ok": True, "deleted_turns": turns.deleted_count}


@router.delete("/admin/students/{student_id}/sessions")
async def admin_clear_student_sessions(student_id: str, _: dict = Depends(require_role("admin"))):
    """Clears every Socratic session and transcript for one student -- the bulk form of
    the above, for wiping a test account rather than trimming a real one."""
    sessions = await db.socratic_sessions.find({"user_id": student_id}, {"_id": 0, "id": 1}).to_list(2000)
    ids = [s["id"] for s in sessions]
    if ids:
        await db.socratic_turns.delete_many({"session_id": {"$in": ids}})
        await db.socratic_sessions.delete_many({"user_id": student_id})
    return {"ok": True, "deleted_sessions": len(ids)}


class AdminStatsOut(BaseModel):
    total_sessions: int
    active_sessions: int
    total_messages: int
    students_engaged: int
    mastered_sessions: int
    flagged_sessions: int
    sessions_last_7d: int
    top_concepts: List[dict] = Field(default_factory=list)
    eligible_packs: int


@router.get("/admin/stats", response_model=AdminStatsOut)
async def admin_stats(_: dict = Depends(require_role("admin"))):
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    students = await db.socratic_sessions.distinct("user_id")
    flagged_sessions = await db.socratic_turns.distinct("session_id", {"flagged": True})

    # Which concepts the cohort keeps needing tutoring on -- the signal that feeds back
    # into what admins should author more carefully.
    concepts = await db.socratic_sessions.aggregate([
        {"$unwind": "$concepts_covered"},
        {"$group": {"_id": "$concepts_covered", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
        {"$limit": 10},
    ]).to_list(10)

    return AdminStatsOut(
        total_sessions=await db.socratic_sessions.count_documents({}),
        active_sessions=await db.socratic_sessions.count_documents({"status": "active"}),
        total_messages=await db.socratic_turns.count_documents({}),
        students_engaged=len(students),
        mastered_sessions=await db.socratic_sessions.count_documents({"mastered": True}),
        flagged_sessions=len(flagged_sessions),
        sessions_last_7d=await db.socratic_sessions.count_documents({"created_at": {"$gte": week_ago}}),
        top_concepts=[{"concept": c["_id"], "count": c["n"]} for c in concepts],
        eligible_packs=await db.packs.count_documents({"tier": {"$in": list(SOCRATIC_TIERS)}}),
    )


async def ensure_indexes(target_db):
    """Chat turns are the first collection in this app that grows per-interaction rather
    than per-authored-item, so it is also the first that actually needs indexes."""
    await target_db.socratic_turns.create_index([("session_id", 1), ("created_at", 1)])
    await target_db.socratic_turns.create_index([("user_id", 1), ("role", 1), ("created_at", 1)])
    await target_db.socratic_sessions.create_index([("user_id", 1), ("content_id", 1), ("status", 1)])
    await target_db.socratic_sessions.create_index([("created_at", -1)])
