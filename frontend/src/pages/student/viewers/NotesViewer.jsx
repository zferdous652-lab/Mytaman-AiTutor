import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// payload shape: { notes: string[] }
const NotesViewer = ({ content, scrollRef }) => {
  const reduce = useReducedMotion();
  const notes = content.payload?.notes || [];
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -60]);
  const cardY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -24]);

  if (notes.length === 0) return <div className="text-sm text-white/40">No notes.</div>;

  return (
    <div className="relative" data-testid="notes-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 h-56 rounded-full blur-3xl opacity-30"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(0,240,255,0.35), transparent 65%)" }}
      />
      <motion.div style={{ y: cardY }} className="relative space-y-2.5">
        {notes.map((n, i) => (
          <motion.div
            key={i}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5, root: scrollRef }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.03 }}
            className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
          >
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#00f0ff] shrink-0" />
            <span className="text-sm text-white/85 leading-relaxed">{n}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default NotesViewer;
