import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Cpu, Languages, LineChart, Shield, User, GraduationCap } from "lucide-react";
import HeroScene from "@/components/HeroScene";
import LandingNav from "@/components/LandingNav";
import { useLang } from "@/context/LangContext";

const RoleCard = ({ to, label, tag, icon: Icon, image, testId }) => (
  <Link to={to} data-testid={testId} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0514]/60 hover:border-[#00f0ff]/50 transition-colors">
    <div className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity">
      <img src={image} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent" />
    </div>
    <div className="relative p-6 flex flex-col gap-4 h-64">
      <div className="flex items-center gap-2 overline text-[#00f0ff]">
        <Icon size={14} /> {tag}
      </div>
      <div className="mt-auto">
        <div className="font-display text-2xl text-white tracking-tight">{label}</div>
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-white/70 group-hover:text-[#00f0ff] transition-colors">
          Enter portal <span>→</span>
        </div>
      </div>
    </div>
  </Link>
);

const Feature = ({ i, title, body, icon: Icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ delay: i * 0.05 }}
    className="relative rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 hover:border-[#00f0ff]/40 transition-colors"
    data-testid={`feature-${i}`}
  >
    <div className="mb-4 h-10 w-10 grid place-items-center rounded-lg bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff]">
      <Icon size={18} />
    </div>
    <div className="font-display text-lg text-white tracking-tight">{title}</div>
    <p className="mt-2 text-sm text-white/60 leading-relaxed">{body}</p>
  </motion.div>
);

const Landing = () => {
  const { t } = useLang();

  return (
    <div className="relative">
      <LandingNav t={t} />

      {/* HERO */}
      <section className="relative min-h-screen overflow-hidden">
        <HeroScene />
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6 pt-40 pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 overline text-[#00f0ff] mb-6">
              <Sparkles size={12} /> {t("tagline")}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter text-white leading-[1.05]">
              {t("hero_title_1")}
              <br />
              <span className="text-[#00f0ff] neon-text">{t("hero_title_2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-white/70 leading-relaxed">{t("hero_sub")}</p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
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
          </div>
        </div>
      </section>

      {/* ROLE CARDS */}
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="overline text-[#00f0ff] mb-3">Portals</div>
        <h2 className="font-display text-3xl lg:text-4xl tracking-tighter text-white max-w-xl mb-10">
          Choose your entrance.
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          <RoleCard
            testId="role-admin"
            to="/login?role=admin"
            label={t("login_admin")}
            tag="Educator / Ops"
            icon={Shield}
            image="https://images.pexels.com/photos/14314636/pexels-photo-14314636.jpeg"
          />
          <RoleCard
            testId="role-parent"
            to="/login?role=parent"
            label={t("login_parent")}
            tag="Guardian"
            icon={User}
            image="https://images.unsplash.com/photo-1758525861536-15fb8a3ee629?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHw0fHxwYXJlbnQlMjB0ZWFjaGluZyUyMGNoaWxkJTIwdGFibGV0fGVufDB8fHx8MTc4MzgzOTk3OHww&ixlib=rb-4.1.0&q=85"
          />
          <RoleCard
            testId="role-student"
            to="/login?role=student"
            label={t("login_student")}
            tag="Learner"
            icon={GraduationCap}
            image="https://images.unsplash.com/photo-1760260627301-c92d64cb2a67?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwxfHxzdHVkZW50JTIwc3R1ZHlpbmclMjBnbG93aW5nJTIwc2NyZWVufGVufDB8fHx8MTc4Mjk5Mzg5N3ww&ixlib=rb-4.1.0&q=85"
          />
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="overline text-[#00f0ff] mb-3">{t("features")}</div>
        <h2 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mb-2">{t("features_title")}</h2>
        <p className="text-white/60 mb-10">{t("features_sub")}</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <Feature i={0} title={t("f1_title")} body={t("f1_body")} icon={Sparkles} />
          <Feature i={1} title={t("f2_title")} body={t("f2_body")} icon={Cpu} />
          <Feature i={2} title={t("f3_title")} body={t("f3_body")} icon={Languages} />
          <Feature i={3} title={t("f4_title")} body={t("f4_body")} icon={LineChart} />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <div className="overline text-[#00f0ff] mb-3">{t("about")}</div>
            <h2 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mb-4">{t("about_title")}</h2>
            <p className="text-white/70 leading-relaxed max-w-2xl">{t("about_body")}</p>
          </div>
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 h-72">
              <img
                src="https://images.pexels.com/photos/30547577/pexels-photo-30547577.jpeg"
                alt="Circuits"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#050505]/80 via-transparent to-[#8a2be2]/30" />
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="rounded-3xl border border-white/10 bg-[#0a0514]/70 p-10 lg:p-14 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#00f0ff]/10 blur-3xl" />
          <div className="overline text-[#00f0ff] mb-3">{t("contact")}</div>
          <h2 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mb-3">{t("contact_title")}</h2>
          <p className="text-white/60 max-w-xl mb-8">{t("contact_body")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="mailto:hello@mytaman.ai"
              data-testid="contact-email"
              className="inline-flex items-center rounded-full bg-[#00f0ff] px-5 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors"
            >
              {t("email")}: hello@mytaman.ai
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/8 py-8 text-center text-xs text-white/40">{t("footer")}</footer>
    </div>
  );
};

export default Landing;
