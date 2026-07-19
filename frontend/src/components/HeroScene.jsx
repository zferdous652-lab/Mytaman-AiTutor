import React from "react";
import { motion } from "framer-motion";

/**
 * AI-themed hero visual — pure CSS/SVG/motion. No WebGL dependencies.
 * Layered orbs, animated rings, particle dots, radial glows.
 */
const HeroScene = () => {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* Radial glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.25),transparent_60%)]" />
      <div className="absolute top-[20%] right-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(138,43,226,0.35),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[10%] left-[8%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,0,85,0.18),transparent_60%)] blur-3xl" />

      {/* Central orb */}
      <div className="absolute top-1/2 right-[6%] -translate-y-1/2 hidden md:block">
        <div className="relative h-[420px] w-[420px]">
          {/* rotating ring 1 */}
          <motion.div
            className="absolute inset-0 rounded-full border border-[#00f0ff]/40"
            animate={{ rotate: 360 }}
            transition={{ duration: 40, ease: "linear", repeat: Infinity }}
            style={{ boxShadow: "0 0 60px rgba(0,240,255,0.25) inset" }}
          />
          {/* rotating ring 2 */}
          <motion.div
            className="absolute inset-6 rounded-full border border-[#8a2be2]/50"
            animate={{ rotate: -360 }}
            transition={{ duration: 30, ease: "linear", repeat: Infinity }}
          />
          {/* rotating ring 3 dashed */}
          <motion.div
            className="absolute inset-12 rounded-full"
            style={{
              border: "1px dashed rgba(255,0,85,0.5)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 55, ease: "linear", repeat: Infinity }}
          />
          {/* core orb */}
          <motion.div
            className="absolute inset-24 rounded-full bg-gradient-to-br from-[#00f0ff] via-[#8a2be2] to-[#ff0055]"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
            style={{ filter: "blur(0.5px)", boxShadow: "0 0 80px rgba(0,240,255,0.6)" }}
          />
          {/* inner highlight */}
          <div className="absolute inset-28 rounded-full bg-gradient-to-t from-transparent to-white/20 mix-blend-overlay" />

          {/* orbiting dots */}
          {[0, 72, 144, 216, 288].map((deg, i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-1/2 h-2.5 w-2.5 -mt-1.5 -ml-1.5 rounded-full bg-[#00f0ff]"
              style={{
                boxShadow: "0 0 12px #00f0ff",
                transformOrigin: "center",
              }}
              animate={{ rotate: [deg, deg + 360] }}
              transition={{ duration: 12 + i * 2, ease: "linear", repeat: Infinity }}
            >
              <div
                className="absolute"
                style={{ transform: "translate(190px, 0)" }}
              >
                <div className="h-2.5 w-2.5 rounded-full bg-[#00f0ff]" style={{ boxShadow: "0 0 16px #00f0ff" }} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Particle field */}
      <div className="absolute inset-0">
        {Array.from({ length: 40 }).map((_, i) => {
          const size = Math.random() * 2 + 1;
          const top = Math.random() * 100;
          const left = Math.random() * 100;
          const delay = Math.random() * 6;
          return (
            <motion.div
              key={i}
              className="absolute rounded-full bg-white/70"
              style={{ top: `${top}%`, left: `${left}%`, width: size, height: size }}
              animate={{ opacity: [0.1, 0.9, 0.1] }}
              transition={{ duration: 4 + Math.random() * 4, delay, repeat: Infinity }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default HeroScene;
