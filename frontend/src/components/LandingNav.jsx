import React from "react";
import { Link } from "react-router-dom";
import LanguageToggle from "@/components/LanguageToggle";
import lv99Mark from "@/assets/brand/lv99-mark.png";

const LandingNav = ({ t }) => (
  <header className="fixed top-0 inset-x-0 z-40">
    <div className="mx-auto max-w-7xl px-6 py-4">
      <div className="glass rounded-2xl px-5 py-3 flex items-center justify-between">
        {/* The wordmark, on the light surface the artwork is drawn for -- its "Lv" and
            ".ai" are near-black navy and vanish on this background otherwise. Alt text
            carries the name because this replaces the text wordmark. Tagline is cropped
            off: its rule is illegible at nav height. */}
        <Link to="/" data-testid="nav-logo" className="flex items-center">
          <img
            src={lv99Mark}
            alt="Lv99.ai"
            width={420}
            height={180}
            className="brand-plate h-9 w-auto px-2.5 py-1.5 sm:h-10"
          />
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
