import React, { Suspense, lazy, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// three.js + fiber + drei is a large bundle. Splitting it out keeps it off the critical
// path: the CSS layers below paint immediately and the WebGL scene fades in over them.
const HeroCanvas = lazy(() => import("@/components/HeroCanvas"));

/** Detects WebGL support once, so a machine without it gets the CSS scene rather than a
 *  blank rectangle where the hero should be. */
const useWebGL = () => {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setOk(!!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
};

/** Error boundary — a WebGL context loss should degrade to the CSS scene, never take the
 *  whole landing page down with it. */
class CanvasBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error("Hero WebGL scene failed, using CSS fallback", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// The always-on CSS layer: glows, grid and particles. Also the standalone visual whenever
// WebGL is unavailable or motion is reduced.
const AmbientLayers = ({ reduce }) => (
  <>
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.16),transparent_62%)]" />
    <div className="absolute top-[16%] right-[8%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(138,43,226,0.32),transparent_60%)] blur-3xl" />
    <div className="absolute bottom-[8%] left-[6%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,0,85,0.16),transparent_60%)] blur-3xl" />
    <div className="absolute inset-0">
      {Array.from({ length: 34 }).map((_, i) => {
        const size = ((i * 7) % 3) + 1;
        const top = (i * 37) % 100;
        const left = (i * 53) % 100;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/70"
            style={{ top: `${top}%`, left: `${left}%`, width: size, height: size }}
            animate={reduce ? undefined : { opacity: [0.1, 0.85, 0.1] }}
            transition={{ duration: 4 + (i % 5), delay: (i % 7) * 0.6, repeat: Infinity }}
          />
        );
      })}
    </div>
  </>
);

const HeroScene = () => {
  const reduce = useReducedMotion();
  const webgl = useWebGL();

  return (
    // z-0, NOT -z-10. A negative z-index paints at step 2 of the root stacking context,
    // while #root's own opaque background paints at step 3 -- later, and over the top. The
    // scene was rendering correctly all along and being buried by that background.
    <div className="absolute inset-0 z-0 overflow-hidden">
      <AmbientLayers reduce={reduce} />

      {webgl && (
        <CanvasBoundary fallback={null}>
          <Suspense fallback={null}>
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              <HeroCanvas reduce={!!reduce} />
            </motion.div>
          </Suspense>
        </CanvasBoundary>
      )}

      {/* Vignette, over the canvas and under the copy. The first stop lifts a violet haze
          behind the mesh; the second sinks the lower half back toward the page background
          so the headline sits on near-solid ink instead of on moving wireframe. Without
          this the mesh competes with the type wherever a bright strand crosses it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 48% at 50% 30%, rgba(139,92,246,0.16), transparent 70%)," +
            "radial-gradient(85% 65% at 50% 108%, rgba(5,5,5,0.96), transparent 62%)",
        }}
      />
    </div>
  );
};

export default HeroScene;
