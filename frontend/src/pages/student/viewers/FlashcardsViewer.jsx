import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";

// payload shape: { cards: [{ front, back }] }
const FlashcardsViewer = ({ content }) => {
  const reduce = useReducedMotion();
  const cards = content.payload?.cards || [];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState({});
  const [done, setDone] = useState(false);

  if (cards.length === 0) return <div className="text-sm text-white/40">No flashcards.</div>;

  const card = cards[index];

  const advance = (rating) => {
    setRatings((r) => ({ ...r, [index]: rating }));
    if (index + 1 >= cards.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  const restart = () => {
    setIndex(0);
    setFlipped(false);
    setRatings({});
    setDone(false);
  };

  const knowCount = Object.values(ratings).filter((r) => r === "know").length;
  const progressPct = Math.round((Object.keys(ratings).length / cards.length) * 100);

  if (done) {
    return (
      <div className="space-y-4" data-testid="flashcards-done">
        <div className="text-sm text-white/70">
          Reviewed all {cards.length} cards — <span className="text-emerald-300">{knowCount} known</span>,{" "}
          <span className="text-[#ffd23f]">{cards.length - knowCount} still learning</span>.
        </div>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
        >
          <RotateCcw size={13} /> Review again
        </button>
      </div>
    );
  }

  return (
    <div data-testid="flashcards-view">
      <div className="mb-5">
        <div className="flex justify-between text-xs text-white/50 mb-1.5">
          <span>Card {index + 1} of {cards.length}</span>
          <span>{progressPct}% reviewed</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="relative mx-auto" style={{ height: 220, maxWidth: 420 }}>
        {[2, 1].map((depth) => {
          const stackIdx = index + depth;
          if (stackIdx >= cards.length) return null;
          return (
            <div
              key={depth}
              aria-hidden
              className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.03]"
              style={{
                transform: `translateY(${depth * 8}px) scale(${1 - depth * 0.045})`,
                opacity: 0.5 - depth * 0.15,
                zIndex: 10 - depth,
              }}
            />
          );
        })}

        <div className="absolute inset-0" style={{ perspective: 1200, zIndex: 20 }}>
          <motion.button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            data-testid="flashcard-active"
            className="relative h-full w-full text-left cursor-pointer"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: reduce ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="absolute inset-0 rounded-2xl border border-[#00f0ff]/25 bg-gradient-to-br from-[#120a1f] to-[#0a0514] p-6 flex flex-col"
              style={{ backfaceVisibility: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,240,255,0.05)" }}
            >
              <div className="text-[10px] uppercase tracking-widest text-[#00f0ff]/70">Question · tap to flip</div>
              <div className="flex-1 grid place-items-center text-center text-lg text-white px-2">{card.front}</div>
            </div>
            <div
              className="absolute inset-0 rounded-2xl border border-[#8a2be2]/30 bg-gradient-to-br from-[#1a0f2e] to-[#0a0514] p-6 flex flex-col"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
            >
              <div className="text-[10px] uppercase tracking-widest text-[#8a2be2]/80">Answer</div>
              <div className="flex-1 grid place-items-center text-center text-base text-white/90 px-2">{card.back}</div>
            </div>
          </motion.button>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        {!flipped ? (
          <div className="text-xs text-white/40">Tap the card to reveal the answer</div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => advance("learning")}
              data-testid="flashcard-learning"
              className="rounded-full border border-[#ff0055]/40 px-5 py-2 text-sm text-[#ff0055] hover:bg-[#ff0055]/10 transition-colors"
            >
              Still learning
            </button>
            <button
              type="button"
              onClick={() => advance("know")}
              data-testid="flashcard-know"
              className="rounded-full border border-emerald-400/40 px-5 py-2 text-sm text-emerald-300 hover:bg-emerald-400/10 transition-colors"
            >
              Know it
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FlashcardsViewer;
