import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Check, Lock, Plus, X } from "lucide-react";
import { api } from "@/lib/api";

const TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

/**
 * The unlock prompt shown when a learner opens a locked lesson.
 *
 * Pricing comes from GET /billing/pricing rather than being hardcoded here, so the number
 * on screen can never drift from the number the server charges.
 *
 * Payment is not connected yet: /billing/checkout records the order and returns
 * payment_required, so this dialog reports that honestly instead of implying the pack has
 * been unlocked. It does not fake a success state.
 */
const UnlockDialog = ({ open, onClose, activePack, lockedType, onUnlocked }) => {
  const [pricing, setPricing] = useState(null);
  const [packs, setPacks] = useState([]);
  const [addOns, setAddOns] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    if (!open) return;
    setPlaced(null);
    setAddOns(new Set());
    (async () => {
      try {
        const [pr, pk, ent] = await Promise.all([
          api.get("/billing/pricing"),
          api.get("/packs/list"),
          api.get("/billing/entitlements"),
        ]);
        setPricing(pr.data);
        const owned = new Set(ent.data.pack_ids);
        // Only packs that are neither the one being unlocked nor already owned can be
        // added as bundle extras.
        setPacks(pk.data.filter((p) => p.id !== activePack?.id && !owned.has(p.id)));
      } catch {
        toast.error("Couldn't load unlock options");
      }
    })();
  }, [open, activePack?.id]);

  if (!pricing) return null;

  const toggleAddOn = (id) =>
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Mirrors the server's price_for(): first pack full price, each extra at the add-on rate.
  const total = pricing.first_pack + addOns.size * pricing.additional_pack;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post("/billing/checkout", {
        pack_ids: [activePack.id, ...Array.from(addOns)],
      });
      setPlaced(data);
      // Only refresh access if the server actually granted it. It does not today, but this
      // keeps the dialog correct the moment a gateway is wired up.
      if (!data.payment_required) {
        toast.success("Tutor Pack unlocked");
        onUnlocked?.();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't start the unlock");
    }
    setSubmitting(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          data-testid="unlock-dialog"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-2xl border border-[#00f0ff]/25 bg-[#0a0514] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#00f0ff]/30 bg-[#00f0ff]/10">
                  <Lock size={18} className="text-[#00f0ff]" />
                </span>
                <div>
                  <div className="font-display text-lg tracking-tight text-white">
                    Unlock {activePack?.title}
                  </div>
                  <div className="text-xs text-white/50">
                    {lockedType ? `${TYPE_LABELS[lockedType] || lockedType} is locked` : "Locked content"}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-white/50 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {placed ? (
              <div className="mt-6" data-testid="unlock-placed">
                <div className="rounded-xl border border-[#ffb020]/30 bg-[#ffb020]/10 p-4">
                  <div className="text-sm font-medium text-[#ffb020]">Payment not connected yet</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/70">{placed.message}</p>
                  <div className="mt-3 text-xs text-white/45">
                    Order <span className="font-mono text-white/70">{placed.order_id.slice(0, 8)}</span> ·{" "}
                    {placed.currency} {placed.amount} · {placed.pack_ids.length} pack
                    {placed.pack_ids.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="mt-5 w-full rounded-full border border-white/15 py-2.5 text-sm text-white/80 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <p className="mt-5 text-sm leading-relaxed text-white/60">
                  Notes are free on every chapter. Unlocking adds the mind map, summary, flashcards, quiz
                  and the Socratic tutor — across <span className="text-white">every chapter</span> of this pack.
                </p>

                <div className="mt-5 flex items-baseline justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span className="text-sm text-white/80">{activePack?.title}</span>
                  <span className="font-display text-lg text-white">
                    {pricing.currency} {pricing.first_pack}
                  </span>
                </div>

                {packs.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-white/50">
                      <Plus size={12} /> Add another course — {pricing.currency} {pricing.additional_pack} each,
                      all chapters included
                    </div>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                      {packs.map((p) => {
                        const on = addOns.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleAddOn(p.id)}
                            data-testid={`unlock-addon-${p.id}`}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              on ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-white" : "border-white/10 text-white/70 hover:border-white/25"
                            }`}
                          >
                            <span className="min-w-0 truncate">{p.title}</span>
                            <span className="flex shrink-0 items-center gap-2 text-xs">
                              +{pricing.additional_pack}
                              {on && <Check size={13} className="text-[#00f0ff]" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-sm text-white/60">Total</span>
                  <span className="font-display text-2xl text-white" data-testid="unlock-total">
                    {pricing.currency} {total}
                  </span>
                </div>

                <button
                  onClick={submit}
                  disabled={submitting}
                  data-testid="unlock-submit"
                  className="mt-5 w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black transition-colors hover:bg-white disabled:opacity-50"
                >
                  {submitting ? "Working…" : `Unlock for ${pricing.currency} ${total}`}
                </button>
                <p className="mt-3 text-center text-[11px] text-white/35">
                  One-time payment. Every chapter, forever.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UnlockDialog;
