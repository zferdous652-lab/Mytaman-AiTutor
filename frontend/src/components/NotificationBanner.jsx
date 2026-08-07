import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Unread in-app notices, shown above the page on every portal.
 *
 * These exist for changes a user did not cause and would otherwise discover by absence —
 * a guardian's account removed, a learner's account removed. Dismissing marks the notice
 * read server-side, so it stays gone across devices rather than only in this tab.
 */
const NotificationBanner = () => {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/list");
      setItems(data);
    } catch {
      setItems([]); // never block a portal on a notice failing to load
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id) => {
    // Optimistic: the notice is informational, so a failed dismiss is not worth
    // re-showing it mid-read. The next load reflects the true state either way.
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      /* no-op */
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="mb-6 space-y-2" data-testid="notification-banner">
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            data-testid={`notification-${n.kind}`}
            className="flex items-start gap-3 rounded-2xl border border-[#ffb020]/30 bg-gradient-to-br from-[#ffb020]/10 to-transparent p-4"
          >
            <Bell size={17} className="mt-0.5 shrink-0 text-[#ffb020]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{n.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-white/60">{n.body}</p>
            </div>
            <button
              onClick={() => dismiss(n.id)}
              data-testid={`notification-dismiss-${n.id}`}
              className="shrink-0 rounded-lg p-1 text-white/40 transition-colors hover:text-white"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBanner;
