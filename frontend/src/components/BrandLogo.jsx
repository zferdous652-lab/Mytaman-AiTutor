import React from "react";
import { Link } from "react-router-dom";
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
 *
 * Pass `to` to make it a home link. A logo in the top-left corner reads as one on every
 * other site, so people click it expecting to be taken home; without `to` it stays a
 * plain image, which is right for surfaces that have no "home" to go to (the auth pages).
 */
const BrandLogo = ({ variant = "mark", className = "", alt = "Lv99.ai", to, testId }) => {
  const glyph = variant === "glyph";
  const img = (
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

  if (!to) return img;

  return (
    <Link
      to={to}
      data-testid={testId}
      // The alt text already names the brand, so the accessible name has to say where the
      // link goes instead -- "Lv99.ai" alone tells a screen reader nothing about it being
      // a way home. inline-flex keeps the anchor the size of the image rather than
      // stretching across the sidebar and giving it a click target the size of the row.
      aria-label="Lv99.ai — go to dashboard"
      className="inline-flex shrink-0 rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00f0ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0514]"
    >
      {img}
    </Link>
  );
};

export default BrandLogo;
