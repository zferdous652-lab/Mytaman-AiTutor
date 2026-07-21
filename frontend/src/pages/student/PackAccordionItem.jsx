import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { api } from "@/lib/api";
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
const OTHER_MODULE_KEY = "__ungrouped";

// A chapter row inside an expanded module -- collapsed by default, reveals its content-type
// cards when opened. Chapter identity comes straight off published content (chapter_id +
// title = chapter_title, set by publish_pack), no separate courses/chapters fetch needed.
const ChapterRow = ({ chapterId, title, items, completed, onOpenContent, isOpen, onToggle }) => (
  <div className="rounded-xl border border-white/8 overflow-hidden" data-testid={`chapter-${chapterId}`}>
    <button
      type="button"
      onClick={onToggle}
      data-testid={`chapter-toggle-${chapterId}`}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
    >
      <span className="text-sm text-white/80">{title}</span>
      <span className="flex items-center gap-2 text-xs text-white/30">
        {items.length} item{items.length === 1 ? "" : "s"}
        <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </span>
    </button>
    {isOpen && (
      <div className="grid lg:grid-cols-3 gap-4 px-4 pb-4" data-testid="content-grid">
        {items.map((c) => (
          <ContentCard key={c.id} content={c} done={completed.has(c.id)} onOpen={() => onOpenContent(c)} />
        ))}
      </div>
    )}
  </div>
);

// One row in the "My learning" accordion. Fetches its pack's published content + progress
// lazily, only once expanded, then groups it Module -> Chapter (a "Module" is a published
// draft bundle from Manual Content).
const PackAccordionItem = ({ pack, expanded, onToggle }) => {
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [completed, setCompleted] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [langFilter, setLangFilter] = useState("all");
  const [openModuleId, setOpenModuleId] = useState(null);
  const [openChapterIds, setOpenChapterIds] = useState(new Set());

  useEffect(() => {
    if (!expanded || loaded) return;
    (async () => {
      const [itemsRes, progressRes] = await Promise.all([
        api.get(`/content/list?pack_id=${pack.id}&only_published=true`),
        api.get(`/content/progress?pack_id=${pack.id}`),
      ]);
      setItems(itemsRes.data);
      setCompleted(new Set(progressRes.data.completed_ids));
      setLoaded(true);
    })();
  }, [expanded, loaded, pack.id]);

  const markComplete = (id) => setCompleted((prev) => new Set(prev).add(id));
  const markIncomplete = (id) => setCompleted((prev) => { const next = new Set(prev); next.delete(id); return next; });

  const toggleChapter = (id) => {
    setOpenChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleItems = items.filter((it) => langFilter === "all" || it.language === langFilter);
  const progressPct = items.length ? Math.round((completed.size / items.length) * 100) : 0;

  // Group by module (published draft), then by chapter within that module. Content
  // published before the module_id field existed falls into an "Other content" bucket.
  const modules = {};
  visibleItems.forEach((it) => {
    const moduleKey = it.module_id || OTHER_MODULE_KEY;
    if (!modules[moduleKey]) {
      modules[moduleKey] = {
        id: moduleKey,
        name: it.module_id ? (it.module_name || `Module ${it.module_index}`) : "Other content",
        index: it.module_index ?? Infinity,
        chapters: {},
      };
    }
    const chapterKey = it.chapter_id || "other";
    if (!modules[moduleKey].chapters[chapterKey]) {
      modules[moduleKey].chapters[chapterKey] = { id: chapterKey, title: it.title || "Untitled chapter", items: [] };
    }
    modules[moduleKey].chapters[chapterKey].items.push(it);
  });
  const moduleList = Object.values(modules).sort((a, b) => a.index - b.index);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0514]/40 overflow-hidden" data-testid={`pack-${pack.id}`}>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`pack-toggle-${pack.id}`}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div>
          <div className="font-display text-lg tracking-tight text-white">{pack.title}</div>
          <div className="text-xs text-white/40 mt-0.5">{pack.subject} · {pack.grade}</div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {loaded && (
            <div className="hidden sm:flex items-center gap-2 w-32">
              <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-xs text-white/50 w-8 text-right" data-testid="progress-pct">{progressPct}%</span>
            </div>
          )}
          <ChevronDown size={18} className={`text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-6 border-t border-white/8 pt-5">
          {!loaded ? (
            <div className="text-sm text-white/40">Loading…</div>
          ) : (
            <>
              <div className="mb-6 flex gap-1" data-testid="lang-filter">
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

              <div className="space-y-3" data-testid="module-list">
                {moduleList.map((mod) => {
                  const chapterList = Object.values(mod.chapters);
                  const isModuleOpen = openModuleId === mod.id;
                  return (
                    <div key={mod.id} className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden" data-testid={`module-${mod.id}`}>
                      <button
                        type="button"
                        onClick={() => setOpenModuleId((cur) => (cur === mod.id ? null : mod.id))}
                        data-testid={`module-toggle-${mod.id}`}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                      >
                        <span className="font-display text-base text-white">{mod.name}</span>
                        <span className="flex items-center gap-2 text-xs text-white/40">
                          {chapterList.length} chapter{chapterList.length === 1 ? "" : "s"}
                          <ChevronDown size={15} className={`transition-transform ${isModuleOpen ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                      {isModuleOpen && (
                        <div className="px-4 pb-4 space-y-2.5">
                          {chapterList.map((ch) => (
                            <ChapterRow
                              key={ch.id}
                              chapterId={ch.id}
                              title={ch.title}
                              items={ch.items}
                              completed={completed}
                              onOpenContent={setSelected}
                              isOpen={openChapterIds.has(ch.id)}
                              onToggle={() => toggleChapter(ch.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {visibleItems.length === 0 && <div className="text-sm text-white/40">No published content yet in this pack.</div>}
              </div>
            </>
          )}
        </div>
      )}

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

export default PackAccordionItem;
