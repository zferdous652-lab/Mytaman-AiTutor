import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, Brain, CalendarCheck, Heart, Link2, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LanguageToggle from "@/components/LanguageToggle";
import BrandLogo from "@/components/BrandLogo";

const RELATIONSHIPS = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "guardian", label: "Guardian" },
];

// The same benefits the invitation email leads with, so the landing page confirms the
// offer rather than restating it in different words.
const BENEFITS = [
  { icon: BarChart3, text: "Monitor their learning progress as it happens" },
  { icon: Target, text: "See their strongest subjects and the topics that need work" },
  { icon: CalendarCheck, text: "Track how consistently they're studying" },
  { icon: Brain, text: "Get AI-generated insights and reports" },
  { icon: Heart, text: "Support their learning journey with what actually helps" },
];

const Shell = ({ children }) => (
  <div className="min-h-screen grid place-items-center p-6">
    <div className="w-full max-w-lg">
      <div className="flex items-center justify-between mb-8">
        <Link to="/" className="flex items-center">
          <BrandLogo className="h-9" />
        </Link>
        <LanguageToggle testId="connect-lang" />
      </div>
      {children}
    </div>
  </div>
);

const Notice = ({ title, body, action }) => (
  <div className="text-center" data-testid="connect-notice">
    <AlertTriangle size={36} className="mx-auto text-amber-400" />
    <h1 className="font-display text-2xl tracking-tighter text-white mt-5">{title}</h1>
    <p className="text-sm text-white/60 mt-3 leading-relaxed">{body}</p>
    {action}
  </div>
);

const inputCls =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]";

const BenefitList = () => (
  <ul className="mt-6 space-y-3 text-left" data-testid="connect-benefits">
    {BENEFITS.map(({ icon: Icon, text }) => (
      <li key={text} className="flex gap-3 text-sm text-white/70">
        <Icon size={16} className="text-[#00f0ff] shrink-0 mt-0.5" />
        <span className="leading-relaxed">{text}</span>
      </li>
    ))}
  </ul>
);

/** Signing in without leaving the invitation flow, for a parent who already has an account. */
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
    <form onSubmit={submit} className="mt-8 space-y-4 text-left" data-testid="connect-inline-login">
      <div>
        <label className="text-xs text-white/60">Email</label>
        <input value={email} readOnly className={`${inputCls} opacity-70 cursor-not-allowed`} />
      </div>
      <div>
        <label className="text-xs text-white/60">Password</label>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          data-testid="connect-login-password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="connect-login-submit"
        className="w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
      >
        {loading ? "…" : "Sign in and connect"}
      </button>
    </form>
  );
};

const ConnectChild = () => {
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [relationship, setRelationship] = useState("guardian");
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      const { data } = await api.get(`/auth/parent-invite/${encodeURIComponent(token)}`);
      setPreview(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "This invitation link is not valid.");
    }
  }, [token]);

  useEffect(() => { if (token) loadPreview(); }, [token, loadPreview]);

  const isMatchingParent =
    user && user.role === "parent" && preview && (user.email || "").toLowerCase() === preview.parent_email;

  useEffect(() => {
    if (!isMatchingParent) return;
    (async () => {
      try {
        const { data } = await api.get(`/parents/child-invites/${encodeURIComponent(token)}`);
        setDetail(data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Could not load this invitation.");
      }
    })();
  }, [isMatchingParent, token]);

  const accept = async () => {
    setBusy(true);
    try {
      await api.post(`/parents/child-invites/${encodeURIComponent(token)}/accept`, { relationship });
      toast.success(`You're connected with ${detail.student_name}`);
      nav("/parent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not connect");
    }
    setBusy(false);
  };

  const decline = async () => {
    setBusy(true);
    try {
      await api.post(`/parents/child-invites/${encodeURIComponent(token)}/decline`);
      toast.success("Invitation declined");
      nav("/parent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not decline");
    }
    setBusy(false);
  };

  if (!token) {
    return <Shell><Notice title="Missing invitation link" body="Open the link from the email we sent you." /></Shell>;
  }
  if (error) {
    return (
      <Shell>
        <Notice
          title="This link can't be used"
          body={error}
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
  if (preview.already_linked) {
    return (
      <Shell>
        <Notice
          title="Already connected"
          body={`${preview.student_name} is already connected to a parent account.`}
          action={
            <Link to="/login" className="mt-8 inline-flex rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/80 hover:text-white transition-colors">
              Go to sign in
            </Link>
          }
        />
      </Shell>
    );
  }

  if (user && !isMatchingParent) {
    return (
      <Shell>
        <Notice
          title="Wrong account"
          body={`This invitation was sent to ${preview.parent_email}. Sign out and sign in with that account to accept it.`}
          action={
            <button
              onClick={() => { logout(); nav(`/connect-child?token=${encodeURIComponent(token)}`); }}
              data-testid="connect-signout"
              className="mt-8 inline-flex rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/80 hover:text-white transition-colors"
            >
              Sign out
            </button>
          }
        />
      </Shell>
    );
  }

  // Not signed in: welcome them, show what they get, then sign in or register.
  if (!user) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-4xl">🎉</div>
          <h1 className="font-display text-2xl lg:text-3xl tracking-tighter text-white mt-4">
            {preview.student_name} has started learning on Lv99.ai!
          </h1>
          <p className="text-sm text-white/60 mt-3 leading-relaxed">
            Join as a Parent to follow their learning journey and support their academic growth.
            It only takes a minute.
          </p>
        </div>

        <BenefitList />

        {preview.email_taken_by_other_role ? (
          <div
            className="mt-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-white/70 leading-relaxed"
            data-testid="connect-email-conflict"
          >
            <span className="text-white">{preview.parent_email}</span> is already registered on Lv99.ai,
            but not as a parent account — so it can't be used to connect. Ask {preview.student_name} to
            resend the invitation to a different email address from their portal.
          </div>
        ) : preview.parent_has_account ? (
          <InlineLogin email={preview.parent_email} onDone={loadPreview} />
        ) : (
          <div className="mt-8 text-center">
            <Link
              to={`/register?token=${encodeURIComponent(token)}&email=${encodeURIComponent(preview.parent_email)}`}
              data-testid="connect-to-register"
              className="inline-flex rounded-full bg-[#00f0ff] px-6 py-3 text-sm font-semibold text-black hover:bg-white transition-colors"
            >
              Create Parent Account
            </Link>
            <p className="mt-3 text-xs text-white/40">
              You'll be connected to {preview.student_name} as soon as you're set up.
            </p>
          </div>
        )}
      </Shell>
    );
  }

  if (!detail) {
    return <Shell><p className="text-sm text-white/40 text-center">Loading invitation…</p></Shell>;
  }

  return (
    <Shell>
      <div className="overline text-[#00f0ff] mb-3">Connect with your child</div>
      <h1 className="font-display text-3xl tracking-tighter text-white mb-2">
        Follow {detail.student_name}'s progress
      </h1>
      <p className="text-sm text-white/50 mb-6">
        Connecting adds {detail.student_name} to your parent dashboard. It doesn't change anything
        about their own account or access.
      </p>

      <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 mb-4" data-testid="connect-child-summary">
        <div className="overline text-white/40 mb-3">Your child</div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Name</dt><dd className="text-white">{detail.student_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Student ID</dt><dd className="font-mono text-white">{detail.username}</dd>
          </div>
          {detail.grade && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">Form</dt><dd className="text-white">{detail.grade}</dd>
            </div>
          )}
          {detail.birth_year && (
            <div className="flex justify-between gap-4">
              <dt className="text-white/50">Year of birth</dt><dd className="text-white">{detail.birth_year}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mb-6">
        <label className="text-xs text-white/60">Your relationship to {detail.student_name}</label>
        <select
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          className={inputCls}
          data-testid="connect-relationship"
        >
          {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          data-testid="connect-decline"
          className="rounded-full border border-white/10 px-5 py-3 text-sm text-white/70 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors disabled:opacity-50"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          data-testid="connect-accept"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
        >
          <Link2 size={16} />
          {busy ? "Connecting…" : `Connect with ${detail.student_name.split(" ")[0]}`}
        </button>
      </div>
    </Shell>
  );
};

export default ConnectChild;
