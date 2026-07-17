import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";

const roleDest = { admin: "/admin", parent: "/parent", student: "/student" };

const Login = () => {
  const { login } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const hintedRole = sp.get("role");

  const seed = {
    admin: "admin@mytaman.ai",
    parent: "parent@mytaman.ai",
    student: "student@mytaman.ai",
  }[hintedRole] || "";

  const [email, setEmail] = useState(seed);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome, ${u.name}`);
      nav(roleDest[u.role] || "/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img
          src="https://images.pexels.com/photos/30547577/pexels-photo-30547577.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#050505]/80 via-[#050505]/40 to-[#8a2be2]/40" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-2" data-testid="login-logo">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
            <div className="font-display font-semibold text-white">MYTAMAN AI TUTOR</div>
          </Link>
          <div>
            <div className="overline text-[#00f0ff]">{t("tagline")}</div>
            <h2 className="font-display text-4xl tracking-tighter text-white mt-3 max-w-md">
              {t("hero_title_1")} {t("hero_title_2")}
            </h2>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <div className="overline text-[#00f0ff]">{t("sign_in")}</div>
            <LanguageToggle testId="login-lang" />
          </div>
          <h1 className="font-display text-3xl tracking-tighter text-white mb-6">Welcome back</h1>
          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="text-xs text-white/60">Email</label>
              <input
                data-testid="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email_ph")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-[#00f0ff] focus:bg-white/10"
              />
            </div>
            <div>
              <label className="text-xs text-white/60">{t("password")}</label>
              <input
                data-testid="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff] focus:bg-white/10"
              />
            </div>
            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
            >
              {loading ? "…" : t("sign_in")}
            </button>
          </form>
          <div className="mt-6 text-sm text-white/60">
            {t("no_account")}{" "}
            <Link to="/register" className="text-[#00f0ff] hover:underline" data-testid="login-to-register">
              {t("sign_up")}
            </Link>
          </div>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60 font-mono">
            <div className="text-white/80 mb-2">Demo accounts</div>
            admin@mytaman.ai / Admin@12345<br />
            parent@mytaman.ai / Parent@12345<br />
            student@mytaman.ai / Student@12345
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
