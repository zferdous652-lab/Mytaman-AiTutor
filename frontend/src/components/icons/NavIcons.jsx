import React from "react";

/**
 * Gradient nav icons for the student and parent sidebars.
 *
 * lucide draws in a single flat colour, which is what these rows used to be. These
 * carry the brand sweep instead -- cyan through violet to magenta, the same ramp as the
 * landing progress bar -- so the sidebar reads as part of the brand rather than as
 * default UI furniture.
 *
 * The geometry is lucide 0.516 (ISC), with two additions: the packs icon keeps the
 * magnifier from package-search, and the trophy gets a star in its bowl.
 *
 * Sparkle marks above the book and trophy were tried and dropped. Rendered at the size
 * these actually appear, they collapse into two stray dots that read as damage rather
 * than shine, and making vertical room for them shrinks the main glyph enough to cost
 * more legibility than the sparkle was worth.
 */

const GRADIENT_ID = "lv99-nav-gradient";

/**
 * The gradient itself, mounted once per shell.
 *
 * userSpaceOnUse rather than the default objectBoundingBox, for two reasons. Each path
 * inside an icon would otherwise resolve the gradient against its OWN bounding box, so
 * every stroke would restart the ramp and the icon would come apart into unrelated
 * colours. And a straight vertical stroke -- the package's centre seam -- has a
 * zero-width box, which is degenerate. Pinning the ramp to the 0-24 viewBox makes one
 * sweep run across the whole glyph.
 */
export const NavIconDefs = () => (
  <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
    <defs>
      <linearGradient id={GRADIENT_ID} gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2">
        <stop offset="0%" stopColor="#00f0ff" />
        <stop offset="50%" stopColor="#7c5cff" />
        <stop offset="100%" stopColor="#e05cf0" />
      </linearGradient>
    </defs>
  </svg>
);

// Matches the lucide call signature (size, className) so these drop straight into the
// existing nav map.
const GradientIcon = ({ size = 20, className = "", title, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={`url(#${GRADIENT_ID})`}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden={title ? undefined : "true"}
    role={title ? "img" : undefined}
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

export const PacksIcon = (props) => (
  <GradientIcon {...props}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </GradientIcon>
);

export const BrowsePacksIcon = (props) => (
  <GradientIcon {...props}>
    <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
    <path d="m7.5 4.27 9 5.15" />
    <polyline points="3.29 7 12 12 20.71 7" />
    <path d="M12 22V12" />
    <circle cx="18.5" cy="15.5" r="2.5" />
    <path d="M20.27 17.27 22 19" />
  </GradientIcon>
);

export const DashboardIcon = (props) => (
  <GradientIcon {...props}>
    <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" />
    <path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" />
    <path d="M18 9h1.5a1 1 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" />
    <path d="M6 9H4.5a1 1 0 0 1 0-5H6" />
    {/* The star sits in the bowl, which spans y 2-9 -- centred at 12,7.7 it clears the
        rim on all sides at the stroke width above. */}
    <path d="m12 4.7 1 2.03 2.24.33-1.62 1.58.38 2.23L12 9.8l-2 1.05.38-2.23-1.62-1.58 2.24-.33z" />
  </GradientIcon>
);

export const OverviewIcon = (props) => (
  <GradientIcon {...props}>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </GradientIcon>
);
