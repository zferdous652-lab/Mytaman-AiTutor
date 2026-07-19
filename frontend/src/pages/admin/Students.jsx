import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const Students = () => {
  const { t } = useLang();
  const [stats, setStats] = useState({});
  useEffect(() => { api.get("/content/stats").then((r) => setStats(r.data)); }, []);
  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("students_label")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Community</h1>
      <div className="grid md:grid-cols-3 gap-4" data-testid="students-stats">
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
          <div className="overline text-white/50">{t("students_label")}</div>
          <div className="font-display text-4xl text-white mt-2 tracking-tighter">{stats.students ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
          <div className="overline text-white/50">Parents</div>
          <div className="font-display text-4xl text-white mt-2 tracking-tighter">{stats.parents ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
          <div className="overline text-white/50">{t("packs")}</div>
          <div className="font-display text-4xl text-white mt-2 tracking-tighter">{stats.packs ?? "—"}</div>
        </div>
      </div>
      <p className="mt-8 text-sm text-white/50 max-w-lg">Detailed roster and per-student progress tracking arrives in Phase 2.</p>
    </div>
  );
};

export default Students;
