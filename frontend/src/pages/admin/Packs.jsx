import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, Send, CheckCircle2, FileEdit, X, ClipboardCheck, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const CONTENT_TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

const Packs = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", subject: "", grade: "", language: "both", tier: "basic" });
  const [reviewPack, setReviewPack] = useState(null);
  const [confirmedDrafts, setConfirmedDrafts] = useState([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [publishingSelection, setPublishingSelection] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteFromStudents, setDeleteFromStudents] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
  };
  useEffect(() => { load(); }, []);

  const openReview = async (pack) => {
    setReviewPack(pack);
    setLoadingReview(true);
    try {
      const { data } = await api.get("/content/drafts", { params: { pack_id: pack.id } });
      const confirmed = data.filter((d) => d.status === "confirmed");
      setConfirmedDrafts(confirmed);
      setSelectedDraftIds(confirmed.map((d) => d.id));
    } catch (err) {
      toast.error("Failed to load confirmed drafts");
      setConfirmedDrafts([]);
      setSelectedDraftIds([]);
    }
    setLoadingReview(false);
  };

  const closeReview = () => {
    setReviewPack(null);
    setConfirmedDrafts([]);
    setSelectedDraftIds([]);
  };

  const toggleDraftSelection = (id) => {
    setSelectedDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const publishSelection = async () => {
    if (!reviewPack || selectedDraftIds.length === 0) return;
    setPublishingSelection(true);
    try {
      const { data } = await api.post(`/packs/${reviewPack.id}/publish`, { draft_ids: selectedDraftIds });
      toast.success(`Published ${data.published_count} item(s) to students & parents`);
      closeReview();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Publish failed");
    }
    setPublishingSelection(false);
  };

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

  const openDelete = (pack) => {
    setDeleteTarget(pack);
    setDeleteFromStudents(false);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setDeleteFromStudents(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteFromStudents) {
        await api.delete(`/packs/${deleteTarget.id}`);
        toast.success(`"${deleteTarget.title}" deleted for everyone, including enrolled students`);
      } else {
        await api.post(`/packs/${deleteTarget.id}/archive`);
        toast.success(`"${deleteTarget.title}" removed from Tutor Packs — enrolled students keep it in My Learning`);
      }
      closeDelete();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
    setDeleting(false);
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
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => openReview(p)}
              onKeyDown={(e) => { if (e.key === "Enter") openReview(p); }}
              className="text-left rounded-2xl border border-white/10 bg-[#0a0514]/60 p-5 flex flex-col cursor-pointer hover:border-[#00f0ff]/40 transition-colors"
              data-testid={`pack-card-${p.id}`}
              title="Click to review confirmed drafts and publish"
            >
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
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-[#00f0ff] transition-colors"
                  data-testid={`pack-${p.id}-manage`}
                >
                  <FileEdit size={13} /> Manage content
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openReview(p); }}
                    className="inline-flex items-center gap-1 text-xs text-[#00f0ff] hover:underline"
                    data-testid={`pack-${p.id}-publish`}
                    title="Review confirmed drafts & publish"
                  >
                    <Send size={13} /> Review & Publish
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDelete(p); }}
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

      {reviewPack && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeReview}
          data-testid="publish-review-modal"
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0a0514] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-6 border-b border-white/10">
              <div>
                <div className="overline text-[#00f0ff]">Publish review</div>
                <div className="font-display text-xl text-white mt-1 tracking-tight">{reviewPack.title}</div>
                <p className="text-xs text-white/50 mt-1">
                  Select which confirmed drafts to push live. Unselected drafts stay confirmed but won't be published.
                </p>
              </div>
              <button type="button" onClick={closeReview} className="text-white/40 hover:text-white" data-testid="publish-review-close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingReview && <div className="text-sm text-white/50">Loading confirmed drafts…</div>}

              {!loadingReview && confirmedDrafts.length === 0 && (
                <div className="text-sm text-white/50 flex flex-col items-center text-center py-10 gap-2">
                  <ClipboardCheck size={28} className="text-white/20" />
                  No confirmed drafts yet for this pack. Confirm a draft from Manual Content first.
                </div>
              )}

              {confirmedDrafts.map((d) => {
                const checked = selectedDraftIds.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className={`block rounded-xl border p-4 cursor-pointer transition-colors ${
                      checked ? "border-[#00f0ff]/50 bg-[#00f0ff]/5" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                    data-testid={`review-draft-${d.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDraftSelection(d.id)}
                        className="mt-1 accent-[#00f0ff]"
                        data-testid={`review-draft-${d.id}-checkbox`}
                      />
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium">{d.name || `Draft ${d.draft_index}`}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {d.items.map((it, i) => (
                            <span
                              key={i}
                              className="text-[10px] uppercase tracking-wide text-white/60 bg-white/5 border border-white/10 rounded-full px-2 py-0.5"
                            >
                              {it.chapter_title} · {CONTENT_TYPE_LABELS[it.content_type] || it.content_type} · {it.language.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {confirmedDrafts.length > 0 && (
              <div className="p-6 border-t border-white/10 flex items-center justify-between gap-3">
                <span className="text-xs text-white/50">{selectedDraftIds.length} of {confirmedDrafts.length} selected</span>
                <button
                  type="button"
                  onClick={publishSelection}
                  disabled={selectedDraftIds.length === 0 || publishingSelection}
                  className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-5 py-2 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="publish-review-submit"
                >
                  <Send size={14} /> {publishingSelection ? "Publishing…" : "Publish selected"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeDelete}
          data-testid="delete-pack-modal"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0514] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#ff0055]"><AlertTriangle size={20} /></div>
              <div>
                <div className="font-display text-lg text-white tracking-tight">Delete "{deleteTarget.title}"?</div>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                  This removes it from Tutor Packs and Browse Packs. Its courses, chapters, content and drafts always go with it.
                </p>
              </div>
            </div>

            <label
              className={`mt-5 flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                deleteFromStudents ? "border-[#ff0055]/50 bg-[#ff0055]/5" : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
              data-testid="delete-cascade-checkbox-label"
            >
              <input
                type="checkbox"
                checked={deleteFromStudents}
                onChange={(e) => setDeleteFromStudents(e.target.checked)}
                className="mt-0.5 accent-[#ff0055]"
                data-testid="delete-cascade-checkbox"
              />
              <div>
                <div className="text-sm text-white">Also remove from Student Portal</div>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">
                  Unenrolls every student and permanently deletes their progress for this pack. Leave unchecked to keep it
                  in already-enrolled students' My Learning — it just disappears from here and from Browse Packs.
                </p>
              </div>
            </label>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-white/30 transition-colors"
                data-testid="delete-pack-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-full bg-[#ff0055] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff0055]/80 transition-colors disabled:opacity-50"
                data-testid="delete-pack-confirm"
              >
                <Trash2 size={14} /> {deleting ? "Deleting…" : deleteFromStudents ? "Delete for everyone" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Packs;
