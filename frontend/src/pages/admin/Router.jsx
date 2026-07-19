import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, ChevronUp, ChevronDown, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const providerMeta = {
  openai: { label: "OpenAI", accent: "#00ff66" },
  anthropic: { label: "Anthropic Claude", accent: "#ff9040" },
  gemini: { label: "Google Gemini", accent: "#00f0ff" },
};

const ProviderCard = ({ p, onToggle, onSaveKey, onSaveModel, onUp, onDown, isFirst, isLast }) => {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(p.model);

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
              onClick={() => { onSaveKey(key); setKey(""); }}
              className="rounded-xl border border-[#00f0ff] px-4 text-sm text-[#00f0ff] hover:bg-[#00f0ff] hover:text-black transition-colors"
            >
              <KeyRound size={14} />
            </button>
            <button
              data-testid={`remove-key-${p.provider}`}
              onClick={() => onSaveKey("")}
              className="rounded-xl border border-white/10 px-3 text-sm text-white/60 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-white/60">Model</label>
          <div className="mt-1 flex gap-2">
            <input
              data-testid={`model-${p.provider}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white font-mono text-xs focus:border-[#00f0ff]"
            />
            <button
              data-testid={`save-model-${p.provider}`}
              onClick={() => onSaveModel(model)}
              className="rounded-xl border border-white/10 px-3 text-xs text-white/70 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
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
          <div className="space-y-4">
            {Object.entries(prompts).map(([key, val]) => (
              <div key={key}>
                <label className="text-xs text-[#00f0ff] font-mono">{key}</label>
                <textarea
                  data-testid={`prompt-${key}`}
                  rows={3}
                  value={val}
                  onChange={(e) => setPrompts({ ...prompts, [key]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white font-mono text-xs leading-relaxed focus:border-[#00f0ff]"
                />
              </div>
            ))}
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
