import React, { useRef } from "react";
import { api } from "@/lib/api";
import QuizViewer from "./viewers/QuizViewer";
import FlashcardsViewer from "./viewers/FlashcardsViewer";
import MindmapViewer from "./viewers/MindmapViewer";
import NotesViewer from "./viewers/NotesViewer";
import SummaryViewer from "./viewers/SummaryViewer";

const ContentViewer = ({ content, done, onClose, onComplete, onUncomplete }) => {
  const scrollRef = useRef(null);
  if (!content) return null;

  const markComplete = async () => {
    try {
      await api.post(`/content/${content.id}/complete`);
      onComplete?.(content.id);
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
  };

  const markIncomplete = async () => {
    try {
      await api.delete(`/content/${content.id}/complete`);
      onUncomplete?.(content.id);
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
  };

  const finishQuiz = async (score, total) => {
    try {
      await api.post(`/content/${content.id}/quiz-result`, { score, total });
    } catch (e) {
      // never block the score screen on a network hiccup — the attempt is still shown locally
    }
    onComplete?.(content.id);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-md p-3 sm:p-6" onClick={onClose}>
      <div
        ref={scrollRef}
        className="max-w-2xl w-full glass rounded-2xl p-5 sm:p-8 max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="content-modal"
      >
        <div className="overline text-[#00f0ff]">{content.content_type} · {content.language?.toUpperCase()}</div>
        <div className="font-display text-2xl tracking-tighter text-white mt-2 mb-5">{content.title}</div>

        {content.content_type === "quiz" && <QuizViewer content={content} onFinish={finishQuiz} />}
        {content.content_type === "flashcards" && <FlashcardsViewer content={content} />}
        {content.content_type === "mindmap" && <MindmapViewer content={content} />}
        {content.content_type === "notes" && <NotesViewer content={content} scrollRef={scrollRef} />}
        {content.content_type === "summary" && <SummaryViewer content={content} scrollRef={scrollRef} />}

        <div className="mt-6 flex gap-3">
          {content.content_type !== "quiz" && !done && (
            <button
              data-testid="mark-complete"
              onClick={markComplete}
              className="rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/40 px-5 py-2 text-sm text-[#00f0ff] hover:bg-[#00f0ff]/20 transition-colors"
            >
              Mark as complete
            </button>
          )}
          {done && (
            <button
              data-testid="mark-incomplete"
              onClick={markIncomplete}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors"
            >
              Mark as incomplete
            </button>
          )}
          <button
            data-testid="modal-close"
            onClick={onClose}
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContentViewer;
