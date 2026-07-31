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
// bm: {id,title,body,payload}|null, en: {...}|null }. BM is always the priority/main
// language when it exists; EN renders as a subtle secondary wherever the content type
// supports it, and is the sole content when no BM variant exists.
const langBadge = (pair) => (pair.bm && pair.en ? "BM · EN" : pair.bm ? "BM" : "EN");

// variant="modal" (default) -- the original centered popover, still used anywhere a lesson
// needs to float above other UI. variant="pane" -- fills its parent container edge-to-edge,
// used by the course player's right-hand reading pane instead of a popup.
const ContentViewer = ({ pair, done, onClose, onComplete, onUncomplete, onQuizScore, variant = "modal" }) => {
  const scrollRef = useRef(null);
  if (!pair) return null;

  const primary = pair.bm || pair.en;
  const secondary = pair.bm && pair.en ? pair.en : null;
  if (!primary) return null;

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
    try {
      await api.delete(`/content/${primary.id}/complete`);
      onUncomplete?.(primary.id);
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
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
            {CONTENT_TYPE_LABELS[pair.content_type] || pair.content_type} · {langBadge(pair)}
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
          secondaryQuestions={secondary?.payload?.questions?.map((q) => q.question) || []}
          onFinish={finishQuiz}
        />
      )}
      {pair.content_type === "flashcards" && <FlashcardsViewer pair={pair} />}
      {pair.content_type === "mindmap" && (
        <MindmapViewer
          content={{ payload: primary.payload }}
          secondary={secondary ? { payload: secondary.payload } : null}
          secondaryLabel="EN"
        />
      )}
      {pair.content_type === "notes" && <NotesViewer pair={pair} scrollRef={scrollRef} />}
      {pair.content_type === "summary" && <SummaryViewer pair={pair} scrollRef={scrollRef} />}

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
