import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, Send, CheckCircle2, FileEdit } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const Packs = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", subject: "", grade: "", language: "both", tier: "basic" });
  const [publishingId, setPublishingId] = useState(null);

  const load = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/packs/create", form);
      toast.success("Pack created");
      setForm({ title: "", description: "", subject: "", grade: "", language: "both", tier: "basic" });
      load();
    } catch (err) {
      toast.error("Failed");
    }
  };

  const deletePack = async (pack) => {
    if (!window.confirm(`Delete "${pack.title}"? This removes all its courses, chapters, content, and drafts. This cannot be undone.`)) return;
    try {
      await api.delete(`/packs/${pack.id}`);
      toast.success(`"${pack.title}" deleted`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  const publishPack = async (pack) => {
    setPublishingId(pack.id);
    try {
      const { data } = await api.post(`/packs/${pack.id}/publish`);
      toast.success(`Published ${data.published_count} item(s) to students & parents`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Publish failed");
    }
    setPublishingId(null);
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">{t("packs")}</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Tutor Packs</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6 space-y-3" data-testid="pack-form">
          <div>
            <label className="text-xs text-white/60">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" data-testid="pack-title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/60">Subject</label>
              <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" data-testid="pack-subject" />
            </div>
            <div>
              <label className="text-xs text-white/60">Grade</label>
              <input required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" data-testid="pack-grade" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-sm" data-testid="pack-desc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/60">Language</label>
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
                <option value="both">EN + BM</option>
                <option value="en">EN</option>
                <option value="bm">BM</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">Tier</label>
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
                <option value="xpoints">X-Points</option>
              </select>
            </div>
          </div>
          <button data-testid="pack-submit" type="submit" className="w-full rounded-full bg-[#00f0ff] py-2 text-sm font-semibold text-black hover:bg-white transition-colors">Create pack</button>
        </form>

        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4" data-testid="packs-list">
          {packs.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 flex flex-col" data-testid={`pack-card-${p.id}`}>
              <div className="flex items-center justify-between">
                <div className="overline text-[#00f0ff]">{p.tier}</div>
                <div className="flex items-center gap-2">
                  {p.published && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#00ff66] uppercase tracking-widest">
                      <CheckCircle2 size={11} /> Published
                    </span>
                  )}
                  <div className="text-[10px] uppercase tracking-widest text-white/40">{p.language.toUpperCase()}</div>
                </div>
              </div>
              <div className="font-display text-lg text-white mt-2 tracking-tight">{p.title}</div>
              <div className="text-xs text-white/50 mt-1">{p.subject} · {p.grade}</div>
              <p className="text-sm text-white/70 mt-3 leading-relaxed flex-1">{p.description}</p>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                <Link
                  to={`/admin/manual?pack=${p.id}`}
                  className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-[#00f0ff] transition-colors"
                  data-testid={`pack-${p.id}-manage`}
                >
                  <FileEdit size={13} /> Manage content
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => publishPack(p)}
                    disabled={publishingId === p.id}
                    className="inline-flex items-center gap-1 text-xs text-[#00f0ff] hover:underline disabled:opacity-50"
                    data-testid={`pack-${p.id}-publish`}
                    title="Publish confirmed content to students & parents"
                  >
                    <Send size={13} /> {publishingId === p.id ? "Publishing…" : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePack(p)}
                    className="text-white/40 hover:text-red-400"
                    data-testid={`pack-${p.id}-delete`}
                    title="Delete pack"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Packs;
