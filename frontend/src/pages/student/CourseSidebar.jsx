import React from "react";
import { ChevronDown, Check, FileText, HelpCircle, Layers, Share2, ClipboardList, Folder } from "lucide-react";
import { RailTooltip } from "@/components/SidebarToggle";

// Each content type gets its own icon + gradient tile so a lesson is identifiable at a
// glance from the icon alone, before reading the label.
const CONTENT_TYPES = {
  notes: { label: "Notes", icon: FileText, gradient: "from-[#a78bfa] to-[#7c3aed]" },
  mindmap: { label: "Mind Map", icon: Share2, gradient: "from-[#38bdf8] to-[#2563eb]" },
  flashcards: { label: "Flashcards", icon: Layers, gradient: "from-[#2dd4bf] to-[#0d9488]" },
  summary: { label: "Summary", icon: ClipboardList, gradient: "from-[#fbbf24] to-[#d97706]" },
  quiz: { label: "Quiz", icon: HelpCircle, gradient: "from-[#f472b6] to-[#db2777]" },
};

const FALLBACK_TYPE = { label: "Lesson", icon: FileText, gradient: "from-white/30 to-white/10" };

const contentTypeStyle = (contentType) => CONTENT_TYPES[contentType] || FALLBACK_TYPE;

// A pair counts as done if EITHER of its language ids has been marked complete -- so
// completing a lesson from "All" (which completes the BM id) still reads as done when the
// student later switches to the "En" filter, and vice versa. `completedIds` is the raw Set
// of completed content ids from GET /content/progress.
export const isPairDone = (pair, completedIds) =>
  (!!pair.bm && completedIds.has(pair.bm.id)) || (!!pair.en && completedIds.has(pair.en.id));

// The badge reflects the active filter mode, not which languages this particular pair
// actually has -- "All" always reads "BM · EN" (even for a pair that's only BM under the
// hood), same as "En"/"Bm" always read their own name for whatever's currently shown.
const langBadge = (langFilter) => (langFilter === "all" ? "BM · EN" : langFilter.toUpperCase());

// A single lesson row inside an expanded chapter -- the leaf of the course tree. `pair` is
// one bilingual lesson: { key, content_type, title, bm, en }. `step` is its 1-based position
// in the chapter, shown as the timeline node to the left of the card.
const LessonRow = ({ pair, step, isLast, done, active, langFilter, onSelect }) => {
  const type = contentTypeStyle(pair.content_type);
  const Icon = type.icon;
  return (
    <div className="flex items-stretch gap-3">
      {/* Timeline rail: a numbered bead per lesson, joined by a connector that runs down
          into the next row. The segment carries a negative bottom margin matching the
          list's row gap so the line stays unbroken across that gap. */}
      <div className="flex w-7 shrink-0 flex-col items-center" aria-hidden>
        <div
          className={`mt-5 h-7 w-7 shrink-0 grid place-items-center rounded-full border text-[11px] font-semibold transition-colors ${
            done
              ? "border-emerald-400/50 bg-[#0f1b17] text-emerald-400"
              : active
              ? "border-[#00f0ff]/60 bg-[#0b1620] text-[#00f0ff]"
              : "border-white/15 bg-[#100c1c] text-white/45"
          }`}
        >
          {step}
        </div>
        {!isLast && <span className="w-px flex-1 -mb-2 bg-white/10" />}
      </div>

      <button
        type="button"
        onClick={onSelect}
        data-testid={`sidebar-content-${pair.key}`}
        className={`min-w-0 flex-1 flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
          active ? "border-[#00f0ff]/50 bg-[#00f0ff]/[0.07]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
        }`}
      >
        <span className={`shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br ${type.gradient} grid place-items-center shadow-lg`}>
          <Icon size={20} className="text-white" strokeWidth={2.2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold uppercase tracking-wide text-white">{type.label}</span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-white/35">
            {langBadge(langFilter)}
          </span>
        </span>

        {done ? (
          <Check size={15} className="shrink-0 text-emerald-400" />
        ) : (
          <span className="shrink-0 h-3 w-3 rounded-full border border-white/20" />
        )}
      </button>
    </div>
  );
};

// Middle tier -- visually quieter than the course header (no bold display font) but louder
// than lesson rows (a folder icon + all-caps label), so it reads as its own layer.
const ChapterNode = ({ chapter, items, completed, isOpen, onToggle, selectedKey, langFilter, onSelectContent }) => {
  const doneCount = items.filter((it) => isPairDone(it, completed)).length;
  return (
    <div data-testid={`sidebar-chapter-${chapter.id}`}>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`sidebar-chapter-toggle-${chapter.id}`}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Folder size={13} className="shrink-0 text-[#8a6dff]" />
          <span className="text-[13px] font-semibold uppercase tracking-wide text-[#c4bdff] truncate">{chapter.title}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/35 shrink-0">
          {doneCount > 0 && <span className="text-emerald-400/80">{doneCount}/{items.length}</span>}
          {doneCount === 0 && <span>{items.length} item{items.length === 1 ? "" : "s"}</span>}
          <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen && (
        <div className="mt-1.5 mb-2 space-y-2">
          {items.map((it, i) => (
            <LessonRow
              key={it.key}
              pair={it}
              step={i + 1}
              isLast={i === items.length - 1}
              done={isPairDone(it, completed)}
              active={selectedKey === it.key}
              langFilter={langFilter}
              onSelect={() => onSelectContent(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Top tier -- the loudest element in the tree: bold display font at full opacity white,
// wrapped in a card that visually contains everything nested under it.
const CourseNode = ({ course, chapters, itemsByChapter, completed, isOpen, onToggleCourse, openChapterIds, onToggleChapter, selectedKey, langFilter, onSelectContent }) => (
  <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden" data-testid={`sidebar-course-${course.id}`}>
    <button
      type="button"
      onClick={onToggleCourse}
      data-testid={`sidebar-course-toggle-${course.id}`}
      className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left hover:bg-white/[0.04] transition-colors"
    >
      <span className="font-display text-lg tracking-tight text-white truncate">{course.title}</span>
      <span className="flex items-center gap-1.5 text-xs text-white/45 shrink-0">
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </span>
    </button>
    {isOpen && (
      <div className="px-3 pb-3 space-y-1">
        {chapters.map((ch) => (
          <ChapterNode
            key={ch.id}
            chapter={ch}
            items={itemsByChapter[ch.id] || []}
            completed={completed}
            isOpen={openChapterIds.has(ch.id)}
            onToggle={() => onToggleChapter(ch.id)}
            selectedKey={selectedKey}
            langFilter={langFilter}
            onSelectContent={onSelectContent}
          />
        ))}
      </div>
    )}
  </div>
);

// The collapsed form of the navigator: just the lesson icon tiles in reading order, so a
// student can still jump between lessons without giving up the reading pane's width.
// `lessons` is the flattened, already language-filtered list of pairs.
export const CourseSidebarRail = ({ lessons, completed, selectedKey, onSelectContent }) => (
  <div className="flex flex-col items-center gap-2" data-testid="course-sidebar-rail">
    {lessons.map((pair) => {
      const type = contentTypeStyle(pair.content_type);
      const Icon = type.icon;
      const done = isPairDone(pair, completed);
      const active = selectedKey === pair.key;
      return (
        <button
          key={pair.key}
          type="button"
          onClick={() => onSelectContent(pair)}
          data-testid={`rail-content-${pair.key}`}
          title={`${type.label} — ${pair.title}`}
          className={`group relative h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br ${type.gradient} grid place-items-center transition-all hover:scale-105 ${
            active ? "ring-2 ring-[#00f0ff] ring-offset-2 ring-offset-[#0a0514]" : "opacity-75 hover:opacity-100"
          }`}
        >
          <Icon size={19} className="text-white" strokeWidth={2.2} />
          {done && (
            <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-[#0a0514] bg-emerald-400 grid place-items-center">
              <Check size={9} className="text-[#0a0514]" strokeWidth={3.5} />
            </span>
          )}
          <RailTooltip>{type.label}</RailTooltip>
        </button>
      );
    })}
  </div>
);

// The course-navigator tree: Course (expandable) -> Chapter (expandable) -> lessons.
// Renders nothing but the tree itself; the caller owns layout/chrome around it.
const CourseSidebar = ({ courses, chaptersByCourse, itemsByChapter, completed, openCourseId, onToggleCourse, openChapterIds, onToggleChapter, selectedKey, langFilter, onSelectContent }) => (
  <div className="space-y-2.5" data-testid="course-sidebar-tree">
    {courses.map((course) => {
      const chapters = (chaptersByCourse[course.id] || []).filter((ch) => itemsByChapter[ch.id]?.length);
      if (chapters.length === 0) return null;
      return (
        <CourseNode
          key={course.id}
          course={course}
          chapters={chapters}
          itemsByChapter={itemsByChapter}
          completed={completed}
          isOpen={openCourseId === course.id}
          onToggleCourse={() => onToggleCourse(course.id)}
          openChapterIds={openChapterIds}
          onToggleChapter={onToggleChapter}
          selectedKey={selectedKey}
          langFilter={langFilter}
          onSelectContent={onSelectContent}
        />
      );
    })}
  </div>
);

export default CourseSidebar;
