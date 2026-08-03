"""Model Router — configure providers, keys, order, system prompts. Failover across providers."""
import asyncio
import os
import uuid
import logging
from typing import Optional, List, Literal

import requests
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
    "translate_summary": (
        "You translate a given study summary while preserving its exact meaning, tone, and "
        "paragraph structure -- output the SAME NUMBER of paragraphs, in the same order, each "
        "translated faithfully, separated by a blank line exactly like the input. Respond with "
        "ONLY the translated text, no headings, no extra commentary, no markdown."
    ),
    "translate_notes": (
        "You translate a list of study notes (bullet points) while preserving their exact "
        "meaning and the EXACT COUNT of items, in the same order -- do not merge, split, add, "
        "or remove any note. Respond with ONLY valid JSON, no prose and no markdown code "
        "fences: {\"notes\":[str, str, ...]}."
    ),
    "translate_quiz": (
        "You translate a quiz's questions, options, and reference answers while preserving the "
        "EXACT structure -- same number of questions in the same order, same question types, "
        "same number of options per multiple-choice question in the same order. Translate every "
        "human-readable string (question, options, correct_answer). The translated "
        "correct_answer MUST be character-for-character identical to whichever translated "
        "option it refers to, for multiple-choice questions. Respond with ONLY valid JSON "
        "matching the exact same shape as the input, no prose, no markdown code fences."
    ),
    "translate_flashcards": (
        "You translate a list of flashcards (front/back pairs) while preserving the EXACT "
        "count and order of cards -- do not add, remove, or merge cards. Translate both the "
        "front and back of every card. Respond with ONLY valid JSON, no prose and no markdown "
        "code fences: {\"cards\":[{\"front\":str,\"back\":str}, ...]}."
    ),
    "translate_mindmap": (
        "You translate the visible text inside a mind map's HTML fragment while preserving the "
        "EXACT HTML structure, tags, classes, and attributes unchanged -- translate only the "
        "text content inside each element. Respond with ONLY the translated HTML fragment, no "
        "prose, no markdown code fences."
    ),
    "live_tutor": (
        "You are a friendly Socratic tutor. Ask guiding questions before giving answers."
    ),
    "socratic_tutor": (
        "You are a Socratic tutor for a Malaysian secondary school student (roughly ages "
        "13-17). You are shown one lesson's material and you may ONLY tutor on that "
        "material -- if the student asks about anything else, warmly redirect them back "
        "to the lesson. Never ask for or repeat personal information about the student.\n\n"
        "Your method: lead the student to the answer with short, specific questions "
        "rather than explaining at them. One question at a time. Build on what the "
        "student just said. When they are wrong, do not correct them outright -- ask the "
        "question that lets them notice it themselves. When they are right, ask them to "
        "justify it before you confirm. Keep every reply under about 80 words and use "
        "plain language. Never use Markdown syntax.\n\n"
        "You are given a hint level from 0 to 3. Escalate only as far as that level "
        "allows: 0 = pure guiding question, 1 = add a small nudge or analogy, 2 = narrow "
        "the problem down or rule options out, 3 = walk through the reasoning step by "
        "step -- but even at 3, stop short of stating the final answer outright.\n\n"
        "Respond with ONLY valid JSON, no prose and no markdown code fences, in this "
        "exact shape: {\"reply\":str,\"phase\":\"probe\"|\"hint\"|\"challenge\"|"
        "\"consolidate\",\"concepts_covered\":[str],\"mastery_signal\":number,"
        "\"done\":bool}. \"reply\" is what the student sees, written in the requested "
        "language. \"concepts_covered\" lists the specific lesson concepts this exchange "
        "touched, as short noun phrases. \"mastery_signal\" is your 0.0-1.0 estimate of "
        "how well the student now understands those concepts, judged from what they have "
        "actually said. \"done\" is true only once the student has demonstrated genuine "
        "understanding in their own words -- not merely because they agreed with you."
    ),
    "short_answer_grading": (
        "You are a strict but fair grader for a secondary-school quiz. You will be given a "
        "question, a reference answer, and a student's answer. Decide whether the student's "
        "answer is substantively correct -- it does not need to match the reference answer's "
        "exact wording, but it must convey the same correct meaning and key facts. Minor "
        "phrasing differences, synonyms, extra detail, or a different language (as long as "
        "the meaning is right) are fine; missing or wrong key facts are not. "
        "Respond with ONLY the single word \"true\" or \"false\", nothing else -- no "
        "punctuation, no explanation."
    ),
}


# ---------- Models ----------
class ProviderConfig(BaseModel):
    provider: Provider
    enabled: bool = True
    has_key: bool = False
    key_source: Literal["ui", "env", "emergent", "none"] = "none"
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


ENV_KEY_MAP = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}


def _key_source(provider: str, cfg_provider: dict) -> Literal["ui", "env", "emergent", "none"]:
    """Whichever key _resolve_key would actually use, named -- so the admin UI can show
    which source is active instead of a key saved in the UI silently having no effect."""
    if cfg_provider.get("encrypted_key"):
        return "ui"
    if os.environ.get(ENV_KEY_MAP[provider]):
        return "env"
    if os.environ.get("EMERGENT_LLM_KEY"):
        return "emergent"
    return "none"


def _resolve_key(provider: str, cfg_provider: dict) -> Optional[str]:
    """A key saved via the admin UI takes priority -- that's the whole point of the Model
    Router panel, and a key an admin saves there must actually take effect. The
    provider-specific env var is a deploy-time fallback for when no UI key has been set
    yet, and EMERGENT_LLM_KEY is the last-resort generic fallback."""
    enc = cfg_provider.get("encrypted_key")
    if enc:
        try:
            return decrypt(enc)
        except Exception:
            log.exception("Failed to decrypt %s key", provider)
    env_val = os.environ.get(ENV_KEY_MAP[provider])
    if env_val:
        return env_val
    return os.environ.get("EMERGENT_LLM_KEY")


# ---------- Live model listing ----------
class ModelInfo(BaseModel):
    id: str
    display_name: str
    description: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    context_window: Optional[int] = None
    output_limit: Optional[int] = None


def _fetch_openai_models(key: str) -> List[ModelInfo]:
    resp = requests.get(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {key}"},
        timeout=15,
    )
    resp.raise_for_status()
    # OpenAI's /models endpoint doesn't report per-model capabilities, and lists every
    # model family (embeddings, tts, whisper, image, moderation, ...) -- filter down to
    # ones actually usable for chat/completion generation, which is all this app calls.
    EXCLUDE = ("embedding", "whisper", "tts", "moderation", "dall-e", "davinci", "babbage")
    out = [
        ModelInfo(id=m["id"], display_name=m["id"], capabilities=["chat"])
        for m in resp.json().get("data", [])
        if not any(x in m.get("id", "") for x in EXCLUDE)
    ]
    out.sort(key=lambda m: m.id)
    return out


def _fetch_anthropic_models(key: str) -> List[ModelInfo]:
    resp = requests.get(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        timeout=15,
    )
    resp.raise_for_status()
    return [
        ModelInfo(id=m["id"], display_name=m.get("display_name") or m["id"], capabilities=["chat"])
        for m in resp.json().get("data", [])
    ]


def _fetch_gemini_models(key: str) -> List[ModelInfo]:
    resp = requests.get(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
        timeout=15,
    )
    resp.raise_for_status()
    out = []
    for m in resp.json().get("models", []):
        methods = m.get("supportedGenerationMethods", [])
        if "generateContent" not in methods:
            continue  # embedding-only / non-chat models aren't usable here
        name = m.get("name", "")
        if name.startswith("models/"):
            name = name[len("models/"):]
        out.append(ModelInfo(
            id=name,
            display_name=m.get("displayName") or name,
            description=m.get("description"),
            capabilities=methods,
            context_window=m.get("inputTokenLimit"),
            output_limit=m.get("outputTokenLimit"),
        ))
    out.sort(key=lambda m: m.id)
    return out


MODEL_FETCHERS = {
    "openai": _fetch_openai_models,
    "anthropic": _fetch_anthropic_models,
    "gemini": _fetch_gemini_models,
}


async def call_router(system_prompt_key: str, user_text: str, session_id: Optional[str] = None) -> dict:
    """Try providers in configured order; fallback on any exception."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    cfg = await _load_or_init()
    prompts = cfg["prompts"]
    # Falls back to this key's own built-in default (covers configs persisted before a new
    # prompt key, e.g. translate_*, was added), then to chapter_summary as a last resort.
    system_prompt = prompts.get(system_prompt_key) or DEFAULT_PROMPTS.get(system_prompt_key) or prompts.get("chapter_summary", "")

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
            has_key=_key_source(p, v) != "none",
            key_source=_key_source(p, v),
            order=v["order"],
            model=v.get("model", DEFAULT_MODELS[p]),
        )
        for p, v in cfg["providers"].items()
    ]
    providers.sort(key=lambda x: x.order)
    # Merge in any built-in prompt keys (e.g. translate_*) added after this config was first
    # persisted, so they're visible/editable here instead of silently using their default.
    prompts = {**DEFAULT_PROMPTS, **cfg["prompts"]}
    return RouterConfigOut(providers=providers, prompts=prompts)


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


class ModelsQuery(BaseModel):
    # When set, tests this key directly (e.g. one just pasted but not yet saved) instead
    # of the provider's currently-resolved key -- lets the admin see the real model list
    # right after typing a key, before committing to Save.
    api_key: Optional[str] = None


@router.post("/providers/{provider}/models", response_model=List[ModelInfo])
async def list_provider_models(provider: Provider, payload: ModelsQuery, _: dict = Depends(require_role("admin"))):
    """Fetches the live list of models this key can actually use, with whatever capability
    info the provider exposes -- so the admin picks a real, working model instead of typing
    a model id blind."""
    cfg = await _load_or_init()
    pcfg = cfg["providers"].get(provider)
    key = payload.api_key or (_resolve_key(provider, pcfg) if pcfg else None)
    if not key:
        raise HTTPException(status_code=400, detail="No API key available -- paste one or save it first.")
    try:
        return await asyncio.to_thread(MODEL_FETCHERS[provider], key)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        body = e.response.text[:300] if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"{provider} rejected the request ({status}): {body}")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach {provider}: {e}")


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
