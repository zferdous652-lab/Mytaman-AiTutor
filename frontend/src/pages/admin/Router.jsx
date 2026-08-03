import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, ChevronUp, ChevronDown, KeyRound, RefreshCw, Info, ChevronRight, Brain } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

// System prompts are grouped into collapsible panels rather than one flat wall of
// textareas -- the Socratic tutor prompt alone is far longer than any generation prompt,
// and scrolling past it to reach the translate_* keys made the page unusable. Anything
// not listed here still renders, under "Other", so a prompt key added to the backend
// later can never silently vanish from this editor.
const PROMPT_GROUPS = [
  {
    id: "socratic",
    label: "Socratic Learning",
    hint: "Governs the per-lesson tutor docked beside Premium pack content. The tutor prompt must keep returning the documented JSON shape — free-form prose still renders, but the phase / mastery / concept signals that drive progress and admin reporting are lost.",
    accent: "#8a2be2",
    icon: Brain,
    keys: ["socratic_tutor", "live_tutor"],
    defaultOpen: true,
  },
  {
    id: "generation",
    label: "Content generation",
    hint: "Used by Generate with AI to author each content type from source material.",
    accent: "#00f0ff",
    keys: ["chapter_summary", "quiz_generation", "flashcard_generation", "mindmap_generation", "notes_generation"],
  },
  {
    id: "translation",
    label: "Translation",
    hint: "Used when generating the second language from an already-generated chapter, so EN and BM stay aligned item-for-item.",
    accent: "#00f0ff",
    keys: ["translate_summary", "translate_notes", "translate_quiz", "translate_flashcards", "translate_mindmap"],
  },
  {
    id: "grading",
    label: "Grading",
    hint: "Scores a student's free-text short answer against the reference answer.",
    accent: "#00f0ff",
    keys: ["short_answer_grading"],
  },
];

const PromptGroup = ({ group, prompts, onChange }) => {
  const [open, setOpen] = useState(!!group.defaultOpen);
  const entries = group.keys.filter((k) => k in prompts);
  if (entries.length === 0) return null;
  const Icon = group.icon;

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden" data-testid={`prompt-group-${group.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid={`prompt-group-toggle-${group.id}`}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="shrink-0 text-white/50" /> : <ChevronRight size={14} className="shrink-0 text-white/50" />}
        {Icon && <Icon size={14} className="shrink-0" style={{ color: group.accent }} />}
        <span className="text-sm font-semibold" style={{ color: group.accent }}>{group.label}</span>
        <span className="ml-auto shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono text-white/40">
          {entries.length}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-white/8">
          {group.hint && <p className="text-xs text-white/45 leading-relaxed">{group.hint}</p>}
          {entries.map((key) => (
            <div key={key}>
              <label className="text-xs font-mono" style={{ color: group.accent }}>{key}</label>
              <textarea
                data-testid={`prompt-${key}`}
                rows={Math.min(16, Math.max(3, Math.ceil((prompts[key] || "").length / 88)))}
                value={prompts[key]}
                onChange={(e) => onChange(key, e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white font-mono text-xs leading-relaxed focus:border-[#00f0ff] outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const providerMeta = {
  openai: { label: "OpenAI", accent: "#00ff66" },
  anthropic: { label: "Anthropic Claude", accent: "#ff9040" },
  gemini: { label: "Google Gemini", accent: "#00f0ff" },
};

// Explains where the ACTIVE key for a provider actually came from -- a key saved in this
// UI can otherwise appear to silently "not work" when a deploy-time env var was resolved
// instead (see backend _resolve_key), with nothing in the old UI to tell the admin why.
const KEY_SOURCE_LABEL = {
  ui: { text: "from this panel", tone: "text-[#00ff66]" },
  env: { text: "from server env var (overrides this panel if also set here)", tone: "text-[#ffd23f]" },
  emergent: { text: "from EMERGENT_LLM_KEY fallback", tone: "text-[#ffd23f]" },
  none: { text: "no key configured", tone: "text-white/40" },
};

const ProviderCard = ({ p, onToggle, onSaveKey, onSaveModel, onUp, onDown, isFirst, isLast }) => {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(p.model);
  const [models, setModels] = useState(null); // ModelInfo[] once fetched, else null
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [manualModel, setManualModel] = useState(false);

  useEffect(() => { setModel(p.model); }, [p.model]);

  // Fetches the live model list for whichever key is relevant right now: the one just
  // typed (not yet saved) takes priority so the admin can see real model names before
  // committing to Save, otherwise falls back to whatever key is currently active.
  const fetchModels = async (unsavedKey) => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const { data } = await api.post(`/router/providers/${p.provider}/models`, unsavedKey ? { api_key: unsavedKey } : {});
      setModels(data);
      if (data.length === 0) setModelsError("Key works, but no usable models were returned.");
    } catch (err) {
      setModelsError(err?.response?.data?.detail || "Could not fetch models with this key.");
      setModels(null);
    }
    setModelsLoading(false);
  };

  const saveKeyAndFetch = async () => {
    const typedKey = key;
    await onSaveKey(typedKey);
    setKey("");
    if (typedKey) fetchModels(typedKey);
  };

  const source = KEY_SOURCE_LABEL[p.key_source] || KEY_SOURCE_LABEL.none;
  const selectedModelInfo = models?.find((m) => m.id === model);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5" data-testid={`provider-${p.provider}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <GripVertical size={16} className="text-white/30" />
          <div>
            <div className="font-display text-lg text-white tracking-tight" style={{ color: providerMeta[p.provider].accent }}>
              {providerMeta[p.provider].label}
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              order #{p.order + 1} · {p.has_key ? "key ready" : "no key"}
            </div>
            <div className={`text-[10px] mt-0.5 ${source.tone}`} data-testid={`key-source-${p.provider}`}>
              Active key {source.text}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid={`up-${p.provider}`} disabled={isFirst} onClick={onUp} className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:text-[#00f0ff] disabled:opacity-30">
            <ChevronUp size={14} />
          </button>
          <button data-testid={`down-${p.provider}`} disabled={isLast} onClick={onDown} className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:text-[#00f0ff] disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
          <label className="inline-flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              data-testid={`enable-${p.provider}`}
              checked={p.enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="accent-[#00f0ff]"
            />
            <span>{p.enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs text-white/60">API key (masked)</label>
          <div className="mt-1 flex gap-2">
            <input
              data-testid={`key-input-${p.provider}`}
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white font-mono text-sm focus:border-[#00f0ff]"
            />
            <button
              data-testid={`save-key-${p.provider}`}
              onClick={saveKeyAndFetch}
              title="Save key and fetch its available models"
              className="rounded-xl border border-[#00f0ff] px-4 text-sm text-[#00f0ff] hover:bg-[#00f0ff] hover:text-black transition-colors"
            >
              <KeyRound size={14} />
            </button>
            <button
              data-testid={`remove-key-${p.provider}`}
              onClick={() => { onSaveKey(""); setModels(null); setModelsError(""); }}
              className="rounded-xl border border-white/10 px-3 text-sm text-white/60 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/60">Model</label>
            <button
              type="button"
              data-testid={`fetch-models-${p.provider}`}
              onClick={() => fetchModels(key || undefined)}
              disabled={modelsLoading || (!p.has_key && !key)}
              title="Fetch this provider's available models for the active key"
              className="text-white/40 hover:text-[#00f0ff] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={modelsLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="mt-1 flex gap-2">
            {models && models.length > 0 && !manualModel ? (
              <select
                data-testid={`model-select-${p.provider}`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white font-mono text-xs focus:border-[#00f0ff]"
              >
                {!models.some((m) => m.id === model) && <option value={model}>{model} (current)</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            ) : (
              <input
                data-testid={`model-${p.provider}`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white font-mono text-xs focus:border-[#00f0ff]"
              />
            )}
            <button
              data-testid={`save-model-${p.provider}`}
              onClick={() => onSaveModel(model)}
              className="rounded-xl border border-white/10 px-3 text-xs text-white/70 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
            >
              Save
            </button>
          </div>
          {models && models.length > 0 && (
            <button
              type="button"
              onClick={() => setManualModel((v) => !v)}
              className="mt-1 text-[10px] text-white/40 hover:text-white/70 underline"
            >
              {manualModel ? "Pick from fetched models" : "Enter model ID manually"}
            </button>
          )}
          {modelsError && <div className="mt-1 text-[10px] text-[#ff0055]">{modelsError}</div>}
        </div>
      </div>

      {selectedModelInfo && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-testid={`model-info-${p.provider}`}>
          <div className="flex items-start gap-2">
            <Info size={13} className="mt-0.5 shrink-0 text-white/40" />
            <div className="min-w-0">
              {selectedModelInfo.description && (
                <div className="text-xs text-white/60">{selectedModelInfo.description}</div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {selectedModelInfo.capabilities.map((c) => (
                  <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/70">
                    {c}
                  </span>
                ))}
                {selectedModelInfo.context_window && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/70">
                    {selectedModelInfo.context_window.toLocaleString()} in
                  </span>
                )}
                {selectedModelInfo.output_limit && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-white/70">
                    {selectedModelInfo.output_limit.toLocaleString()} out
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Router = () => {
  const { t } = useLang();
  const [cfg, setCfg] = useState(null);
  const [prompts, setPrompts] = useState({});

  const load = async () => {
    const { data } = await api.get("/router/config");
    setCfg(data);
    setPrompts(data.prompts);
  };
  useEffect(() => { load(); }, []);

  if (!cfg) return <div className="p-12 text-white/60">Loading router…</div>;

  const move = async (provider, dir) => {
    const order = cfg.providers.map((p) => p.provider);
    const idx = order.indexOf(provider);
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    [order[idx], order[swap]] = [order[swap], order[idx]];
    await api.post("/router/order", { order });
    toast.success("Order updated");
    load();
  };
  const toggle = async (provider, enabled) => {
    await api.patch(`/router/providers/${provider}`, { enabled });
    toast.success(`${provider} ${enabled ? "enabled" : "disabled"}`);
    load();
  };
  const saveKey = async (provider, api_key) => {
    await api.patch(`/router/providers/${provider}`, { api_key });
    toast.success(api_key ? "Key saved" : "Key removed");
    load();
  };
  const saveModel = async (provider, model) => {
    await api.patch(`/router/providers/${provider}`, { model });
    toast.success("Model updated");
    load();
  };
  const savePrompts = async () => {
    await api.put("/router/prompts", { prompts });
    toast.success("Prompts saved");
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("router")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-2">{t("router_title")}</h1>
      <p className="text-white/60 max-w-2xl mb-8">{t("router_sub")}</p>

      <div className="space-y-4" data-testid="providers-list">
        {cfg.providers.map((p, i) => (
          <ProviderCard
            key={p.provider}
            p={p}
            isFirst={i === 0}
            isLast={i === cfg.providers.length - 1}
            onUp={() => move(p.provider, -1)}
            onDown={() => move(p.provider, 1)}
            onToggle={(v) => toggle(p.provider, v)}
            onSaveKey={(k) => saveKey(p.provider, k)}
            onSaveModel={(m) => saveModel(p.provider, m)}
          />
        ))}
      </div>

      <div className="mt-10">
        <div className="overline text-[#00f0ff] mb-3">{t("system_prompts")}</div>
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
          <div className="space-y-3">
            {PROMPT_GROUPS.map((group) => (
              <PromptGroup
                key={group.id}
                group={group}
                prompts={prompts}
                onChange={(key, val) => setPrompts((prev) => ({ ...prev, [key]: val }))}
              />
            ))}
            <PromptGroup
              group={{
                id: "other",
                label: "Other",
                accent: "#00f0ff",
                keys: Object.keys(prompts).filter(
                  (k) => !PROMPT_GROUPS.some((g) => g.keys.includes(k))
                ),
              }}
              prompts={prompts}
              onChange={(key, val) => setPrompts((prev) => ({ ...prev, [key]: val }))}
            />
          </div>
          <button
            data-testid="save-prompts"
            onClick={savePrompts}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-5 py-2 text-sm font-semibold text-black hover:bg-white transition-colors"
          >
            Save prompts
          </button>
        </div>
      </div>
    </div>
  );
};

export default Router;
