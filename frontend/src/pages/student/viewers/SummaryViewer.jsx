import React from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

const splitOn = (re) => (text) => text.split(re).map((p) => p.trim()).filter(Boolean);
const byBlankLine = splitOn(/\n\s*\n/);
const byLine = splitOn(/\n+/);

/**
 * Pairs BM and EN into matching blocks, or returns null if they cannot be trusted to
 * correspond.
 *
 * The FINEST alignment wins, not the first one found. A summary written as sections of
 * several lines each, separated by blank lines, aligns at both levels: line by line, and
 * section by section. Taking the section-level match puts a whole paragraph of English
 * under a whole paragraph of BM, which is barely better than stacking the two versions.
 * Line level puts each English sentence directly under the BM sentence it translates,
 * which is the point of the interleaved view. Preferring more blocks is also the safer
 * read, not the riskier one: the more blocks that line up, the less likely the match is
 * coincidence.
 *
 * Two blocks minimum, deliberately. Without it, two unrelated single-paragraph summaries
 * both split to one block, "match", and get rendered as though one were a translation of
 * the other. Refusing to pair is the safe answer whenever the structures disagree --
 * pairing the wrong lines together is worse than showing the two versions separately.
 */
const pairBlocks = (bmText, enText) => {
  if (!bmText || !enText) return null;
  let best = null;
  for (const split of [byLine, byBlankLine]) {
    const bm = split(bmText);
    const en = split(enText);
    if (bm.length < 2 || bm.length !== en.length) continue;
    if (!best || bm.length > best.bm.length) best = { bm, en };
  }
  return best;
};

// pair shape: { bm: {payload:{body}}|null, en: {payload:{body}}|null }. BM renders as the
// main text; EN (when both exist) renders as a subtle translation under each BM paragraph,
// same inline-per-line pattern as NotesViewer. When the two cannot be aligned -- which
// means they are not a translation pair, but two independently generated summaries -- each
// renders whole, one after the other, rather than pairing unrelated lines.
const SummaryViewer = ({ pair, scrollRef }) => {
  const reduce = useReducedMotion();
  const bmText = pair.bm?.payload?.body ?? pair.bm?.body ?? "";
  const enText = pair.en?.payload?.body ?? pair.en?.body ?? "";
  const mainText = bmText || enText;
  const { scrollYProgress } = useScroll({ container: scrollRef, layoutEffect: false });
  const bgY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -40]);

  if (!mainText) return <div className="text-base text-[#5c5346]">No content.</div>;

  const blocks = pairBlocks(bmText, enText);

  return (
    <div className="relative" data-testid="summary-view">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -top-8 h-40 rounded-full blur-3xl opacity-10"
        style={{ y: bgY, background: "radial-gradient(circle, rgba(31,111,92,0.5), transparent 65%)" }}
      />
      {blocks ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative space-y-5"
        >
          {blocks.bm.map((para, i) => (
            <div key={i}>
              <p className="whitespace-pre-wrap text-xl text-[#2b2620] leading-loose">{para}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-lg text-[#5c5346] leading-relaxed italic" data-testid="summary-secondary">
                {blocks.en[i]}
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
