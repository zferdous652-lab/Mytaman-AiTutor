import React, { useEffect, useState } from "react";
import { toast } from "sonner";
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
  const [coursesByPack, setCoursesByPack] = useState({});

  const load = async () => {
    const [all, mine] = await Promise.all([api.get("/packs/list"), api.get("/packs/mine")]);
    setPacks(all.data);
    setEnrolled(new Set(mine.data.map((p) => p.id)));

    const courseLists = await Promise.all(all.data.map((p) => api.get(`/courses/list?pack_id=${p.id}`)));
    const map = {};
    all.data.forEach((p, i) => { map[p.id] = courseLists[i].data; });
    setCoursesByPack(map);
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
        {packs.map((p) => {
          const courses = coursesByPack[p.id] || [];
          return (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 flex flex-col">
              <div className="flex justify-between">
                <div className="overline text-[#00f0ff]">{p.tier}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">{p.language.toUpperCase()}</div>
              </div>
              <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
              <div className="text-xs text-white/50 mt-1">{p.subject} · {p.grade}</div>
              <p className="text-sm text-white/70 mt-3 leading-relaxed">{p.description}</p>

              {courses.length > 0 && (
                <div className="mt-4" data-testid={`preview-${p.id}`}>
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Preview</div>
                  <ol className="space-y-1">
                    {courses.map((c, i) => (
                      <li key={c.id} className="text-xs text-white/60">{i + 1}. {c.title}</li>
                    ))}
                  </ol>
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
