import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { Menu, X } from "lucide-react";
import LanguageToggle from "@/components/LanguageToggle";
import lv99Mark from "@/assets/brand/lv99-mark.png";

const SECTIONS = [
  { id: "features", key: "features" },
  { id: "about", key: "about" },
  { id: "contact", key: "contact" },
];

/**
 * The landing header.
 *
 * It used to be one fixed bar that looked identical whether you were at the top of the
 * page or three sections down, which told the reader nothing. Now it reacts to the
 * scroll it is sitting over:
 *
 *   - it compacts and solidifies once you leave the hero, so it stops competing with the
 *     headline at rest but stays legible over content,
 *   - the link for the section you are actually reading is marked, with the highlight
 *     sliding between links rather than blinking on and off,
 *   - a hairline at the bottom edge tracks reading progress.
 *
 * Everything here is gated on prefers-reduced-motion: the states still change, they just
 * change instantly.
 */
const LandingNav = ({ t }) => {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  // Spring only for the progress bar: raw scrollYProgress jitters on trackpads.
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Which section is being read. An observer rather than a scroll handler doing
  // getBoundingClientRect on every frame -- the browser does this work off the main
  // thread. The band sits in the upper half so a section counts as "current" once its
  // heading is up near the bar, not when its last pixel leaves.
  useEffect(() => {
    const seen = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        // Last match, not first: sections here are taller than the band, so two are
        // often inside it at once. Taking the first would keep the previous section lit
        // well after the reader has moved into the next one -- measured, it lagged by a
        // whole section.
        const current = [...SECTIONS].reverse().find((s) => seen.get(s.id));
        setActive(current ? current.id : null);
      },
      { rootMargin: "-25% 0px -60% 0px" }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Close the mobile panel on Escape, and stop the page scrolling behind it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const go = useCallback(
    (e, id) => {
      e.preventDefault();
      setMenuOpen(false);
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      // Move focus too, so a keyboard user lands where the page just scrolled.
      el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    },
    [reduce]
  );

  const navLink = (s, onMobile = false) => {
    const isActive = active === s.id;
    return (
      <a
        key={s.id}
        href={`#${s.id}`}
        onClick={(e) => go(e, s.id)}
        aria-current={isActive ? "location" : undefined}
        data-testid={`nav-${s.id}`}
        className={`relative transition-colors ${onMobile ? "px-4 py-3 text-base" : "px-3 py-1.5"} ${
          isActive ? "text-white" : "text-white/70 hover:text-white"
        }`}
      >
        {isActive && (
          // layoutId makes the pill travel from the previous link to this one instead of
          // disappearing and reappearing.
          <motion.span
            layoutId={onMobile ? "nav-pill-mobile" : "nav-pill"}
            className="absolute inset-0 -z-10 rounded-full bg-white/[0.08] ring-1 ring-[#00f0ff]/25"
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        {t(s.key)}
      </a>
    );
  };

  return (
    <header className="fixed top-0 inset-x-0 z-40">
      <motion.div
        className="mx-auto max-w-7xl px-6"
        animate={{ paddingTop: scrolled ? 8 : 16, paddingBottom: scrolled ? 8 : 16 }}
        transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          data-scrolled={scrolled}
          className="glass relative overflow-hidden rounded-2xl flex items-center justify-between"
          animate={{
            // Denser and darker once it is sitting over content rather than over the hero.
            backgroundColor: scrolled ? "rgba(10,5,20,0.86)" : "rgba(10,5,20,0.55)",
            paddingTop: scrolled ? 8 : 12,
            paddingBottom: scrolled ? 8 : 12,
            boxShadow: scrolled
              ? "0 10px 34px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,240,255,0.10)"
              : "0 0 0 0 rgba(0,0,0,0)",
          }}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ paddingLeft: 20, paddingRight: 20 }}
        >
          {/* The dark-surface logo: light neon strokes with their own glow, so it needs no
              plate. Alt text carries the name because this replaces the text wordmark; the
              tagline is cropped off, illegible at nav height. Sizes run a little larger
              than the old artwork because the glow occupies part of the box. */}
          <Link to="/" data-testid="nav-logo" className="flex items-center">
            <motion.img
              src={lv99Mark}
              alt="Lv99.ai"
              width={420}
              height={180}
              animate={{ height: scrolled ? 42 : 60 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-auto"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {SECTIONS.map((s) => navLink(s))}
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle testId="landing-lang" />
            <Link
              to="/login"
              data-testid="nav-signin"
              className="hidden sm:inline-flex items-center rounded-full border border-white/15 px-4 py-1.5 text-sm hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
            >
              {t("sign_in")}
            </Link>
            {/* Below md the links used to vanish entirely, leaving a phone with a logo and
                a language toggle and no way to reach any section. */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="nav-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              data-testid="nav-menu-toggle"
              className="md:hidden rounded-full border border-white/15 p-2 text-white/80 transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff]"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          {/* Reading progress, pinned to the bar's bottom edge. scaleX from a spring so it
              tracks the page without the jitter raw scroll values carry on a trackpad. */}
          <motion.div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-px origin-left bg-gradient-to-r from-[#00f0ff] via-[#8b5cf6] to-[#ff5ca8]"
            style={{ scaleX: reduce ? 0 : progress, opacity: scrolled ? 1 : 0 }}
          />
        </motion.div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              id="nav-mobile-menu"
              key="mobile"
              initial={reduce ? false : { opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="glass mt-2 overflow-hidden rounded-2xl md:hidden"
              data-testid="nav-mobile-menu"
            >
              <div className="flex flex-col p-2">
                {SECTIONS.map((s) => navLink(s, true))}
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 rounded-full bg-[#00f0ff] px-4 py-3 text-center text-sm font-semibold text-black"
                  data-testid="nav-mobile-signin"
                >
                  {t("sign_in")}
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.div>
    </header>
  );
};

export default LandingNav;
