import React, { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";

const ELEVATED = "0 6px 0 rgba(0,240,255,0.18), 0 10px 24px rgba(0,0,0,0.35)";
const PRESSED = "0 2px 0 rgba(0,240,255,0.18), 0 4px 10px rgba(0,0,0,0.3)";

const TONE_CLASS = {
  idle: "border-white/12 bg-white/[0.04] text-white/80 hover:border-white/25",
  selected: "border-[#00f0ff] bg-[#00f0ff]/10 text-[#00f0ff]",
  correct: "border-emerald-400/70 bg-emerald-400/10 text-emerald-300",
  incorrect: "border-[#ff0055]/70 bg-[#ff0055]/10 text-[#ff0055]",
  faded: "border-white/8 text-white/30",
};

const OptionButton = ({ children, tone, onClick, disabled, testId, reduce }) => (
  <motion.button
    type="button"
    disabled={disabled}
    onClick={onClick}
    data-testid={testId}
    whileTap={!disabled && !reduce ? { y: 4, boxShadow: PRESSED } : undefined}
    style={reduce ? undefined : { boxShadow: ELEVATED }}
    transition={{ type: "spring", stiffness: 500, damping: 32 }}
    className={`w-full text-left rounded-xl border px-4 py-3.5 text-sm transition-colors ${TONE_CLASS[tone]}`}
  >
    {children}
  </motion.button>
);

const ScoreRing = ({ pct }) => (
  <div
    className="relative h-28 w-28 shrink-0 rounded-full grid place-items-center"
    style={{
      background: `conic-gradient(#00f0ff ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      boxShadow: "0 0 30px rgba(0,240,255,0.2)",
    }}
  >
    <div className="h-[86%] w-[86%] rounded-full bg-[#0a0514] grid place-items-center">
      <span className="font-display text-2xl text-white">{pct}%</span>
    </div>
  </div>
);

// payload shape: { questions: [{ type: mcq|true_false|short_answer, question, options?, correct_answer? }] }
const QuizViewer = ({ content, onFinish }) => {
  const reduce = useReducedMotion();
  const questions = useMemo(() => content.payload?.questions || [], [content.payload?.questions]);
  const total = questions.length;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shortDraft, setShortDraft] = useState("");

  const gradable = useMemo(() => questions.filter((q) => q.type !== "short_answer").length, [questions]);
  const correctCount = useMemo(
    () =>
      questions.reduce((acc, q, i) => {
        if (q.type === "short_answer") return acc;
        const given = answers[i];
        return acc + (given && given.toLowerCase() === (q.correct_answer || "").toLowerCase() ? 1 : 0);
      }, 0),
    [answers, questions]
  );

  if (total === 0) return <div className="text-sm text-white/40">No questions.</div>;

  const q = questions[index];

  const selectAnswer = (val) => {
    if (locked) return;
    setAnswers((a) => ({ ...a, [index]: val }));
    setLocked(true);
  };

  const submitShort = () => {
    if (locked) return;
    setAnswers((a) => ({ ...a, [index]: shortDraft }));
    setLocked(true);
  };

  const next = () => {
    if (index + 1 >= total) {
      setFinished(true);
      onFinish?.(correctCount, gradable);
      return;
    }
    setIndex((i) => i + 1);
    setLocked(false);
    setShortDraft("");
  };

  const retake = () => {
    setIndex(0);
    setAnswers({});
    setLocked(false);
    setFinished(false);
    setShortDraft("");
  };

  if (finished) {
    const pct = gradable ? Math.round((correctCount / gradable) * 100) : 0;
    return (
      <div className="space-y-6" data-testid="quiz-score">
        <div className="flex items-center gap-6">
          <ScoreRing pct={pct} />
          <div>
            <div className="text-sm text-white/60">Your score</div>
            <div className="font-display text-xl text-white">{correctCount}/{gradable} correct</div>
            {gradable < total && (
              <div className="text-xs text-white/40 mt-1">{total - gradable} short-answer question(s) aren't auto-graded</div>
            )}
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-auto pr-1">
          {questions.map((qq, i) => {
            if (qq.type === "short_answer") {
              return (
                <div key={i} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60">
                  <span className="text-white/40">Q{i + 1}.</span> {qq.question} — your answer: "{answers[i] || "—"}"
                </div>
              );
            }
            const ok = (answers[i] || "").toLowerCase() === (qq.correct_answer || "").toLowerCase();
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  ok ? "border-emerald-400/30 text-emerald-300/90" : "border-[#ff0055]/30 text-[#ff0055]/90"
                }`}
              >
                {ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <X size={13} className="mt-0.5 shrink-0" />}
                <span><span className="text-white/40">Q{i + 1}.</span> {qq.question}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={retake}
          data-testid="quiz-retake"
          className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
        >
          Retake quiz
        </button>
      </div>
    );
  }

  return (
    <div data-testid="quiz-view">
      <div className="mb-4">
        <div className="flex justify-between text-xs text-white/50 mb-1.5">
          <span>Question {index + 1} of {total}</span>
          <span>{Math.round((index / total) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]"
            animate={{ width: `${(index / total) * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.4 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          <div className="text-base text-white mb-4">{q.question}</div>

          {q.type === "mcq" && (
            <div className="space-y-2.5">
              {(q.options || []).map((opt) => {
                let tone = "idle";
                if (locked) {
                  if (opt === q.correct_answer) tone = "correct";
                  else if (opt === answers[index]) tone = "incorrect";
                  else tone = "faded";
                } else if (opt === answers[index]) tone = "selected";
                return (
                  <OptionButton key={opt} tone={tone} disabled={locked} reduce={reduce} onClick={() => selectAnswer(opt)} testId={`quiz-opt-${opt}`}>
                    {opt}
                  </OptionButton>
                );
              })}
            </div>
          )}

          {q.type === "true_false" && (
            <div className="grid grid-cols-2 gap-3">
              {["true", "false"].map((opt) => {
                let tone = "idle";
                if (locked) {
                  if (opt === q.correct_answer) tone = "correct";
                  else if (opt === answers[index]) tone = "incorrect";
                  else tone = "faded";
                } else if (opt === answers[index]) tone = "selected";
                return (
                  <OptionButton key={opt} tone={tone} disabled={locked} reduce={reduce} onClick={() => selectAnswer(opt)} testId={`quiz-tf-${opt}`}>
                    <span className="capitalize">{opt}</span>
                  </OptionButton>
                );
              })}
            </div>
          )}

          {q.type === "short_answer" && (
            <div className="space-y-3">
              <input
                disabled={locked}
                value={locked ? answers[index] || "" : shortDraft}
                onChange={(e) => setShortDraft(e.target.value)}
                placeholder="Your answer"
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#00f0ff] outline-none disabled:opacity-60"
              />
              {!locked ? (
                <button
                  type="button"
                  onClick={submitShort}
                  className="rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/40 px-4 py-1.5 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/20 transition-colors"
                >
                  Submit answer
                </button>
              ) : (
                <div className="text-xs text-white/50">
                  Answer recorded{q.correct_answer ? ` — expected: "${q.correct_answer}"` : ""}. Not auto-graded.
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {locked && (
        <button
          type="button"
          onClick={next}
          data-testid="quiz-next"
          className="mt-5 rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors"
        >
          {index + 1 >= total ? "See results" : "Next question"}
        </button>
      )}
    </div>
  );
};

export default QuizViewer;
