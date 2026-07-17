import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";

const roleDest = { admin: "/admin", parent: "/parent", student: "/student" };

const Register = () => {
  const { register } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Account created — ${u.name}`);
      nav(roleDest[u.role] || "/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" data-testid="register-logo" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
            <div className="font-display font-semibold text-white">MYTAMAN AI TUTOR</div>
          </Link>
          <LanguageToggle testId="register-lang" />
        </div>
        <div className="overline text-[#00f0ff] mb-3">{t("sign_up")}</div>
        <h1 className="font-display text-3xl tracking-tighter text-white mb-6">Create your account</h1>
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
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">{t("password")}</label>
            <input
              data-testid="register-password"
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">{t("role")}</label>
            <select
              data-testid="register-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            >
              <option value="student">Student / Learner</option>
              <option value="parent">Parent</option>
            </select>
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
