import React from "react";
import lv99Mark from "@/assets/brand/lv99-mark.png";
import lv99Glyph from "@/assets/brand/lv99-glyph.png";

/**
 * The Lv99.ai mark, in one place.
 *
 * Six surfaces used to hand-roll a gradient square plus the words "Lv99.ai" — the two
 * sidebars and the four auth pages — which meant six copies to keep in step every time
 * the brand moved. They all render this instead.
 *
 * Two variants, because a wordmark squeezed into a 40px collapsed rail is unreadable:
 *   mark  — the full wordmark, for anywhere with horizontal room
 *   glyph — the 99 with its arc and sparkle on a square canvas, for icon-sized slots
 *
 * The artwork is the dark-surface file: light neon strokes carrying their own glow, so
 * it sits directly on the app background with no plate behind it.
 */
const BrandLogo = ({ variant = "mark", className = "", alt = "Lv99.ai" }) => {
  const glyph = variant === "glyph";
  return (
    <img
      src={glyph ? lv99Glyph : lv99Mark}
      alt={alt}
      // Intrinsic dimensions so the slot is reserved before the image decodes -- these
      // sit in headers and sidebars, where a late reflow shifts the whole page.
      width={glyph ? 256 : 420}
      height={glyph ? 256 : 189}
      draggable="false"
      className={`${glyph ? "" : "w-auto"} select-none ${className}`}
    />
  );
};

export default BrandLogo;
