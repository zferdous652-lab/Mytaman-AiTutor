import React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Shield, User, GraduationCap, Wallet } from "lucide-react";
import HeroScene from "@/components/HeroScene";
import LandingNav from "@/components/LandingNav";
import TiltCard from "@/components/TiltCard";
import { Reveal, StatStrip, PipelineSection, ProgressionSection, MascotSlot } from "@/components/LandingSections";
import { useLang } from "@/context/LangContext";
import lv99Lockup from "@/assets/brand/lv99-lockup.png";

const RoleCard = ({ to, label, tag, cta, icon: Icon, image, testId }) => (
  <TiltCard intensity={9} className="rounded-2xl">
  <Link to={to} data-testid={testId} className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-[#0a0514]/60 hover:border-[#00f0ff]/50 transition-colors">
    <div className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity">
      {/* Decorative, and below the fold: lazy so it never competes with the hero for
          bandwidth, with intrinsic dimensions so the card does not reflow when it lands. */}
      <img
        src={image}
        alt=""
        width={1200}
        height={800}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent" />
    </div>
    <div className="relative p-6 flex flex-col gap-4 h-64">
      <div className="flex items-center gap-2 overline text-[#00f0ff]">
        <Icon size={14} /> {tag}
      </div>
      <div className="mt-auto">
        <div className="font-display text-2xl text-white tracking-tight">{label}</div>
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-white/70 group-hover:text-[#00f0ff] transition-colors">
          {cta} <span aria-hidden="true">→</span>
        </div>
      </div>
    </div>
  </Link>
  </TiltCard>
);

// `Reveal` and `TiltCard` both gate on prefers-reduced-motion; this card was the one
// place that animated regardless.
const Feature = ({ i, title, body, icon: Icon }) => {
  const reduce = useReducedMotion();
  return (
  <motion.div
    initial={reduce ? false : { opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ delay: reduce ? 0 : i * 0.05 }}
    data-testid={`feature-${i}`}
  >
    <TiltCard intensity={8} className="h-full rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 hover:border-[#00f0ff]/40 transition-colors">
    <div className="mb-4 h-10 w-10 grid place-items-center rounded-lg bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff]">
      <Icon size={18} />
    </div>
    <div className="font-display text-lg text-white tracking-tight">{title}</div>
    <p className="mt-2 text-sm text-white/60 leading-relaxed">{body}</p>
    </TiltCard>
  </motion.div>
  );
};

// The five content types the hero mesh has orbiting it. Those spheres carry a `label`
// in HeroCanvas that never reached the screen, so the concept read as five random dots.
// Naming them in HTML says it once, legibly, and to a screen reader too -- cheaper and
// clearer than drawing text inside the WebGL scene.
const CONTENT_TYPES = [
  { key: "ct_notes", color: "#00f0ff" },
  { key: "ct_mindmap", color: "#8b5cf6" },
  { key: "ct_summary", color: "#00f0ff" },
  { key: "ct_flashcards", color: "#ff5ca8" },
  { key: "ct_quiz", color: "#8b5cf6" },
];

const Landing = () => {
  const { t } = useLang();

  return (
    <div className="relative">
      <a href="#main" className="skip-link">{t("skip_to_content")}</a>
      <LandingNav t={t} />

      <main id="main">
      {/* HERO */}
      <section className="relative min-h-screen overflow-hidden">
        <HeroScene />
        <div className="absolute inset-0 z-[1] grid-bg pointer-events-none" />
        {/* Explicit z-10 so the copy always sits above the scene and the grid overlay. */}
        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-40 pb-24 text-center">
          <div className="mx-auto max-w-5xl">
            <div className="inline-flex items-center gap-2.5 overline overline-hero text-[#00f0ff] mb-7">
              <Sparkles size={14} /> {t("tagline")}
            </div>
            <h1 className="landing-display hero-title text-white">
              {t("hero_title_1")}
              <br />
              <span className="text-[#00f0ff] neon-text">{t("hero_title_2")}</span>
            </h1>
            <p className="hero-sub mx-auto mt-6 max-w-2xl text-white/70">{t("hero_sub")}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                data-testid="hero-get-started"
                className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-6 py-3 text-sm font-semibold text-black hover:bg-white transition-colors"
              >
                {t("get_started")} <span>→</span>
              </Link>
              <Link
                to="/login"
                data-testid="hero-signin"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm text-white hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
              >
                {t("sign_in")}
              </Link>
            </div>

            <div className="mt-12">
              <div className="overline text-white/35">{t("generated_per_chapter")}</div>
              <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                {CONTENT_TYPES.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 text-sm text-white/65">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: c.color }}
                    />
                    {t(c.key)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <StatStrip t={t} />

      {/* HOW IT WORKS / UNDER THE HOOD */}
      <PipelineSection t={t} />

      {/* GAMIFICATION */}
      <ProgressionSection t={t} />

      {/* FEATURES */}
      <section id="features" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="text-center">
          <div className="overline text-[#00f0ff] mb-3">{t("features")}</div>
          <h2 className="landing-display section-title text-white mb-3">{t("features_title")}</h2>
          <p className="mx-auto max-w-2xl text-white/60 mb-10">{t("features_sub")}</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Icons follow the audience each card addresses, not the feature it used to describe. */}
          <Feature i={0} title={t("f1_title")} body={t("f1_body")} icon={GraduationCap} />
          <Feature i={1} title={t("f2_title")} body={t("f2_body")} icon={User} />
          <Feature i={2} title={t("f3_title")} body={t("f3_body")} icon={Shield} />
          <Feature i={3} title={t("f4_title")} body={t("f4_body")} icon={Wallet} />
        </div>
      </section>

      {/* ROLE CARDS */}
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="text-center">
          <div className="overline text-[#00f0ff] mb-3">{t("portals")}</div>
          <h2 className="landing-display section-title text-white mb-10">{t("portals_title")}</h2>
        </div>
        {/* Two entrances, not three. The admin portal is staff-only, so advertising it to
            the public serves nobody -- /login?role=admin still works for anyone who needs
            it, it just is not signposted from the homepage. Narrowed so two cards do not
            stretch across the full width. */}
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          <RoleCard
            testId="role-parent"
            to="/login?role=parent"
            label={t("login_parent")}
            tag={t("role_parent_tag")}
            cta={t("enter_portal")}
            icon={User}
            image="https://images.unsplash.com/photo-1758525861536-15fb8a3ee629?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHw0fHxwYXJlbnQlMjB0ZWFjaGluZyUyMGNoaWxkJTIwdGFibGV0fGVufDB8fHx8MTc4MzgzOTk3OHww&ixlib=rb-4.1.0&q=85"
          />
          <RoleCard
            testId="role-student"
            to="/login?role=student"
            label={t("login_student")}
            tag={t("role_student_tag")}
            cta={t("enter_portal")}
            icon={GraduationCap}
            image="https://images.unsplash.com/photo-1760260627301-c92d64cb2a67?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwc3R1ZHlpbmclMjBnbG93aW5nJTIwc2NyZWVufGVufDB8fHx8MTc4Mjk5Mzg5N3ww&ixlib=rb-4.1.0&q=85"
          />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <div className="overline text-[#00f0ff] mb-3">{t("about")}</div>
            <h2 className="landing-display section-title text-white mb-4">{t("about_title")}</h2>
            <p className="text-white/70 leading-relaxed max-w-2xl">{t("about_body")}</p>
          </div>
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 h-72">
              <img
                src="https://images.pexels.com/photos/30547577/pexels-photo-30547577.jpeg"
                alt=""
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#050505]/80 via-transparent to-[#8a2be2]/30" />
            </div>
          </div>
        </div>
      </section>

      {/* RESERVED FOR COMMISSIONED 3D ART — see LANDING_ASSETS.md */}
      <MascotSlot t={t} />

      {/* CONTACT */}
      <section id="contact" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-3xl border border-white/10 bg-[#0a0514]/70 p-10 lg:p-14 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#00f0ff]/10 blur-3xl" />
          <div className="text-center">
            <div className="overline text-[#00f0ff] mb-3">{t("contact")}</div>
            <h2 className="landing-display section-title text-white mb-3">{t("contact_title")}</h2>
            <p className="mx-auto max-w-xl text-white/60 mb-8">{t("contact_body")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:ai.tutor@lv99.ai"
              data-testid="contact-email"
              className="inline-flex items-center rounded-full bg-[#00f0ff] px-5 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors"
            >
              {t("email")}: ai.tutor@lv99.ai
            </a>
          </div>
        </div>
      </section>

      </main>

      <footer className="border-t border-white/8 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-6">
          {/* The dark-surface logo, as supplied: transparent, unmodified, no backing plate. */}
          <img
            src={lv99Lockup}
            alt="Lv99.ai — The AI Tutor That Levels You Up"
            width={640}
            height={351}
            loading="lazy"
            decoding="async"
            className="w-[300px] max-w-full sm:w-[360px]"
          />
          {/* white/40 measured 3.73:1 on this background, under the 4.5:1 AA needs. */}
          <div className="text-center text-xs text-white/55">{t("footer")}</div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
