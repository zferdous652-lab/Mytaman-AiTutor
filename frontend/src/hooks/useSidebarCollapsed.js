import { useCallback, useEffect, useState } from "react";

// Persisted collapse state for a sidebar. Each sidebar passes its own `storageKey` so the
// portal shell and the course navigator remember their states independently -- collapsing
// one shouldn't collapse the other. Reads synchronously on first render so a collapsed
// sidebar doesn't flash open before the effect runs.
export const useSidebarCollapsed = (storageKey) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false; // private mode / storage disabled -- just start expanded
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // best-effort — a sidebar that can't remember its state still works fine
    }
  }, [storageKey, collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return [collapsed, toggle];
};

export default useSidebarCollapsed;
