import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Package, Trophy, LogOut, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";
import SidebarToggle, { RailTooltip } from "@/components/SidebarToggle";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import CourseSidebar, { isPairDone, CourseSidebarRail } from "./CourseSidebar";
import ContentViewer, { primaryVariant } from "./ContentViewer";
import SocraticPanel from "./SocraticPanel";

const LANG_FILTERS = ["all", "en", "bm"];

// The right-hand pane shown before a lesson is picked -- an at-a-glance summary of the
// active pack plus a nudge to start reading, instead of a blank area.
const WelcomePane = ({ pack, progressPct, itemCount }) => (
  <div className="h-full grid place-items-center p-10 text-center">
    <div>
      <div
        className="mx-auto mb-6 h-24 w-24 rounded-full grid place-items-center"
        style={{
          background: `conic-gradient(#00f0ff ${progressPct * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
          boxShadow: "0 0 30px rgba(0,240,255,0.15)",
        }}
      >
        <div className="h-[86%] w-[86%] rounded-full bg-[#0a0514] grid place-items-center">
          <span className="font-display text-xl text-white">{progressPct}%</span>
        </div>
      </div>
      <div className="overline text-[#00f0ff]">{pack?.grade}</div>
      <h2 className="font-display text-2xl tracking-tighter text-white mt-2">{pack?.title}</h2>
      <p className="text-sm text-white/50 mt-3 max-w-sm mx-auto">
        {itemCount > 0
          ? "Pick a lesson from the course list on the left to start reading, watching, or practicing."
          : "No published content yet in this pack — check back soon."}
      </p>
    </div>
  </div>
);

// The full course-player: replaces the app's generic dashboard sidebar with a course
// navigator (Course -> Chapter -> Lesson) while a pack is open, and renders the selected
// lesson full-bleed in the right pane instead of a popup -- mirrors how most e-learning
// platforms (Udemy, Coursera, etc.) structure their "in course" view.
const CoursePlayer = ({ mine, activePack, onSwitchPack }) => {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLang();

  const [loaded, setLoaded] = useState(false);
  const [courses, setCourses] = useState([]);
  const [chaptersByCourse, setChaptersByCourse] = useState({});
  const [items, setItems] = useState([]);
  const [completed, setCompleted] = useState(new Set());
  const [quizScores, setQuizScores] = useState({});
  const [selected, setSelected] = useState(null);
  const [langFilter, setLangFilter] = useState("all");
  const [openCourseId, setOpenCourseId] = useState(null);
  const [openChapterIds, setOpenChapterIds] = useState(new Set());
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("mytaman:sidebar:course");
  const [tutorCollapsed, toggleTutorCollapsed] = useSidebarCollapsed("mytaman:sidebar:socratic");

  useEffect(() => {
    setLoaded(false);
    setSelected(null);
    setOpenCourseId(null);
    setOpenChapterIds(new Set());
    (async () => {
      const [itemsRes, coursesRes, progressRes] = await Promise.all([
        api.get(`/content/list-paired?pack_id=${activePack.id}&only_published=true`),
        api.get(`/courses/list?pack_id=${activePack.id}`),
        api.get(`/content/progress?pack_id=${activePack.id}`),
      ]);
      setItems(itemsRes.data);
      setCourses(coursesRes.data);
      setCompleted(new Set(progressRes.data.completed_ids));
      setQuizScores(progressRes.data.quiz_scores || {});

      const chapterLists = await Promise.all(coursesRes.data.map((c) => api.get(`/chapters/list?course_id=${c.id}`)));
      const map = {};
      coursesRes.data.forEach((c, i) => { map[c.id] = chapterLists[i].data; });
      setChaptersByCourse(map);
      if (coursesRes.data.length === 1) setOpenCourseId(coursesRes.data[0].id);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePack.id]);

  const markComplete = (id) => setCompleted((prev) => new Set(prev).add(id));
  const markIncomplete = (id) => setCompleted((prev) => { const next = new Set(prev); next.delete(id); return next; });
  const updateQuizScore = (id, score, total) =>
    setQuizScores((prev) => ({ ...prev, [id]: { score, total, attempts: (prev[id]?.attempts || 0) + 1 } }));

  const toggleChapter = (id) => {
    setOpenChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // "All" shows bilingual pairs (BM primary, EN secondary). "En"/"Bm" each show every
  // lesson generated in that language, regardless of whether the other language also
  // exists for it -- "has this language", not "only this language". Both language ids
  // stay on the pair either way -- ContentViewer/CourseSidebar decide what to *display*
  // from `langFilter`, but "done" is always checked against both ids, so completing a
  // lesson under one filter still reads as done under the others.
  const filteredItems = useMemo(() => {
    if (langFilter === "all") return items.filter((it) => it.bm && it.en);
    if (langFilter === "en") return items.filter((it) => it.en);
    return items.filter((it) => it.bm);
  }, [items, langFilter]);

  useEffect(() => {
    setSelected(null);
  }, [langFilter]);

  const completedPairCount = filteredItems.filter((it) => isPairDone(it, completed)).length;
  const progressPct = filteredItems.length ? Math.round((completedPairCount / filteredItems.length) * 100) : 0;

  const itemsByChapter = useMemo(() => {
    const map = {};
    filteredItems.forEach((it) => {
      const key = it.chapter_id || "other";
      (map[key] = map[key] || []).push(it);
    });
    return map;
  }, [filteredItems]);

  // Reading order for "Go to next item": every course's chapters in order, each chapter's
  // lessons in order -- lets the next-item button walk straight across chapter boundaries.
  const flatLessons = useMemo(() => {
    const out = [];
    courses.forEach((course) => {
      (chaptersByCourse[course.id] || []).forEach((ch) => {
        (itemsByChapter[ch.id] || []).forEach((it) => out.push({ item: it, courseId: course.id, chapterId: ch.id }));
      });
    });
    return out;
  }, [courses, chaptersByCourse, itemsByChapter]);

  const currentIndex = selected ? flatLessons.findIndex((l) => l.item.key === selected.key) : -1;
  const nextLesson = currentIndex >= 0 ? flatLessons[currentIndex + 1] : undefined;

  // The tutor docks beside an open lesson, never on the welcome pane -- it exists to
  // discuss the thing on screen, so with nothing on screen there is nothing to discuss.
  // It talks about the exact language variant being read, not the pair.
  const tutorVariant = selected ? primaryVariant(selected, langFilter) : null;
  const tutorLang = tutorVariant && selected?.bm && tutorVariant.id === selected.bm.id ? "bm" : "en";
  // Every pack carries the tutor now that tiers are gone; the dock just needs a lesson
  // open. Access is still re-checked server-side on every Socratic endpoint.
  const showTutor = !!tutorVariant;

  const goToNext = () => {
    if (!nextLesson) return;
    setOpenCourseId(nextLesson.courseId);
    setOpenChapterIds((prev) => new Set(prev).add(nextLesson.chapterId));
    setSelected(nextLesson.item);
  };

  // Picking a lesson from the collapsed rail also expands its course/chapter, so the tree
  // is already showing that lesson in context whenever the sidebar is opened back up.
  const selectFromRail = (pair) => {
    const entry = flatLessons.find((l) => l.item.key === pair.key);
    if (entry) {
      setOpenCourseId(entry.courseId);
      setOpenChapterIds((prev) => new Set(prev).add(entry.chapterId));
    }
    setSelected(pair);
  };

  return (
    <div className="fixed inset-0 z-30 flex bg-[var(--bg)]">
      <motion.aside
        initial={reduce ? false : { x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={`${collapsed ? "w-[76px]" : "w-[320px]"} shrink-0 border-r border-white/8 bg-[#0a0514]/80 backdrop-blur-xl flex flex-col transition-[width] duration-200`}
        data-testid="course-sidebar"
        data-collapsed={collapsed}
      >
        <div className={`border-b border-white/8 ${collapsed ? "p-3 flex flex-col items-center gap-3" : "p-5 pb-3 flex items-center gap-2"}`}>
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2] shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-white leading-tight truncate">Lv99.ai</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]">Course navigator</div>
            </div>
          )}
          <SidebarToggle collapsed={collapsed} onToggle={toggleCollapsed} testId="course-sidebar-toggle" align={collapsed ? "center" : "left"} />
        </div>

        {!collapsed && mine.length > 1 && (
          <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto">
            {mine.map((p) => (
              <button
                key={p.id}
                onClick={() => onSwitchPack(p.id)}
                data-testid={`sidebar-pack-${p.id}`}
                className={`shrink-0 rounded-full px-3 py-1 text-xs border transition-colors ${
                  p.id === activePack.id ? "border-[#00f0ff] text-[#00f0ff]" : "border-white/10 text-white/50 hover:border-white/30"
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {/* Cross-portal navigation sits with the other navigation controls at the top,
            above the language filter -- the footer is for account/session actions. */}
        <div className={`${collapsed ? "px-2 pt-3 flex-col items-center gap-1.5" : "px-4 pt-3 gap-1.5"} flex`}>
          <button
            onClick={() => navigate("/student/browse")}
            data-testid="side-browse"
            title={collapsed ? t("browse_packs") : undefined}
            className={`group relative inline-flex items-center justify-center rounded-xl border border-white/10 text-xs text-white/70 hover:border-[#00f0ff]/40 hover:text-[#00f0ff] transition-colors ${
              collapsed ? "h-9 w-9" : "flex-1 gap-1.5 px-2 py-2"
            }`}
          >
            <Package size={13} /> {!collapsed && t("browse_packs")}
            {collapsed && <RailTooltip>{t("browse_packs")}</RailTooltip>}
          </button>
          <button
            onClick={() => navigate("/student/dashboard")}
            data-testid="side-dashboard"
            title={collapsed ? t("dashboard") || "Dashboard" : undefined}
            className={`group relative inline-flex items-center justify-center rounded-xl border border-white/10 text-xs text-white/70 hover:border-[#00f0ff]/40 hover:text-[#00f0ff] transition-colors ${
              collapsed ? "h-9 w-9" : "flex-1 gap-1.5 px-2 py-2"
            }`}
          >
            <Trophy size={13} /> {!collapsed && (t("dashboard") || "Dashboard")}
            {collapsed && <RailTooltip>{t("dashboard") || "Dashboard"}</RailTooltip>}
          </button>
        </div>

        <div className={`px-4 pt-3 gap-1 ${collapsed ? "hidden" : "flex"}`} data-testid="lang-filter">
          {LANG_FILTERS.map((l) => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              data-testid={`lang-filter-${l}`}
              className={`rounded-full px-3 py-1 text-xs uppercase border transition-colors ${
                langFilter === l ? "border-[#00f0ff] text-[#00f0ff]" : "border-white/10 text-white/50 hover:border-white/30"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className={`flex-1 overflow-y-auto py-4 mt-1 ${collapsed ? "px-2" : "px-3"}`}>
          {!loaded ? (
            <div className={collapsed ? "text-center text-xs text-white/40" : "px-2 text-sm text-white/40"}>{collapsed ? "…" : "Loading…"}</div>
          ) : collapsed ? (
            <CourseSidebarRail
              lessons={flatLessons.map((l) => l.item)}
              completed={completed}
              selectedKey={selected?.key}
              onSelectContent={selectFromRail}
            />
          ) : (
            <CourseSidebar
              courses={courses}
              chaptersByCourse={chaptersByCourse}
              itemsByChapter={itemsByChapter}
              completed={completed}
              openCourseId={openCourseId}
              onToggleCourse={(id) => setOpenCourseId((cur) => (cur === id ? null : id))}
              openChapterIds={openChapterIds}
              onToggleChapter={toggleChapter}
              selectedKey={selected?.key}
              langFilter={langFilter}
              onSelectContent={setSelected}
            />
          )}
        </div>

        <div className={`border-t border-white/8 ${collapsed ? "p-2 flex flex-col items-center gap-1.5" : "p-4 space-y-3"}`}>
          {!collapsed && (
            <>
              <LanguageToggle testId="course-lang" />
              <div className="text-xs text-white/60">
                <div className="font-mono truncate" title={user.email || user.username}>{user.email || user.username}</div>
                <div className="text-white/40">{user.name}</div>
              </div>
            </>
          )}
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); navigate("/"); }}
            title={collapsed ? t("logout") : undefined}
            className={`inline-flex items-center rounded-xl border border-white/10 text-sm text-white/80 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors ${
              collapsed ? "h-9 w-9 justify-center" : "w-full gap-2 px-3 py-2"
            }`}
          >
            <LogOut size={14} /> {!collapsed && t("logout")}
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {selected ? (
          <>
            <div className="shrink-0 border-b border-white/8 bg-[#0a0514]/60 px-6 sm:px-10 py-3 flex items-center gap-4" data-testid="lesson-progress-bar">
              <span className="text-xs text-white/50 shrink-0">
                Lesson {currentIndex + 1} of {flatLessons.length}
              </span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-white/50 shrink-0">
                {completedPairCount}/{filteredItems.length} completed
              </span>
            </div>

            <div className="flex-1 min-h-0">
              <ContentViewer
                key={selected.key}
                variant="pane"
                pair={selected}
                focusLang={langFilter}
                done={isPairDone(selected, completed)}
                onClose={() => setSelected(null)}
                onComplete={markComplete}
                onUncomplete={markIncomplete}
                onQuizScore={updateQuizScore}
              />
            </div>

            <div className="shrink-0 border-t border-white/8 bg-[#0a0514]/60 px-6 sm:px-10 py-3 flex justify-end">
              <button
                type="button"
                onClick={goToNext}
                disabled={!nextLesson}
                data-testid="go-to-next-item"
                className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#00f0ff]"
              >
                {nextLesson ? "Go to next item" : "You're all caught up"}
                {nextLesson && <ArrowRight size={15} />}
              </button>
            </div>
          </>
        ) : (
          <WelcomePane pack={activePack} progressPct={progressPct} itemCount={filteredItems.length} />
        )}
      </main>

      {showTutor && (
        <SocraticPanel
          key={`${tutorVariant.id}:${tutorLang}`}
          contentId={tutorVariant.id}
          contentType={selected.content_type}
          language={tutorLang}
          collapsed={tutorCollapsed}
          onToggle={toggleTutorCollapsed}
        />
      )}
    </div>
  );
};

const StudentHome = () => {
  const { t } = useLang();
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePackId, setActivePackId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/packs/mine");
      setMine(data);
      if (data[0]) setActivePackId(data[0].id);
      setLoading(false);
    })();
  }, []);

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

  const activePack = mine.find((p) => p.id === activePackId) || mine[0];

  return <CoursePlayer mine={mine} activePack={activePack} onSwitchPack={setActivePackId} />;
};

const StudentBrowse = () => {
  const { t } = useLang();
  const navigate = useNavigate();
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

  // A student holds one Tutor Pack at a time, so enrolling somewhere new drops the
  // current one. That's a real loss of access, so it asks first and names what's going --
  // the progress itself is kept server-side and comes back if they switch back, which the
  // prompt says so nobody thinks their work has been thrown away.
  const enroll = async (pack) => {
    const current = packs.find((p) => enrolled.has(p.id) && p.id !== pack.id);
    if (current) {
      const ok = window.confirm(
        `Switch to "${pack.title}"?\n\n` +
        `You'll lose access to "${current.title}" — you can only study one Tutor Pack at a time.\n\n` +
        `Your progress in "${current.title}" is kept, and comes back if you switch to it again.`
      );
      if (!ok) return;
    }
    try {
      const { data } = await api.post("/packs/enroll", { pack_id: pack.id });
      toast.success(data.replaced_pack_ids?.length ? `Switched to ${pack.title}` : "Enrolled");
      navigate("/student");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't enroll in that pack.");
    }
  };

  const currentPack = packs.find((p) => enrolled.has(p.id)) || null;

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("browse_packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-3">Available Tutor Packs</h1>
      <p className="text-sm text-white/50 max-w-xl mb-8" data-testid="one-pack-note">
        {currentPack
          ? `${t("one_pack_rule")} ${t("one_pack_current")} "${currentPack.title}".`
          : t("one_pack_rule")}
      </p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="browse-list">
        {packs.map((p) => {
          const courses = coursesByPack[p.id] || [];
          const hasOtherPack = !!currentPack && currentPack.id !== p.id;
          return (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 flex flex-col">
              <div className="flex justify-between">
                <div className="overline text-[#00f0ff]">{p.grade}</div>
                <div className="flex items-center gap-2">
                  {enrolled.has(p.id) && (
                    <span className="rounded-full border border-[#00f0ff]/40 bg-[#00f0ff]/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#00f0ff]">
                      {t("current_pack")}
                    </span>
                  )}
                  <div className="text-[10px] uppercase tracking-widest text-white/40">{p.language.toUpperCase()}</div>
                </div>
              </div>
              <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
              <div className="text-xs text-white/50 mt-1">{p.grade}</div>
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
                onClick={() => (enrolled.has(p.id) ? navigate("/student") : enroll(p))}
                title={enrolled.has(p.id) ? "Go to My Tutor Packs" : hasOtherPack ? `Replaces ${currentPack.title}` : undefined}
                className={`mt-4 w-full rounded-full py-2 text-sm font-semibold transition-colors ${
                  enrolled.has(p.id)
                    ? "border border-white/10 text-white/70 hover:border-[#00f0ff]/40 hover:text-[#00f0ff]"
                    : "bg-[#00f0ff] text-black hover:bg-white"
                }`}
              >
                {enrolled.has(p.id) ? t("enrolled") : hasOtherPack ? t("switch_pack") : t("enroll")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { StudentHome, StudentBrowse };
