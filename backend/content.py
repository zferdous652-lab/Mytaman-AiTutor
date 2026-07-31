"""Content generation & storage endpoints."""
import io
import json
import random
import re
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, ValidationError

from db import db
from auth import require_role, get_current_user
from model_router import call_router
from xp import award_lesson_xp, award_quiz_xp
from rewards import on_xp_earned

router = APIRouter(prefix="/content", tags=["content"])

ContentType = Literal["summary", "quiz", "flashcards", "mindmap", "notes"]
PROMPT_KEY = {
    "summary": "chapter_summary",
    "quiz": "quiz_generation",
    "flashcards": "flashcard_generation",
    "mindmap": "mindmap_generation",
    "notes": "notes_generation",
}


class GenerateIn(BaseModel):
    pack_id: str
    title: str = Field(min_length=1)
    content_type: ContentType
    source_text: str = Field(min_length=10)
    language: Literal["en", "bm"] = "en"


class ContentOut(BaseModel):
    id: str
    pack_id: Optional[str] = None
    chapter_id: Optional[str] = None
    course_id: Optional[str] = None
    title: Optional[str] = None
    content_type: ContentType
    language: str
    body: Optional[str] = None
    payload: Optional[dict] = None
    status: Optional[str] = None
    draft_index: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    published: bool
    created_at: str


@router.post("/generate", response_model=ContentOut)
async def generate(payload: GenerateIn, user: dict = Depends(require_role("admin"))):
    lang_hint = "Respond in Bahasa Melayu." if payload.language == "bm" else "Respond in English."
    user_text = f"{lang_hint}\n\nTitle: {payload.title}\n\nSource material:\n{payload.source_text}"
    result = await call_router(PROMPT_KEY[payload.content_type], user_text)
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "title": payload.title,
        "content_type": payload.content_type,
        "language": payload.language,
        "body": result["text"],
        "provider": result["provider"],
        "model": result["model"],
        "published": False,
        "source_text": payload.source_text,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contents.insert_one(doc)
    return ContentOut(**{k: doc.get(k) for k in ContentOut.model_fields.keys()})


# ---------- Manual content (chapter-based, typed payload, draft/confirm) ----------

QuestionType = Literal["mcq", "true_false", "short_answer"]


class QuizQuestion(BaseModel):
    type: QuestionType
    question: str = Field(min_length=1)
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None

    def validate_shape(self, index: int):
        if self.type == "mcq":
            if not self.options or len(self.options) < 2:
                raise ValueError(f"Question {index}: MCQ needs at least 2 options")
            if self.correct_answer not in self.options:
                raise ValueError(f"Question {index}: correct_answer must match one of the options")
        elif self.type == "true_false":
            if self.correct_answer not in ("true", "false"):
                raise ValueError(f"Question {index}: true_false correct_answer must be 'true' or 'false'")


class QuizPayload(BaseModel):
    questions: List[QuizQuestion] = Field(min_length=1, max_length=40)


class FlashCard(BaseModel):
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)


class FlashcardsPayload(BaseModel):
    cards: List[FlashCard] = Field(min_length=1, max_length=200)


MINDMAP_ALLOWED_TAGS = ["div", "span", "p", "ul", "ol", "li", "strong", "em", "b", "i", "br", "h3", "h4"]
MINDMAP_ALLOWED_CLASSES = {"mindmap-root", "mindmap-node", "mindmap-branch", "mindmap-leaf"}
_CLASS_ATTR_RE = re.compile(r'\sclass="([^"]*)"')


def _sanitize_mindmap_html(html: str) -> str:
    """Strict allowlist sanitizer for AI-generated (or hand-authored) mind map HTML -- this
    is rendered client-side via dangerouslySetInnerHTML, so this is the only real security
    boundary. Strips every tag/attribute except a small structural set, no inline styles or
    scripts, and only lets through our own known mindmap-* class names (not the raw values
    the model produced), so nothing else on the page can be targeted via class names either."""
    import bleach

    cleaned = bleach.clean(html, tags=MINDMAP_ALLOWED_TAGS, attributes={"*": ["class"]}, strip=True)

    def _filter_classes(match: "re.Match") -> str:
        kept = [c for c in match.group(1).split() if c in MINDMAP_ALLOWED_CLASSES]
        return f' class="{" ".join(kept)}"' if kept else ""

    return _CLASS_ATTR_RE.sub(_filter_classes, cleaned).strip()


class MindmapPayload(BaseModel):
    html: Optional[str] = None
    image_url: Optional[str] = None  # legacy -- mind maps used to be an uploaded image
    caption: Optional[str] = None

    def validate_shape(self):
        if not (self.html and self.html.strip()) and not (self.image_url and self.image_url.strip()):
            raise ValueError("Provide mind map HTML (or, for legacy content, an image_url)")


class TextPayload(BaseModel):
    body: str = Field(min_length=1)


class NotesPayload(BaseModel):
    notes: List[str] = Field(min_length=1, max_length=200)

    def validate_shape(self):
        if any(not n.strip() for n in self.notes):
            raise ValueError("Notes cannot be empty")


def _validate_payload(content_type: str, payload: dict) -> dict:
    try:
        if content_type == "quiz":
            parsed = QuizPayload(**payload)
            for i, q in enumerate(parsed.questions, start=1):
                q.validate_shape(i)
            return parsed.model_dump()
        if content_type == "flashcards":
            return FlashcardsPayload(**payload).model_dump()
        if content_type == "mindmap":
            if payload.get("html"):
                payload = {**payload, "html": _sanitize_mindmap_html(payload["html"])}
            parsed = MindmapPayload(**payload)
            parsed.validate_shape()
            return parsed.model_dump()
        if content_type == "notes":
            parsed = NotesPayload(**payload)
            parsed.validate_shape()
            return parsed.model_dump()
        # summary
        return TextPayload(**payload).model_dump()
    except (ValidationError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload for {content_type}: {e}")


def _extract_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]
    return json.loads(text)


def _extract_html(text: str) -> str:
    """Strips markdown code fences / stray prose the model may wrap the HTML fragment in,
    keeping just the outer <div ...>...</div> mind map markup."""
    text = text.strip()
    fenced = re.search(r"```(?:html)?\s*(<div[\s\S]*?</div>)\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    start, end = text.find("<div"), text.rfind("</div>")
    if start != -1 and end != -1 and end > start:
        return text[start:end + len("</div>")].strip()
    return text


class AiDraftItemIn(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: Literal["en", "bm"] = "en"
    source_text: str = Field(min_length=10)


class AiDraftItemOut(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: str
    payload: dict
    provider: str
    model: str


def _normalize_quiz_payload(raw: dict) -> dict:
    """Accepts quiz JSON in either our target shape ({type, question, options,
    correct_answer}) or the older ad-hoc shape ({q, choices, answer_index, explanation})
    that a not-yet-updated Model Router prompt (or a model that ignores the newer
    instructions) may still produce, and normalizes it to our schema."""
    normalized = []
    for q in raw.get("questions", []):
        if "type" in q and "question" in q:
            normalized.append(q)
            continue
        question_text = q.get("q") or q.get("question") or q.get("text") or ""
        choices = q.get("choices") or q.get("options")
        answer_index = q.get("answer_index")
        correct_answer = q.get("correct_answer") or q.get("answer")
        if correct_answer is None and choices and isinstance(answer_index, int) and 0 <= answer_index < len(choices):
            correct_answer = choices[answer_index]
        if choices:
            normalized.append({"type": "mcq", "question": question_text, "options": choices, "correct_answer": correct_answer})
        else:
            normalized.append({"type": "short_answer", "question": question_text, "correct_answer": correct_answer})
    return {"questions": normalized}


def _shuffle_mcq_options(payload: dict) -> dict:
    """Models writing quiz JSON have a strong stylistic bias toward listing the correct
    option first -- asking nicely in the prompt doesn't reliably fix this across many
    generations, so shuffle the options for real here. correct_answer is matched by
    string value elsewhere, not position, so reordering options is safe."""
    for q in payload.get("questions", []):
        if q.get("type") == "mcq" and q.get("options"):
            random.shuffle(q["options"])
    return payload


def _notes_from_plain_text(text: str) -> dict:
    """Falls back to splitting plain-text lines into notes when the AI didn't return JSON
    -- covers a not-yet-updated Model Router prompt that still asks for free-form notes."""
    lines = [ln.strip().lstrip("-*• ").strip() for ln in text.splitlines()]
    return {"notes": [ln for ln in lines if ln]}


_MD_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_MD_BOLD_UNDERSCORE_RE = re.compile(r"__(.+?)__")
_MD_HEADER_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^[*+]\s+", re.MULTILINE)


def _strip_markdown(text: str) -> str:
    """Best-effort cleanup of Markdown syntax the model may still emit despite being told
    not to -- either because it didn't fully comply, or because a not-yet-updated Model
    Router prompt is still in play. Summaries/notes are shown as plain text to students, so
    stray **/##/etc. would otherwise render as literal characters instead of formatting."""
    text = _MD_BOLD_RE.sub(r"\1", text)
    text = _MD_BOLD_UNDERSCORE_RE.sub(r"\1", text)
    text = _MD_HEADER_RE.sub("", text)
    text = _MD_BULLET_RE.sub("- ", text)
    # Catches any leftover unpaired ** / __ the regexes above didn't match a partner for.
    return text.replace("**", "").replace("__", "")


@router.post("/ai-draft", response_model=AiDraftItemOut)
async def ai_generate_draft_item(payload: AiDraftItemIn, _: dict = Depends(require_role("admin"))):
    """Generates a single chapter's content via the Model Router, validated against the same
    typed payload shapes as Manual Content, so the result can be edited and saved through the
    same /content/drafts pipeline (draft -> confirm -> publish)."""
    chapter = await db.chapters.find_one({"id": payload.chapter_id}, {"_id": 0})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    lang_hint = "Respond in Bahasa Melayu." if payload.language == "bm" else "Respond in English."
    user_text = f"{lang_hint}\n\nChapter: {chapter['title']}\n\nSource material:\n{payload.source_text}"
    result = await call_router(PROMPT_KEY[payload.content_type], user_text)

    if payload.content_type == "summary":
        raw_payload = {"body": _strip_markdown(result["text"]).strip()}
    elif payload.content_type == "mindmap":
        raw_payload = {"html": _extract_html(result["text"])}
    else:
        try:
            raw_payload = _extract_json(result["text"])
        except (json.JSONDecodeError, ValueError):
            if payload.content_type == "notes":
                raw_payload = _notes_from_plain_text(result["text"])
            else:
                raise HTTPException(
                    status_code=502,
                    detail="AI did not return valid JSON. Try again, or adjust the prompt in Model Router.",
                )
        if payload.content_type == "quiz":
            raw_payload = _normalize_quiz_payload(raw_payload)
        if payload.content_type == "notes" and "notes" in raw_payload:
            raw_payload["notes"] = [_strip_markdown(n).strip() for n in raw_payload["notes"]]

    validated = _validate_payload(payload.content_type, raw_payload)
    if payload.content_type == "quiz":
        validated = _shuffle_mcq_options(validated)
    return AiDraftItemOut(
        chapter_id=payload.chapter_id,
        content_type=payload.content_type,
        language=payload.language,
        payload=validated,
        provider=result["provider"],
        model=result["model"],
    )


class SourcePdfIn(BaseModel):
    filename: str
    url: str
    text: str


class DraftItemIn(BaseModel):
    chapter_id: str
    content_type: ContentType
    language: Literal["en", "bm"] = "en"
    payload: dict
    source_pdf: Optional[SourcePdfIn] = None


DraftSource = Literal["manual", "ai"]


class SaveDraftIn(BaseModel):
    pack_id: str
    items: List[DraftItemIn] = Field(min_length=1)
    source: DraftSource = "manual"


class DraftItemOut(BaseModel):
    chapter_id: str
    course_id: str
    course_title: str
    chapter_title: str
    content_type: ContentType
    language: str
    payload: dict
    source_pdf: Optional[SourcePdfIn] = None


class HiddenReviewItem(BaseModel):
    chapter_id: str
    content_type: str
    language: str


class PackDraftOut(BaseModel):
    id: str
    pack_id: str
    draft_index: int
    status: str
    name: Optional[str] = None
    source: DraftSource = "manual"
    items: List[DraftItemOut]
    created_at: str
    hidden_from_review: bool = False
    hidden_review_items: List[HiddenReviewItem] = Field(default_factory=list)


def _draft_out(doc: dict) -> PackDraftOut:
    """Builds a PackDraftOut from a raw pack_drafts document, defaulting `source` to
    "manual" for drafts saved before the Manual Content / Generate with AI split existed,
    and `hidden_from_review` to False for drafts saved before the Tutor Pack Publish review
    panel's own remove-from-list flag existed."""
    d = {k: doc.get(k) for k in PackDraftOut.model_fields.keys()}
    d["source"] = doc.get("source") or "manual"
    d["hidden_from_review"] = bool(doc.get("hidden_from_review"))
    d["hidden_review_items"] = doc.get("hidden_review_items") or []
    return PackDraftOut(**d)


async def _build_items_out(pack_id: str, items_in: List[DraftItemIn]) -> list:
    items_out = []
    for item in items_in:
        chapter = await db.chapters.find_one({"id": item.chapter_id}, {"_id": 0})
        if not chapter:
            raise HTTPException(status_code=404, detail=f"Chapter {item.chapter_id} not found")
        course = await db.courses.find_one({"id": chapter["course_id"]}, {"_id": 0})
        if not course or course["pack_id"] != pack_id:
            raise HTTPException(status_code=400, detail=f"Chapter {item.chapter_id} does not belong to this Tutor Pack")
        validated_payload = _validate_payload(item.content_type, item.payload)
        items_out.append({
            "chapter_id": item.chapter_id,
            "course_id": course["id"],
            "course_title": course["title"],
            "chapter_title": chapter["title"],
            "content_type": item.content_type,
            "language": item.language,
            "payload": validated_payload,
            "source_pdf": item.source_pdf.model_dump() if item.source_pdf else None,
        })
    return items_out


@router.post("/drafts", response_model=PackDraftOut)
async def save_draft(payload: SaveDraftIn, user: dict = Depends(require_role("admin"))):
    pack = await db.packs.find_one({"id": payload.pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Tutor Pack not found")

    items_out = await _build_items_out(payload.pack_id, payload.items)

    last = await db.pack_drafts.find_one(
        {"pack_id": payload.pack_id}, {"_id": 0, "draft_index": 1}, sort=[("draft_index", -1)]
    )
    next_index = (last["draft_index"] if last else 0) + 1
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "draft_index": next_index,
        "status": "draft",
        "source": payload.source,
        "items": items_out,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pack_drafts.insert_one(doc)
    return _draft_out(doc)


class UpdateDraftItemsIn(BaseModel):
    items: List[DraftItemIn] = Field(min_length=1)


@router.put("/drafts/{draft_id}", response_model=PackDraftOut)
async def update_pack_draft_items(draft_id: str, payload: UpdateDraftItemsIn, _: dict = Depends(require_role("admin"))):
    """Replaces a draft's items in place (same id/draft_index) instead of creating a new
    draft -- lets an admin re-edit an already-confirmed draft (e.g. add another chapter)
    without spawning a fresh Draft N every time. Resets status to "draft" since the
    confirmed content just changed underneath it; the existing Confirm action becomes
    available again once the edit is saved."""
    draft = await db.pack_drafts.find_one({"id": draft_id}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    items_out = await _build_items_out(draft["pack_id"], payload.items)

    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id},
        {"$set": {"items": items_out, "status": "draft"}},
        return_document=True,
        projection={"_id": 0},
    )
    return _draft_out(res)


@router.get("/drafts", response_model=List[PackDraftOut])
async def list_pack_drafts(pack_id: str, source: Optional[DraftSource] = None, _: dict = Depends(require_role("admin"))):
    q: dict = {"pack_id": pack_id}
    if source == "manual":
        # Drafts saved before the source field existed are all Manual Content drafts.
        q["$or"] = [{"source": "manual"}, {"source": {"$exists": False}}]
    elif source == "ai":
        q["source"] = "ai"
    docs = await db.pack_drafts.find(q, {"_id": 0}).sort("draft_index", 1).to_list(200)
    return [_draft_out(d) for d in docs]


@router.post("/drafts/{draft_id}/confirm", response_model=PackDraftOut)
async def confirm_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    # (Re)confirming always resurfaces the draft in the Tutor Pack Publish review panel,
    # even if it was previously removed from that list -- confirm is the one action that
    # explicitly signals "this is ready to be reviewed for publishing again."
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id},
        {"$set": {"status": "confirmed", "hidden_from_review": False, "hidden_review_items": []}},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


@router.post("/drafts/{draft_id}/deny", response_model=PackDraftOut)
async def deny_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    """Reverts a confirmed draft back to draft status -- the inverse of Confirm."""
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"status": "draft"}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


@router.post("/drafts/{draft_id}/duplicate", response_model=PackDraftOut)
async def duplicate_pack_draft(draft_id: str, user: dict = Depends(require_role("admin"))):
    source = await db.pack_drafts.find_one({"id": draft_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Draft not found")
    last = await db.pack_drafts.find_one(
        {"pack_id": source["pack_id"]}, {"_id": 0, "draft_index": 1}, sort=[("draft_index", -1)]
    )
    next_index = (last["draft_index"] if last else 0) + 1
    source_label = source.get("name") or f"Draft {source['draft_index']}"
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": source["pack_id"],
        "draft_index": next_index,
        "status": "draft",
        "name": f"{source_label} (copy)",
        "source": source.get("source") or "manual",
        "items": source["items"],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pack_drafts.insert_one(doc)
    return _draft_out(doc)


class RenameDraftIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)


@router.patch("/drafts/{draft_id}", response_model=PackDraftOut)
async def rename_pack_draft(draft_id: str, payload: RenameDraftIn, _: dict = Depends(require_role("admin"))):
    name = payload.name.strip() if payload.name and payload.name.strip() else None
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"name": name}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_out(res)


async def _unpublish_item(pack_id: str, chapter_id: str, content_type: str, language: str) -> bool:
    """Removes one published (chapter, content type, language) slot -- plus any student
    progress/quiz_results referencing it -- from the contents collection. Never touches
    pack_drafts. Returns whether anything was actually live to remove."""
    existing = await db.contents.find_one({
        "pack_id": pack_id, "chapter_id": chapter_id, "content_type": content_type, "language": language,
    })
    if not existing:
        return False
    await db.contents.delete_one({"id": existing["id"]})
    await db.progress.delete_many({"content_id": existing["id"]})
    await db.quiz_results.delete_many({"content_id": existing["id"]})
    return True


async def _unpublish_draft_items(draft: dict) -> int:
    """Removes every item of a draft from the published contents collection, without
    touching the draft itself."""
    removed = 0
    for item in draft["items"]:
        if await _unpublish_item(draft["pack_id"], item["chapter_id"], item["content_type"], item["language"]):
            removed += 1
    return removed


@router.delete("/drafts/{draft_id}")
async def delete_pack_draft(draft_id: str, _: dict = Depends(require_role("admin"))):
    """Deletes a draft. Only ever touches pack_drafts -- this is the one place a draft is
    allowed to be deleted outright (Manual Content / Generate with AI's own 3-dot Delete
    and Mark-mode bulk delete), and it never reaches the published contents collection."""
    res = await db.pack_drafts.delete_one({"id": draft_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


class BulkDeleteDraftsIn(BaseModel):
    ids: List[str] = Field(min_length=1)


@router.post("/drafts/bulk-delete")
async def bulk_delete_pack_drafts(payload: BulkDeleteDraftsIn, _: dict = Depends(require_role("admin"))):
    res = await db.pack_drafts.delete_many({"id": {"$in": payload.ids}})
    return {"ok": True, "deleted_count": res.deleted_count}


async def _hide_drafts_from_review(ids: List[str]) -> None:
    await db.pack_drafts.update_many({"id": {"$in": ids}}, {"$set": {"hidden_from_review": True}})


@router.post("/drafts/{draft_id}/hide-from-review")
async def hide_pack_draft_from_review(draft_id: str, _: dict = Depends(require_role("admin"))):
    """Removes a draft from the Tutor Pack Publish review panel's list only -- an
    admin-only bookkeeping flag on pack_drafts. Never touches the draft's content, its
    status, the published contents collection, or its visibility in Manual Content /
    Generate with AI, which don't look at this flag at all. (Re)confirming the draft
    resets it, bringing the draft back into the review panel."""
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"hidden_from_review": True}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"ok": True}


class BulkUnpublishDraftsIn(BaseModel):
    ids: List[str] = Field(min_length=1)


@router.post("/drafts/bulk-unpublish")
async def bulk_unpublish_pack_drafts(payload: BulkUnpublishDraftsIn, _: dict = Depends(require_role("admin"))):
    drafts = await db.pack_drafts.find({"id": {"$in": payload.ids}}, {"_id": 0}).to_list(len(payload.ids))
    removed_from_students = 0
    for draft in drafts:
        removed_from_students += await _unpublish_draft_items(draft)
    await _hide_drafts_from_review(payload.ids)
    return {"ok": True, "removed_from_students": removed_from_students}


class UnpublishDraftItemIn(BaseModel):
    chapter_id: str
    content_type: str
    language: str


@router.post("/drafts/{draft_id}/items/unpublish", response_model=PackDraftOut)
async def unpublish_pack_draft_item(draft_id: str, payload: UnpublishDraftItemIn, _: dict = Depends(require_role("admin"))):
    """The (x) on a single content-type tag in the Tutor Pack Publish review pop-up.
    Removes that one item from the published contents collection (like _unpublish_item
    elsewhere) AND records it in this draft's own hidden_review_items, so the tag stays
    gone from the review pop-up across reloads -- without ever touching the draft's actual
    items, which Manual Content / Generate with AI keep showing exactly as authored.
    (Re)confirming the draft there clears hidden_review_items, bringing every tag back."""
    draft = await db.pack_drafts.find_one({"id": draft_id}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    await _unpublish_item(draft["pack_id"], payload.chapter_id, payload.content_type, payload.language)

    key = {"chapter_id": payload.chapter_id, "content_type": payload.content_type, "language": payload.language}
    hidden = draft.get("hidden_review_items") or []
    if key not in hidden:
        hidden = hidden + [key]
    res = await db.pack_drafts.find_one_and_update(
        {"id": draft_id}, {"$set": {"hidden_review_items": hidden}}, return_document=True, projection={"_id": 0}
    )
    return _draft_out(res)


UPLOAD_DIR = Path(__file__).parent / "uploads" / "mindmaps"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), _: dict = Depends(require_role("admin"))):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use PNG, JPEG, WEBP, or GIF.")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    ext = Path(file.filename or "").suffix or ".png"
    fname = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / fname).write_bytes(data)
    return {"url": f"/api/uploads/mindmaps/{fname}"}


SOURCE_PDF_DIR = Path(__file__).parent / "uploads" / "source_pdfs"
SOURCE_PDF_DIR.mkdir(parents=True, exist_ok=True)
MAX_PDF_BYTES = 15 * 1024 * 1024
MAX_PDF_PAGES = 60
_PAGE_NUMBER_RE = re.compile(r"[\divxlcIVXLC]{1,4}")


def _clean_extracted_pages(pages: List[List[str]]) -> str:
    """Strips stray page numbers and repeated running headers/footers that plain PDF
    text extraction pulls out as ordinary lines -- in whatever order they appear in
    the PDF's content stream, not visual reading order, which is why a page number
    or the book's running title can end up sitting next to a chapter heading."""
    num_pages = len(pages)
    line_counts = Counter()
    for page_lines in pages:
        for line in {ln.strip() for ln in page_lines if ln.strip()}:
            line_counts[line] += 1

    # A line repeated on most pages is a running header/footer, not real content.
    # Skip this heuristic for very short documents, where "most pages" is meaningless.
    repeat_threshold = max(2, num_pages // 2 + 1) if num_pages > 2 else num_pages + 1
    noisy = {line for line, count in line_counts.items() if count >= repeat_threshold}

    cleaned_pages = []
    for page_lines in pages:
        kept = [
            line.strip() for line in page_lines
            if line.strip() and line.strip() not in noisy and not _PAGE_NUMBER_RE.fullmatch(line.strip())
        ]
        if kept:
            cleaned_pages.append("\n".join(kept))
    return "\n\n".join(cleaned_pages)


@router.post("/extract-pdf")
async def extract_pdf_text(file: UploadFile = File(...), _: dict = Depends(require_role("admin"))):
    """Extracts plain text from an uploaded course-material PDF and keeps the PDF itself on
    disk, so it can be attached to a draft (viewable/removable later), not just its text."""
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF too large (max 15MB)")

    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
    except PdfReadError:
        raise HTTPException(status_code=400, detail="Could not read this PDF -- it may be corrupted or encrypted.")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise HTTPException(status_code=400, detail=f"PDF has too many pages (max {MAX_PDF_PAGES}).")

    pages = [(page.extract_text() or "").splitlines() for page in reader.pages]
    text = _clean_extracted_pages(pages)
    if len(text) < 10:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in this PDF -- it may be scanned/image-only.",
        )

    fname = f"{uuid.uuid4()}.pdf"
    (SOURCE_PDF_DIR / fname).write_bytes(data)
    return {"filename": file.filename, "text": text, "url": f"/api/uploads/source_pdfs/{fname}"}


# ---------- Shared list / publish / stats ----------

@router.get("/list", response_model=List[ContentOut])
async def list_content(pack_id: Optional[str] = None, only_published: bool = False, user: dict = Depends(get_current_user)):
    q: dict = {}
    if pack_id:
        q["pack_id"] = pack_id
    if only_published or user["role"] != "admin":
        q["published"] = True
    docs = await db.contents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ContentOut(**{k: d.get(k) for k in ContentOut.model_fields.keys()}) for d in docs]


@router.post("/{content_id}/publish")
async def publish(content_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.contents.update_one({"id": content_id}, {"$set": {"published": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/{content_id}")
async def delete_content(content_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.contents.delete_one({"id": content_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/{content_id}/complete")
async def mark_complete(content_id: str, user: dict = Depends(get_current_user)):
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Not found")
    await db.progress.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {"$setOnInsert": {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pack_id": content["pack_id"],
            "content_id": content_id,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    xp_result = await award_lesson_xp(user["id"], content["pack_id"], content_id, content.get("title") or "Lesson")
    bonus_result = await on_xp_earned(user["id"], content["pack_id"])
    return {"ok": True, "xp_awarded": xp_result["xp_awarded"] + bonus_result["xp_awarded"]}


@router.delete("/{content_id}/complete")
async def mark_incomplete(content_id: str, user: dict = Depends(get_current_user)):
    await db.progress.delete_one({"user_id": user["id"], "content_id": content_id})
    return {"ok": True}


def _normalize_short_answer(s: str) -> str:
    """Mirrors the frontend's exact-match fallback comparator: lowercase, strip
    punctuation, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", (s or "").lower(), flags=re.UNICODE)).strip()


class GradeShortAnswerIn(BaseModel):
    question_index: int = Field(ge=0)
    given_answer: str


class GradeShortAnswerOut(BaseModel):
    correct: bool
    graded_by: Literal["ai", "fallback"]
    provider: Optional[str] = None
    model: Optional[str] = None


@router.post("/{content_id}/grade-short-answer", response_model=GradeShortAnswerOut)
async def grade_short_answer(content_id: str, payload: GradeShortAnswerIn, user: dict = Depends(get_current_user)):
    """AI-graded short-answer scoring: a student's free-text answer rarely matches the
    reference answer's exact wording, so this asks the model whether it's substantively
    correct rather than doing a literal string comparison. Falls back to a normalized
    exact-match if every provider fails (no key configured, outage, etc.), rather than
    blocking the student's quiz on an AI call that can't currently succeed.

    Looks the question up server-side from the published content by index, rather than
    trusting question/correct_answer text from the client, so this can't be used to grade
    arbitrary text unrelated to an actual assigned quiz."""
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Not found")
    if content["content_type"] != "quiz":
        raise HTTPException(status_code=400, detail="Not a quiz")
    questions = (content.get("payload") or {}).get("questions", [])
    if payload.question_index >= len(questions):
        raise HTTPException(status_code=400, detail="Invalid question index")
    q = questions[payload.question_index]
    if q.get("type") != "short_answer":
        raise HTTPException(status_code=400, detail="Not a short-answer question")
    correct_answer = (q.get("correct_answer") or "").strip()
    if not correct_answer:
        raise HTTPException(status_code=422, detail="This question has no reference answer to grade against")

    given = (payload.given_answer or "").strip()
    if not given:
        return GradeShortAnswerOut(correct=False, graded_by="fallback")

    lang_hint = "The question and answers are in Bahasa Melayu." if content.get("language") == "bm" else "The question and answers are in English."
    user_text = f"{lang_hint}\n\nQuestion: {q['question']}\n\nReference answer: {correct_answer}\n\nStudent's answer: {given}"
    try:
        result = await call_router("short_answer_grading", user_text)
        correct = result["text"].strip().lower().startswith("true")
        return GradeShortAnswerOut(correct=correct, graded_by="ai", provider=result["provider"], model=result["model"])
    except HTTPException:
        correct = _normalize_short_answer(given) == _normalize_short_answer(correct_answer)
        return GradeShortAnswerOut(correct=correct, graded_by="fallback")


class QuizResultIn(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=0)


@router.post("/{content_id}/quiz-result")
async def submit_quiz_result(content_id: str, payload: QuizResultIn, user: dict = Depends(get_current_user)):
    content = await db.contents.find_one({"id": content_id, "published": True}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Not found")
    if content["content_type"] != "quiz":
        raise HTTPException(status_code=400, detail="Not a quiz")
    existing = await db.quiz_results.find_one({"user_id": user["id"], "content_id": content_id}, {"_id": 0, "attempts": 1})
    is_first_attempt = existing is None
    now = datetime.now(timezone.utc).isoformat()
    await db.quiz_results.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {
            "$set": {"score": payload.score, "total": payload.total, "submitted_at": now},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "pack_id": content["pack_id"],
                "content_id": content_id,
            },
            "$inc": {"attempts": 1},
        },
        upsert=True,
    )
    # A submitted quiz counts as completed, same as mark_complete.
    await db.progress.update_one(
        {"user_id": user["id"], "content_id": content_id},
        {"$setOnInsert": {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "pack_id": content["pack_id"],
            "content_id": content_id,
            "completed_at": now,
        }},
        upsert=True,
    )
    xp_result = await award_quiz_xp(
        user["id"], content["pack_id"], content_id, content.get("title") or "Quiz", payload.score, payload.total, is_first_attempt
    )
    bonus_result = await on_xp_earned(user["id"], content["pack_id"])
    return {"ok": True, "xp_awarded": xp_result["xp_awarded"] + bonus_result["xp_awarded"]}


@router.get("/progress")
async def get_progress(pack_id: str, user: dict = Depends(get_current_user)):
    docs = await db.progress.find({"user_id": user["id"], "pack_id": pack_id}, {"_id": 0, "content_id": 1}).to_list(500)
    quiz_docs = await db.quiz_results.find(
        {"user_id": user["id"], "pack_id": pack_id}, {"_id": 0, "content_id": 1, "score": 1, "total": 1, "attempts": 1}
    ).to_list(500)
    return {
        "completed_ids": [d["content_id"] for d in docs],
        "quiz_scores": {d["content_id"]: {"score": d["score"], "total": d["total"], "attempts": d.get("attempts", 1)} for d in quiz_docs},
    }


@router.get("/stats")
async def stats(_: dict = Depends(require_role("admin"))):
    total = await db.contents.count_documents({})
    published = await db.contents.count_documents({"published": True})
    students = await db.users.count_documents({"role": "student"})
    parents = await db.users.count_documents({"role": "parent"})
    packs = await db.packs.count_documents({})
    return {
        "total_content": total,
        "published_content": published,
        "students": students,
        "parents": parents,
        "packs": packs,
    }
