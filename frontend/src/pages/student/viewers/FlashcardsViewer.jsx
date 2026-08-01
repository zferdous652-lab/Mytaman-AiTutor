import React, { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";

const MIN_CARD_HEIGHT = 220;
const MAX_CARD_HEIGHT = 520;
const FACE_VERTICAL_PADDING = 48; // p-6 top + bottom on each face -- not part of the measured inner content

// Cards with more text get a wider frame, not just a taller one -- more text per line
// means fewer wrapped lines, which keeps longer bilingual cards from turning into a tall,
// cramped column. Tiered on character count rather than measured, since (unlike height)
// the "right" width is a design choice, not something with one correct answer to measure.
const CARD_WIDTH_MIN = 420;
const CARD_WIDTH_MAX = 720;
const widthForLength = (len) => {
  if (len > 220) return CARD_WIDTH_MAX;
  if (len > 130) return 620;
  if (len > 70) return 520;
  return CARD_WIDTH_MIN;
};

// Shared markup for both the visible (flipping) faces and their invisible measurement
// clones below, so the two can never drift out of sync with each other. `measuring` swaps
// out the visible faces' "flex-1 + justify-center" (which vertically centers content within
// a *fixed* card height) for plain stacked layout -- flex-1 in an auto-height container is
// ambiguous across browsers and can under-report its natural height, which previously threw
// the measured card height off and made the centered answer text bleed up over the label.
const FaceContent = ({ label, labelClass, main, mainClass, sub, subClass, measuring }) => (
  <>
    <div className={`text-[10px] uppercase tracking-widest shrink-0 ${labelClass}`}>{label}</div>
    <div
      className={
        measuring
          ? "flex flex-col items-center text-center px-2 py-2"
          : "flex-1 min-h-0 flex flex-col items-center justify-center text-center px-2 py-2"
      }
    >
      <div className={mainClass}>{main}</div>
      {sub && <div className={`mt-2 text-base italic leading-relaxed ${subClass}`}>{sub}</div>}
    </div>
  </>
);

// pair shape: { bm: {payload:{cards}}|null, en: {payload:{cards}}|null }. Cards are paired
// by index; each face shows its BM text as the main line with the matching EN text as a
// subtle secondary line underneath, when both exist.
const FlashcardsViewer = ({ pair }) => {
  const reduce = useReducedMotion();
  const bmCards = pair.bm?.payload?.cards || [];
  const enCards = pair.en?.payload?.cards || [];
  const cardCount = Math.max(bmCards.length, enCards.length);
  const cards = Array.from({ length: cardCount }).map((_, i) => ({
    front: { main: bmCards[i]?.front || enCards[i]?.front, sub: bmCards[i]?.front && enCards[i]?.front ? enCards[i].front : null },
    back: { main: bmCards[i]?.back || enCards[i]?.back, sub: bmCards[i]?.back && enCards[i]?.back ? enCards[i].back : null },
  }));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState({});
  const [done, setDone] = useState(false);

  const containerRef = useRef(null);
  const frontMeasureRef = useRef(null);
  const backMeasureRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(MIN_CARD_HEIGHT);

  const card = cards[index];
  const cardWidth = widthForLength(
    Math.max(
      (card.front.main || "").length,
      (card.front.sub || "").length,
      (card.back.main || "").length,
      (card.back.sub || "").length
    )
  );

  // The card frame grows/shrinks per card to fit whichever face (front or back) needs more
  // room -- measured off invisible clones so the visible, absolutely-positioned flip faces
  // never have to guess a height up front. Re-measures on card change and on resize, since
  // the clones' width (and therefore their text wrapping) tracks the real card's width.
  useLayoutEffect(() => {
    const measure = () => {
      const frontH = frontMeasureRef.current?.offsetHeight || 0;
      const backH = backMeasureRef.current?.offsetHeight || 0;
      const natural = Math.max(frontH, backH) + FACE_VERTICAL_PADDING;
      if (natural > FACE_VERTICAL_PADDING) setCardHeight(Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, natural)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [card]);

  if (cards.length === 0) return <div className="text-sm text-white/40">No flashcards.</div>;

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
  const progressPct = Math.round((knowCount / cards.length) * 100);

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

      <div
        ref={containerRef}
        className="relative mx-auto"
        style={{ height: cardHeight, maxWidth: cardWidth, transition: "height 200ms ease, max-width 200ms ease" }}
      >
        {/* Invisible clones, one per face, used only to measure the height each face's real
            content needs at the card's actual width -- never shown or interactive. */}
        <div className="absolute left-0 right-0 top-0 invisible pointer-events-none p-6 flex flex-col" aria-hidden="true">
          <div ref={frontMeasureRef} className="flex flex-col">
            <FaceContent measuring label="Question · tap to flip" labelClass="" main={card.front.main} mainClass="text-xl leading-relaxed" sub={card.front.sub} subClass="" />
          </div>
        </div>
        <div className="absolute left-0 right-0 top-0 invisible pointer-events-none p-6 flex flex-col" aria-hidden="true">
          <div ref={backMeasureRef} className="flex flex-col">
            <FaceContent measuring label="Answer" labelClass="" main={card.back.main} mainClass="text-lg leading-relaxed" sub={card.back.sub} subClass="" />
          </div>
        </div>

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
              className="absolute inset-0 rounded-2xl border border-[#00f0ff]/25 bg-gradient-to-br from-[#120a1f] to-[#0a0514] p-6 flex flex-col overflow-hidden"
              style={{ backfaceVisibility: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,240,255,0.05)" }}
            >
              <FaceContent
                label="Question · tap to flip"
                labelClass="text-[#00f0ff]/70"
                main={card.front.main}
                mainClass="text-xl leading-relaxed text-white"
                sub={card.front.sub}
                subClass="text-white/50"
              />
            </div>
            <div
              className="absolute inset-0 rounded-2xl border border-[#8a2be2]/30 bg-gradient-to-br from-[#1a0f2e] to-[#0a0514] p-6 flex flex-col overflow-hidden"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
            >
              <FaceContent
                label="Answer"
                labelClass="text-[#8a2be2]/80"
                main={card.back.main}
                mainClass="text-lg leading-relaxed text-white/90"
                sub={card.back.sub}
                subClass="text-white/40"
              />
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
