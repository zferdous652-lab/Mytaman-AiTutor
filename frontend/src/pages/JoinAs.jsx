import React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";
import BrandLogo from "@/components/BrandLogo";

/**
 * The fork between the two sign-up flows.
 *
 * "Get started" used to drop everyone straight onto the parent form, so a student
 * arriving from the landing page had no way to reach their own sign-up short of
 * finding the link buried on the login page. Both accounts are self-serve and neither
 * depends on the other existing first, so this asks once rather than guessing.
 *
 * Deliberately a pair of links, not a radio group with a submit button: there is
 * nothing to validate and nothing to save, so an extra confirmation step would only
 * add a click.
 */
const ROLES = [
  {
    id: "parent",
    to: "/register",
    emoji: "👨‍👩‍👧",
    title: "join_parent",
    desc: "join_parent_desc",
    note: "join_parent_note",
    accent: "#8b5cf6",
  },
  {
    id: "student",
    to: "/register-student",
    emoji: "🎓",
    title: "join_student",
    desc: "join_student_desc",
    note: "join_student_note",
    accent: "#00f0ff",
  },
];

const JoinAs = () => {
  const { t } = useLang();
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" data-testid="join-logo" className="flex items-center">
            <BrandLogo className="h-9" />
          </Link>
          <LanguageToggle testId="join-lang" />
        </div>

        <div className="overline text-[#00f0ff] mb-3">{t("sign_up")}</div>
        <h1 className="font-display text-3xl tracking-tighter text-white mb-2">{t("joining_as")}</h1>
        <p className="text-sm text-white/50 mb-8 max-w-lg">{t("joining_as_sub")}</p>

        {/* A list, because that is what it is -- two choices of equal weight. Screen
            readers get the count up front instead of two loose links. */}
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="join-options">
          {ROLES.map((r, i) => (
            <li key={r.id}>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: reduce ? 0 : i * 0.07 }}
              >
                <Link
                  to={r.to}
                  data-testid={`join-${r.id}`}
                  // Each card hovers to its own accent, carried as a custom property so
                  // the hover stays in CSS rather than becoming a pair of mouse handlers
                  // that a keyboard user would never trigger.
                  style={{ "--accent": r.accent }}
                  className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-[var(--accent)] hover:bg-white/[0.05] focus:outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[#00f0ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0514]"
                >
                  <span aria-hidden="true" className="text-3xl leading-none">
                    {r.emoji}
                  </span>
                  <span className="mt-4 font-display text-xl tracking-tight text-white">{t(r.title)}</span>
                  <span className="mt-2 text-sm text-white/60 leading-relaxed">{t(r.desc)}</span>
                  <span className="mt-4 text-xs text-white/40">{t(r.note)}</span>
                  <span
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition-transform group-hover:translate-x-0.5"
                    style={{ color: "var(--accent)" }}
                  >
                    {t("sign_up")}
                    <ArrowRight size={15} />
                  </span>
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-white/50">
          {t("have_account")}{" "}
          <Link to="/login" className="text-[#00f0ff] hover:underline" data-testid="join-to-login">
            {t("sign_in")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default JoinAs;
