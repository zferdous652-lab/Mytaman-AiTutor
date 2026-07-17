import React, { useEffect, useState } from "react";
import { Sparkles, FileText, Users, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const Stat = ({ label, value, icon: Icon, tone = "primary", testId }) => (
  <div data-testid={testId} className="relative rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 overflow-hidden">
    <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full blur-3xl ${tone === "primary" ? "bg-[#00f0ff]/10" : "bg-[#8a2be2]/10"}`} />
    <div className="relative">
      <div className="overline text-white/50 flex items-center gap-2">
        <Icon size={12} /> {label}
      </div>
      <div className="font-display text-4xl text-white mt-2 tracking-tighter">{value}</div>
    </div>
  </div>
);

const Overview = () => {
  const { t } = useLang();
  const [stats, setStats] = useState({});
  useEffect(() => {
    api.get("/content/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);
  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("overview")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">
        Daily operations
      </h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat testId="stat-content" label={t("total_content")} value={stats.total_content ?? "—"} icon={FileText} />
        <Stat testId="stat-published" label={t("published")} value={stats.published_content ?? "—"} icon={Sparkles} tone="tertiary" />
        <Stat testId="stat-students" label={t("students_label")} value={stats.students ?? "—"} icon={Users} />
        <Stat testId="stat-packs" label={t("packs")} value={stats.packs ?? "—"} icon={Package} tone="tertiary" />
      </div>

      <div className="mt-10 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-8">
        <div className="overline text-[#00f0ff] mb-3">Quick start</div>
        <div className="font-display text-2xl tracking-tighter text-white mb-2">
          Upload a chapter → publish in minutes
        </div>
        <p className="text-white/60 max-w-2xl">
          Head to <span className="text-[#00f0ff]">{t("generate")}</span> to turn raw material into AI-crafted summaries, quizzes, mind maps and flashcards. Then hit <span className="text-[#00f0ff]">{t("publish")}</span> to push them to enrolled students.
        </p>
      </div>
    </div>
  );
};

export default Overview;
