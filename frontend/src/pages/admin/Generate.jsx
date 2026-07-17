import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const TYPES = [
  { v: "summary", label: "Summary" },
  { v: "quiz", label: "Quiz" },
  { v: "flashcards", label: "Flashcards" },
  { v: "mindmap", label: "Mind map" },
  { v: "notes", label: "Notes" },
];

const Generate = ({ manual = false }) => {
  const { t, lang } = useLang();
  const [packs, setPacks] = useState([]);
  const [form, setForm] = useState({
    pack_id: "",
    title: "",
    content_type: "summary",
    source_text: "",
    body: "",
    language: lang,
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);

  const loadPacks = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
    if (data[0] && !form.pack_id) setForm((f) => ({ ...f, pack_id: data[0].id }));
  };
  const loadItems = async () => {
    const { data } = await api.get("/content/list");
    setItems(data);
  };

  useEffect(() => { loadPacks(); loadItems(); }, []); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      if (manual) {
        const { data } = await api.post("/content/manual", {
          pack_id: form.pack_id,
          title: form.title,
          content_type: form.content_type,
          body: form.body,
          language: form.language,
        });
        setResult(data);
        toast.success("Content saved");
      } else {
        const { data } = await api.post("/content/generate", {
          pack_id: form.pack_id,
          title: form.title,
          content_type: form.content_type,
          source_text: form.source_text,
          language: form.language,
        });
        setResult(data);
        toast.success(`Generated via ${data.provider}`);
      }
      loadItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Failed");
    }
    setBusy(false);
  };

  const publish = async (id) => {
    await api.post(`/content/${id}/publish`);
    toast.success("Published");
    loadItems();
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{manual ? t("manual") : t("generate")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">
        {manual ? "Set up content manually" : "Generate content with AI"}
      </h1>

      <div className="grid lg:grid-cols-5 gap-6">
        <form onSubmit={submit} className="lg:col-span-3 space-y-4 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid={manual ? "manual-form" : "generate-form"}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">{t("pack")}</label>
              <select
                data-testid="gen-pack"
                value={form.pack_id}
                onChange={(e) => setForm({ ...form, pack_id: e.target.value })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              >
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">{t("content_type")}</label>
              <select
                data-testid="gen-type"
                value={form.content_type}
                onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              >
                {TYPES.map((tp) => <option key={tp.v} value={tp.v}>{tp.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60">{t("title_label")}</label>
            <input
              data-testid="gen-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"
              placeholder="e.g. Bab 1 — Zaman Prasejarah"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">Language</label>
            <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 font-mono text-xs">
              {["en", "bm"].map((l) => (
                <button
                  key={l}
                  type="button"
                  data-testid={`gen-lang-${l}`}
                  onClick={() => setForm({ ...form, language: l })}
                  className={`px-3 py-1 rounded-full ${form.language === l ? "bg-[#00f0ff] text-black" : "text-white/70"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60">{manual ? "Body" : t("source_material")}</label>
            <textarea
              data-testid={manual ? "gen-body" : "gen-source"}
              required
              rows={10}
              value={manual ? form.body : form.source_text}
              onChange={(e) => setForm({ ...form, [manual ? "body" : "source_text"]: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white font-mono text-sm leading-relaxed"
              placeholder={manual ? "Type or paste the content..." : "Paste chapter text, curriculum notes, or lesson material..."}
            />
          </div>
          <button
            data-testid="gen-submit"
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
          >
            <Sparkles size={14} />
            {busy ? t("generating") : manual ? t("save_manual") : t("generate_btn")}
          </button>
        </form>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
            <div className="overline text-[#00f0ff] mb-3">Preview</div>
            {!result && <div className="text-white/40 text-sm">Generated content will appear here.</div>}
            {result && (
              <div data-testid="gen-preview">
                <div className="font-display text-lg text-white">{result.title}</div>
                {result.provider && (
                  <div className="mt-1 text-xs font-mono text-white/50">
                    {t("provider")}: <span className="text-[#00f0ff]">{result.provider}</span> · {result.model}
                  </div>
                )}
                <pre className="mt-3 whitespace-pre-wrap text-sm text-white/80 font-mono leading-relaxed max-h-80 overflow-auto">{result.body}</pre>
                {!result.published && (
                  <button
                    data-testid="gen-publish"
                    onClick={() => publish(result.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#00f0ff] px-4 py-2 text-sm text-[#00f0ff] hover:bg-[#00f0ff] hover:text-black transition-colors"
                  >
                    <Send size={14} /> {t("publish")}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
            <div className="overline text-[#00f0ff] mb-3">Recent</div>
            <div className="space-y-2 max-h-64 overflow-auto" data-testid="recent-list">
              {items.slice(0, 12).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
                  <div>
                    <div className="text-sm text-white">{c.title}</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">
                      {c.content_type} · {c.language}
                    </div>
                  </div>
                  {c.published ? (
                    <span className="text-[10px] text-[#00ff66] uppercase tracking-widest">Live</span>
                  ) : (
                    <button
                      data-testid={`publish-${c.id}`}
                      onClick={() => publish(c.id)}
                      className="text-[10px] uppercase tracking-widest text-[#00f0ff] hover:underline"
                    >
                      Publish
                    </button>
                  )}
                </div>
              ))}
              {items.length === 0 && <div className="text-xs text-white/40">No content yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Generate;
