import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TrendingUp, Target, Lightbulb, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";
import { BIRTH_YEARS, GRADES } from "@/pages/RegisterStudent";

const fieldCls =
  "mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#00f0ff]";

const AddChildForm = ({ onAdded }) => {
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    grade: GRADES[0],
    birth_year: "",
    relationship: "guardian",
    language: "en",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/parents/children", {
        ...form,
        username: form.username.trim().toLowerCase(),
        birth_year: Number(form.birth_year),
      });
      toast.success("Child account created");
      setForm({ name: "", username: "", password: "", grade: GRADES[0], birth_year: "", relationship: "guardian", language: "en" });
      onAdded();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create child account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="add-child-form" className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 max-w-lg space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/50">Child's name</label>
          <input required value={form.name} onChange={set("name")} className={fieldCls} data-testid="add-child-name" />
        </div>
        <div>
          <label className="text-xs text-white/50">Your relationship</label>
          <select value={form.relationship} onChange={set("relationship")} className={fieldCls} data-testid="add-child-relationship">
            <option value="mother">Mother</option>
            <option value="father">Father</option>
            <option value="guardian">Guardian</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/50">Student ID</label>
        <input
          required
          autoCapitalize="none"
          autoCorrect="off"
          value={form.username}
          onChange={set("username")}
          placeholder="e.g. aisyah_01"
          className={`${fieldCls} placeholder-white/25`}
          data-testid="add-child-username"
        />
        <p className="mt-1 text-xs text-white/40">
          Your child signs in with this — no email needed. 4–24 characters.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-white/50">Form</label>
          <select value={form.grade} onChange={set("grade")} className={fieldCls} data-testid="add-child-grade">
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-white/50">Year of birth</label>
          <select required value={form.birth_year} onChange={set("birth_year")} className={fieldCls} data-testid="add-child-birth-year">
            <option value="">Select…</option>
            {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-white/50">Language</label>
          <select value={form.language} onChange={set("language")} className={fieldCls} data-testid="add-child-language">
            <option value="en">English</option>
            <option value="bm">Bahasa Melayu</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/50">Password</label>
        <input
          required
          type="password"
          minLength={8}
          value={form.password}
          onChange={set("password")}
          className={fieldCls}
          data-testid="add-child-password"
        />
        <p className="mt-1 text-xs text-white/40">
          At least 8 characters. Your child will set their own the first time they sign in.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        data-testid="add-child-submit"
        className="w-full rounded-full bg-[#00f0ff] py-2 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create child account"}
      </button>
    </form>
  );
};

// Persisted across ParentHome/ParentPacks (each mounts its own useChildren instance),
// so picking a child on one page doesn't silently reset back to children[0] on the other.
const SELECTED_CHILD_KEY = "mytaman_parent_selected_child";

const useChildren = () => {
  const [children, setChildren] = useState(null);
  const [selectedId, setSelectedIdState] = useState(() => localStorage.getItem(SELECTED_CHILD_KEY));

  const setSelectedId = useCallback((id) => {
    setSelectedIdState(id);
    if (id) localStorage.setItem(SELECTED_CHILD_KEY, id);
    else localStorage.removeItem(SELECTED_CHILD_KEY);
  }, []);

  const load = useCallback(async () => {
    const { data } = await api.get("/parents/children");
    setChildren(data);
    const cur = localStorage.getItem(SELECTED_CHILD_KEY);
    setSelectedId((cur && data.some((c) => c.id === cur)) ? cur : data[0]?.id ?? null);
  }, [setSelectedId]);
  useEffect(() => { load(); }, [load]);

  return { children, selectedId, setSelectedId, reload: load };
};

const ChildSwitcher = ({ children, selectedId, onSelect }) => {
  if (children.length < 2) return null;
  return (
    <div className="flex gap-2 mb-6" data-testid="child-switcher">
      {children.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            c.id === selectedId ? "bg-[#00f0ff] text-black font-semibold" : "border border-white/10 text-white/60 hover:text-white"
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
};

const RemoveChildModal = ({ child, onCancel, onConfirm }) => {
  const [removing, setRemoving] = useState(false);
  const confirm = async () => {
    setRemoving(true);
    try {
      await onConfirm();
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel} data-testid="remove-child-modal">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#120a1f] p-6"
      >
        <div className="font-display text-lg text-white tracking-tight">Remove {child.name}?</div>
        <p className="mt-2 text-sm text-white/60">
          {child.name} will stop appearing here and won't be able to sign in. Their account, enrolled packs and
          progress are all kept, so you can add them back later.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="remove-child-cancel"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={removing}
            data-testid="remove-child-confirm"
            className="rounded-full bg-[#ff0055] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ff3377] transition-colors disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ManageChildren = ({ children, onRemoved }) => {
  const [target, setTarget] = useState(null);

  const remove = async () => {
    await api.delete(`/parents/children/${target.id}`);
    toast.success(`${target.name} removed`);
    setTarget(null);
    onRemoved();
  };

  return (
    <div className="mt-10">
      <div className="overline text-white/40 mb-3">Manage children</div>
      <div className="space-y-2" data-testid="manage-children-list">
        {children.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5"
            data-testid={`manage-child-${c.id}`}
          >
            <div className="min-w-0">
              <div className="text-sm text-white truncate">{c.name}</div>
              <div className="text-xs text-white/40 truncate">
                <span className="font-mono">{c.username}</span>
                {c.grade && <span> · {c.grade}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTarget(c)}
              data-testid={`remove-child-${c.id}`}
              className="shrink-0 text-xs text-[#ff0055]/80 hover:text-[#ff0055] transition-colors"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {target && <RemoveChildModal child={target} onCancel={() => setTarget(null)} onConfirm={remove} />}
    </div>
  );
};

// Turns raw per-pack numbers (completed/total/percent/quiz_average/last_active) into
// plain-language insights -- a weighted overall progress figure, up to two standout
// subjects, up to two that could use more attention, and up to three short, specific,
// encouraging recommendations. Deliberately simple thresholds (not a model call): a
// parent dashboard needs to be explainable at a glance, not statistically clever.
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

const buildInsights = (packs, childName) => {
  const totalCompleted = packs.reduce((s, p) => s + p.completed, 0);
  const totalItems = packs.reduce((s, p) => s + p.total, 0);
  const overallProgress = totalItems ? Math.round((totalCompleted / totalItems) * 100) : 0;

  const withQuiz = packs.filter((p) => p.quiz_average != null);
  const overallQuizAvg = withQuiz.length
    ? Math.round(withQuiz.reduce((s, p) => s + p.quiz_average, 0) / withQuiz.length)
    : null;

  // Blend quiz performance (mastery) with completion (engagement) when both exist,
  // so a pack isn't called "strong" purely for being finished without checking retention.
  const scored = packs.map((p) => ({
    ...p,
    score: p.quiz_average != null ? Math.round(p.quiz_average * 0.6 + p.percent * 0.4) : p.percent,
  }));

  const strong = scored.filter((p) => p.score >= 70).sort((a, b) => b.score - a.score).slice(0, 2);
  const growing = scored
    .filter((p) => p.score < 60 && (p.completed > 0 || p.quiz_average != null))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const recommendations = [];
  growing.forEach((p) => {
    if (p.quiz_average != null && p.quiz_average < 60) {
      recommendations.push(`Review ${p.title} together — recent quiz scores suggest a few topics haven't clicked yet.`);
    } else if (p.percent < 40) {
      recommendations.push(`${childName} started ${p.title} but progress has stalled — a short daily session could help.`);
    }
  });
  const stale = packs.find((p) => p.last_active && Date.now() - new Date(p.last_active).getTime() > STALE_MS);
  if (stale && recommendations.length < 3) {
    recommendations.push(`${childName} hasn't opened ${stale.title} in over two weeks — a gentle nudge could help keep momentum.`);
  }
  if (recommendations.length === 0 && strong.length > 0) {
    recommendations.push(`Great consistency across the board — consider browsing for a new Tutor Pack to keep ${childName} challenged.`);
  }
  if (recommendations.length === 0 && strong.length === 0 && growing.length === 0) {
    recommendations.push(`${childName} is just getting started — check back after a few more sessions for personalized insights.`);
  }

  return { overallProgress, overallQuizAvg, strong, growing, recommendations: recommendations.slice(0, 3) };
};

const Meter = ({ percent, tone = "brand" }) => {
  const fill = tone === "good" ? "bg-emerald-400" : tone === "warning" ? "bg-amber-400" : "bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]";
  return (
    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
      <div className={`h-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
};

const HeroStat = ({ label, value, sublabel }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
    <div className="overline text-white/50">{label}</div>
    <div className="font-display text-5xl text-white mt-2 tracking-tighter">{value}</div>
    {sublabel && <div className="text-xs text-white/40 mt-2">{sublabel}</div>}
  </div>
);

const StatTile = ({ label, value, sublabel }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
    <div className="overline text-white/50">{label}</div>
    <div className="font-display text-3xl text-white mt-2 tracking-tighter">{value}</div>
    {sublabel && <div className="text-xs text-white/40 mt-2">{sublabel}</div>}
  </div>
);

const InsightList = ({ title, icon: Icon, tone, items, emptyLabel }) => {
  const iconColor = tone === "good" ? "text-emerald-400" : "text-amber-400";
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColor} />
        <div className="overline text-white/50">{title}</div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/40 mt-4">{emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((p) => (
            <div key={p.id}>
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-sm text-white truncate">{p.title}</span>
                <span className="text-xs text-white/50 shrink-0">{p.score}%</span>
              </div>
              <div className="mt-1.5">
                <Meter percent={p.score} tone={tone} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Recommendations = ({ items }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="parent-recommendations">
    <div className="flex items-center gap-2">
      <Lightbulb size={16} className="text-[#00f0ff]" />
      <div className="overline text-white/50">Suggestions for you</div>
    </div>
    <ul className="mt-4 space-y-3">
      {items.map((text, i) => (
        <li key={i} className="text-sm text-white/70 leading-relaxed flex gap-2">
          <span className="text-[#00f0ff] shrink-0">•</span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  </div>
);

const ParentHome = () => {
  const { t } = useLang();
  const { children, selectedId, setSelectedId, reload } = useChildren();
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  useEffect(() => {
    if (!selectedId) { setPacks([]); return; }
    setLoadingPacks(true);
    api.get(`/parents/children/${selectedId}/packs`).then((r) => setPacks(r.data)).finally(() => setLoadingPacks(false));
  }, [selectedId]);

  const child = children?.find((c) => c.id === selectedId);
  const firstName = child?.name?.split(" ")[0] || "your child";
  const insights = useMemo(() => buildInsights(packs, firstName), [packs, firstName]);

  if (children === null) {
    return <div className="p-8 lg:p-12 text-sm text-white/40">Loading…</div>;
  }

  if (children.length === 0) {
    return (
      <div className="p-8 lg:p-12">
        <div className="overline text-[#00f0ff]">{t("overview")}</div>
        <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-6">Add your child</h1>
        <p className="text-white/60 max-w-md mb-6">Create your child's account to start tracking their progress and selecting Tutor Packs for them.</p>
        <AddChildForm onAdded={reload} />
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff] flex items-center gap-2">
        <Sparkles size={14} /> {t("overview")}
      </div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">{firstName}'s learning journey</h1>

      <ChildSwitcher children={children} selectedId={selectedId} onSelect={setSelectedId} />

      {loadingPacks ? (
        <p className="text-white/40 text-sm">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-white/60 max-w-md">
          Select a pack in <a href="/parent/packs" className="text-[#00f0ff] underline">Tutor Packs</a> to enroll your child.
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <HeroStat label="Overall progress" value={`${insights.overallProgress}%`} sublabel="Across every Tutor Pack" />
            <StatTile
              label="Quiz average"
              value={insights.overallQuizAvg != null ? `${insights.overallQuizAvg}%` : "—"}
              sublabel={insights.overallQuizAvg != null ? "How well it's sticking" : "No quizzes attempted yet"}
            />
            <StatTile label="Tutor Packs" value={packs.length} sublabel={`${packs.filter((p) => p.total > 0 && p.completed === p.total).length} completed`} />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <InsightList
              title="Strong subjects"
              icon={TrendingUp}
              tone="good"
              items={insights.strong}
              emptyLabel="No standout subject yet — keep going, it'll show up here."
            />
            <InsightList
              title="Growing areas"
              icon={Target}
              tone="warning"
              items={insights.growing}
              emptyLabel="Nothing needs extra attention right now."
            />
          </div>

          <div className="mt-4">
            <Recommendations items={insights.recommendations} />
          </div>

          <div className="mt-10">
            <div className="overline text-white/40 mb-3">All Tutor Packs</div>
            <div className="grid md:grid-cols-2 gap-4" data-testid="parent-packs">
              {packs.map((p) => (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
                  <div className="overline text-[#00f0ff]">{p.tier}</div>
                  <div className="font-display text-xl tracking-tighter text-white mt-2">{p.title}</div>
                  <div className="text-xs text-white/50 mt-1">{p.grade}</div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-white/50 mb-1">
                      <span>Progress</span>
                      <span>{p.completed}/{p.total} · {p.percent}%</span>
                    </div>
                    <Meter percent={p.percent} />
                  </div>
                  {p.quiz_average != null && (
                    <div className="mt-3 text-xs text-white/50">Quiz average: {p.quiz_average}%</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <ManageChildren children={children} onRemoved={reload} />
    </div>
  );
};

const ParentPacks = () => {
  const { t } = useLang();
  const { children, selectedId, setSelectedId } = useChildren();
  const [packs, setPacks] = useState([]);
  const [enrolled, setEnrolled] = useState(new Set());

  const load = async (childId) => {
    if (!childId) return;
    const [all, mine] = await Promise.all([
      api.get("/packs/list"),
      api.get(`/parents/children/${childId}/packs`),
    ]);
    setPacks(all.data);
    setEnrolled(new Set(mine.data.map((p) => p.id)));
  };
  useEffect(() => { load(selectedId); }, [selectedId]);

  const enroll = async (id) => {
    await api.post(`/parents/children/${selectedId}/enroll`, { pack_id: id });
    toast.success("Pack selected");
    load(selectedId);
  };

  if (children === null) {
    return <div className="p-8 lg:p-12 text-sm text-white/40">Loading…</div>;
  }

  if (children.length === 0) {
    return (
      <div className="p-8 lg:p-12">
        <div className="overline text-[#00f0ff]">{t("packs")}</div>
        <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-6">Add your child first</h1>
        <p className="text-white/60 max-w-md">
          Add your child on the <a href="/parent" className="text-[#00f0ff] underline">Overview</a> page before selecting packs for them.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Select packs for your child</h1>

      <ChildSwitcher children={children} selectedId={selectedId} onSelect={setSelectedId} />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="parent-browse">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5">
            <div className="overline text-[#00f0ff]">{p.tier}</div>
            <div className="font-display text-lg tracking-tight text-white mt-2">{p.title}</div>
            <div className="text-xs text-white/50 mt-1">{p.grade}</div>
            <p className="text-sm text-white/70 mt-3 leading-relaxed">{p.description}</p>
            <button
              data-testid={`parent-enroll-${p.id}`}
              disabled={enrolled.has(p.id)}
              onClick={() => enroll(p.id)}
              className={`mt-4 w-full rounded-full py-2 text-sm font-semibold transition-colors ${
                enrolled.has(p.id) ? "border border-white/10 text-white/50" : "bg-[#00f0ff] text-black hover:bg-white"
              }`}
            >
              {enrolled.has(p.id) ? t("enrolled") : "Select"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export { ParentHome, ParentPacks };
