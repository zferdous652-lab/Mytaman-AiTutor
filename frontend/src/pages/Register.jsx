import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";
import BrandLogo from "@/components/BrandLogo";

const roleDest = { admin: "/admin", parent: "/parent", student: "/student/dashboard" };

// Public sign-up creates a PARENT account only. Children are minors and are created
// either from inside the parent portal or via a parent-approved request, so there is
// no role picker here any more.
const Register = () => {
  const { register } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  // Arriving from a child's approval email: lock the address to the one the child
  // nominated, so the account they create is the one allowed to approve the request.
  const approvalToken = sp.get("token");
  const lockedEmail = sp.get("email") || "";
  const [form, setForm] = useState({ name: "", email: lockedEmail, password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Account created — ${u.name}`);
      nav(approvalToken ? `/connect-child?token=${encodeURIComponent(approvalToken)}` : roleDest[u.role] || "/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" data-testid="register-logo" className="flex items-center">
            <BrandLogo className="h-9" />
          </Link>
          <LanguageToggle testId="register-lang" />
        </div>
        <div className="overline text-[#00f0ff] mb-3">{t("sign_up")}</div>
        <h1 className="font-display text-3xl tracking-tighter text-white mb-2">Create your parent account</h1>
        <p className="text-sm text-white/50 mb-6">
          {approvalToken
            ? "Create your account to connect with your child and follow their progress."
            : "You'll add your child's account from inside the portal once you're signed in."}
        </p>
        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <div>
            <label className="text-xs text-white/60">{t("name")}</label>
            <input
              data-testid="register-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">Email</label>
            <input
              data-testid="register-email"
              type="email"
              required
              readOnly={Boolean(lockedEmail)}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={`mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff] ${lockedEmail ? "opacity-70 cursor-not-allowed" : ""}`}
            />
            {lockedEmail && (
              <p className="mt-1 text-xs text-white/40">This is the address your child listed for you.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-white/60">{t("password")}</label>
            <input
              data-testid="register-password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
            <p className="mt-1 text-xs text-white/40">At least 8 characters.</p>
          </div>
          <button
            data-testid="register-submit"
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
          >
            {loading ? "…" : t("sign_up")}
          </button>
        </form>
        <div className="mt-6 text-sm text-white/60">
          {t("have_account")}{" "}
          <Link to="/login" className="text-[#00f0ff] hover:underline" data-testid="register-to-login">
            {t("sign_in")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
