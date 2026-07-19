import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const StudentHome = () => {
  const { t } = useLang();
  const [mine, setMine] = useState([]);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const { data } = await api.get("/packs/mine");
    setMine(data);
    if (data[0]) setActive(data[0]);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!active) { setItems([]); return; }
    api.get(`/content/list?pack_id=${active.id}&only_published=true`).then((r) => setItems(r.data));
  }, [active]);

  if (mine.length === 0) {
    return (
      <div className="p-8 lg:p-12">
        <div className="overline text-[#00f0ff]">{t("my_packs")}</div>
        <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-6">Get started</h1>
        <p className="text-white/60 max-w-md mb-6">You have no packs yet. Browse and enroll to begin.</p>
        <a href="/student/browse" data-testid="cta-browse" className="inline-flex rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors">Browse packs</a>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("my_packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">My learning</h1>

      <div className="flex gap-2 flex-wrap mb-6" data-testid="my-packs-tabs">
        {mine.map((p) => (
          <button
            key={p.id}
            data-testid={`tab-${p.id}`}
            onClick={() => setActive(p)}
            className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
              active?.id === p.id ? "border-[#00f0ff] bg-[#00f0ff]/10 text-[#00f0ff]" : "border-white/10 text-white/70 hover:border-white/30"
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4" data-testid="content-grid">
        {items.map((c) => (
          <button
            key={c.id}
            data-testid={`content-${c.id}`}
            onClick={() => setSelected(c)}
            className="text-left rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 hover:border-[#00f0ff]/40 transition-colors"
          >
            <div className="overline text-[#00f0ff]">{c.content_type} · {c.language}</div>
            <div className="mt-2 font-display text-lg tracking-tight text-white">{c.title}</div>
            <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] w-1/3" />
            </div>
            <div className="mt-2 text-xs text-white/40">Tap to open</div>
          </button>
        ))}
        {items.length === 0 && <div className="text-sm text-white/40">No published content yet in this pack.</div>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-md p-6" onClick={() => setSelected(null)}>
          <div className="max-w-2xl w-full glass rounded-2xl p-8" onClick={(e) => e.stopPropagation()} data-testid="content-modal">
            <div className="overline text-[#00f0ff]">{selected.content_type}</div>
            <div className="font-display text-2xl tracking-tighter text-white mt-2">{selected.title}</div>
            <pre className="mt-5 whitespace-pre-wrap text-sm text-white/80 font-mono leading-relaxed max-h-[60vh] overflow-auto">{selected.body}</pre>
            <button data-testid="modal-close" onClick={() => setSelected(null)} className="mt-6 rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

const StudentBrowse = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [enrolled, setEnrolled] = useState(new Set());

  const load = async () => {
    const [all, mine] = await Promise.all([api.get("/packs/list"), api.get("/packs/mine")]);
    setPacks(all.data);
    setEnrolled(new Set(mine.data.map((p) => p.id)));
  };
  useEffect(() => { load(); }, []);

  const enroll = async (id) => {
    await api.post("/packs/enroll", { pack_id: id });
    toast.success("Enrolled");
    load();
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("browse_packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Available Tutor Packs</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="browse-list">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
            <div className="flex justify-between">
              <div className="overline text-[#00f0ff]">{p.tier}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">{p.language.toUpperCase()}</div>
            </div>
            <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
            <div className="text-xs text-white/50 mt-1">{p.subject} · {p.grade}</div>
            <p className="text-sm text-white/70 mt-3 leading-relaxed">{p.description}</p>
            <button
              data-testid={`enroll-${p.id}`}
              disabled={enrolled.has(p.id)}
              onClick={() => enroll(p.id)}
              className={`mt-4 w-full rounded-full py-2 text-sm font-semibold transition-colors ${
                enrolled.has(p.id) ? "border border-white/10 text-white/50" : "bg-[#00f0ff] text-black hover:bg-white"
              }`}
            >
              {enrolled.has(p.id) ? t("enrolled") : t("enroll")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export { StudentHome, StudentBrowse };
