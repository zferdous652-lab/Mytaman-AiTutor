import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";
import PackAccordionItem from "./PackAccordionItem";

const StudentHome = () => {
  const { t } = useLang();
  const [mine, setMine] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await api.get("/packs/mine");
    setMine(data);
    if (data[0]) setExpandedId(data[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="p-8 lg:p-12 text-sm text-white/40">Loading…</div>;
  }

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

      <div className="space-y-4" data-testid="my-packs-list">
        {mine.map((p) => (
          <PackAccordionItem
            key={p.id}
            pack={p}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
          />
        ))}
      </div>
    </div>
  );
};

const StudentBrowse = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [enrolled, setEnrolled] = useState(new Set());
  const [modulesOpenId, setModulesOpenId] = useState(null);
  const [modulesByPack, setModulesByPack] = useState({});
  const [modulesLoading, setModulesLoading] = useState(false);

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

  const toggleModules = async (id) => {
    if (modulesOpenId === id) {
      setModulesOpenId(null);
      return;
    }
    setModulesOpenId(id);
    if (!modulesByPack[id]) {
      setModulesLoading(true);
      try {
        const { data } = await api.get(`/packs/${id}/modules`);
        setModulesByPack((m) => ({ ...m, [id]: data }));
      } finally {
        setModulesLoading(false);
      }
    }
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("browse_packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Available Tutor Packs</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="browse-list">
        {packs.map((p) => {
          const isOpen = modulesOpenId === p.id;
          const modules = modulesByPack[p.id];
          return (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 flex flex-col">
              <div className="flex justify-between">
                <div className="overline text-[#00f0ff]">{p.tier}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">{p.language.toUpperCase()}</div>
              </div>
              <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
              <div className="text-xs text-white/50 mt-1">{p.subject} · {p.grade}</div>
              <p className="text-sm text-white/70 mt-3 leading-relaxed">{p.description}</p>

              <button
                type="button"
                onClick={() => toggleModules(p.id)}
                data-testid={`modules-toggle-${p.id}`}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-[#00f0ff]/80 hover:text-[#00f0ff] transition-colors self-start"
              >
                <Layers size={12} />
                {isOpen ? "Hide modules" : "View modules"}
                <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="mt-3 space-y-2" data-testid={`modules-list-${p.id}`}>
                  {modulesLoading && !modules ? (
                    <div className="text-xs text-white/40">Loading modules…</div>
                  ) : modules && modules.length > 0 ? (
                    modules.map((m) => (
                      <div key={m.id} className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
                        <div className="text-xs text-white/80 font-medium">{m.name || `Module ${m.draft_index}`}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {m.items.map((it, i) => (
                            <span key={i} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50">
                              {it.chapter_title} · {it.content_type} · {it.language.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-white/40">No modules published yet.</div>
                  )}
                </div>
              )}

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
          );
        })}
      </div>
    </div>
  );
};

export { StudentHome, StudentBrowse };
