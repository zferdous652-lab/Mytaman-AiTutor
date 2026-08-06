import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";

// Shown to a student who has no connected guardian, offering to (re)send the invitation.
// It is not a blocker -- the student already has full access -- and it disappears on its
// own the moment `linked` comes back true.
//
// Two situations reach it: a parent who never joined, and a parent whose account was
// later removed. The copy has to distinguish them, because telling a student their parent
// "hasn't joined yet" when the parent did join and was then removed is simply false.
const ParentLinkBanner = () => {
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/link-status");
      setStatus(data);
      setEmail(data.parent_invite_email || "");
    } catch {
      setStatus({ linked: true }); // fail quiet: never block the portal on this
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resend = async (withEmail) => {
    setBusy(true);
    try {
      const body = withEmail ? { parent_email: email } : {};
      const { data } = await api.post("/auth/resend-parent-invite", body);
      toast.success(`Invitation sent to ${data.parent_email}`);
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send the invitation");
    }
    setBusy(false);
  };

  if (!status || status.linked) return null;

  return (
    <div
      className="rounded-2xl border border-[#8a2be2]/30 bg-gradient-to-br from-[#8a2be2]/10 to-transparent p-5 mb-6"
      data-testid="parent-link-banner"
    >
      <div className="flex items-start gap-3">
        <UserPlus size={18} className="text-[#8a2be2] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white font-medium">
            {status.guardian_removed
              ? "Reconnect with a parent or guardian"
              : "Your parent hasn't joined yet"}
          </div>
          <p className="text-xs text-white/60 mt-1 leading-relaxed">
            {status.guardian_removed ? (
              <>
                {status.former_parent_name ? (
                  <><span className="text-white/80">{status.former_parent_name}</span>'s account was removed</>
                ) : (
                  <>Your guardian's account was removed</>
                )}
                , so nobody is following your progress right now. Your work is safe —
                invite a parent or guardian to reconnect.
              </>
            ) : status.parent_invite_email ? (
              <>
                We invited <span className="text-white/80">{status.parent_invite_email}</span> to follow your
                progress. Not there yet? Send it again.
              </>
            ) : (
              <>Invite your parent so they can follow your progress.</>
            )}
          </p>

          {editing ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
                className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-[#00f0ff]"
                data-testid="parent-link-email"
              />
              <button
                type="button"
                onClick={() => resend(true)}
                disabled={busy || !email}
                data-testid="parent-link-send-new"
                className="rounded-full bg-[#00f0ff] px-4 py-2 text-xs font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send invitation"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEmail(status.parent_invite_email || ""); }}
                className="text-white/40 hover:text-white transition-colors"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resend(false)}
                disabled={busy}
                data-testid="parent-link-resend"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-white/80 hover:border-[#00f0ff]/50 hover:text-white transition-colors disabled:opacity-50"
              >
                <Send size={12} /> {busy ? "Sending…" : "Resend email to parent"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                data-testid="parent-link-change-email"
                className="rounded-full px-3 py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentLinkBanner;
