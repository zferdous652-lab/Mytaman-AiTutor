import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const AddChildForm = ({ onAdded }) => {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/parents/children", form);
      toast.success("Child account created");
      setForm({ name: "", email: "", password: "" });
      onAdded();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not create child account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="add-child-form" className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 max-w-md space-y-4">
      <div>
        <label className="text-xs text-white/50">Child's name</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#00f0ff]"
          data-testid="add-child-name"
        />
      </div>
      <div>
        <label className="text-xs text-white/50">Child's email</label>
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#00f0ff]"
          data-testid="add-child-email"
        />
      </div>
      <div>
        <label className="text-xs text-white/50">Password</label>
        <input
          required
          type="password"
          minLength={6}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#00f0ff]"
          data-testid="add-child-password"
        />
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

const useChildren = () => {
  const [children, setChildren] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    const { data } = await api.get("/parents/children");
    setChildren(data);
    setSelectedId((cur) => (cur && data.some((c) => c.id === cur)) ? cur : data[0]?.id ?? null);
  };
  useEffect(() => { load(); }, []);

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
      <div className="overline text-[#00f0ff]">{t("overview")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Your child's progress</h1>

      <ChildSwitcher children={children} selectedId={selectedId} onSelect={setSelectedId} />

      {loadingPacks ? (
        <p className="text-white/40 text-sm">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-white/60 max-w-md">
          Select a pack in <a href="/parent/packs" className="text-[#00f0ff] underline">Tutor Packs</a> to enroll your child.
        </p>
      ) : (
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
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]"
                    style={{ width: `${p.percent}%` }}
                  />
                </div>
              </div>
              {p.quiz_average != null && (
                <div className="mt-3 text-xs text-white/50">Quiz average: {p.quiz_average}%</div>
              )}
            </div>
          ))}
        </div>
      )}
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
