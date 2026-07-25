import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// payload shape: { notes: string[] }
const NotesViewer = ({ content, scrollRef }) => {
  const reduce = useReducedMotion();
  const notes = content.payload?.notes || [];
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -60]);
  const cardY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -24]);

  if (notes.length === 0) return <div className="text-base text-[#5c5346]">No notes.</div>;

  return (
    <div className="relative" data-testid="notes-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 h-56 rounded-full blur-3xl opacity-10"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(31,111,92,0.4), transparent 65%)" }}
      />
      <motion.div style={{ y: cardY }} className="relative space-y-3">
        {notes.map((n, i) => (
          <motion.div
            key={i}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5, root: scrollRef }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.03 }}
            className="flex gap-3 rounded-xl border border-[#3b2f1a]/12 bg-white/50 px-4 py-3.5"
          >
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#1f6f5c] shrink-0" />
            <span className="text-lg text-[#2b2620] leading-relaxed">{n}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default NotesViewer;
