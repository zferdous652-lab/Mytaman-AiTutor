import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, X, MessageSquare, Users, CheckCircle2, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const StatCard = ({ icon: Icon, label, value, accent = "#00f0ff" }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
    <div className="flex items-center gap-2">
      <Icon size={14} style={{ color: accent }} />
      <div className="overline" style={{ color: accent }}>{label}</div>
    </div>
    <div className="font-display text-3xl tracking-tighter text-white mt-2">{value}</div>
  </div>
);

const PHASE_LABEL = { probe: "Probing", hint: "Hint", challenge: "Challenge", consolidate: "Consolidating" };

// Full transcript view. Open-ended AI conversation with school-age children is only
// defensible if an adult can actually read what was said, so this shows every turn
// verbatim rather than a summary.
const TranscriptModal = ({ sessionId, onClose }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/socratic/admin/sessions/${sessionId}`);
        setData(res.data);
      } catch (e) {
        toast.error("Couldn't load that transcript.");
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="max-w-2xl w-full glass rounded-2xl p-6 max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="transcript-modal"
      >
        {!data ? (
          <div className="text-white/50 text-sm">Loading transcript…</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="overline text-[#8a2be2]">{data.session.student_name}</div>
                <div className="font-display text-xl tracking-tight text-white mt-1">
                  {data.session.content_title || "Lesson"}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {data.session.pack_title} · {data.session.content_type} · {data.session.language.toUpperCase()} ·{" "}
                  {data.session.turn_count} turns
                </div>
              </div>
              <button
                onClick={onClose}
                data-testid="transcript-close"
                className="shrink-0 rounded-full border border-white/15 p-2 text-white/70 hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              {data.turns.map((turn) => (
                <div key={turn.id} className={`flex ${turn.role === "student" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      turn.role === "student"
                        ? "bg-[#00f0ff]/10 border border-[#00f0ff]/25 text-white"
                        : "bg-white/[0.04] border border-white/10 text-white/85"
                    } ${turn.flagged ? "ring-1 ring-[#ff0055]" : ""}`}
                  >
                    {turn.role === "tutor" && turn.phase && (
                      <div className="overline text-[10px] text-[#8a2be2] mb-1">
                        {PHASE_LABEL[turn.phase] || turn.phase}
                        {turn.hint_level > 0 && ` · hint ${turn.hint_level}`}
                      </div>
                    )}
                    {turn.flagged && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#ff0055] mb-1">
                        <AlertTriangle size={11} /> Flagged for review
                      </div>
                    )}
                    {turn.text}
                  </div>
                </div>
              ))}
              {data.turns.length === 0 && <div className="text-sm text-white/40">No messages in this session yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Socratic = () => {
  const { t } = useLang();
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [openSessionId, setOpenSessionId] = useState(null);

  const loadSessions = async (onlyFlagged) => {
    const { data } = await api.get(`/socratic/admin/sessions?flagged_only=${onlyFlagged}`);
    setSessions(data);
  };

  const load = async () => {
    const [s, st] = await Promise.all([api.get("/socratic/settings"), api.get("/socratic/admin/stats")]);
    setSettings(s.data);
    setStats(st.data);
    await loadSessions(flaggedOnly);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = async (patch) => {
    try {
      const { data } = await api.put("/socratic/settings", patch);
      setSettings(data);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save settings.");
    }
  };

  const toggleFlagged = async (next) => {
    setFlaggedOnly(next);
    await loadSessions(next);
  };

  if (!settings || !stats) return <div className="p-12 text-white/60">Loading Socratic Learning…</div>;

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#8a2be2]">{t("socratic")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-2">
        {t("socratic_admin_title")}
      </h1>
      <p className="text-white/60 max-w-2xl mb-8">{t("socratic_admin_sub")}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-testid="socratic-stats">
        <StatCard icon={Activity} label="Sessions" value={stats.total_sessions} />
        <StatCard icon={MessageSquare} label="Messages" value={stats.total_messages} />
        <StatCard icon={Users} label="Students engaged" value={stats.students_engaged} />
        <StatCard icon={AlertTriangle} label="Flagged" value={stats.flagged_sessions} accent="#ff0055" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="socratic-settings">
          <div className="overline text-[#00f0ff] mb-4">Settings</div>

          <label className="flex items-center justify-between gap-3 mb-4">
            <span className="text-sm text-white/80">Enabled</span>
            <button
              type="button"
              onClick={() => saveSettings({ enabled: !settings.enabled })}
              data-testid="socratic-toggle-enabled"
              className={`h-6 w-11 rounded-full transition-colors relative ${settings.enabled ? "bg-[#00f0ff]" : "bg-white/15"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all ${
                  settings.enabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>

          <div className="mb-4">
            <label className="text-xs text-white/60">Max turns per conversation</label>
            <input
              type="number"
              min={1}
              max={200}
              defaultValue={settings.max_turns_per_session}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v && v !== settings.max_turns_per_session) saveSettings({ max_turns_per_session: v });
              }}
              data-testid="socratic-max-turns"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-[#00f0ff] outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="text-xs text-white/60">Daily messages per student</label>
            <input
              type="number"
              min={1}
              max={1000}
              defaultValue={settings.daily_message_cap}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v && v !== settings.daily_message_cap) saveSettings({ daily_message_cap: v });
              }}
              data-testid="socratic-daily-cap"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-[#00f0ff] outline-none"
            />
            <p className="text-[11px] text-white/35 mt-1.5">
              Every message is a paid model call — this is the cost ceiling as much as a pedagogy one.
            </p>
          </div>

          <label className="flex items-start justify-between gap-3">
            <span className="text-sm text-white/80">
              Allow quiz answers
              <span className="block text-[11px] text-white/35 mt-0.5">
                Off: the tutor never reveals a quiz's correct answer at any hint level.
              </span>
            </span>
            <button
              type="button"
              onClick={() => saveSettings({ allow_quiz_answers: !settings.allow_quiz_answers })}
              data-testid="socratic-toggle-quiz-answers"
              className={`mt-1 shrink-0 h-6 w-11 rounded-full transition-colors relative ${
                settings.allow_quiz_answers ? "bg-[#ff0055]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all ${
                  settings.allow_quiz_answers ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>

          <div className="mt-5 pt-4 border-t border-white/8">
            <div className="text-xs text-white/60">
              Available on{" "}
              <span className="text-[#8a2be2] font-semibold">{settings.tiers.join(", ")}</span> tier packs
              <span className="block text-white/35 mt-1">
                {stats.eligible_packs} pack{stats.eligible_packs === 1 ? "" : "s"} currently eligible.
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {stats.top_concepts.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="socratic-concepts">
              <div className="overline text-[#00f0ff] mb-1">Most-tutored concepts</div>
              <p className="text-xs text-white/40 mb-4">
                What students keep needing help with — worth strengthening in the authored content.
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.top_concepts.map((c) => (
                  <span
                    key={c.concept}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                  >
                    {c.concept} <span className="text-[#8a2be2] font-mono">{c.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="overline text-[#00f0ff]">Sessions</div>
                <p className="text-xs text-white/40 mt-1">Click a row to read the full transcript.</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFlagged(!flaggedOnly)}
                data-testid="socratic-flagged-filter"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  flaggedOnly
                    ? "border-[#ff0055] text-[#ff0055]"
                    : "border-white/10 text-white/60 hover:border-white/30"
                }`}
              >
                <AlertTriangle size={11} className="inline mr-1" /> Flagged only
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-sm text-white/40 py-6 text-center">
                {flaggedOnly ? "Nothing flagged — good." : "No tutor sessions yet."}
              </div>
            ) : (
              <div className="space-y-2" data-testid="socratic-sessions">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOpenSessionId(s.id)}
                    className="w-full text-left rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 hover:border-[#8a2be2]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">
                          {s.student_name}
                          <span className="text-white/35"> · {s.content_title || "Lesson"}</span>
                        </div>
                        <div className="text-[11px] text-white/40 mt-0.5 truncate">
                          {s.pack_title} · {s.content_type} · {s.turn_count} turns ·{" "}
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {s.flagged_count > 0 && (
                          <span className="rounded-full bg-[#ff0055]/15 border border-[#ff0055]/40 px-2 py-0.5 text-[10px] text-[#ff0055]">
                            <AlertTriangle size={9} className="inline mr-0.5" />
                            {s.flagged_count}
                          </span>
                        )}
                        {s.mastered && <CheckCircle2 size={14} className="text-[#00f0ff]" />}
                        <span className="text-[10px] font-mono text-white/35">
                          {Math.round((s.mastery_signal || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {openSessionId && <TranscriptModal sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />}
    </div>
  );
};

export default Socratic;
