import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  FileEdit,
  Cpu,
  Package,
  Users,
  LogOut,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";

const items = {
  admin: (t) => [
    { to: "/admin", label: t("overview"), icon: LayoutDashboard, end: true, id: "overview" },
    { to: "/admin/generate", label: t("generate"), icon: Sparkles, id: "generate" },
    { to: "/admin/manual", label: t("manual"), icon: FileEdit, id: "manual" },
    { to: "/admin/router", label: t("router"), icon: Cpu, id: "router" },
    { to: "/admin/packs", label: t("packs"), icon: Package, id: "packs" },
    { to: "/admin/students", label: t("students_label"), icon: Users, id: "students" },
  ],
  student: (t) => [
    { to: "/student", label: t("my_packs"), icon: BookOpen, end: true, id: "my-packs" },
    { to: "/student/browse", label: t("browse_packs"), icon: Package, id: "browse" },
  ],
  parent: (t) => [
    { to: "/parent", label: t("overview"), icon: LayoutDashboard, end: true, id: "overview" },
    { to: "/parent/packs", label: t("packs"), icon: Package, id: "packs" },
  ],
};

const DashboardShell = ({ children }) => {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const list = items[user.role](t);

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="border-r border-white/8 bg-[#0a0514]/70 backdrop-blur-xl p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
          <div>
            <div className="font-display font-semibold text-white leading-tight">MYTAMAN</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]">{user.role}</div>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {list.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              data-testid={`side-${it.id}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/25"
                    : "text-white/70 hover:bg-white/5 hover:text-white border border-transparent"
                }`
              }
            >
              <it.icon size={16} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="pt-4 border-t border-white/8 space-y-3">
          <LanguageToggle testId="dash-lang" />
          <div className="text-xs text-white/60">
            <div className="font-mono truncate" title={user.email}>{user.email}</div>
            <div className="text-white/40">{user.name}</div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); nav("/"); }}
            className="w-full inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors"
          >
            <LogOut size={14} /> {t("logout")}
          </button>
        </div>
      </aside>
      <main className="min-h-screen">{children}</main>
    </div>
  );
};

export default DashboardShell;
