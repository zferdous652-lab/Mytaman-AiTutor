"""Model Router telemetry — per-call records, aggregates, and TPM limits.

IMPORTANT — what is measured vs estimated
-----------------------------------------
The chat SDK this app routes through (`emergentintegrations`' LlmChat) returns only the
completion *string*; it exposes no usage block. So:

  * measured exactly  -- request counts, which model served each call, latency, errors
  * ESTIMATED         -- input/output token counts, and therefore cost

Token counts here come from a characters-per-token heuristic, never from the provider's
own accounting, and every stored record carries `tokens_estimated: True` so the UI can
label them honestly rather than presenting them as billing-grade numbers. Provider-side
"cached tokens" are not obtainable through this wrapper at all and are deliberately not
invented -- the API reports them as unavailable instead of as zero, which would read as a
real measurement of "no caching".

If the SDK ever starts returning a usage block, feed it into `record_call(...)` and set
`tokens_estimated=False`; nothing else in the pipeline has to change.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import require_role

log = logging.getLogger("router_metrics")

router = APIRouter(prefix="/router", tags=["model_router"])

# Rough characters-per-token ratio. English/Malay prose sits near 4; this is only ever
# used for estimates that are labelled as such in the UI and for TPM throttling, where
# being approximately right is enough to stop a runaway loop.
CHARS_PER_TOKEN = 4


def estimate_tokens(text: Optional[str]) -> int:
    if not text:
        return 0
    return max(1, round(len(text) / CHARS_PER_TOKEN))


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_indexes(target_db):
    """router_calls grows once per AI request, so it needs indexes for the dashboard's
    time-window queries and for the per-minute TPM lookup on the hot path."""
    await target_db.router_calls.create_index([("ts", -1)])
    await target_db.router_calls.create_index([("provider", 1), ("ts", -1)])


async def record_call(
    *,
    provider: str,
    model: str,
    prompt_key: str,
    latency_ms: int,
    input_text: str = "",
    output_text: str = "",
    ok: bool = True,
    error: Optional[str] = None,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    tokens_estimated: bool = True,
) -> None:
    """Records one provider attempt. Called for failures as well as successes -- an error
    rate is meaningless if only the successes are written down. Never raises: telemetry
    must not be able to break content generation."""
    try:
        in_tok = input_tokens if input_tokens is not None else estimate_tokens(input_text)
        out_tok = output_tokens if output_tokens is not None else estimate_tokens(output_text)
        await db.router_calls.insert_one({
            "id": str(uuid.uuid4()),
            "ts": _now().isoformat(),
            "provider": provider,
            "model": model,
            "prompt_key": prompt_key,
            "latency_ms": latency_ms,
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "tokens_estimated": tokens_estimated,
            "ok": ok,
            "error": error,
        })
    except Exception:  # noqa: BLE001
        log.exception("Failed to record router call telemetry")


async def tokens_last_minute(provider: str) -> int:
    """Estimated tokens this provider has processed in the trailing 60s, used for TPM."""
    since = (_now() - timedelta(seconds=60)).isoformat()
    cur = db.router_calls.find(
        {"provider": provider, "ts": {"$gte": since}},
        {"_id": 0, "input_tokens": 1, "output_tokens": 1},
    )
    total = 0
    async for d in cur:
        total += (d.get("input_tokens") or 0) + (d.get("output_tokens") or 0)
    return total


async def tpm_would_exceed(provider: str, cfg: dict, incoming_tokens: int) -> Optional[int]:
    """Returns the configured cap when sending `incoming_tokens` now would breach this
    provider's tokens-per-minute limit, else None. A provider over its cap is skipped and
    the router fails over to the next one, rather than erroring the whole request."""
    cap = ((cfg.get("limits") or {}).get(provider) or {}).get("tpm")
    if not cap:
        return None
    used = await tokens_last_minute(provider)
    return cap if used + incoming_tokens > cap else None


# ---------- Pricing ----------
def _price_for(model: str, pricing: dict) -> Optional[dict]:
    return (pricing or {}).get(model)


def _cost_usd(model: str, in_tok: int, out_tok: int, pricing: dict) -> Optional[float]:
    """Cost is None -- not 0 -- when the admin hasn't entered rates for a model. Rates
    change per provider and per tier, so guessing them would put invented money on screen."""
    p = _price_for(model, pricing)
    if not p:
        return None
    return (in_tok / 1_000_000) * float(p.get("input_per_1m") or 0) + \
           (out_tok / 1_000_000) * float(p.get("output_per_1m") or 0)


def _percentile(values: List[int], pct: float) -> int:
    if not values:
        return 0
    s = sorted(values)
    k = max(0, min(len(s) - 1, round((pct / 100) * (len(s) - 1))))
    return s[k]


# ---------- API models ----------
class ModelStat(BaseModel):
    provider: str
    model: str
    requests: int
    share_pct: float
    ok: int
    errors: int
    error_rate: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    p50_ms: int
    p95_ms: int
    cost_usd: Optional[float] = None


class MetricsTotals(BaseModel):
    requests: int
    ok: int
    errors: int
    error_rate: float
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cached_tokens: Optional[int] = None  # always None -- see module docstring
    cost_usd: Optional[float] = None
    p50_ms: int
    p95_ms: int


class MetricsOut(BaseModel):
    window_hours: int
    totals: MetricsTotals
    by_model: List[ModelStat]
    tokens_estimated: bool
    pricing_configured: bool


class CallLog(BaseModel):
    id: str
    ts: str
    provider: str
    model: str
    prompt_key: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    ok: bool
    error: Optional[str] = None


class LimitsUpdate(BaseModel):
    # {provider: tokens-per-minute or null to clear}
    limits: dict = Field(default_factory=dict)


class PricingUpdate(BaseModel):
    # {model_id: {input_per_1m: float, output_per_1m: float}}
    pricing: dict = Field(default_factory=dict)


# ---------- Endpoints ----------
@router.get("/metrics", response_model=MetricsOut)
async def get_metrics(hours: int = 24, _: dict = Depends(require_role("admin"))):
    hours = max(1, min(hours, 24 * 30))
    since = (_now() - timedelta(hours=hours)).isoformat()
    cfg = await db.model_router.find_one({"id": "config"}, {"_id": 0}) or {}
    pricing = cfg.get("pricing") or {}

    docs = await db.router_calls.find({"ts": {"$gte": since}}, {"_id": 0}).to_list(20000)

    groups: dict = {}
    for d in docs:
        k = (d.get("provider"), d.get("model"))
        g = groups.setdefault(k, {"requests": 0, "ok": 0, "errors": 0, "in": 0, "out": 0, "lat": []})
        g["requests"] += 1
        g["ok" if d.get("ok") else "errors"] += 1
        g["in"] += d.get("input_tokens") or 0
        g["out"] += d.get("output_tokens") or 0
        # Latency of a failed attempt is time-to-error, not time-to-answer -- averaging the
        # two together would quietly flatter or distort the served-request latency.
        if d.get("ok"):
            g["lat"].append(d.get("latency_ms") or 0)

    total_requests = len(docs)
    by_model = []
    for (provider, model), g in groups.items():
        by_model.append(ModelStat(
            provider=provider or "unknown",
            model=model or "unknown",
            requests=g["requests"],
            share_pct=round(100 * g["requests"] / total_requests, 1) if total_requests else 0.0,
            ok=g["ok"],
            errors=g["errors"],
            error_rate=round(100 * g["errors"] / g["requests"], 1) if g["requests"] else 0.0,
            input_tokens=g["in"],
            output_tokens=g["out"],
            total_tokens=g["in"] + g["out"],
            p50_ms=_percentile(g["lat"], 50),
            p95_ms=_percentile(g["lat"], 95),
            cost_usd=_cost_usd(model, g["in"], g["out"], pricing),
        ))
    by_model.sort(key=lambda m: m.requests, reverse=True)

    all_lat = [d.get("latency_ms") or 0 for d in docs if d.get("ok")]
    tot_in = sum(d.get("input_tokens") or 0 for d in docs)
    tot_out = sum(d.get("output_tokens") or 0 for d in docs)
    errors = sum(1 for d in docs if not d.get("ok"))
    costs = [m.cost_usd for m in by_model if m.cost_usd is not None]

    return MetricsOut(
        window_hours=hours,
        totals=MetricsTotals(
            requests=total_requests,
            ok=total_requests - errors,
            errors=errors,
            error_rate=round(100 * errors / total_requests, 1) if total_requests else 0.0,
            input_tokens=tot_in,
            output_tokens=tot_out,
            total_tokens=tot_in + tot_out,
            cached_tokens=None,
            cost_usd=round(sum(costs), 4) if costs else None,
            p50_ms=_percentile(all_lat, 50),
            p95_ms=_percentile(all_lat, 95),
        ),
        by_model=by_model,
        tokens_estimated=True,
        pricing_configured=bool(pricing),
    )


@router.get("/logs", response_model=List[CallLog])
async def get_logs(limit: int = 50, _: dict = Depends(require_role("admin"))):
    limit = max(1, min(limit, 500))
    docs = await db.router_calls.find({}, {"_id": 0}).sort("ts", -1).to_list(limit)
    return [CallLog(**{k: d.get(k) for k in CallLog.model_fields.keys()}) for d in docs]


@router.put("/limits")
async def update_limits(payload: LimitsUpdate, _: dict = Depends(require_role("admin"))):
    cfg = await db.model_router.find_one({"id": "config"}, {"_id": 0})
    if not cfg:
        raise HTTPException(status_code=404, detail="Router config not initialised")
    limits = cfg.get("limits") or {}
    for provider, tpm in payload.limits.items():
        if tpm in (None, "", 0):
            limits.pop(provider, None)
        else:
            try:
                limits[provider] = {"tpm": max(1, int(tpm))}
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail=f"Invalid TPM for {provider}")
    await db.model_router.update_one({"id": "config"}, {"$set": {"limits": limits}})
    return {"ok": True, "limits": limits}


@router.put("/pricing")
async def update_pricing(payload: PricingUpdate, _: dict = Depends(require_role("admin"))):
    cfg = await db.model_router.find_one({"id": "config"}, {"_id": 0})
    if not cfg:
        raise HTTPException(status_code=404, detail="Router config not initialised")
    pricing = cfg.get("pricing") or {}
    for model, rates in payload.pricing.items():
        if rates is None:
            pricing.pop(model, None)
            continue
        try:
            pricing[model] = {
                "input_per_1m": float(rates.get("input_per_1m") or 0),
                "output_per_1m": float(rates.get("output_per_1m") or 0),
            }
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(status_code=422, detail=f"Invalid pricing for {model}")
    await db.model_router.update_one({"id": "config"}, {"$set": {"pricing": pricing}})
    return {"ok": True, "pricing": pricing}
