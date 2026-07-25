import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, X, Clock, ChevronLeft } from "lucide-react";

const QUIZ_DURATION_SECONDS = 30 * 60;

const ELEVATED = "0 6px 0 rgba(31,111,92,0.18), 0 10px 24px rgba(59,47,26,0.15)";
const PRESSED = "0 2px 0 rgba(31,111,92,0.18), 0 4px 10px rgba(59,47,26,0.12)";

const TONE_CLASS = {
  idle: "border-[#3b2f1a]/15 bg-white/50 text-[#2b2620] hover:border-[#3b2f1a]/35",
  selected: "border-[#1f6f5c] bg-[#1f6f5c]/10 text-[#1f6f5c]",
  correct: "border-emerald-700/60 bg-emerald-700/10 text-emerald-800",
  incorrect: "border-[#b3261e]/60 bg-[#b3261e]/10 text-[#b3261e]",
  faded: "border-[#3b2f1a]/10 text-[#5c5346]/50",
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
    className={`w-full text-left rounded-xl border px-4 py-3.5 text-base transition-colors ${TONE_CLASS[tone]}`}
  >
    {children}
  </motion.button>
);

const ScoreRing = ({ pct }) => (
  <div
    className="relative h-28 w-28 shrink-0 rounded-full grid place-items-center"
    style={{
      background: `conic-gradient(#1f6f5c ${pct * 3.6}deg, rgba(59,47,26,0.1) 0deg)`,
      boxShadow: "0 0 20px rgba(31,111,92,0.15)",
    }}
  >
    <div className="h-[86%] w-[86%] rounded-full bg-[#f8f4e9] grid place-items-center">
      <span className="text-2xl font-bold text-[#2b2620]">{pct}%</span>
    </div>
  </div>
);

const formatClock = (secs) => {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
};

// Normalizes free text for short-answer auto-grading: lowercase, trim, strip punctuation,
// collapse whitespace. This is a blunt exact-match comparator -- it won't recognize a
// correctly-paraphrased answer, only one that matches the reference answer's wording.
const normalizeShortAnswer = (s) =>
  (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");

// Returns true/false once graded, or null when there's no reference answer to grade
// against at all (short-answer questions aren't required to have one).
const gradeShortAnswer = (question, given) => {
  if (!question.correct_answer) return null;
  return normalizeShortAnswer(given) === normalizeShortAnswer(question.correct_answer);
};

// payload shape: { questions: [{ type: mcq|true_false|short_answer, question, options?, correct_answer? }] }
const QuizViewer = ({ content, onFinish }) => {
  const reduce = useReducedMotion();
  const questions = useMemo(() => content.payload?.questions || [], [content.payload?.questions]);
  const total = questions.length;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  const [shortDraft, setShortDraft] = useState("");
  const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION_SECONDS);

  const locked = answers[index] !== undefined;

  // Gradable = every mcq/true_false question, plus short-answer questions that actually
  // have a reference answer to auto-grade against (a short-answer question is allowed to
  // have none, in which case it's excluded from scoring entirely rather than counted wrong).
  const gradable = useMemo(
    () => questions.filter((q) => q.type !== "short_answer" || !!q.correct_answer).length,
    [questions]
  );
  const correctCount = useMemo(
    () =>
      questions.reduce((acc, q, i) => {
        const given = answers[i];
        if (q.type === "short_answer") return acc + (gradeShortAnswer(q, given) === true ? 1 : 0);
        return acc + (given && given.toLowerCase() === (q.correct_answer || "").toLowerCase() ? 1 : 0);
      }, 0),
    [answers, questions]
  );

  const finishNow = () => {
    setFinished(true);
    onFinish?.(correctCount, gradable);
  };

  // Whole-quiz 30-minute countdown -- auto-submits with whatever's answered when it hits 0.
  useEffect(() => {
    if (finished || total === 0) return;
    if (timeLeft <= 0) {
      finishNow();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished, total]);

  if (total === 0) return <div className="text-base text-[#5c5346]">No questions.</div>;

  const q = questions[index];

  const selectAnswer = (val) => {
    if (locked) return;
    setAnswers((a) => ({ ...a, [index]: val }));
  };

  const submitShort = () => {
    if (locked) return;
    setAnswers((a) => ({ ...a, [index]: shortDraft }));
  };

  const goPrev = () => {
    if (index === 0) return;
    setIndex((i) => i - 1);
    setShortDraft("");
  };

  const next = () => {
    if (index + 1 >= total) {
      finishNow();
      return;
    }
    setIndex((i) => i + 1);
    setShortDraft("");
  };

  const retake = () => {
    setIndex(0);
    setAnswers({});
    setFinished(false);
    setShortDraft("");
    setTimeLeft(QUIZ_DURATION_SECONDS);
  };

  const answeredCount = Object.keys(answers).length;

  if (finished) {
    const pct = gradable ? Math.round((correctCount / gradable) * 100) : 0;
    const ungraded = total - gradable;
    return (
      <div className="space-y-7" data-testid="quiz-score">
        <div className="flex items-center gap-8">
          {gradable > 0 ? (
            <ScoreRing pct={pct} />
          ) : (
            <div className="h-28 w-28 shrink-0 rounded-full border border-[#3b2f1a]/15 bg-white/40 grid place-items-center text-center px-3">
              <span className="text-xs text-[#5c5346]">Not auto-graded</span>
            </div>
          )}
          <div>
            <div className="text-base text-[#5c5346]">Your score</div>
            {gradable > 0 ? (
              <div className="text-2xl font-bold text-[#2b2620]">{correctCount}/{gradable} correct</div>
            ) : (
              <div className="text-lg font-semibold text-[#2b2620]">This quiz isn't auto-graded</div>
            )}
            {ungraded > 0 && (
              <div className="text-sm text-[#5c5346] mt-1">
                {ungraded} short-answer question{ungraded === 1 ? "" : "s"} {gradable > 0 ? "aren't" : "isn't"} gradable
                (no reference answer set)
              </div>
            )}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 max-h-80 overflow-auto pr-1">
          {questions.map((qq, i) => {
            if (qq.type === "short_answer") {
              const graded = gradeShortAnswer(qq, answers[i]);
              const toneCls =
                graded === true
                  ? "border-emerald-700/25 bg-emerald-700/5 text-emerald-800"
                  : graded === false
                  ? "border-[#b3261e]/25 bg-[#b3261e]/5 text-[#b3261e]"
                  : "border-[#3b2f1a]/12 bg-white/40 text-[#5c5346]";
              return (
                <div key={i} className={`rounded-lg border px-4 py-3 text-sm ${toneCls}`}>
                  <div className="flex items-start gap-2">
                    {graded === true && <Check size={15} className="mt-0.5 shrink-0" />}
                    {graded === false && <X size={15} className="mt-0.5 shrink-0" />}
                    <span><span className="opacity-70">Q{i + 1}.</span> {qq.question}</span>
                  </div>
                  <div className="mt-1">Your answer: "{answers[i] || "—"}"</div>
                  {graded === false && qq.correct_answer && <div className="opacity-70">Expected: "{qq.correct_answer}"</div>}
                  {graded === null && <div className="mt-1 text-xs opacity-70">No reference answer -- not gradable</div>}
                </div>
              );
            }
            const given = answers[i];
            const ok = (given || "").toLowerCase() === (qq.correct_answer || "").toLowerCase();
            return (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  ok ? "border-emerald-700/25 bg-emerald-700/5 text-emerald-800" : "border-[#b3261e]/25 bg-[#b3261e]/5 text-[#b3261e]"
                }`}
              >
                <div className="flex items-start gap-2">
                  {ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <X size={15} className="mt-0.5 shrink-0" />}
                  <span><span className="opacity-70">Q{i + 1}.</span> {qq.question}</span>
                </div>
                <div className="mt-1.5 pl-[23px]">
                  <div>Your answer: <span className="font-medium">{given || "—"}</span></div>
                  {!ok && <div>Correct answer: <span className="font-medium">{qq.correct_answer}</span></div>}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={retake}
          data-testid="quiz-retake"
          className="rounded-full border border-[#3b2f1a]/20 px-6 py-2.5 text-base text-[#2b2620] hover:border-[#1f6f5c] hover:text-[#1f6f5c] transition-colors"
        >
          Retake quiz
        </button>
      </div>
    );
  }

  return (
    <div data-testid="quiz-view">
      <div className="flex justify-end mb-3">
        <div
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
            timeLeft <= 60 ? "border-[#b3261e]/40 text-[#b3261e]" : "border-[#3b2f1a]/15 text-[#5c5346]"
          }`}
          data-testid="quiz-timer"
        >
          <Clock size={14} />
          <span className={timeLeft <= 60 ? "font-semibold" : ""}>{formatClock(timeLeft)}</span>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-sm text-[#5c5346] mb-2">
          <span>Question {index + 1} of {total}</span>
          <span>{Math.round((answeredCount / total) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-[#3b2f1a]/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#1f6f5c] to-[#8a6d3b]"
            animate={{ width: `${(answeredCount / total) * 100}%` }}
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
          <div className="text-xl text-[#2b2620] mb-6">{q.question}</div>

          {q.type === "mcq" && (
            <div className="grid sm:grid-cols-2 gap-3.5">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-4">
              <input
                disabled={locked}
                value={locked ? answers[index] || "" : shortDraft}
                onChange={(e) => setShortDraft(e.target.value)}
                placeholder="Your answer"
                className="w-full rounded-lg border border-[#3b2f1a]/20 bg-white/50 px-4 py-3 text-lg text-[#2b2620] placeholder:text-[#5c5346]/50 focus:border-[#1f6f5c] outline-none disabled:opacity-60"
              />
              {!locked ? (
                <button
                  type="button"
                  onClick={submitShort}
                  className="rounded-full bg-[#1f6f5c]/10 border border-[#1f6f5c]/40 px-5 py-2 text-sm text-[#1f6f5c] hover:bg-[#1f6f5c]/20 transition-colors"
                >
                  Submit answer
                </button>
              ) : (
                (() => {
                  const graded = gradeShortAnswer(q, answers[index]);
                  if (graded === null) {
                    return <div className="text-sm text-[#5c5346]">Answer recorded — no reference answer set, so this question isn't scored.</div>;
                  }
                  return (
                    <div className={`flex items-center gap-2 text-sm font-medium ${graded ? "text-emerald-800" : "text-[#b3261e]"}`} data-testid="quiz-short-graded">
                      {graded ? <Check size={16} /> : <X size={16} />}
                      {graded ? "Correct!" : `Not quite — expected: "${q.correct_answer}"`}
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center gap-3">
        {index > 0 && (
          <button
            type="button"
            onClick={goPrev}
            data-testid="quiz-prev"
            className="inline-flex items-center gap-1 rounded-full border border-[#3b2f1a]/20 px-5 py-3 text-base text-[#2b2620] hover:border-[#1f6f5c] hover:text-[#1f6f5c] transition-colors"
          >
            <ChevronLeft size={16} /> Previous
          </button>
        )}
        {locked && (
          <button
            type="button"
            onClick={next}
            data-testid="quiz-next"
            className="rounded-full bg-[#1f6f5c] px-7 py-3 text-base font-semibold text-white hover:bg-[#18594a] transition-colors"
          >
            {index + 1 >= total ? "See results" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
};

export default QuizViewer;
