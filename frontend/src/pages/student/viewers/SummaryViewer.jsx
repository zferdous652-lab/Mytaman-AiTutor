import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// Splits summary body text into paragraphs on blank lines -- the same shape the AI
// generator produces for both languages, which is what lets BM/EN paragraphs be paired
// by index below.
const splitParagraphs = (text) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// pair shape: { bm: {payload:{body}}|null, en: {payload:{body}}|null }. BM renders as the
// main text; EN (when both exist) renders as a subtle translation under each BM paragraph,
// same inline-per-line pattern as NotesViewer. Falls back to one whole-text block per
// language if the two don't split into the same number of paragraphs, so misaligned
// content still renders sensibly instead of pairing the wrong lines together.
const SummaryViewer = ({ pair, scrollRef }) => {
  const reduce = useReducedMotion();
  const bmText = pair.bm?.payload?.body ?? pair.bm?.body ?? "";
  const enText = pair.en?.payload?.body ?? pair.en?.body ?? "";
  const mainText = bmText || enText;
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -40]);

  if (!mainText) return <div className="text-base text-[#5c5346]">No content.</div>;

  const bmParas = splitParagraphs(bmText);
  const enParas = splitParagraphs(enText);
  const paired = bmText && enText && bmParas.length > 0 && bmParas.length === enParas.length;

  return (
    <div className="relative" data-testid="summary-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -top-8 h-40 rounded-full blur-3xl opacity-10"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(31,111,92,0.5), transparent 65%)" }}
      />
      {paired ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative space-y-5"
        >
          {bmParas.map((para, i) => (
            <div key={i}>
              <p className="whitespace-pre-wrap text-xl text-[#2b2620] leading-loose">{para}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-lg text-[#5c5346] leading-relaxed italic" data-testid="summary-secondary">
                {enParas[i]}
              </p>
            </div>
          ))}
        </motion.div>
      ) : (
        <>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative whitespace-pre-wrap text-xl text-[#2b2620] leading-loose"
          >
            {mainText}
          </motion.p>
          {bmText && enText && (
            <div className="relative mt-6 pt-5 border-t border-[#3b2f1a]/12" data-testid="summary-secondary">
              <div className="overline text-[#8a6d3b] mb-2">English</div>
              <p className="whitespace-pre-wrap text-lg text-[#5c5346] leading-relaxed italic">{enText}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SummaryViewer;
