import React from "react";
import { ChevronDown, ChevronRight, Check, FileText, HelpCircle, Layers, Waypoints, StickyNote, Folder } from "lucide-react";

const CONTENT_TYPE_ICON = { summary: FileText, quiz: HelpCircle, flashcards: Layers, mindmap: Waypoints, notes: StickyNote };
const CONTENT_TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

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
// one bilingual lesson: { key, content_type, title, bm, en }.
const LessonRow = ({ pair, done, active, langFilter, onSelect }) => {
  const Icon = CONTENT_TYPE_ICON[pair.content_type] || FileText;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`sidebar-content-${pair.key}`}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors border ${
        active ? "bg-white/10 border-white/20" : "border-transparent hover:bg-white/5"
      }`}
    >
      <Icon size={14} className={`shrink-0 ${active ? "text-white" : "text-white/50"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm truncate ${active ? "text-white font-medium" : "text-white/80"}`}>{pair.title}</span>
        <span className="block text-[10px] uppercase tracking-widest text-white/45">
          {CONTENT_TYPE_LABELS[pair.content_type] || pair.content_type} · {langBadge(langFilter)}
        </span>
      </span>
      {done ? (
        <Check size={13} className="shrink-0 text-emerald-400" />
      ) : (
        <span className="shrink-0 h-1.5 w-1.5 rounded-full border border-white/25" />
      )}
    </button>
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
          <ChevronRight size={13} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </span>
      </button>
      {isOpen && (
        <div className="ml-3 mt-1 mb-2 space-y-1 border-l-2 border-[#8a6dff]/20 pl-3">
          {items.map((it) => (
            <LessonRow
              key={it.key}
              pair={it}
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

// Top tier -- the loudest element in the tree: bold display font, full opacity white, and a
// gradient accent bar down the left edge so it visually anchors everything nested under it.
const CourseNode = ({ course, chapters, itemsByChapter, completed, isOpen, onToggleCourse, openChapterIds, onToggleChapter, selectedKey, langFilter, onSelectContent }) => (
  <div className="relative rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden" data-testid={`sidebar-course-${course.id}`}>
    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00f0ff] to-[#8a2be2]" aria-hidden />
    <button
      type="button"
      onClick={onToggleCourse}
      data-testid={`sidebar-course-toggle-${course.id}`}
      className="w-full flex items-center justify-between gap-2 pl-4 pr-3.5 py-3 text-left hover:bg-white/[0.04] transition-colors"
    >
      <span className="font-display text-base tracking-tight text-white truncate">{course.title}</span>
      <span className="flex items-center gap-1.5 text-xs text-white/45 shrink-0">
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </span>
    </button>
    {isOpen && (
      <div className="pl-3.5 pr-2.5 pb-2.5 space-y-1">
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
