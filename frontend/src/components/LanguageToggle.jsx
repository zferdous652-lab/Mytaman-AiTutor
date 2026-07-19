import React from "react";
import { useLang } from "@/context/LangContext";

const LanguageToggle = ({ testId = "lang-toggle" }) => {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 font-mono text-xs">
      <button
        data-testid={`${testId}-en`}
        onClick={() => setLang("en")}
        className={`px-3 py-1 rounded-full transition-colors ${
          lang === "en" ? "bg-[#00f0ff] text-black" : "text-white/70 hover:text-white"
        }`}
      >
        EN
      </button>
      <button
        data-testid={`${testId}-bm`}
        onClick={() => setLang("bm")}
        className={`px-3 py-1 rounded-full transition-colors ${
          lang === "bm" ? "bg-[#00f0ff] text-black" : "text-white/70 hover:text-white"
        }`}
      >
        BM
      </button>
    </div>
  );
};

export default LanguageToggle;
