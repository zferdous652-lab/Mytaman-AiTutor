import React from "react";
import { PanelLeft } from "lucide-react";

// The hover label for an icon-only control in a collapsed rail. Expects an ancestor with
// `group relative` -- it positions itself just outside that element's right edge.
export const RailTooltip = ({ children }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1526] px-2.5 py-1.5 text-xs text-white/90 opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
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
