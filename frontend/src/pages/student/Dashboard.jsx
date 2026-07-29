import React, { useEffect, useState } from "react";
import { Sparkles, Trophy, Flame, Target, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";
import RewardsPanel from "./RewardsPanel";

const KIND_LABELS = {
  lesson: "Lesson completed",
  lesson_first_of_day: "First lesson of the day",
  quiz: "Quiz completed",
  quiz_perfect: "Perfect quiz bonus",
  weekly_consistency: "Weekly consistency bonus",
  daily_reward: "Daily reward",
  chest: "Mystery chest",
  lucky_spin: "Lucky spin",
  weekly_mission: "Weekly mission",
  monthly_challenge: "Monthly challenge",
  season_reward: "Season pass reward",
};

const formatWhen = (iso) => {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
};

const StudentDashboard = () => {
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [me, hist] = await Promise.all([api.get("/xp/me"), api.get("/xp/history")]);
    setSummary(me.data);
    setHistory(hist.data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return <div className="p-8 lg:p-12 text-sm text-white/40">Loading…</div>;
  }

  const progressPct = summary.xp_for_next_level ? Math.min(100, summary.progress_pct) : 100;

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("dashboard") || "Dashboard"}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-6">My progress</h1>

      {summary.weekend_multiplier_active && (
        <div className="flex items-center gap-2 rounded-xl border border-[#ff8a00]/30 bg-[#ff8a00]/10 px-4 py-2.5 text-sm text-[#ff8a00] mb-6" data-testid="weekend-multiplier-banner">
          <Zap size={14} />
          XP weekend is live — lessons and quizzes pay 1.5x XP!
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 rounded-2xl border border-[#00f0ff]/20 bg-gradient-to-br from-[#120a1f] to-[#0a0514] p-6" data-testid="xp-summary-card">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-[#00f0ff]/10 border border-[#00f0ff]/30 grid place-items-center">
              <Trophy size={24} className="text-[#00f0ff]" />
            </div>
            <div>
              <div className="text-xs text-white/50 uppercase tracking-widest">Level</div>
              <div className="font-display text-3xl text-white" data-testid="xp-level">{summary.level}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-xs text-white/50 mb-1.5">
              <span>{summary.xp_into_level} XP</span>
              <span>{summary.xp_for_next_level ? `${summary.xp_for_next_level} XP to level ${summary.level + 1}` : "Max level"}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="mt-4 text-sm text-white/60" data-testid="xp-total">
            <span className="text-white font-semibold">{summary.total_xp}</span> total XP earned
          </div>
        </div>

        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="xp-streak-card">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-[#ff8a00]/10 border border-[#ff8a00]/30 grid place-items-center">
              <Flame size={24} className="text-[#ff8a00]" />
            </div>
            <div>
              <div className="text-xs text-white/50 uppercase tracking-widest">Streak</div>
              <div className="font-display text-3xl text-white" data-testid="xp-streak-days">
                {summary.current_streak} {summary.current_streak === 1 ? "day" : "days"}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 text-xs text-white/50 mb-1.5">
              <Target size={12} />
              <span>
                Today: {summary.today_xp}/{summary.daily_goal_xp} XP
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${summary.today_goal_met ? "bg-[#2ecc71]" : "bg-[#ff8a00]"}`}
                style={{ width: `${Math.min(100, Math.round((summary.today_xp / summary.daily_goal_xp) * 100))}%` }}
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-white/60">
            {summary.today_goal_met
              ? "Daily goal met — keep the streak going!"
              : "Complete a lesson or quiz today to keep your streak."}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[#00f0ff]" />
            <div className="text-sm text-white font-medium">Recent activity</div>
          </div>
          <div className="space-y-2" data-testid="xp-history">
            {history.length === 0 && (
              <div className="text-sm text-white/40">Complete a lesson or quiz to start earning XP.</div>
            )}
            {history.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
                data-testid={`xp-event-${ev.id}`}
              >
                <div>
                  <div className="text-sm text-white/90">{ev.label || KIND_LABELS[ev.kind] || ev.kind}</div>
                  <div className="text-xs text-white/40 mt-0.5">{formatWhen(ev.created_at)}</div>
                </div>
                <div className="text-sm font-semibold text-[#00f0ff] shrink-0">+{ev.amount} XP</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RewardsPanel onXpChanged={refresh} />
    </div>
  );
};

export default StudentDashboard;
