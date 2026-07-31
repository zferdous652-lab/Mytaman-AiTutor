import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// payload shape: { body }. Falls back to legacy top-level `body` for content created
// via the old /content/generate flow (predates the typed-payload draft/publish pipeline).
const SummaryViewer = ({ content, scrollRef }) => {
  const reduce = useReducedMotion();
  const text = content.payload?.body ?? content.body ?? "";
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -40]);

  if (!text) return <div className="text-base text-[#5c5346]">No content.</div>;

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
        {text}
      </motion.p>
    </div>
  );
};

export default SummaryViewer;
