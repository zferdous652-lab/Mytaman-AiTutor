import React from "react";
import { PanelLeft } from "lucide-react";

// The hover label for an icon-only control. Expects an ancestor with `group relative`.
//
// `placement="right"` (default) sits just outside that element's right edge, which is what
// a left-hand collapsed rail wants. `placement="bottom-end"` drops below and aligns to the
// control's right edge instead -- needed for controls in a right-docked panel's header,
// where a right-hand tooltip would render off the edge of the screen.
//
// Stays dark on purpose: a dark tooltip reads correctly over both the app's dark shell and
// the tutor dock's off-white surface.
export const RailTooltip = ({ children, placement = "right" }) => (
  <span
    role="tooltip"
    className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1526] px-2.5 py-1.5 text-xs text-white/90 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 ${
      placement === "bottom-end" ? "top-full right-0 mt-1.5" : "left-full top-1/2 ml-2 -translate-y-1/2"
    }`}
  >
    {children}
  </span>
);

// Collapse/expand control for a sidebar. Deliberately CSS-only (no tooltip provider): the
// label is a sibling span revealed on hover/focus, so this drops into any sidebar header
// or rail without wrapping the tree in extra context providers.
const SidebarToggle = ({ collapsed, onToggle, testId = "sidebar-toggle", align = "left" }) => (
  <div className="relative group shrink-0">
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
    >
      <PanelLeft size={17} />
    </button>
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full z-50 mt-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1526] px-2.5 py-1.5 text-xs text-white/90 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
        align === "left" ? "left-0" : "left-1/2 -translate-x-1/2"
      }`}
    >
      {collapsed ? "Expand sidebar" : "Collapse sidebar"}
    </span>
  </div>
);

export default SidebarToggle;
