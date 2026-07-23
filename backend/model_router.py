"""Model Router — configure providers, keys, order, system prompts. Failover across providers."""
import os
import uuid
import logging
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db, encrypt, decrypt
from auth import require_role

log = logging.getLogger("model_router")

router = APIRouter(prefix="/router", tags=["model_router"])

Provider = Literal["openai", "anthropic", "gemini"]
DEFAULT_MODELS = {
    "openai": "gpt-5.4",
    "anthropic": "claude-sonnet-4-6",
    "gemini": "gemini-3-flash-preview",
}
DEFAULT_ORDER: List[Provider] = ["openai", "anthropic", "gemini"]

DEFAULT_PROMPTS = {
    "chapter_summary": (
        "You are an expert educator. Produce a concise, well-structured chapter summary "
        "with 5-8 key bullet points, using clear language suitable for secondary students. "
        "Respond in plain text only -- no Markdown syntax (no #, *, **, or code fences); "
        "write plain sentences, using a simple \"- \" at the start of a line for each bullet point."
    ),
    "quiz_generation": (
        "You are a quiz author for secondary school students. Generate 5-8 questions for the "
        "given chapter, mixing multiple-choice, true/false, and short-answer types. "
        "Respond with ONLY valid JSON, no prose and no markdown code fences, in this exact shape: "
        "{\"questions\":[{\"type\":\"mcq\"|\"true_false\"|\"short_answer\",\"question\":str,"
        "\"options\":[str,str,str,str],\"correct_answer\":str}]}. "
        "\"options\" is required only when type is \"mcq\" (at least 2 entries) and correct_answer "
        "must exactly match one of them. For \"true_false\", correct_answer must be exactly "
        "\"true\" or \"false\". For \"short_answer\", options may be omitted."
    ),
    "flashcard_generation": (
        "You are a flashcard author. Generate 8-12 flashcards for the given chapter. "
        "Respond with ONLY valid JSON, no prose and no markdown code fences: "
        "{\"cards\":[{\"front\":str,\"back\":str}]}"
    ),
    "mindmap_generation": (
        "You produce a mind map for the given chapter as a small nested HTML fragment -- NOT a "
        "full page. Respond with ONLY the HTML, no prose, no markdown code fences, no <html>/<head>/"
        "<body> tags. Use ONLY these three class names, nested like this:\n"
        "<div class=\"mindmap-root\">\n"
        "  <div class=\"mindmap-node\">Central Topic</div>\n"
        "  <div class=\"mindmap-branch\">\n"
        "    <div class=\"mindmap-node\">Branch A</div>\n"
        "    <div class=\"mindmap-leaf\">Idea 1</div>\n"
        "    <div class=\"mindmap-leaf\">Idea 2</div>\n"
        "  </div>\n"
        "  <div class=\"mindmap-branch\">\n"
        "    <div class=\"mindmap-node\">Branch B</div>\n"
        "    <div class=\"mindmap-leaf\">Idea 3</div>\n"
        "  </div>\n"
        "</div>\n"
        "Rules: exactly one mindmap-root wrapping exactly one mindmap-node (the central topic) "
        "followed by 4-7 mindmap-branch siblings. Each mindmap-branch starts with its own "
        "mindmap-node (the branch topic) followed by 2-4 mindmap-leaf items (short phrases, a few "
        "words each) or, for deeper structure, another nested mindmap-branch instead of leaves. "
        "Keep the whole tree to at most 3 levels deep. Do not use any other tags, attributes, "
        "inline styles, scripts, or class names."
    ),
    "notes_generation": (
        "You produce structured study notes for the given chapter as a flat list of concise, "
        "self-contained bullet points (not paragraphs, not nested headings). Respond with ONLY "
        "valid JSON, no prose and no markdown code fences: {\"notes\":[str, str, ...]}. "
        "Generate 6-12 notes."
    ),
    "live_tutor": (
        "You are a friendly Socratic tutor. Ask guiding questions before giving answers."
    ),
}


# ---------- Models ----------
class ProviderConfig(BaseModel):
    provider: Provider
    enabled: bool = True
    has_key: bool = False
    order: int
    model: str


class RouterConfigOut(BaseModel):
    providers: List[ProviderConfig]
    prompts: dict


class ProviderUpdate(BaseModel):
    enabled: Optional[bool] = None
    api_key: Optional[str] = None  # if empty string -> remove
    model: Optional[str] = None


class OrderUpdate(BaseModel):
    order: List[Provider]


class PromptUpdate(BaseModel):
    prompts: dict = Field(default_factory=dict)


# ---------- Helpers ----------
async def _load_or_init():
    doc = await db.model_router.find_one({"id": "config"}, {"_id": 0})
    if doc:
        return doc
    doc = {
        "id": "config",
        "providers": {
            p: {"enabled": True, "encrypted_key": None, "order": i, "model": DEFAULT_MODELS[p]}
            for i, p in enumerate(DEFAULT_ORDER)
        },
        "prompts": DEFAULT_PROMPTS.copy(),
    }
    await db.model_router.insert_one(doc)
    return doc


def _resolve_key(provider: str, cfg_provider: dict) -> Optional[str]:
    """Env var overrides UI-entered key. Fallback to EMERGENT_LLM_KEY."""
    env_map = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}
    env_val = os.environ.get(env_map[provider])
    if env_val:
        return env_val
    enc = cfg_provider.get("encrypted_key")
    if enc:
        try:
            return decrypt(enc)
        except Exception:
            log.exception("Failed to decrypt %s key", provider)
    return os.environ.get("EMERGENT_LLM_KEY")


async def call_router(system_prompt_key: str, user_text: str, session_id: Optional[str] = None) -> dict:
    """Try providers in configured order; fallback on any exception."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    cfg = await _load_or_init()
    prompts = cfg["prompts"]
    system_prompt = prompts.get(system_prompt_key, prompts.get("chapter_summary", ""))

    ordered = sorted(
        [(p, v) for p, v in cfg["providers"].items() if v.get("enabled")],
        key=lambda kv: kv[1].get("order", 999),
    )
    if not ordered:
        raise HTTPException(status_code=500, detail="No enabled AI providers")

    errors = []
    for provider, pcfg in ordered:
        key = _resolve_key(provider, pcfg)
        if not key:
            errors.append(f"{provider}: no key available")
            continue
        try:
            sid = session_id or str(uuid.uuid4())
            chat = LlmChat(api_key=key, session_id=sid, system_message=system_prompt).with_model(
                provider, pcfg.get("model", DEFAULT_MODELS[provider])
            )
            resp = await chat.send_message(UserMessage(text=user_text))
            text = resp if isinstance(resp, str) else str(resp)
            return {"provider": provider, "model": pcfg.get("model", DEFAULT_MODELS[provider]), "text": text}
        except Exception as e:  # noqa: BLE001
            log.warning("Provider %s failed: %s", provider, e)
            errors.append(f"{provider}: {e}")
            continue

    raise HTTPException(status_code=502, detail={"message": "All providers failed", "errors": errors})


# ---------- Endpoints ----------
@router.get("/config", response_model=RouterConfigOut)
async def get_config(_: dict = Depends(require_role("admin"))):
    cfg = await _load_or_init()
    providers = [
        ProviderConfig(
            provider=p,
            enabled=v["enabled"],
            has_key=bool(v.get("encrypted_key")) or bool(os.environ.get(
                {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}[p]
            )) or bool(os.environ.get("EMERGENT_LLM_KEY")),
            order=v["order"],
            model=v.get("model", DEFAULT_MODELS[p]),
        )
        for p, v in cfg["providers"].items()
    ]
    providers.sort(key=lambda x: x.order)
    return RouterConfigOut(providers=providers, prompts=cfg["prompts"])


@router.patch("/providers/{provider}")
async def update_provider(provider: Provider, payload: ProviderUpdate, _: dict = Depends(require_role("admin"))):
    cfg = await _load_or_init()
    p = cfg["providers"].get(provider)
    if not p:
        raise HTTPException(status_code=404, detail="Unknown provider")
    if payload.enabled is not None:
        p["enabled"] = payload.enabled
    if payload.model is not None:
        p["model"] = payload.model
    if payload.api_key is not None:
        p["encrypted_key"] = encrypt(payload.api_key) if payload.api_key else None
    await db.model_router.update_one({"id": "config"}, {"$set": {f"providers.{provider}": p}})
    return {"ok": True}


@router.post("/order")
async def update_order(payload: OrderUpdate, _: dict = Depends(require_role("admin"))):
    cfg = await _load_or_init()
    if sorted(payload.order) != sorted(cfg["providers"].keys()):
        raise HTTPException(status_code=400, detail="Order must contain exactly the same providers")
    updates = {}
    for i, p in enumerate(payload.order):
        updates[f"providers.{p}.order"] = i
    await db.model_router.update_one({"id": "config"}, {"$set": updates})
    return {"ok": True}


@router.put("/prompts")
async def update_prompts(payload: PromptUpdate, _: dict = Depends(require_role("admin"))):
    cfg = await _load_or_init()
    merged = {**cfg["prompts"], **payload.prompts}
    await db.model_router.update_one({"id": "config"}, {"$set": {"prompts": merged}})
    return {"ok": True, "prompts": merged}
