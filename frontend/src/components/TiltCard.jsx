import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

/**
 * Pointer-reactive 3D tilt with a moving specular glare.
 *
 * The rotation is driven by springs rather than raw pointer values, so the card settles
 * instead of snapping — the difference between "responds to you" and "twitches at you".
 * Everything is disabled under prefers-reduced-motion: a tilting, parallaxing card is
 * exactly the kind of motion that triggers vestibular symptoms.
 */
const TiltCard = ({ children, className = "", intensity = 10, glare = true, ...rest }) => {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  // -0.5 .. 0.5, relative to the card's own box.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [intensity, -intensity]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-intensity, intensity]), spring);

  // Glare tracks the pointer across the surface. Composed at the top level rather than
  // inside the `glare &&` branch below -- a hook behind a conditional changes the hook
  // order the moment the prop is toggled.
  const glareX = useTransform(px, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(py, [-0.5, 0.5], ["0%", "100%"]);
  const glareBg = useTransform(
    [glareX, glareY],
    ([x, y]) => `radial-gradient(420px circle at ${x} ${y}, rgba(0,240,255,0.14), transparent 45%)`
  );

  const onPointerMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const reset = () => { px.set(0); py.set(0); };

  if (reduce) {
    return <div className={className} {...rest}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 900 }}
      whileHover={{ z: 30 }}
      className={`group relative ${className}`}
      {...rest}
    >
      {children}
      {glare && (
        // group-hover, not hover: the layer is pointer-events-none, so it can never be
        // hovered itself -- it has to follow the card's hover state.
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
};

export default TiltCard;
