import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LanguageToggle from "@/components/LanguageToggle";
import { BIRTH_YEARS, GRADES } from "@/pages/RegisterStudent";

const RELATIONSHIPS = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "guardian", label: "Guardian" },
];

const Shell = ({ children }) => (
  <div className="min-h-screen grid place-items-center p-6">
    <div className="w-full max-w-lg">
      <div className="flex items-center justify-between mb-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
          <div className="font-display font-semibold text-white">MYTAMAN AI TUTOR</div>
        </Link>
        <LanguageToggle testId="approve-lang" />
      </div>
      {children}
    </div>
  </div>
);

const Notice = ({ title, body, action }) => (
  <div className="text-center" data-testid="approve-notice">
    <AlertTriangle size={36} className="mx-auto text-amber-400" />
    <h1 className="font-display text-2xl tracking-tighter text-white mt-5">{title}</h1>
    <p className="text-sm text-white/60 mt-3 leading-relaxed">{body}</p>
    {action}
  </div>
);

const Field = ({ label, children, hint }) => (
  <div>
    <label className="text-xs text-white/60">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
  </div>
);

const inputCls =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]";

/** Signing in without leaving the approval flow, for a parent who already has an account. */
const InlineLogin = ({ email, onDone }) => {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sign in failed");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-left" data-testid="approve-inline-login">
      <Field label="Email">
        <input value={email} readOnly className={`${inputCls} opacity-70 cursor-not-allowed`} />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          data-testid="approve-login-password"
        />
      </Field>
      <button
        type="submit"
        disabled={loading}
        data-testid="approve-login-submit"
        className="w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
      >
        {loading ? "…" : "Sign in and review"}
      </button>
    </form>
  );
};

const ApproveChild = () => {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const { user, loading: authLoading, logout, refresh } = useAuth();
  const nav = useNavigate();

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [packs, setPacks] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  const loadPreview = useCallback(async () => {
    try {
      const { data } = await api.get(`/auth/child-request/${encodeURIComponent(token)}`);
      setPreview(data);
    } catch (err) {
      setPreviewError(err?.response?.data?.detail || "This approval link is not valid.");
    }
  }, [token]);

  useEffect(() => { if (token) loadPreview(); }, [token, loadPreview]);

  const isMatchingParent =
    user && user.role === "parent" && preview && (user.email || "").toLowerCase() === preview.parent_email;

  // The detail call is what reveals the password the child chose, so it only runs once
  // we're signed in as the parent the request was actually addressed to.
  useEffect(() => {
    if (!isMatchingParent) return;
    (async () => {
      try {
        const [d, p] = await Promise.all([
          api.get(`/parents/child-requests/${encodeURIComponent(token)}`),
          api.get("/packs/list"),
        ]);
        setDetail(d.data);
        setPacks(p.data);
        setForm({
          name: d.data.student_name,
          grade: d.data.grade,
          birth_year: String(d.data.birth_year),
          relationship: "guardian",
          language: "en",
          password: d.data.chosen_password,
          pack_ids: [],
        });
      } catch (err) {
        setPreviewError(err?.response?.data?.detail || "Could not load this request.");
      }
    })();
  }, [isMatchingParent, token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const togglePack = (id) =>
    setForm((f) => ({
      ...f,
      pack_ids: f.pack_ids.includes(id) ? f.pack_ids.filter((x) => x !== id) : [...f.pack_ids, id],
    }));

  const approve = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, birth_year: Number(form.birth_year) };
      // Only send a password when the parent actually changed it -- an unchanged value
      // means the child keeps the one they already know and isn't forced to reset.
      if (body.password === detail.chosen_password) delete body.password;
      await api.post(`/parents/child-requests/${encodeURIComponent(token)}/approve`, body);
      await refresh();
      toast.success(`${form.name} can now sign in`);
      nav("/parent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not approve this request");
    }
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    try {
      await api.post(`/parents/child-requests/${encodeURIComponent(token)}/reject`);
      toast.success("Request declined");
      nav("/parent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not decline this request");
    }
    setBusy(false);
  };

  if (!token) {
    return <Shell><Notice title="Missing approval link" body="Open the link from the email we sent you." /></Shell>;
  }
  if (previewError) {
    return (
      <Shell>
        <Notice
          title="This link can't be used"
          body={previewError}
          action={
            <Link to="/login" className="mt-8 inline-flex rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/80 hover:text-white transition-colors">
              Go to sign in
            </Link>
          }
        />
      </Shell>
    );
  }
  if (!preview || authLoading) {
    return <Shell><p className="text-sm text-white/40 text-center">Loading…</p></Shell>;
  }

  // Signed in, but as somebody other than the parent this request was sent to.
  if (user && !isMatchingParent) {
    return (
      <Shell>
        <Notice
          title="Wrong account"
          body={`This request was sent to ${preview.parent_email}. Sign out and sign in with that account to approve it.`}
          action={
            <button
              onClick={() => { logout(); nav(`/approve-child?token=${encodeURIComponent(token)}`); }}
              data-testid="approve-signout"
              className="mt-8 inline-flex rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/80 hover:text-white transition-colors"
            >
              Sign out
            </button>
          }
        />
      </Shell>
    );
  }

  // Not signed in: either sign in inline, or go create the parent account first.
  if (!user) {
    return (
      <Shell>
        <div className="text-center">
          <ShieldCheck size={36} className="mx-auto text-[#00f0ff]" />
          <h1 className="font-display text-2xl tracking-tighter text-white mt-5">
            {preview.student_name} needs your approval
          </h1>
          <p className="text-sm text-white/60 mt-3 leading-relaxed">
            {preview.student_name} asked to join MYTAMAN AI Tutor and listed you as their parent or guardian.
          </p>
        </div>
        {preview.parent_has_account ? (
          <InlineLogin email={preview.parent_email} onDone={loadPreview} />
        ) : (
          <div className="mt-8 text-center">
            <p className="text-sm text-white/60">
              You'll need a parent account first — it takes a moment.
            </p>
            <Link
              to={`/register?token=${encodeURIComponent(token)}&email=${encodeURIComponent(preview.parent_email)}`}
              data-testid="approve-to-register"
              className="mt-5 inline-flex rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors"
            >
              Create my parent account
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  if (!detail || !form) {
    return <Shell><p className="text-sm text-white/40 text-center">Loading request…</p></Shell>;
  }

  const gradeMatched = packs.filter((p) => p.grade === form.grade);
  const visiblePacks = gradeMatched.length ? gradeMatched : packs;

  return (
    <Shell>
      <div className="overline text-[#00f0ff] mb-3">Approve child account</div>
      <h1 className="font-display text-3xl tracking-tighter text-white mb-2">
        {detail.student_name} wants to join
      </h1>
      <p className="text-sm text-white/50 mb-6">
        Here's what they filled in. Check it, add the last few details, and their account will be created.
      </p>

      {/* What the child submitted -- read-only, so the parent can see exactly what was claimed. */}
      <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 mb-4" data-testid="approve-submitted">
        <div className="overline text-white/40 mb-3">Submitted by your child</div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Name</dt><dd className="text-white">{detail.student_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Student ID</dt><dd className="font-mono text-white">{detail.username}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Year of birth</dt><dd className="text-white">{detail.birth_year}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Form</dt><dd className="text-white">{detail.grade}</dd>
          </div>
          <div className="flex justify-between gap-4 items-center">
            <dt className="text-white/50">Password they chose</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono text-white" data-testid="approve-chosen-password">
                {showPassword ? detail.chosen_password : "•".repeat(detail.chosen_password.length)}
              </span>
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                data-testid="approve-toggle-password"
                className="text-white/40 hover:text-white transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      <form onSubmit={approve} className="space-y-4" data-testid="approve-form">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input required value={form.name} onChange={set("name")} className={inputCls} data-testid="approve-name" />
          </Field>
          <Field label="Your relationship">
            <select value={form.relationship} onChange={set("relationship")} className={inputCls} data-testid="approve-relationship">
              {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Form">
            <select value={form.grade} onChange={set("grade")} className={inputCls} data-testid="approve-grade">
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Year of birth">
            <select value={form.birth_year} onChange={set("birth_year")} className={inputCls} data-testid="approve-birth-year">
              {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <select value={form.language} onChange={set("language")} className={inputCls} data-testid="approve-language">
              <option value="en">English</option>
              <option value="bm">Bahasa Melayu</option>
            </select>
          </Field>
        </div>

        <Field
          label="Password"
          hint={
            form.password === detail.chosen_password
              ? "Keeping their password — they can sign in straight away."
              : "You've changed it, so they'll be asked to set a new one on first sign in. Tell them this password."
          }
        >
          <input
            required
            minLength={8}
            value={form.password}
            onChange={set("password")}
            className={inputCls}
            data-testid="approve-password"
          />
        </Field>

        <div>
          <div className="text-xs text-white/60 mb-2">
            Tutor Packs {gradeMatched.length > 0 && <span className="text-white/35">· suggested for {form.grade}</span>}
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1" data-testid="approve-packs">
            {visiblePacks.length === 0 && <p className="text-xs text-white/40">No packs available yet.</p>}
            {visiblePacks.map((p) => (
              <label
                key={p.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  form.pack_ids.includes(p.id)
                    ? "border-[#00f0ff]/50 bg-[#00f0ff]/5"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
                data-testid={`approve-pack-${p.id}`}
              >
                <input
                  type="checkbox"
                  checked={form.pack_ids.includes(p.id)}
                  onChange={() => togglePack(p.id)}
                  className="mt-1 accent-[#00f0ff]"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{p.title}</span>
                  <span className="block text-xs text-white/40">{p.grade} · {p.tier}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-white/40">Optional — you can add packs later from the portal.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={reject}
            disabled={busy}
            data-testid="approve-reject"
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="submit"
            disabled={busy}
            data-testid="approve-submit"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            {busy ? "Creating…" : "Approve and create account"}
          </button>
        </div>
      </form>
    </Shell>
  );
};

export default ApproveChild;
