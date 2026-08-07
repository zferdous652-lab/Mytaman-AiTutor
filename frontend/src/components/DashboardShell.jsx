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
  Brain,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import LanguageToggle from "@/components/LanguageToggle";
import ParentLinkBanner from "@/components/ParentLinkBanner";
import NotificationBanner from "@/components/NotificationBanner";
import SidebarToggle, { RailTooltip } from "@/components/SidebarToggle";
import BrandLogo from "@/components/BrandLogo";
import {
  PacksIcon,
  BrowsePacksIcon,
  DashboardIcon,
  OverviewIcon,
} from "@/components/icons/NavIcons";
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
    { to: "/admin/accounts", label: t("accounts"), icon: ShieldCheck, id: "accounts" },
  ],
  // Student and parent get the gradient set; admin stays on flat lucide, which suits a
  // dense eight-item operations sidebar better than eight competing gradients.
  student: (t) => [
    { to: "/student", label: t("my_packs"), icon: PacksIcon, end: true, id: "my-packs" },
    { to: "/student/browse", label: t("browse_packs"), icon: BrowsePacksIcon, id: "browse" },
    { to: "/student/dashboard", label: t("dashboard") || "Dashboard", icon: DashboardIcon, id: "dashboard" },
  ],
  parent: (t) => [
    { to: "/parent", label: t("overview"), icon: OverviewIcon, end: true, id: "overview" },
    { to: "/parent/packs", label: t("packs"), icon: BrowsePacksIcon, id: "packs" },
  ],
};

// The gradient icons are a touch larger than the flat ones were: the magnifier and the
// star are the details that carry the style, and at 16px they close up.
const ICON_SIZE = { student: 20, parent: 20 };

// Where the sidebar logo takes you, per role. Student gets the progress dashboard;
// parent gets Overview, which is their equivalent -- there is no /parent/dashboard.
// Admin is deliberately absent: its logo stays a plain image until someone decides
// which of its eight sections counts as "home".
const LOGO_HOME = {
  student: "/student/dashboard",
  parent: "/parent",
};

const DashboardShell = ({ children }) => {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const list = items[user.role](t);
  const logoHome = LOGO_HOME[user.role];
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("mytaman:sidebar:shell");

  return (
    <div className={`min-h-screen grid ${collapsed ? "grid-cols-[72px_1fr]" : "grid-cols-[260px_1fr]"} transition-[grid-template-columns] duration-200`}>
      <aside
        className={`border-r border-white/8 bg-[#0a0514]/70 backdrop-blur-xl flex flex-col ${collapsed ? "p-3 items-center" : "p-5"}`}
        data-testid="dash-sidebar"
        data-collapsed={collapsed}
      >
        <div className={`flex items-center mb-8 ${collapsed ? "flex-col gap-3" : "gap-3"}`}>
          {/* The rail is 72px wide, where a wordmark is unreadable -- it gets the glyph. */}
          {collapsed ? (
            <BrandLogo variant="glyph" className="h-9 w-9 shrink-0" to={logoHome} testId="dash-logo-home" />
          ) : (
            <div className="min-w-0 flex-1">
              <BrandLogo className="h-8" to={logoHome} testId="dash-logo-home" />
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]">{user.role}</div>
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
              <it.icon size={ICON_SIZE[user.role] || 16} className="shrink-0" />
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
        {/* Notices sit above every portal: they report changes the user did not cause
            (a guardian or learner account removed) and would otherwise meet as an
            unexplained absence. The student invite prompt sits with them, and removes
            itself once a parent has connected. */}
        <div className="px-8 lg:px-12 pt-8 lg:pt-12 empty:hidden [&:not(:has(*))]:hidden [&+*]:pt-0">
          <NotificationBanner />
          {user.role === "student" && <ParentLinkBanner />}
        </div>
        {children}
      </main>
    </div>
  );
};

export default DashboardShell;
