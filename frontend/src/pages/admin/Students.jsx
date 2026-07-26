import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const CHART_ACCENT = "#00f0ff";
const CHART_TRACK = "rgba(255,255,255,0.06)";
const CHART_ROW_H = 34;

const ChartTooltip = ({ active, payload, suffix = "" }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-[#120a1f] px-3 py-1.5 text-xs shadow-xl">
      <div className="text-white/70">{p.name}</div>
      <div className="text-white font-medium">{p.value}{suffix}</div>
    </div>
  );
};

// Horizontal bar chart card -- one metric per category (pack or student), so a single
// accent hue is correct (see dataviz skill: sequential = one hue, no legend needed for a
// single series). Bars are capped at 16px thick with a rounded data-end.
const BarChartCard = ({ title, data, suffix = "", emptyLabel }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
    <div className="overline text-white/50 mb-3">{title}</div>
    {data.length === 0 ? (
      <div className="text-sm text-white/40 py-8 text-center">{emptyLabel}</div>
    ) : (
      <ResponsiveContainer width="100%" height={Math.max(CHART_ROW_H * data.length, CHART_ROW_H * 2)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={CHART_TRACK} />
          <XAxis type="number" hide domain={[0, suffix === "%" ? 100 : "dataMax"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
            tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
          />
          <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} label={{ position: "right", fill: "rgba(255,255,255,0.6)", fontSize: 11, formatter: (v) => `${v}${suffix}` }}>
            {data.map((_, i) => <Cell key={i} fill={CHART_ACCENT} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )}
  </div>
);

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const ProgressBar = ({ pct }) => (
  <div className="flex items-center gap-2 w-32">
    <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]" style={{ width: `${pct}%` }} />
    </div>
    <span className="text-xs text-white/50 w-9 text-right">{pct}%</span>
  </div>
);

const StudentRow = ({ student }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 overflow-hidden" data-testid={`student-row-${student.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        data-testid={`student-toggle-${student.id}`}
      >
        <div className="min-w-0">
          <div className="font-display text-base text-white truncate">{student.name}</div>
          <div className="text-xs text-white/40 truncate">{student.email}</div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="hidden sm:block text-xs text-white/40 w-20">
            {student.packs.length} pack{student.packs.length === 1 ? "" : "s"}
          </div>
          <div className="hidden md:block">
            <ProgressBar pct={student.overall_completion_pct} />
          </div>
          <div className="hidden lg:block text-xs text-white/40 w-28">Active {fmtDate(student.last_active)}</div>
          <ChevronDown size={16} className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/8 pt-4 space-y-2">
          {student.packs.length === 0 && <div className="text-sm text-white/40">Not enrolled in any Tutor Pack yet.</div>}
          {student.packs.map((p) => (
            <div
              key={p.pack_id}
              className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              data-testid={`student-${student.id}-pack-${p.pack_id}`}
            >
              <div className="min-w-0">
                <div className="text-sm text-white">{p.pack_title}</div>
                <div className="text-xs text-white/40 mt-0.5">Enrolled {fmtDate(p.enrolled_at)} · Active {fmtDate(p.last_active)}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-xs text-white/50 text-right">
                  <div className="text-white/70">{p.completed_count}/{p.total_count} items</div>
                  {p.quiz_avg_pct !== null && p.quiz_avg_pct !== undefined && <div>Quiz avg {p.quiz_avg_pct}%</div>}
                </div>
                <ProgressBar pct={p.completion_pct} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Students = () => {
  const { t } = useLang();
  const [stats, setStats] = useState({});
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get("/content/stats").then((r) => setStats(r.data));
    api.get("/students/roster").then((r) => setRoster(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [roster, query]);

  // Derived chart data -- computed client-side from the roster already fetched, no extra
  // network round trip. All three are single-metric-per-category, so each chart uses one
  // accent hue with no legend, per the dataviz "sequential = one hue" rule.
  const enrollmentByPack = useMemo(() => {
    const counts = new Map();
    roster.forEach((s) => s.packs.forEach((p) => counts.set(p.pack_title, (counts.get(p.pack_title) || 0) + 1)));
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [roster]);

  const completionByStudent = useMemo(
    () => [...roster].sort((a, b) => b.overall_completion_pct - a.overall_completion_pct).map((s) => ({ name: s.name, value: s.overall_completion_pct })),
    [roster]
  );

  const quizAvgByPack = useMemo(() => {
    const sums = new Map();
    roster.forEach((s) =>
      s.packs.forEach((p) => {
        if (p.quiz_avg_pct === null || p.quiz_avg_pct === undefined) return;
        const cur = sums.get(p.pack_title) || { total: 0, count: 0 };
        cur.total += p.quiz_avg_pct;
        cur.count += 1;
        sums.set(p.pack_title, cur);
      })
    );
    return [...sums.entries()].map(([name, { total, count }]) => ({ name, value: Math.round(total / count) })).sort((a, b) => b.value - a.value);
  }, [roster]);

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

      {!loading && roster.length > 0 && (
        <div className="mt-4 grid md:grid-cols-3 gap-4" data-testid="students-charts">
          <BarChartCard title="Enrollment by Tutor Pack" data={enrollmentByPack} emptyLabel="No enrollments yet." />
          <BarChartCard title="Completion by student" data={completionByStudent} suffix="%" emptyLabel="No completion data yet." />
          <BarChartCard title="Quiz average by Tutor Pack" data={quizAvgByPack} suffix="%" emptyLabel="No quiz attempts yet." />
        </div>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <div className="overline text-[#00f0ff]">Roster</div>
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#00f0ff]"
            data-testid="student-search"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3" data-testid="students-roster">
        {loading && <div className="text-sm text-white/40">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-sm text-white/40">
            {roster.length === 0 ? "No students have registered yet." : "No students match your search."}
          </div>
        )}
        {!loading && filtered.map((s) => <StudentRow key={s.id} student={s} />)}
      </div>
    </div>
  );
};

export default Students;
