import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// pair shape: { bm: {payload:{body}}|null, en: {payload:{body}}|null }. BM renders as the
// main text; EN (when both exist) renders as a subtle secondary block underneath.
const SummaryViewer = ({ pair, scrollRef }) => {
  const reduce = useReducedMotion();
  const bmText = pair.bm?.payload?.body ?? pair.bm?.body ?? "";
  const enText = pair.en?.payload?.body ?? pair.en?.body ?? "";
  const mainText = bmText || enText;
  const subText = bmText && enText ? enText : "";
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -40]);

  if (!mainText) return <div className="text-base text-[#5c5346]">No content.</div>;

  return (
    <div className="relative" data-testid="summary-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -top-8 h-40 rounded-full blur-3xl opacity-10"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(31,111,92,0.5), transparent 65%)" }}
      />
      <motion.p
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative whitespace-pre-wrap text-xl text-[#2b2620] leading-loose"
      >
        {mainText}
      </motion.p>
      {subText && (
        <div className="relative mt-6 pt-5 border-t border-[#3b2f1a]/12" data-testid="summary-secondary">
          <div className="overline text-[#8a6d3b] mb-2">English</div>
          <p className="whitespace-pre-wrap text-base text-[#5c5346] leading-relaxed italic">{subText}</p>
        </div>
      )}
    </div>
  );
};

export default SummaryViewer;
