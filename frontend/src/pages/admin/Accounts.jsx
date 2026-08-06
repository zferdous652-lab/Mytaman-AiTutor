import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ROLE_FILTERS = [
  { id: "", label: "All portals" },
  { id: "admin", label: "Admin" },
  { id: "parent", label: "Parent" },
  { id: "student", label: "Student" },
];

const ROLE_STYLE = {
  admin: "border-[#8a2be2]/40 bg-[#8a2be2]/10 text-[#c9a4ff]",
  parent: "border-[#00f0ff]/40 bg-[#00f0ff]/10 text-[#00f0ff]",
  student: "border-[#00ff66]/30 bg-[#00ff66]/10 text-[#7dffb0]",
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Copy-to-clipboard that reports failure instead of silently doing nothing. */
const CopyButton = ({ value, label = "Copy" }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      // Clipboard access needs a secure context; over plain HTTP it throws.
      toast.error("Couldn't copy — select the password and copy it manually");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff]"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : label}
    </button>
  );
};

/**
 * Password reset for one account.
 *
 * An existing password is never shown, here or anywhere else: they are stored as bcrypt
 * hashes and cannot be read back. The only options are to set a new one or generate one,
 * and a generated password is displayed exactly once — the server does not keep it.
 */
const ResetDialog = ({ account, onClose, onDone }) => {
  const [mode, setMode] = useState("generate");
  const [password, setPassword] = useState("");
  const [requireChange, setRequireChange] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const { user } = useAuth();

  const isSelf = user?.id === account?.id;

  const submit = async () => {
    if (mode === "manual" && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/accounts/${account.id}/password`, {
        ...(mode === "generate" ? { generate: true } : { new_password: password }),
        require_change: requireChange,
      });
      setResult(data);
      setPassword("");
      onDone?.();
      if (!data.generated_password) toast.success("Password updated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't update the password");
    }
    setSubmitting(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      data-testid="reset-dialog"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-2xl border border-[#00f0ff]/25 bg-[#0a0514] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#00f0ff]/30 bg-[#00f0ff]/10">
              <KeyRound size={18} className="text-[#00f0ff]" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-lg tracking-tight text-white">Reset password</div>
              <div className="truncate text-xs text-white/50">
                {account.name} · {account.login}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/50 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="mt-6" data-testid="reset-result">
            {result.generated_password ? (
              <>
                <div className="rounded-xl border border-[#ffb020]/30 bg-[#ffb020]/10 p-4">
                  <div className="text-sm font-medium text-[#ffb020]">Shown once — copy it now</div>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">
                    This password is stored only as a hash. Closing this dialog is the last chance
                    to read it; if it's lost, generate another.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white">
                      {result.generated_password}
                    </code>
                    <CopyButton value={result.generated_password} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-white/45">
                  Send it to {account.name} over a channel they already trust.
                  {result.require_change && " They'll be asked to set their own at next sign-in."}
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-[#00ff66]/25 bg-[#00ff66]/10 p-4 text-sm text-[#7dffb0]">
                Password updated.
                {result.require_change && " They'll be asked to change it at next sign-in."}
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-full border border-white/15 py-2.5 text-sm text-white/80 transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                { id: "generate", label: "Generate" },
                { id: "manual", label: "Type one" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  data-testid={`reset-mode-${m.id}`}
                  className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                    mode === m.id
                      ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-white"
                      : "border-white/10 text-white/60 hover:border-white/25"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "manual" ? (
              <div className="mt-4">
                <label className="text-xs text-white/60">New password</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="reset-password-input"
                  placeholder="At least 8 characters"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-white outline-none focus:border-[#00f0ff]/50"
                />
                <p className="mt-1.5 text-[11px] text-white/40">
                  Shown in plain text so you can read it back accurately — this is a temporary
                  credential you're about to hand over.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                A 16-character random password will be generated and shown once.
              </p>
            )}

            <label
              className={`mt-4 flex items-start gap-2.5 text-sm ${isSelf ? "opacity-40" : "text-white/70"}`}
            >
              <input
                type="checkbox"
                checked={requireChange && !isSelf}
                disabled={isSelf}
                onChange={(e) => setRequireChange(e.target.checked)}
                data-testid="reset-require-change"
                className="mt-0.5 accent-[#00f0ff]"
              />
              <span>
                Require a change at next sign-in
                <span className="block text-[11px] text-white/40">
                  {isSelf
                    ? "Not applied when resetting your own password."
                    : "Keeps the password you set from becoming their permanent one."}
                </span>
              </span>
            </label>

            <button
              onClick={submit}
              disabled={submitting}
              data-testid="reset-submit"
              className="mt-5 w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black transition-colors hover:bg-white disabled:opacity-50"
            >
              {submitting ? "Working…" : "Reset password"}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

/** Self-service rotation for the signed-in admin, which needs the current password. */
const MyPasswordCard = () => {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Your password has been changed");
      setCurrent("");
      setNext("");
      setOpen(false);
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Couldn't change your password");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#8a2be2]/30 bg-[#8a2be2]/10">
            <UserCog size={17} className="text-[#c9a4ff]" />
          </span>
          <div>
            <div className="text-sm font-medium text-white">Your password</div>
            <div className="text-xs text-white/45">Rotate it with your current password</div>
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          data-testid="my-password-toggle"
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/75 transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff]"
        >
          {open ? "Cancel" : "Change"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            data-testid="my-password-current"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-[#00f0ff]/50"
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            data-testid="my-password-new"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-[#00f0ff]/50"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#00f0ff] px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white disabled:opacity-50"
          >
            {busy ? "…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
};

const Accounts = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (q.trim()) params.set("q", q.trim());
      const [a, l] = await Promise.all([
        api.get(`/accounts/list?${params}`),
        api.get("/accounts/audit?limit=25"),
      ]);
      setAccounts(a.data);
      setAudit(l.data);
    } catch {
      toast.error("Couldn't load accounts");
    }
    setLoading(false);
  }, [role, q]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const toggleActive = async (acc) => {
    try {
      await api.post(`/accounts/${acc.id}/active`, { active: !acc.active });
      toast.success(acc.active ? `${acc.name} deactivated` : `${acc.name} reactivated`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't update the account");
    }
  };

  const counts = useMemo(
    () =>
      accounts.reduce(
        (acc, a) => ({ ...acc, [a.role]: (acc[a.role] || 0) + 1 }),
        {}
      ),
    [accounts]
  );

  return (
    <div className="p-8" data-testid="admin-accounts">
      <div className="overline text-[#00f0ff]">Account Manager</div>
      <h1 className="font-display text-4xl tracking-tighter text-white">Accounts</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
        Every account across the Admin, Parent and Student portals. Reset a password for
        someone who's locked out, or suspend access. Existing passwords are stored as
        hashes and can't be displayed — they can only be replaced.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email or student ID"
                data-testid="accounts-search"
                className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-[#00f0ff]/50"
              />
            </div>
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                onClick={() => setRole(f.id)}
                data-testid={`accounts-filter-${f.id || "all"}`}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                  role === f.id
                    ? "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]"
                    : "border-white/10 text-white/60 hover:border-white/25"
                }`}
              >
                {f.label}
                {f.id && counts[f.id] != null && <span className="ml-1.5 text-white/35">{counts[f.id]}</span>}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2" data-testid="accounts-list">
            {loading ? (
              <div className="rounded-2xl border border-white/10 p-6 text-sm text-white/45">Loading…</div>
            ) : accounts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 p-6 text-sm text-white/45">
                No accounts match that search.
              </div>
            ) : (
              accounts.map((a) => (
                <div
                  key={a.id}
                  data-testid={`account-row-${a.id}`}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 transition-colors ${
                    a.active ? "border-white/10 bg-[#0a0514]/60" : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm ${a.active ? "text-white" : "text-white/40"}`}>
                        {a.name}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${ROLE_STYLE[a.role]}`}>
                        {a.role}
                      </span>
                      {a.id === user?.id && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/50">
                          You
                        </span>
                      )}
                      {!a.active && (
                        <span className="rounded-full border border-[#ff4d6d]/40 bg-[#ff4d6d]/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#ff8fa3]">
                          Suspended
                        </span>
                      )}
                      {a.must_change_password && (
                        <span className="rounded-full border border-[#ffb020]/40 bg-[#ffb020]/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#ffb020]">
                          Must change
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-white/45">
                      <span className="font-mono">{a.login}</span>
                      <span>{a.login_type === "username" ? "student ID" : "email"}</span>
                      <span>· password changed {fmtDate(a.password_changed_at)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setResetting(a)}
                      data-testid={`account-reset-${a.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-white/75 transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff]"
                    >
                      <KeyRound size={13} /> Reset password
                    </button>
                    <button
                      onClick={() => toggleActive(a)}
                      data-testid={`account-active-${a.id}`}
                      title={a.active ? "Suspend this account" : "Restore access"}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                        a.active
                          ? "border-white/15 text-white/60 hover:border-[#ff4d6d] hover:text-[#ff8fa3]"
                          : "border-[#00ff66]/30 text-[#7dffb0] hover:border-[#00ff66]"
                      }`}
                    >
                      {a.active ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                      {a.active ? "Suspend" : "Restore"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <MyPasswordCard />

          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
            <div className="text-sm font-medium text-white">Recent activity</div>
            <p className="mt-1 text-xs text-white/45">
              Who changed what, and when. Passwords themselves are never recorded.
            </p>
            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1" data-testid="accounts-audit">
              {audit.length === 0 ? (
                <div className="text-xs text-white/35">Nothing yet.</div>
              ) : (
                audit.map((e) => (
                  <div key={e.id} className="border-l-2 border-white/10 pl-3">
                    <div className="text-xs text-white/75">
                      <span className="text-white">{e.actor_name || e.actor_login}</span>{" "}
                      {e.action === "password_reset"
                        ? "reset the password for"
                        : e.action === "deactivated"
                        ? "suspended"
                        : "restored"}{" "}
                      <span className="text-white">{e.target_name || e.target_login}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/35">
                      {fmtDate(e.created_at)}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {resetting && (
          <ResetDialog
            account={resetting}
            onClose={() => setResetting(null)}
            onDone={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Accounts;
