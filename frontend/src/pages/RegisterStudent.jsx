import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MailCheck, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import LanguageToggle from "@/components/LanguageToggle";

export const GRADES = ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5"];

const CURRENT_YEAR = new Date().getFullYear();
export const BIRTH_YEARS = Array.from({ length: 21 }, (_, i) => CURRENT_YEAR - 4 - i);

// Students sign up for themselves, but submitting this form does not create an
// account -- it emails their parent for approval. Nothing exists until the parent
// confirms it, which is why there's no "you're in" state here, only "ask your parent".
const RegisterStudent = () => {
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    parent_email: "",
    birth_year: "",
    grade: GRADES[0],
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register-student", {
        ...form,
        username: form.username.trim().toLowerCase(),
        birth_year: Number(form.birth_year),
      });
      setSent(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send the request");
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-md text-center" data-testid="student-register-sent">
          <MailCheck size={40} className="mx-auto text-[#00f0ff]" />
          <h1 className="font-display text-2xl tracking-tighter text-white mt-5">Ask your parent to check their email</h1>
          <p className="text-sm text-white/60 mt-3 leading-relaxed">
            We've sent an approval request to <span className="text-white">{sent.parent_email}</span>. Your account
            isn't active yet — once your parent approves it, you can sign in with the student ID{" "}
            <span className="font-mono text-white">{form.username.trim().toLowerCase()}</span>.
          </p>
          <p className="text-xs text-white/40 mt-4">The request expires in 72 hours.</p>
          <Link
            to="/login"
            className="mt-8 inline-flex rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" data-testid="student-register-logo" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
            <div className="font-display font-semibold text-white">MYTAMAN AI TUTOR</div>
          </Link>
          <LanguageToggle testId="student-register-lang" />
        </div>

        <div className="overline text-[#00f0ff] mb-3">Student sign up</div>
        <h1 className="font-display text-3xl tracking-tighter text-white mb-2">Join with your parent</h1>
        <p className="text-sm text-white/50 mb-6">
          You don't need an email address — just a student ID you'll remember.
        </p>

        <div className="flex gap-3 rounded-xl border border-[#00f0ff]/20 bg-[#00f0ff]/5 p-4 mb-6">
          <ShieldCheck size={16} className="text-[#00f0ff] shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            Your parent has to approve this before your account is created. We'll email them a link.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" data-testid="student-register-form">
          <div>
            <label className="text-xs text-white/60">Your full name</label>
            <input
              data-testid="student-register-name"
              required
              value={form.name}
              onChange={set("name")}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Student ID</label>
            <input
              data-testid="student-register-username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              value={form.username}
              onChange={set("username")}
              placeholder="e.g. aisyah_01"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/25 focus:border-[#00f0ff]"
            />
            <p className="mt-1 text-xs text-white/40">4–24 characters: letters, numbers, dot, dash or underscore.</p>
          </div>

          <div>
            <label className="text-xs text-white/60">Password</label>
            <input
              data-testid="student-register-password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
            <p className="mt-1 text-xs text-white/40">
              At least 8 characters. Your parent will see this and may change it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/60">Year of birth</label>
              <select
                data-testid="student-register-birth-year"
                required
                value={form.birth_year}
                onChange={set("birth_year")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
              >
                <option value="">Select…</option>
                {BIRTH_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">Form</label>
              <select
                data-testid="student-register-grade"
                value={form.grade}
                onChange={set("grade")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Parent's email</label>
            <input
              data-testid="student-register-parent-email"
              type="email"
              required
              value={form.parent_email}
              onChange={set("parent_email")}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#00f0ff]"
            />
            <p className="mt-1 text-xs text-white/40">We'll send the approval request here.</p>
          </div>

          <button
            data-testid="student-register-submit"
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#00f0ff] py-3 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send request to my parent"}
          </button>
        </form>

        <div className="mt-6 text-sm text-white/60">
          Already approved?{" "}
          <Link to="/login" className="text-[#00f0ff] hover:underline" data-testid="student-register-to-login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterStudent;
