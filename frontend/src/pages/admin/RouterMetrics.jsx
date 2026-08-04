import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, ChevronDown, Clock, Coins, Gauge, Info, RefreshCw, Hash } from "lucide-react";
import { api } from "@/lib/api";

// Categorical slots 1-3 of the validated palette, dark steps. Three is the documented
// all-pairs cap for this palette, so a 4th+ model folds into "Other" rather than inventing
// a hue. Validated against this panel's card surface (#0a0514): worst all-pairs CVD dE 9.4,
// normal-vision dE 20.9, all >= 3:1 contrast.
const SERIES = ["#3987e5", "#d95926", "#199e70"];
const OTHER = "#6b7280";
const IN_COLOR = SERIES[0];   // input tokens
const OUT_COLOR = SERIES[1];  // output tokens

const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
];

const nf = new Intl.NumberFormat();
const fmtInt = (n) => nf.format(Math.round(n || 0));
const fmtTokens = (n) => {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms || 0)}ms`);
const fmtUsd = (v) => `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`;

// A hero number, not a chart -- a single magnitude reads faster as text than as a plot.
const StatTile = ({ icon: Icon, label, value, sub, tone = "default" }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-4">
    <div className="flex items-center gap-2 text-white/50">
      <Icon size={13} className={tone === "warn" ? "text-[#ffb020]" : "text-[#00f0ff]"} />
      <span className="text-[10px] uppercase tracking-[0.18em]">{label}</span>
    </div>
    <div className={`mt-2 font-display text-2xl tracking-tight ${tone === "warn" ? "text-[#ffb020]" : "text-white"}`}>
      {value}
    </div>
    {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
  </div>
);

// Config/detail panels collapse so the observability read stays at the top of the page.
// `summary` keeps the collapsed header informative -- how many caps or rates are set --
// so the section still reports its state without being opened.
const CollapsibleCard = ({ title, summary, open, onToggle, testId, children }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-sm text-white font-medium">{title}</span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] text-white/40">
        {summary}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </span>
    </button>
    {open && <div className="mt-4">{children}</div>}
  </div>
);

const Legend = ({ items }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
        {it.label}
      </span>
    ))}
  </div>
);

// Share of requests per model. Bar, because the job is comparing magnitudes across a
// handful of named categories.
const TrafficBreakdown = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.requests), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} title={`${r.model} — ${fmtInt(r.requests)} requests (${r.share_pct}%)`}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-xs text-white/80 truncate font-mono">{r.model}</span>
            <span className="text-xs text-white/50 shrink-0 tabular-nums">
              {r.share_pct}% · {fmtInt(r.requests)}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-[4px] bg-white/[0.05] overflow-hidden">
            <div
              className="h-full rounded-[4px] transition-[width] duration-300"
              style={{ width: `${(r.requests / max) * 100}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Input vs output tokens per model. Stacked, with a 2px surface gap between segments so
// the split stays readable at small widths.
const TokenDistribution = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.total_tokens), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const inPct = (r.input_tokens / max) * 100;
        const outPct = (r.output_tokens / max) * 100;
        return (
          <div key={r.key} title={`${r.model} — in ${fmtInt(r.input_tokens)} / out ${fmtInt(r.output_tokens)} tokens (est.)`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs text-white/80 truncate font-mono">{r.model}</span>
              <span className="text-xs text-white/50 shrink-0 tabular-nums">{fmtTokens(r.total_tokens)}</span>
            </div>
            {/* Zero-width segments are skipped rather than rendered at 0% -- an empty
                segment still contributes the 2px flex gap, leaving a stray notch at the
                start of a bar that has only output tokens (or only input). */}
            <div className="flex h-2.5 w-full items-stretch gap-[2px] rounded-[4px] bg-white/[0.05] overflow-hidden">
              {r.input_tokens > 0 && (
                <div className="rounded-l-[4px] transition-[width] duration-300" style={{ width: `${inPct}%`, background: IN_COLOR }} />
              )}
              {r.output_tokens > 0 && (
                <div className="rounded-r-[4px] transition-[width] duration-300" style={{ width: `${outPct}%`, background: OUT_COLOR }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RouterMetrics = ({ providers = [], config }) => {
  const [hours, setHours] = useState(24);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState({});
  const [pricing, setPricing] = useState({});
  const [showLogs, setShowLogs] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([
        api.get(`/router/metrics?hours=${hours}`),
        api.get("/router/logs?limit=50"),
      ]);
      setMetrics(m.data);
      setLogs(l.data);
    } catch {
      toast.error("Could not load router metrics");
    }
    setLoading(false);
  }, [hours]);

  useEffect(() => { load(); }, [load]);

  // Seed the editable limit/pricing fields from whatever the router config already has.
  useEffect(() => {
    if (!config) return;
    const nextLimits = {};
    Object.entries(config.limits || {}).forEach(([p, v]) => { nextLimits[p] = v?.tpm ?? ""; });
    setLimits(nextLimits);
    const nextPricing = {};
    Object.entries(config.pricing || {}).forEach(([m, v]) => {
      nextPricing[m] = { input_per_1m: v?.input_per_1m ?? "", output_per_1m: v?.output_per_1m ?? "" };
    });
    setPricing(nextPricing);
  }, [config]);

  const saveLimits = async () => {
    const payload = {};
    Object.entries(limits).forEach(([p, v]) => { payload[p] = v === "" ? null : Number(v); });
    await api.put("/router/limits", { limits: payload });
    toast.success("Token rate limits saved");
  };

  const savePricing = async () => {
    const payload = {};
    Object.entries(pricing).forEach(([m, v]) => {
      if (v?.input_per_1m === "" && v?.output_per_1m === "") return;
      payload[m] = { input_per_1m: Number(v.input_per_1m || 0), output_per_1m: Number(v.output_per_1m || 0) };
    });
    await api.put("/router/pricing", { pricing: payload });
    toast.success("Pricing saved");
    load();
  };

  if (loading && !metrics) {
    return <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 text-sm text-white/40">Loading router metrics…</div>;
  }
  if (!metrics) return null;

  const t = metrics.totals;

  // Cap the series at the palette's validated all-pairs limit; the rest folds into "Other"
  // rather than generating a 4th hue.
  const top = metrics.by_model.slice(0, SERIES.length).map((m, i) => ({ ...m, key: `${m.provider}:${m.model}`, color: SERIES[i] }));
  const rest = metrics.by_model.slice(SERIES.length);
  const rows = rest.length
    ? [...top, {
        key: "other",
        model: `Other (${rest.length})`,
        color: OTHER,
        requests: rest.reduce((a, m) => a + m.requests, 0),
        share_pct: Math.round(rest.reduce((a, m) => a + m.share_pct, 0) * 10) / 10,
        input_tokens: rest.reduce((a, m) => a + m.input_tokens, 0),
        output_tokens: rest.reduce((a, m) => a + m.output_tokens, 0),
        total_tokens: rest.reduce((a, m) => a + m.total_tokens, 0),
      }]
    : top;

  const empty = t.requests === 0;

  // Counts shown in the collapsed headers, so each config section reports whether it is
  // actually configured without having to be opened.
  const capCount = Object.values(limits).filter((v) => v !== "" && v != null && Number(v) > 0).length;
  const pricedCount = providers.filter((p) => {
    const r = pricing[p.model];
    return r && (Number(r.input_per_1m) > 0 || Number(r.output_per_1m) > 0);
  }).length;

  return (
    <div className="mb-8 space-y-4" data-testid="router-metrics">
      {/* Filters sit in one row above the charts. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="overline text-[#00f0ff]">Router observability</div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 font-mono text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w.hours}
                type="button"
                onClick={() => setHours(w.hours)}
                data-testid={`metrics-window-${w.label}`}
                className={`px-3 py-1 rounded-full transition-colors ${hours === w.hours ? "bg-[#00f0ff] text-black" : "text-white/70 hover:text-white"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            title="Refresh"
            className="rounded-lg border border-white/10 p-2 text-white/60 hover:text-[#00f0ff] hover:border-[#00f0ff]/40 transition-colors"
            data-testid="metrics-refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 text-sm text-white/50">
          No AI requests recorded in this window yet. Generate content from the{" "}
          <span className="text-white/80">Generate with AI</span> page and the traffic, latency and
          token figures will appear here.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile icon={Activity} label="Requests" value={fmtInt(t.requests)} sub={`${fmtInt(t.ok)} ok · ${fmtInt(t.errors)} failed`} />
            <StatTile icon={Hash} label="Tokens (est.)" value={fmtTokens(t.total_tokens)} sub={`${fmtTokens(t.input_tokens)} in · ${fmtTokens(t.output_tokens)} out`} />
            <StatTile
              icon={Coins}
              label="Cost (est.)"
              value={t.cost_usd != null ? fmtUsd(t.cost_usd) : "—"}
              sub={t.cost_usd != null ? "from your configured rates" : "set rates below"}
            />
            <StatTile
              icon={AlertTriangle}
              label="Error rate"
              value={`${t.error_rate}%`}
              tone={t.error_rate > 0 ? "warn" : "default"}
              sub={`${fmtInt(t.errors)} failed calls`}
            />
            <StatTile icon={Clock} label="Latency p95" value={fmtMs(t.p95_ms)} sub={`p50 ${fmtMs(t.p50_ms)}`} />
          </div>

          {/* Why the token and cost numbers are marked "est." -- stated on screen rather
              than only in the code, since an admin reading a cost figure deserves to know
              how it was derived. */}
          <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-[11px] leading-relaxed text-white/45">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Requests, latency and error rates are measured directly. Token counts are{" "}
              <span className="text-white/70">estimated</span> from text length — the chat SDK this
              router uses returns only the completion text, with no usage block — so costs derived
              from them are estimates too. Provider-side cached tokens aren&apos;t reported through
              this SDK and are shown as “—” rather than as zero.
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Gauge size={14} className="text-[#00f0ff]" />
                <div className="text-sm text-white font-medium">Traffic breakdown</div>
              </div>
              <div className="text-[11px] text-white/40 mb-4">Share of requests routed to each model</div>
              <TrafficBreakdown rows={rows} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Hash size={14} className="text-[#00f0ff]" />
                <div className="text-sm text-white font-medium">Token distribution</div>
              </div>
              <div className="text-[11px] text-white/40 mb-3">Estimated tokens per model</div>
              <div className="mb-4">
                <Legend items={[{ label: "Input", color: IN_COLOR }, { label: "Output", color: OUT_COLOR }]} />
              </div>
              <TokenDistribution rows={rows} />
            </div>
          </div>

          {/* The table view: exact per-model numbers, and the accessible alternative to
              reading identity from the bar colours above. */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 overflow-x-auto">
            <div className="text-sm text-white font-medium mb-3">Performance by model</div>
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead className="text-white/40 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Share</th>
                  <th className="pb-2 font-medium text-right">p50</th>
                  <th className="pb-2 font-medium text-right">p95</th>
                  <th className="pb-2 font-medium text-right">Errors</th>
                  <th className="pb-2 font-medium text-right">In (est.)</th>
                  <th className="pb-2 font-medium text-right">Out (est.)</th>
                  <th className="pb-2 font-medium text-right">Cost (est.)</th>
                </tr>
              </thead>
              <tbody className="text-white/75">
                {metrics.by_model.map((m, i) => (
                  <tr key={`${m.provider}:${m.model}`} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: SERIES[i] || OTHER }} />
                        <span className="font-mono">{m.model}</span>
                        <span className="text-white/35">{m.provider}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtInt(m.requests)}</td>
                    <td className="py-2 text-right tabular-nums">{m.share_pct}%</td>
                    <td className="py-2 text-right tabular-nums">{fmtMs(m.p50_ms)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMs(m.p95_ms)}</td>
                    <td className={`py-2 text-right tabular-nums ${m.error_rate > 0 ? "text-[#ffb020]" : ""}`}>{m.error_rate}%</td>
                    <td className="py-2 text-right tabular-nums">{fmtTokens(m.input_tokens)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtTokens(m.output_tokens)}</td>
                    <td className="py-2 text-right tabular-nums">{m.cost_usd != null ? fmtUsd(m.cost_usd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Rate limits + pricing */}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <CollapsibleCard
          title="Token rate limits"
          summary={capCount > 0 ? `${capCount} cap${capCount === 1 ? "" : "s"} set` : "No caps"}
          open={showLimits}
          onToggle={() => setShowLimits((s) => !s)}
          testId="toggle-limits"
        >
          <div className="text-[11px] text-white/40 -mt-1 mb-4">
            Tokens per minute per provider. A provider over its cap is skipped and the request fails
            over to the next one, so a spike throttles rather than erroring. Blank = no cap.
          </div>
          <div className="space-y-2">
            {providers.map((p) => (
              <div key={p.provider} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-white/70 capitalize">{p.provider}</span>
                <input
                  type="number"
                  min="0"
                  placeholder="No cap"
                  value={limits[p.provider] ?? ""}
                  onChange={(e) => setLimits({ ...limits, [p.provider]: e.target.value })}
                  data-testid={`tpm-${p.provider}`}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white font-mono focus:border-[#00f0ff]"
                />
                <span className="text-[10px] text-white/35 shrink-0">TPM</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={saveLimits}
            data-testid="save-limits"
            className="mt-4 rounded-full border border-[#00f0ff]/50 px-4 py-1.5 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-colors"
          >
            Save limits
          </button>
        </CollapsibleCard>

        <CollapsibleCard
          title="Cost rates"
          summary={pricedCount > 0 ? `${pricedCount} of ${providers.length} priced` : "Not set"}
          open={showPricing}
          onToggle={() => setShowPricing((s) => !s)}
          testId="toggle-pricing"
        >
          <div className="text-[11px] text-white/40 -mt-1 mb-4">
            USD per 1M tokens, per model. Rates differ by provider and tier, so nothing is assumed —
            cost stays “—” until you enter your own.
          </div>
          <div className="space-y-2">
            {providers.map((p) => (
              <div key={p.provider} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-white/70 font-mono" title={p.model}>{p.model}</span>
                <input
                  type="number" step="0.01" min="0" placeholder="in"
                  value={pricing[p.model]?.input_per_1m ?? ""}
                  onChange={(e) => setPricing({ ...pricing, [p.model]: { ...pricing[p.model], input_per_1m: e.target.value } })}
                  data-testid={`price-in-${p.provider}`}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white font-mono focus:border-[#00f0ff]"
                />
                <input
                  type="number" step="0.01" min="0" placeholder="out"
                  value={pricing[p.model]?.output_per_1m ?? ""}
                  onChange={(e) => setPricing({ ...pricing, [p.model]: { ...pricing[p.model], output_per_1m: e.target.value } })}
                  data-testid={`price-out-${p.provider}`}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white font-mono focus:border-[#00f0ff]"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={savePricing}
            data-testid="save-pricing"
            className="mt-4 rounded-full border border-[#00f0ff]/50 px-4 py-1.5 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-colors"
          >
            Save rates
          </button>
        </CollapsibleCard>
      </div>

      {/* Request logs */}
      <CollapsibleCard
        title="Request logs"
        summary={`Last ${logs.length}`}
        open={showLogs}
        onToggle={() => setShowLogs((s) => !s)}
        testId="toggle-logs"
      >
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="text-white/40 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Task</th>
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">In</th>
                  <th className="pb-2 font-medium text-right">Out</th>
                  <th className="pb-2 font-medium text-right">Latency</th>
                  <th className="pb-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="text-white/75">
                {logs.length === 0 && (
                  <tr><td colSpan={7} className="py-3 text-white/40">No requests recorded yet.</td></tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 whitespace-nowrap text-white/50">{new Date(l.ts).toLocaleString()}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-white/60">{l.prompt_key}</td>
                    <td className="py-2 pr-3 font-mono text-[11px]">{l.model}</td>
                    <td className="py-2 text-right tabular-nums">{fmtInt(l.input_tokens)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtInt(l.output_tokens)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMs(l.latency_ms)}</td>
                    <td className="py-2 pl-3">
                      {l.ok ? (
                        <span className="text-emerald-400">ok</span>
                      ) : (
                        <span className="text-[#ff6b6b]" title={l.error || ""}>failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </CollapsibleCard>
    </div>
  );
};

export default RouterMetrics;
