import React from "react";
import { ChevronDown, ChevronRight, Check, FileText, HelpCircle, Layers, Waypoints, StickyNote } from "lucide-react";

const CONTENT_TYPE_ICON = { summary: FileText, quiz: HelpCircle, flashcards: Layers, mindmap: Waypoints, notes: StickyNote };
const CONTENT_TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

// A single lesson row inside an expanded chapter -- the leaf of the course tree.
const LessonRow = ({ content, done, active, onSelect }) => {
  const Icon = CONTENT_TYPE_ICON[content.content_type] || FileText;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`sidebar-content-${content.id}`}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? "bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30"
          : "text-white/65 hover:bg-white/5 hover:text-white border border-transparent"
      }`}
    >
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm truncate">{content.title}</span>
        <span className="block text-[10px] uppercase tracking-widest opacity-60">
          {CONTENT_TYPE_LABELS[content.content_type] || content.content_type} · {content.language?.toUpperCase()}
        </span>
      </span>
      {done ? (
        <Check size={13} className="shrink-0 text-emerald-400" />
      ) : (
        <span className="shrink-0 h-1.5 w-1.5 rounded-full border border-white/20" />
      )}
    </button>
  );
};

const ChapterNode = ({ chapter, items, completed, isOpen, onToggle, selectedId, onSelectContent }) => {
  const doneCount = items.filter((it) => completed.has(it.id)).length;
  return (
    <div data-testid={`sidebar-chapter-${chapter.id}`}>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`sidebar-chapter-toggle-${chapter.id}`}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm text-white/85 truncate">{chapter.title}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/35 shrink-0">
          {doneCount > 0 && <span className="text-emerald-400/80">{doneCount}/{items.length}</span>}
          {doneCount === 0 && <span>{items.length} item{items.length === 1 ? "" : "s"}</span>}
          <ChevronRight size={13} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </span>
      </button>
      {isOpen && (
        <div className="ml-2 mt-1 mb-2 space-y-1 border-l border-white/8 pl-3">
          {items.map((it) => (
            <LessonRow
              key={it.id}
              content={it}
              done={completed.has(it.id)}
              active={selectedId === it.id}
              onSelect={() => onSelectContent(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CourseNode = ({ course, chapters, itemsByChapter, completed, isOpen, onToggleCourse, openChapterIds, onToggleChapter, selectedId, onSelectContent }) => (
  <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden" data-testid={`sidebar-course-${course.id}`}>
    <button
      type="button"
      onClick={onToggleCourse}
      data-testid={`sidebar-course-toggle-${course.id}`}
      className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left hover:bg-white/[0.03] transition-colors"
    >
      <span className="font-display text-sm tracking-tight text-white truncate">{course.title}</span>
      <span className="flex items-center gap-1.5 text-xs text-white/40 shrink-0">
        {chapters.length} chapter{chapters.length === 1 ? "" : "s"}
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </span>
    </button>
    {isOpen && (
      <div className="px-2.5 pb-2.5 space-y-1">
        {chapters.map((ch) => (
          <ChapterNode
            key={ch.id}
            chapter={ch}
            items={itemsByChapter[ch.id] || []}
            completed={completed}
            isOpen={openChapterIds.has(ch.id)}
            onToggle={() => onToggleChapter(ch.id)}
            selectedId={selectedId}
            onSelectContent={onSelectContent}
          />
        ))}
      </div>
    )}
  </div>
);

// The course-navigator tree: Course (expandable) -> Chapter (expandable) -> lessons.
// Renders nothing but the tree itself; the caller owns layout/chrome around it.
const CourseSidebar = ({ courses, chaptersByCourse, itemsByChapter, completed, openCourseId, onToggleCourse, openChapterIds, onToggleChapter, selectedId, onSelectContent }) => (
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
          selectedId={selectedId}
          onSelectContent={onSelectContent}
        />
      );
    })}
  </div>
);

export default CourseSidebar;
