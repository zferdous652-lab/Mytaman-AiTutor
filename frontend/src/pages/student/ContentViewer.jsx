import React, { useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import QuizViewer from "./viewers/QuizViewer";
import FlashcardsViewer from "./viewers/FlashcardsViewer";
import MindmapViewer from "./viewers/MindmapViewer";
import NotesViewer from "./viewers/NotesViewer";
import SummaryViewer from "./viewers/SummaryViewer";

// Reading-heavy content types get the paper theme; flashcards/mindmap keep the neon glass look.
const PAPER_TYPES = ["summary", "notes", "quiz"];
const CONTENT_TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

// pair shape (from GET /content/list-paired): { key, content_type, title,
// bm: {id,title,body,payload}|null, en: {...}|null }.
//
// focusLang controls which language is being *read*: "all" shows BM as the main content
// with EN as a subtle secondary wherever the content type supports it (falling back to
// whichever single language exists); "en"/"bm" show that language alone, matching the
// original single-language behavior. Completion, though, is always tracked pair-wide --
// marking complete only awards XP once (against whichever language is primary for the
// active view), but marking *incomplete* clears both language ids, and "done" (passed in
// from the caller) is computed by checking either id, so a lesson finished from "All"
// still reads as done after switching to "En" or "Bm", and vice versa.
// The badge reflects the active filter mode, not which languages this particular pair
// actually has -- "All" always reads "BM · EN" (even for a pair that's only BM under the
// hood), same as "En"/"Bm" always read their own name for whatever's currently shown.
const langBadge = (focusLang) => (focusLang === "all" ? "BM · EN" : focusLang.toUpperCase());

// Which language variant is the one actually being read. Exported because the Socratic
// tutor dock has to open its session against the exact same content id the student is
// looking at -- if these two ever disagreed, the tutor would be discussing a different
// language's copy of the lesson than the one on screen.
export const primaryVariant = (pair, focusLang) => {
  if (!pair) return null;
  if (focusLang === "en") return pair.en || pair.bm;
  if (focusLang === "bm") return pair.bm || pair.en;
  return pair.bm || pair.en;
};

// variant="modal" (default) -- the original centered popover, still used anywhere a lesson
// needs to float above other UI. variant="pane" -- fills its parent container edge-to-edge,
// used by the course player's right-hand reading pane instead of a popup.
const ContentViewer = ({ pair, done, onClose, onComplete, onUncomplete, onQuizScore, variant = "modal", focusLang = "all" }) => {
  const scrollRef = useRef(null);
  if (!pair) return null;

  const primary = primaryVariant(pair, focusLang);
  const secondary = focusLang === "all" && pair.bm && pair.en ? pair.en : null;
  if (!primary) return null;

  // What the purely-presentational viewers (Summary/Notes/Flashcards) render -- reflects
  // the active filter, unlike `pair` itself which always keeps both language ids around
  // for completion tracking.
  const displayPair = focusLang === "all" ? pair : { ...pair, bm: focusLang === "bm" ? pair.bm : null, en: focusLang === "en" ? pair.en : null };

  const paper = PAPER_TYPES.includes(pair.content_type);
  const pane = variant === "pane";

  const markComplete = async () => {
    try {
      const { data } = await api.post(`/content/${primary.id}/complete`);
      if (data?.xp_awarded > 0) toast.success(`+${data.xp_awarded} XP`);
      onComplete?.(primary.id);
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
  };

  const markIncomplete = async () => {
    // Clears both language ids so the lesson can always be fully un-completed regardless
    // of which language view (All/En/Bm) it was originally marked done from.
    try {
      await Promise.allSettled(
        [pair.bm?.id, pair.en?.id].filter(Boolean).map((id) => api.delete(`/content/${id}/complete`))
      );
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
    if (pair.bm) onUncomplete?.(pair.bm.id);
    if (pair.en) onUncomplete?.(pair.en.id);
  };

  const finishQuiz = async (score, total) => {
    try {
      const { data } = await api.post(`/content/${primary.id}/quiz-result`, { score, total });
      if (data?.xp_awarded > 0) toast.success(`+${data.xp_awarded} XP`);
    } catch (e) {
      // never block the score screen on a network hiccup — the attempt is still shown locally
    }
    onComplete?.(primary.id);
    onQuizScore?.(primary.id, score, total);
  };

  const body = (
    <div
      ref={scrollRef}
      className={
        pane
          ? `h-full w-full overflow-auto p-6 sm:p-10 lg:p-14 ${paper ? "paper-card paper-content" : "glass"}`
          : paper
          ? "paper-card paper-content max-w-4xl w-full rounded-2xl p-6 sm:p-10 lg:p-12 max-h-[90vh] overflow-auto"
          : "max-w-2xl w-full glass rounded-2xl p-5 sm:p-8 max-h-[85vh] overflow-auto"
      }
      onClick={pane ? undefined : (e) => e.stopPropagation()}
      data-testid="content-modal"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`overline ${paper ? "text-[#1f6f5c]" : "text-[#00f0ff]"}`}>
            {CONTENT_TYPE_LABELS[pair.content_type] || pair.content_type} · {langBadge(focusLang)}
          </div>
          <div className={`font-display text-2xl tracking-tighter mt-2 mb-5 ${paper ? "text-[#2b2620]" : "text-white"}`}>
            {pair.title}
          </div>
        </div>
        {pane && (
          <button
            type="button"
            data-testid="pane-close"
            onClick={onClose}
            aria-label="Close lesson"
            className={
              paper
                ? "shrink-0 rounded-full border border-[#3b2f1a]/20 p-2 text-[#5c5346] hover:border-[#1f6f5c] hover:text-[#1f6f5c] transition-colors"
                : "shrink-0 rounded-full border border-white/15 p-2 text-white/70 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
            }
          >
            <X size={16} />
          </button>
        )}
      </div>

      {pair.content_type === "quiz" && (
        <QuizViewer
          content={{ id: primary.id, content_type: "quiz", payload: primary.payload }}
          secondaryQuestions={secondary?.payload?.questions || []}
          onFinish={finishQuiz}
        />
      )}
      {pair.content_type === "flashcards" && <FlashcardsViewer pair={displayPair} />}
      {pair.content_type === "mindmap" && (
        <MindmapViewer
          content={{ payload: primary.payload }}
          secondary={secondary ? { payload: secondary.payload } : null}
          secondaryLabel="EN"
        />
      )}
      {pair.content_type === "notes" && <NotesViewer pair={displayPair} scrollRef={scrollRef} />}
      {pair.content_type === "summary" && <SummaryViewer pair={displayPair} scrollRef={scrollRef} />}

      <div className="mt-6 flex gap-3">
        {pair.content_type !== "quiz" && !done && (
          <button
            data-testid="mark-complete"
            onClick={markComplete}
            className={
              paper
                ? "rounded-full bg-[#1f6f5c]/10 border border-[#1f6f5c]/40 px-5 py-2 text-sm text-[#1f6f5c] hover:bg-[#1f6f5c]/20 transition-colors"
                : "rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/40 px-5 py-2 text-sm text-[#00f0ff] hover:bg-[#00f0ff]/20 transition-colors"
            }
          >
            Mark as complete
          </button>
        )}
        {done && (
          <button
            data-testid="mark-incomplete"
            onClick={markIncomplete}
            className={
              paper
                ? "rounded-full border border-[#3b2f1a]/25 px-5 py-2 text-sm text-[#5c5346] hover:border-[#b3261e] hover:text-[#b3261e] transition-colors"
                : "rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors"
            }
          >
            Mark as incomplete
          </button>
        )}
        {!pane && (
          <button
            data-testid="modal-close"
            onClick={onClose}
            className={
              paper
                ? "rounded-full border border-[#3b2f1a]/25 px-5 py-2 text-sm text-[#5c5346] hover:border-[#1f6f5c] hover:text-[#1f6f5c] transition-colors"
                : "rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
            }
          >
            Close
          </button>
        )}
      </div>
    </div>
  );

  if (pane) return body;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      {body}
    </div>
  );
};

export default ContentViewer;
