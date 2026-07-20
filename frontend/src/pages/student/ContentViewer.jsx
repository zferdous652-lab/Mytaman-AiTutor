import React, { useState } from "react";
import { api } from "@/lib/api";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SummaryView = ({ content }) => (
  <div className="whitespace-pre-wrap text-sm text-white/80 leading-relaxed">
    {content.payload?.body ?? content.body ?? "No content."}
  </div>
);

const NotesView = ({ content }) => (
  <ul className="space-y-2 text-sm text-white/80">
    {(content.payload?.notes || []).map((n, i) => (
      <li key={i} className="flex gap-2">
        <span className="text-[#00f0ff]">•</span>
        <span>{n}</span>
      </li>
    ))}
  </ul>
);

const MindmapView = ({ content }) => {
  const url = content.payload?.image_url;
  const src = url?.startsWith("http") ? url : `${BACKEND_URL}${url}`;
  return (
    <div>
      {url ? (
        <img src={src} alt={content.payload?.caption || "Mind map"} className="w-full rounded-xl border border-white/10" />
      ) : (
        <div className="text-sm text-white/40">No image.</div>
      )}
      {content.payload?.caption && <p className="mt-3 text-sm text-white/60">{content.payload.caption}</p>}
    </div>
  );
};

const FlashcardsView = ({ content }) => {
  const [flipped, setFlipped] = useState({});
  const cards = content.payload?.cards || [];
  return (
    <div className="grid sm:grid-cols-2 gap-3" data-testid="flashcard-grid">
      {cards.map((c, i) => (
        <button
          key={i}
          data-testid={`flashcard-${i}`}
          onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
          className="text-left rounded-xl border border-white/10 bg-white/5 p-4 min-h-[110px] hover:border-[#00f0ff]/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
            {flipped[i] ? "Answer · tap to flip back" : "Question · tap to flip"}
          </div>
          <div className="text-sm text-white">{flipped[i] ? c.back : c.front}</div>
        </button>
      ))}
      {cards.length === 0 && <div className="text-sm text-white/40">No flashcards.</div>}
    </div>
  );
};

const QuizView = ({ content, onSubmit }) => {
  const questions = content.payload?.questions || [];
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const score = questions.reduce(
    (acc, q, i) => {
      if (q.type === "short_answer") return acc;
      acc.gradable += 1;
      if ((answers[i] || "").toLowerCase() === (q.correct_answer || "").toLowerCase()) acc.correct += 1;
      return acc;
    },
    { correct: 0, gradable: 0 }
  );

  const submit = () => {
    setSubmitted(true);
    onSubmit?.();
  };

  return (
    <div className="space-y-5" data-testid="quiz-view">
      {questions.map((q, i) => (
        <div key={i} className="rounded-xl border border-white/10 p-4">
          <div className="text-sm text-white mb-3">{i + 1}. {q.question}</div>

          {q.type === "mcq" && (
            <div className="space-y-2">
              {(q.options || []).map((opt) => {
                const isCorrect = opt === q.correct_answer;
                const isPicked = opt === answers[i];
                const cls = submitted
                  ? isCorrect
                    ? "border-emerald-400/60 text-emerald-300"
                    : isPicked
                    ? "border-[#ff0055]/60 text-[#ff0055]"
                    : "border-white/10 text-white/60"
                  : isPicked
                  ? "border-[#00f0ff] text-[#00f0ff]"
                  : "border-white/10 text-white/70 hover:border-white/30";
                return (
                  <label key={opt} className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer ${cls}`}>
                    <input
                      type="radio"
                      className="accent-[#00f0ff]"
                      name={`q-${i}`}
                      disabled={submitted}
                      checked={isPicked}
                      onChange={() => setAnswers((a) => ({ ...a, [i]: opt }))}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          )}

          {q.type === "true_false" && (
            <div className="flex gap-2">
              {["true", "false"].map((opt) => {
                const isCorrect = opt === q.correct_answer;
                const isPicked = opt === answers[i];
                const cls = submitted
                  ? isCorrect
                    ? "border-emerald-400/60 text-emerald-300"
                    : isPicked
                    ? "border-[#ff0055]/60 text-[#ff0055]"
                    : "border-white/10 text-white/60"
                  : isPicked
                  ? "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10"
                  : "border-white/10 text-white/70 hover:border-white/30";
                return (
                  <button key={opt} disabled={submitted} onClick={() => setAnswers((a) => ({ ...a, [i]: opt }))} className={`rounded-lg border px-4 py-2 text-sm capitalize ${cls}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "short_answer" && (
            <input
              disabled={submitted}
              value={answers[i] || ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
              placeholder="Your answer"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#00f0ff] outline-none"
            />
          )}
        </div>
      ))}

      {questions.length === 0 && <div className="text-sm text-white/40">No questions.</div>}

      {questions.length > 0 && !submitted && (
        <button data-testid="quiz-submit" onClick={submit} className="rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors">
          Check answers
        </button>
      )}
      {submitted && (
        <div className="text-sm text-white/70" data-testid="quiz-score">
          Score: <span className="text-[#00f0ff] font-semibold">{score.correct}/{score.gradable}</span>
          {score.gradable < questions.length && " (short answers aren't auto-graded)"}
        </div>
      )}
    </div>
  );
};

const RENDERERS = {
  summary: SummaryView,
  notes: NotesView,
  mindmap: MindmapView,
  flashcards: FlashcardsView,
};

const ContentViewer = ({ content, onClose, onComplete }) => {
  if (!content) return null;
  const Renderer = RENDERERS[content.content_type];

  const markComplete = async () => {
    try {
      await api.post(`/content/${content.id}/complete`);
      onComplete?.(content.id);
    } catch (e) {
      // best-effort — completion tracking shouldn't block reading content
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-md p-6" onClick={onClose}>
      <div className="max-w-2xl w-full glass rounded-2xl p-8 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()} data-testid="content-modal">
        <div className="overline text-[#00f0ff]">{content.content_type} · {content.language?.toUpperCase()}</div>
        <div className="font-display text-2xl tracking-tighter text-white mt-2 mb-5">{content.title}</div>

        {content.content_type === "quiz" ? <QuizView content={content} onSubmit={markComplete} /> : Renderer ? <Renderer content={content} /> : <div className="text-sm text-white/40">Unsupported content type.</div>}

        <div className="mt-6 flex gap-3">
          {content.content_type !== "quiz" && (
            <button data-testid="mark-complete" onClick={markComplete} className="rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/40 px-5 py-2 text-sm text-[#00f0ff] hover:bg-[#00f0ff]/20 transition-colors">
              Mark as complete
            </button>
          )}
          <button data-testid="modal-close" onClick={onClose} className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContentViewer;
