import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// pair shape: { bm: {payload:{notes:string[]}}|null, en: {payload:{notes:string[]}}|null }.
// Notes are paired by index -- each row shows its BM line as the main text with the
// matching EN line as a subtle secondary line underneath, when both exist.
const NotesViewer = ({ pair, scrollRef }) => {
  const reduce = useReducedMotion();
  const bmNotes = pair.bm?.payload?.notes || [];
  const enNotes = pair.en?.payload?.notes || [];
  const count = Math.max(bmNotes.length, enNotes.length);
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -60]);
  const cardY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -24]);

  if (count === 0) return <div className="text-base text-[#5c5346]">No notes.</div>;

  return (
    <div className="relative" data-testid="notes-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 h-56 rounded-full blur-3xl opacity-10"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(31,111,92,0.4), transparent 65%)" }}
      />
      <motion.div style={{ y: cardY }} className="relative space-y-3">
        {Array.from({ length: count }).map((_, i) => {
          const main = bmNotes[i] || enNotes[i];
          const sub = bmNotes[i] && enNotes[i] ? enNotes[i] : null;
          return (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5, root: scrollRef }}
              transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.03 }}
              className="rounded-xl border border-[#3b2f1a]/12 bg-white/50 px-4 py-3.5"
            >
              <div className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#1f6f5c] shrink-0" />
                <span className="text-xl text-[#2b2620] leading-relaxed">{main}</span>
              </div>
              {sub && <div className="mt-1.5 pl-[18px] text-base text-[#5c5346] italic">{sub}</div>}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default NotesViewer;
