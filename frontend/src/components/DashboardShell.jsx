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
  Trophy,
  Brain,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";
import ParentLinkBanner from "@/components/ParentLinkBanner";
import SidebarToggle, { RailTooltip } from "@/components/SidebarToggle";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

const items = {
  admin: (t) => [
    { to: "/admin", label: t("overview"), icon: LayoutDashboard, end: true, id: "overview" },
    { to: "/admin/generate", label: t("generate"), icon: Sparkles, id: "generate" },
    { to: "/admin/manual", label: t("manual"), icon: FileEdit, id: "manual" },
    { to: "/admin/router", label: t("router"), icon: Cpu, id: "router" },
    { to: "/admin/packs", label: t("packs"), icon: Package, id: "packs" },
    { to: "/admin/students", label: t("students_label"), icon: Users, id: "students" },
    { to: "/admin/socratic", label: t("socratic"), icon: Brain, id: "socratic" },
  ],
  student: (t) => [
    { to: "/student", label: t("my_packs"), icon: BookOpen, end: true, id: "my-packs" },
    { to: "/student/browse", label: t("browse_packs"), icon: Package, id: "browse" },
    { to: "/student/dashboard", label: t("dashboard") || "Dashboard", icon: Trophy, id: "dashboard" },
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
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("mytaman:sidebar:shell");

  return (
    <div className={`min-h-screen grid ${collapsed ? "grid-cols-[72px_1fr]" : "grid-cols-[260px_1fr]"} transition-[grid-template-columns] duration-200`}>
      <aside
        className={`border-r border-white/8 bg-[#0a0514]/70 backdrop-blur-xl flex flex-col ${collapsed ? "p-3 items-center" : "p-5"}`}
        data-testid="dash-sidebar"
        data-collapsed={collapsed}
      >
        <div className={`flex items-center mb-8 ${collapsed ? "flex-col gap-3" : "gap-2"}`}>
          <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-white leading-tight">Lv99.ai</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]">{user.role}</div>
            </div>
          )}
          <SidebarToggle collapsed={collapsed} onToggle={toggleCollapsed} testId="dash-sidebar-toggle" align={collapsed ? "center" : "left"} />
        </div>

        <nav className={`flex-1 space-y-1 ${collapsed ? "w-full" : ""}`}>
          {list.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              data-testid={`side-${it.id}`}
              title={collapsed ? it.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center rounded-xl text-sm transition-colors ${
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/25"
                    : "text-white/70 hover:bg-white/5 hover:text-white border border-transparent"
                }`
              }
            >
              <it.icon size={16} className="shrink-0" />
              {collapsed ? <RailTooltip>{it.label}</RailTooltip> : it.label}
            </NavLink>
          ))}
        </nav>

        <div className={`pt-4 border-t border-white/8 ${collapsed ? "w-full flex justify-center" : "space-y-3"}`}>
          {!collapsed && (
            <>
              <LanguageToggle testId="dash-lang" />
              <div className="text-xs text-white/60">
                {/* Students have a student ID instead of an email. */}
                <div className="font-mono truncate" title={user.email || user.username}>{user.email || user.username}</div>
                <div className="text-white/40">{user.name}</div>
              </div>
            </>
          )}
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); nav("/"); }}
            title={collapsed ? t("logout") : undefined}
            className={`group relative inline-flex items-center rounded-xl border border-white/10 text-sm text-white/80 hover:border-[#ff0055] hover:text-[#ff0055] transition-colors ${
              collapsed ? "justify-center p-2.5" : "w-full gap-2 px-3 py-2"
            }`}
          >
            <LogOut size={14} className="shrink-0" />
            {collapsed ? <RailTooltip>{t("logout")}</RailTooltip> : t("logout")}
          </button>
        </div>
      </aside>
      <main className="min-h-screen">
        {/* Sits above every student page so the invite prompt can't be missed, and
            removes itself once the parent has connected. */}
        {user.role === "student" && (
          <div className="px-8 lg:px-12 pt-8 lg:pt-12 [&+*]:pt-0">
            <ParentLinkBanner />
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default DashboardShell;
