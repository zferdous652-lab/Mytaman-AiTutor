import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, Send, CheckCircle2, FileEdit, X, ClipboardCheck, AlertTriangle, Pencil, EyeOff, Archive, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/context/LangContext";

const CONTENT_TYPE_LABELS = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards", mindmap: "Mind Map", notes: "Notes" };

const Packs = () => {
  const { t } = useLang();
  const [packs, setPacks] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", grade: "", language: "both", tier: "basic" });
  const [reviewPack, setReviewPack] = useState(null);
  const [confirmedDrafts, setConfirmedDrafts] = useState([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [publishingSelection, setPublishingSelection] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteFromStudents, setDeleteFromStudents] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [archivedPacks, setArchivedPacks] = useState([]);
  const [showArchived, setShowArchived] = useState(false);

  const askConfirm = (title, message, onConfirm, confirmLabel = "Delete") => setConfirmState({ title, message, onConfirm, confirmLabel });
  const closeConfirm = () => setConfirmState(null);
  const runConfirm = async () => {
    if (!confirmState) return;
    await confirmState.onConfirm();
    setConfirmState(null);
  };

  const load = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
  };
  useEffect(() => { load(); }, []);

  const loadArchived = async () => {
    const { data } = await api.get("/packs/archived");
    setArchivedPacks(data);
  };
  const toggleArchived = () => {
    if (!showArchived) loadArchived();
    setShowArchived((s) => !s);
  };

  // Archived packs are invisible to /packs/list by design (that's what makes archiving
  // useful) so the only remaining action on one is a real, unrecoverable delete -- there's
  // no "keep for students" choice left to make since it's already hidden from new enrollment.
  const deleteArchivedPack = (pack) => {
    askConfirm(
      `Permanently delete "${pack.title}"?`,
      "This is already hidden from Tutor Packs and Browse Packs. Deleting it now also removes it from every student who's still enrolled, including their progress. This cannot be undone.",
      async () => {
        try {
          await api.delete(`/packs/${pack.id}`);
          toast.success(`"${pack.title}" permanently deleted`);
          setArchivedPacks((prev) => prev.filter((p) => p.id !== pack.id));
        } catch (err) {
          toast.error(err?.response?.data?.detail || "Delete failed");
        }
      },
      "Delete"
    );
  };

  const openReview = async (pack) => {
    setReviewPack(pack);
    setLoadingReview(true);
    try {
      const { data } = await api.get("/content/drafts", { params: { pack_id: pack.id } });
      const confirmed = data.filter((d) => d.status === "confirmed" && !d.hidden_from_review);
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

  // Per-row Remove: admin-side only, via hidden_from_review -- the draft stays confirmed
  // and completely untouched in Manual Content / Generate with AI (including anything it
  // already published live for students). Re-confirming it there brings it back here.
  const removeFromList = (draft) => {
    const label = draft.name || `Draft ${draft.draft_index}`;
    askConfirm(
      `Remove ${label} from this list?`,
      "Admin-only: it disappears from Publish review here, but the draft stays confirmed and untouched in Manual Content / Generate with AI — re-confirm it there to bring it back here.",
      async () => {
        try {
          await api.post(`/content/drafts/${draft.id}/hide-from-review`);
          toast.success(`${label} removed from this list`);
          setConfirmedDrafts((prev) => prev.filter((d) => d.id !== draft.id));
          setSelectedDraftIds((prev) => prev.filter((id) => id !== draft.id));
        } catch (err) {
          toast.error(err?.response?.data?.detail || "Failed");
        }
      },
      "Remove"
    );
  };

  // Remove all: the one bulk action, next to Publish selected -- clears every checked
  // draft from this list AND pulls its content from the student portal. Same "draft stays
  // untouched, re-confirm to resurface" rule applies.
  const removeAllSelected = () => {
    if (selectedDraftIds.length === 0) return;
    askConfirm(
      `Remove ${selectedDraftIds.length} checked draft(s)?`,
      "They disappear from this list and their content is pulled from the student portal — the drafts themselves stay untouched in Manual Content / Generate with AI. Re-confirm any of them there to bring it back here.",
      async () => {
        setBulkDeleting(true);
        try {
          const { data } = await api.post("/content/drafts/bulk-unpublish", { ids: selectedDraftIds });
          toast.success(`Removed ${selectedDraftIds.length} draft(s), ${data.removed_from_students} item(s) from the student portal`);
          setConfirmedDrafts((prev) => prev.filter((d) => !selectedDraftIds.includes(d.id)));
          setSelectedDraftIds([]);
        } catch (err) {
          toast.error(err?.response?.data?.detail || "Failed");
        }
        setBulkDeleting(false);
      },
      "Remove"
    );
  };

  const isItemHidden = (draft, item) =>
    (draft.hidden_review_items || []).some(
      (h) => h.chapter_id === item.chapter_id && h.content_type === item.content_type && h.language === item.language
    );

  // Per-item remove: the (x) on a single content-type tag inside a draft row. Removes just
  // that one (chapter, content type, language) slot from the student portal, and records it
  // on this draft's own hidden_review_items so the tag stays gone from this list across
  // reloads -- never touches the draft's actual items, which Manual Content / Generate with
  // AI keep showing exactly as authored. Re-confirming the draft there brings it back.
  const removeItemFromStudents = (draft, item) => {
    const label = `${item.chapter_title} · ${CONTENT_TYPE_LABELS[item.content_type] || item.content_type} · ${item.language.toUpperCase()}`;
    askConfirm(
      `Remove ${label} from students?`,
      "This removes this item from the student portal and clears its tag here — the draft stays fully untouched in Manual Content / Generate with AI. Re-confirm it there to bring the tag back.",
      async () => {
        try {
          const { data: updatedDraft } = await api.post(`/content/drafts/${draft.id}/items/unpublish`, {
            chapter_id: item.chapter_id,
            content_type: item.content_type,
            language: item.language,
          });
          toast.success(`${label} removed from the student portal`);
          setConfirmedDrafts((prev) => prev.map((d) => (d.id === draft.id ? updatedDraft : d)));
        } catch (err) {
          toast.error(err?.response?.data?.detail || "Failed");
        }
      },
      "Remove"
    );
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
      setForm({ title: "", description: "", grade: "", language: "both", tier: "basic" });
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
          <div>
            <label className="text-xs text-white/60">Grade</label>
            <input required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" data-testid="pack-grade" />
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
              <div className="text-xs text-white/50 mt-1">{p.grade}</div>
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

      <div className="mt-6">
        <button
          type="button"
          onClick={toggleArchived}
          className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
          data-testid="toggle-archived"
        >
          <Archive size={12} /> Archived packs
          <ChevronDown size={12} className={`transition-transform ${showArchived ? "rotate-180" : ""}`} />
        </button>

        {showArchived && (
          <div className="mt-3 space-y-2" data-testid="archived-list">
            {archivedPacks.length === 0 && <div className="text-xs text-white/40">No archived packs.</div>}
            {archivedPacks.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0a0514]/40 px-4 py-3"
                data-testid={`archived-pack-${p.id}`}
              >
                <div>
                  <div className="text-sm text-white">{p.title}</div>
                  <div className="text-xs text-white/40">{p.grade}</div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteArchivedPack(p)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                  data-testid={`archived-pack-${p.id}-delete`}
                >
                  <Trash2 size={12} /> Delete permanently
                </button>
              </div>
            ))}
          </div>
        )}
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
                  Check drafts and Publish selected to push live. Remove only clears this list — the draft always stays in Manual Content / Generate with AI; re-confirm it there to bring it back.
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
                const editHref = `/admin/${d.source === "ai" ? "generate" : "manual"}?pack=${reviewPack.id}&draft=${d.id}`;
                return (
                  <div
                    key={d.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      checked ? "border-[#00f0ff]/50 bg-[#00f0ff]/5" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                    data-testid={`review-draft-${d.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDraftSelection(d.id)}
                        className="mt-1 accent-[#00f0ff] cursor-pointer"
                        data-testid={`review-draft-${d.id}-checkbox`}
                      />
                      <label className="flex-1 cursor-pointer" onClick={() => toggleDraftSelection(d.id)}>
                        <div className="text-sm text-white font-medium">
                          {d.name || `Draft ${d.draft_index}`}
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-white/30">{d.source === "ai" ? "AI generated" : "Manual"}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {d.items.filter((it) => !isItemHidden(d, it)).map((it, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/60 bg-white/5 border border-white/10 rounded-full pl-2 pr-1 py-0.5"
                            >
                              {it.chapter_title} · {CONTENT_TYPE_LABELS[it.content_type] || it.content_type} · {it.language.toUpperCase()}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeItemFromStudents(d, it); }}
                                className="text-white/30 hover:text-red-400 transition-colors"
                                title="Remove this item from students"
                                data-testid={`review-draft-${d.id}-item-${i}-remove`}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={editHref}
                          className="text-white/40 hover:text-[#00f0ff] transition-colors"
                          title="Edit this draft"
                          data-testid={`review-draft-${d.id}-edit`}
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeFromList(d)}
                          className="text-white/40 hover:text-red-400 transition-colors"
                          title="Remove from this list (admin-side only)"
                          data-testid={`review-draft-${d.id}-delete`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {confirmedDrafts.length > 0 && (
              <div className="p-6 border-t border-white/10 flex items-center justify-between gap-3">
                <span className="text-xs text-white/50">{selectedDraftIds.length} of {confirmedDrafts.length} selected</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={removeAllSelected}
                    disabled={selectedDraftIds.length === 0 || bulkDeleting}
                    className="inline-flex items-center gap-2 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="publish-review-bulk-delete"
                    title="Remove all checked drafts from this list and from students"
                  >
                    <Trash2 size={14} /> {bulkDeleting ? "Removing…" : "Remove all"}
                  </button>
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
      {confirmState && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={closeConfirm}
          data-testid="confirm-modal"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0514] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-[#ff0055]"><AlertTriangle size={20} /></div>
              <div>
                <div className="font-display text-lg text-white tracking-tight">{confirmState.title}</div>
                <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{confirmState.message}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirm}
                className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 hover:border-white/30 transition-colors"
                data-testid="confirm-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runConfirm}
                className="inline-flex items-center gap-2 rounded-full bg-[#ff0055] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff0055]/80 transition-colors"
                data-testid="confirm-modal-confirm"
              >
                {confirmState.confirmLabel === "Remove" ? <EyeOff size={14} /> : <Trash2 size={14} />} {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Packs;
