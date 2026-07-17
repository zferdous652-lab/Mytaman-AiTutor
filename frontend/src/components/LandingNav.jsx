import React from "react";
import { Link } from "react-router-dom";
import LanguageToggle from "@/components/LanguageToggle";

const LandingNav = ({ t }) => (
  <header className="fixed top-0 inset-x-0 z-40">
    <div className="mx-auto max-w-7xl px-6 py-4">
      <div className="glass rounded-2xl px-5 py-3 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2] pulse-glow" />
          <div className="font-display font-semibold tracking-tight text-white">
            MYTAMAN <span className="text-[#00f0ff]">AI TUTOR</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <a href="#features" className="hover:text-white transition-colors" data-testid="nav-features">
            {t("features")}
          </a>
          <a href="#about" className="hover:text-white transition-colors" data-testid="nav-about">
            {t("about")}
          </a>
          <a href="#contact" className="hover:text-white transition-colors" data-testid="nav-contact">
            {t("contact")}
          </a>
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
        </div>
      </div>
    </div>
  </header>
);

export default LandingNav;
