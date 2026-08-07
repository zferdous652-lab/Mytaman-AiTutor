import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Boxes, Flame, Languages, Layers, Route, Sparkles, Target, Trophy, Zap } from "lucide-react";
import TiltCard from "@/components/TiltCard";

/* ------------------------------------------------------------------ *
 * Shared motion helpers
 * ------------------------------------------------------------------ */

// Standard scroll-reveal. `once` so sections don't re-animate every time the reader
// scrolls back up, which reads as jitter rather than delight.
export const Reveal = ({ children, delay = 0, y = 24, className = "" }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-90px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

/** Counts up when scrolled into view. Jumps straight to the value under reduced motion. */
const CountUp = ({ to, duration = 1400, suffix = "" }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setN(to); return; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutCubic — fast start, gentle settle, so the final value is readable.
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);

  return <span ref={ref}>{n}{suffix}</span>;
};

/* ------------------------------------------------------------------ *
 * Stat strip
 * ------------------------------------------------------------------ */
export const StatStrip = ({ t }) => {
  const stats = [
    { value: 5, label: t("stat_types"), icon: Layers },
    { value: 2, label: t("stat_langs"), icon: Languages },
    { value: 3, label: t("stat_providers"), icon: Route },
    { value: 99, label: t("stat_levels"), icon: Trophy },
  ];
  return (
    <section className="relative mx-auto max-w-7xl px-6 -mt-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <TiltCard
              intensity={7}
              className="rounded-2xl border border-white/10 bg-[#0a0514]/70 p-5 backdrop-blur-sm"
            >
              <s.icon size={16} className="text-[#00f0ff]" />
              <div className="mt-3 landing-display section-title text-white">
                <CountUp to={s.value} />
              </div>
              <div className="mt-1 text-xs text-white/50 leading-snug">{s.label}</div>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ *
 * "Under the hood" pipeline
 * ------------------------------------------------------------------ */
const PIPELINE_ICONS = [Languages, Sparkles, Boxes];

export const PipelineSection = ({ t }) => {
  const reduce = useReducedMotion();
  const items = [
    { title: t("uh2_title"), body: t("uh2_body") },
    { title: t("uh3_title"), body: t("uh3_body") },
    { title: t("uh4_title"), body: t("uh4_body") },
  ];

  return (
    <section id="how" className="relative mx-auto max-w-7xl px-6 py-28">
      <Reveal className="text-center">
        <div className="overline text-[#8a6dff] mb-3">{t("under_hood")}</div>
        <h2 className="landing-display section-title text-white mb-4">
          {t("under_hood_title_1")}{" "}
          <span className="bg-gradient-to-r from-[#00f0ff] via-[#8a2be2] to-[#ff0055] bg-clip-text text-transparent">
            {t("under_hood_title_2")}
          </span>
        </h2>
        <p className="mx-auto max-w-2xl text-white/55 leading-relaxed">{t("under_hood_sub")}</p>
      </Reveal>

      {/* Three across on wide screens. The centre spine that used to run between two
          columns went with the fourth card -- it existed to pair rows, and there are no
          pairs now. */}
      <div className="relative mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => {
          const Icon = PIPELINE_ICONS[i];
          return (
            <Reveal key={it.title} delay={i * 0.08}>
              <TiltCard
                intensity={8}
                className="group h-full rounded-2xl border border-white/10 bg-[#0a0514]/70 p-6 transition-colors hover:border-[#00f0ff]/40"
              >
                <div className="flex items-start gap-4">
                  <motion.span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#00f0ff]/25 bg-[#00f0ff]/10 text-[#00f0ff]"
                    animate={reduce ? undefined : { y: [0, -5, 0] }}
                    transition={{ duration: 3.5 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Icon size={20} />
                  </motion.span>
                  <div className="min-w-0">
                    <div className="font-display text-lg text-white tracking-tight">{it.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{it.body}</p>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ *
 * Gamification / progression
 * ------------------------------------------------------------------ */
export const ProgressionSection = ({ t }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduce = useReducedMotion();

  const rewards = [
    { icon: Zap, label: t("g_xp"), tint: "#00f0ff" },
    { icon: Flame, label: t("g_streak"), tint: "#ff8a00" },
    { icon: Target, label: t("g_missions"), tint: "#8a2be2" },
    { icon: Trophy, label: t("g_season"), tint: "#ffd23f" },
  ];

  return (
    <section id="progression" className="relative mx-auto max-w-7xl px-6 py-28">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="overline text-[#ffd23f] mb-3">{t("progression")}</div>
          <h2 className="landing-display section-title text-white mb-4">
            {t("progression_title")}
          </h2>
          <p className="max-w-xl leading-relaxed text-white/60">{t("progression_body")}</p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {rewards.map((r, i) => (
              <Reveal key={r.label} delay={0.1 + i * 0.06}>
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <r.icon size={16} style={{ color: r.tint }} />
                  <span className="text-sm text-white/75">{r.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* Live-feeling XP card: the product's own progression loop, shown rather than described. */}
        <Reveal delay={0.15}>
          <TiltCard
            intensity={9}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#120a1f] to-[#0a0514] p-7"
          >
            <div ref={ref}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]"
                    animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Trophy size={24} className="text-black" />
                  </motion.div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{t("g_level")}</div>
                    <div className="font-display text-3xl text-white">
                      <CountUp to={99} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-[#ff8a00]/40 bg-[#ff8a00]/10 px-3 py-1 text-xs text-[#ff8a00]">
                  <Flame size={12} /> <CountUp to={30} />
                </div>
              </div>

              <div className="mt-7">
                <div className="mb-2 flex justify-between text-[11px] text-white/45">
                  <span>{t("g_xp_earned")}</span>
                  <span>Lv99</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]"
                    initial={{ width: 0 }}
                    animate={inView ? { width: "100%" } : { width: 0 }}
                    transition={{ duration: reduce ? 0 : 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                {[t("g_chest"), t("g_spin"), t("g_badge")].map((label, i) => (
                  <motion.div
                    key={label}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3"
                    animate={reduce ? undefined : { y: [0, -4, 0] }}
                    transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                  >
                    <div className="text-[11px] text-white/60">{label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ *
 * Reserved slot for commissioned 3D art (see LANDING_ASSETS.md)
 * ------------------------------------------------------------------ */
export const MascotSlot = ({ t }) => {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  // Parallax drift, so the band has depth even before the real asset lands.
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [40, -40]);

  return (
    <section ref={ref} className="relative mx-auto max-w-7xl px-6 py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-dashed border-[#8a2be2]/30 bg-[#0a0514]/60 px-8 py-16 text-center">
          <motion.div
            aria-hidden
            style={{ y }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(138,43,226,0.18),transparent_60%)]"
          />
          <div className="relative">
            <motion.div
              className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-[#8a2be2]/40 bg-[#8a2be2]/10"
              animate={reduce ? undefined : { y: [0, -10, 0], rotate: [0, 4, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles size={34} className="text-[#8a6dff]" />
            </motion.div>
            <div className="mt-6 font-display text-2xl tracking-tight text-white">{t("mascot_title")}</div>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/50">{t("mascot_body")}</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
};
