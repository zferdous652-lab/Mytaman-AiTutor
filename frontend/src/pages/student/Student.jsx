import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";
import ContentViewer from "./ContentViewer";

const ContentCard = ({ content, done, onOpen }) => (
  <button
    onClick={onOpen}
    data-testid={`content-${content.id}`}
    className={`text-left rounded-2xl border p-5 transition-colors ${
      done ? "border-emerald-400/30 bg-emerald-400/5 hover:border-emerald-400/50" : "border-white/10 bg-[#0a0514]/60 hover:border-[#00f0ff]/40"
    }`}
  >
    <div className="flex justify-between items-start gap-2">
      <div className="overline text-[#00f0ff]">{content.content_type} · {content.language}</div>
      {done && <Check size={14} className="text-emerald-400 shrink-0" />}
    </div>
    <div className="mt-2 font-display text-lg tracking-tight text-white">{content.title}</div>
    <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${done ? "bg-emerald-400 w-full" : "bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] w-0"}`} />
    </div>
    <div className="mt-2 text-xs text-white/40">{done ? "Completed" : "Tap to open"}</div>
  </button>
);

const LANG_FILTERS = ["all", "en", "bm"];

const StudentHome = () => {
  const { t } = useLang();
  const [mine, setMine] = useState([]);
  const [active, setActive] = useState(null);
  const [courses, setCourses] = useState([]);
  const [chaptersByCourse, setChaptersByCourse] = useState({});
  const [items, setItems] = useState([]);
  const [completed, setCompleted] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [langFilter, setLangFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await api.get("/packs/mine");
    setMine(data);
    if (data[0]) setActive(data[0]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!active) {
      setItems([]);
      setCourses([]);
      setChaptersByCourse({});
      setCompleted(new Set());
      return;
    }
    (async () => {
      const [itemsRes, coursesRes, progressRes] = await Promise.all([
        api.get(`/content/list?pack_id=${active.id}&only_published=true`),
        api.get(`/courses/list?pack_id=${active.id}`),
        api.get(`/content/progress?pack_id=${active.id}`),
      ]);
      setItems(itemsRes.data);
      setCourses(coursesRes.data);
      setCompleted(new Set(progressRes.data.completed_ids));

      const chapterLists = await Promise.all(coursesRes.data.map((c) => api.get(`/chapters/list?course_id=${c.id}`)));
      const map = {};
      coursesRes.data.forEach((c, i) => { map[c.id] = chapterLists[i].data; });
      setChaptersByCourse(map);
    })();
  }, [active]);

  const markComplete = (contentId) => setCompleted((prev) => new Set(prev).add(contentId));
  const markIncomplete = (contentId) => setCompleted((prev) => { const next = new Set(prev); next.delete(contentId); return next; });

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

  const visibleItems = items.filter((it) => langFilter === "all" || it.language === langFilter);
  const progressPct = items.length ? Math.round((completed.size / items.length) * 100) : 0;

  const itemsByChapter = {};
  visibleItems.forEach((it) => {
    const key = it.chapter_id || "other";
    (itemsByChapter[key] = itemsByChapter[key] || []).push(it);
  });

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

      {active && (
        <div className="mb-8 flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Progress</span>
              <span data-testid="progress-pct">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="flex gap-1" data-testid="lang-filter">
            {LANG_FILTERS.map((l) => (
              <button
                key={l}
                onClick={() => setLangFilter(l)}
                className={`rounded-full px-3 py-1 text-xs uppercase border transition-colors ${
                  langFilter === l ? "border-[#00f0ff] text-[#00f0ff]" : "border-white/10 text-white/50 hover:border-white/30"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {courses.map((course) => {
          const chapters = chaptersByCourse[course.id] || [];
          const hasItems = chapters.some((ch) => itemsByChapter[ch.id]?.length);
          if (!hasItems) return null;
          return (
            <div key={course.id}>
              <h2 className="font-display text-lg text-white mb-3">{course.title}</h2>
              <div className="space-y-5">
                {chapters.map((ch) => {
                  const chItems = itemsByChapter[ch.id] || [];
                  if (chItems.length === 0) return null;
                  return (
                    <div key={ch.id}>
                      <div className="text-sm text-white/60 mb-2">{ch.title}</div>
                      <div className="grid lg:grid-cols-3 gap-4" data-testid="content-grid">
                        {chItems.map((c) => (
                          <ContentCard key={c.id} content={c} done={completed.has(c.id)} onOpen={() => setSelected(c)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {itemsByChapter.other?.length > 0 && (
          <div>
            <h2 className="font-display text-lg text-white mb-3">Other content</h2>
            <div className="grid lg:grid-cols-3 gap-4">
              {itemsByChapter.other.map((c) => (
                <ContentCard key={c.id} content={c} done={completed.has(c.id)} onOpen={() => setSelected(c)} />
              ))}
            </div>
          </div>
        )}

        {visibleItems.length === 0 && <div className="text-sm text-white/40">No published content yet in this pack.</div>}
      </div>

      <ContentViewer
        content={selected}
        done={selected ? completed.has(selected.id) : false}
        onClose={() => setSelected(null)}
        onComplete={markComplete}
        onUncomplete={markIncomplete}
      />
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
