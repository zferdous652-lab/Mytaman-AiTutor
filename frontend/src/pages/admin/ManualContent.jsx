import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, X, Upload, CheckCircle2, FileEdit } from "lucide-react";
import { api } from "@/lib/api";

const TYPES = [
  { v: "summary", label: "Summary" },
  { v: "quiz", label: "Quiz" },
  { v: "flashcards", label: "Flash Cards" },
  { v: "mindmap", label: "Mind Map" },
  { v: "notes", label: "Notes" },
];

const MAX_QUESTIONS = 40;
const inputCls = "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-[#00f0ff] focus:bg-white/10";
const smallInputCls = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#00f0ff]";

const emptyQuestion = () => ({ type: "mcq", question: "", options: ["", "", "", ""], correct_answer: "" });

// ---------- Quiz builder ----------
const QuizBuilder = ({ questions, setQuestions }) => {
  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions([...questions, emptyQuestion()]);
  };
  const removeQuestion = (idx) => setQuestions(questions.filter((_, i) => i !== idx));
  const patch = (idx, next) => setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...next } : q)));

  return (
    <div className="space-y-4" data-testid="quiz-builder">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">Questions</div>
        <div className="text-xs font-mono text-[#00f0ff]">{questions.length}/{MAX_QUESTIONS}</div>
      </div>
      {questions.map((q, idx) => (
        <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3" data-testid={`quiz-q-${idx}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-white/50">Question {idx + 1}/{MAX_QUESTIONS}</div>
            <button type="button" onClick={() => removeQuestion(idx)} className="text-white/40 hover:text-white" data-testid={`quiz-q-${idx}-remove`}>
              <X size={14} />
            </button>
          </div>
          <select
            value={q.type}
            onChange={(e) => {
              const type = e.target.value;
              patch(idx, { type, options: type === "mcq" ? ["", "", "", ""] : undefined, correct_answer: "" });
            }}
            className={smallInputCls + " w-full"}
          >
            <option value="mcq">Multiple choice</option>
            <option value="true_false">True / False</option>
            <option value="short_answer">Short answer</option>
          </select>
          <input
            required
            value={q.question}
            onChange={(e) => patch(idx, { question: e.target.value })}
            placeholder="Question text"
            className={smallInputCls + " w-full"}
            data-testid={`quiz-q-${idx}-text`}
          />
          {q.type === "mcq" && (
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${idx}`}
                    checked={q.correct_answer === opt && opt !== ""}
                    onChange={() => patch(idx, { correct_answer: opt })}
                    title="Mark as correct answer"
                  />
                  <input
                    value={opt}
                    onChange={(e) => {
                      const options = [...q.options];
                      const prevVal = options[oi];
                      options[oi] = e.target.value;
                      const correct_answer = q.correct_answer === prevVal ? e.target.value : q.correct_answer;
                      patch(idx, { options, correct_answer });
                    }}
                    placeholder={`Option ${oi + 1}`}
                    className={smallInputCls + " flex-1"}
                    data-testid={`quiz-q-${idx}-opt-${oi}`}
                  />
                </div>
              ))}
            </div>
          )}
          {q.type === "true_false" && (
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 font-mono text-xs">
              {["true", "false"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => patch(idx, { correct_answer: v })}
                  className={`px-3 py-1 rounded-full ${q.correct_answer === v ? "bg-[#00f0ff] text-black" : "text-white/70"}`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {q.type === "short_answer" && (
            <input
              value={q.correct_answer || ""}
              onChange={(e) => patch(idx, { correct_answer: e.target.value })}
              placeholder="Expected answer (optional, for reference)"
              className={smallInputCls + " w-full"}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addQuestion}
        disabled={questions.length >= MAX_QUESTIONS}
        className="inline-flex items-center gap-1 text-xs text-[#00f0ff] hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        data-testid="quiz-add-question"
      >
        <Plus size={12} /> Add question
      </button>
    </div>
  );
};

// ---------- Flashcards builder ----------
const FlashcardsBuilder = ({ cards, setCards }) => {
  const addCard = () => setCards([...cards, { front: "", back: "" }]);
  const removeCard = (idx) => setCards(cards.filter((_, i) => i !== idx));
  const patch = (idx, next) => setCards(cards.map((c, i) => (i === idx ? { ...c, ...next } : c)));

  return (
    <div className="space-y-3" data-testid="flashcards-builder">
      {cards.map((c, idx) => (
        <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 grid sm:grid-cols-2 gap-3" data-testid={`flashcard-${idx}`}>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/40">Front</label>
            <input value={c.front} onChange={(e) => patch(idx, { front: e.target.value })} className={smallInputCls + " w-full mt-1"} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Back</label>
              <input value={c.back} onChange={(e) => patch(idx, { back: e.target.value })} className={smallInputCls + " w-full mt-1"} />
            </div>
            <button type="button" onClick={() => removeCard(idx)} className="self-end text-white/40 hover:text-white pb-2">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addCard} className="inline-flex items-center gap-1 text-xs text-[#00f0ff] hover:underline" data-testid="flashcard-add">
        <Plus size={12} /> Add flash card
      </button>
    </div>
  );
};

// ---------- Notes builder (structured bullet points) ----------
const NotesBuilder = ({ notes, setNotes }) => {
  const addNote = () => setNotes([...notes, ""]);
  const removeNote = (idx) => setNotes(notes.filter((_, i) => i !== idx));
  const patch = (idx, value) => setNotes(notes.map((n, i) => (i === idx ? value : n)));

  return (
    <div className="space-y-2" data-testid="notes-builder">
      {notes.map((n, idx) => (
        <div key={idx} className="flex items-center gap-2" data-testid={`note-${idx}`}>
          <span className="text-xs font-mono text-white/40 w-14 shrink-0">Note {idx + 1}</span>
          <input
            value={n}
            onChange={(e) => patch(idx, e.target.value)}
            placeholder="Key point..."
            className={smallInputCls + " flex-1"}
            data-testid={`note-${idx}-text`}
          />
          <button type="button" onClick={() => removeNote(idx)} className="text-white/40 hover:text-white">
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addNote} className="inline-flex items-center gap-1 text-xs text-[#00f0ff] hover:underline" data-testid="note-add">
        <Plus size={12} /> Add note
      </button>
    </div>
  );
};

// ---------- Mind map builder (image upload) ----------
const MindmapBuilder = ({ mindmap, setMindmap, uploading, onUpload }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="space-y-3" data-testid="mindmap-builder">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("mindmap-file-input").click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-[#00f0ff] bg-[#00f0ff]/5" : "border-white/15 bg-white/5"
        }`}
        data-testid="mindmap-dropzone"
      >
        <input
          id="mindmap-file-input"
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload size={22} className="mx-auto text-white/40" />
        <div className="mt-2 text-sm text-white/70">
          {uploading ? "Uploading…" : "Drag & drop a mind map image, or click to upload"}
        </div>
        <div className="mt-1 text-[10px] text-white/30">PNG, JPEG, WEBP, GIF · max 5MB</div>
      </div>
      {mindmap.image_url && (
        <div className="rounded-xl border border-white/10 overflow-hidden" data-testid="mindmap-preview">
          <img src={mindmap.image_url} alt="Mind map preview" className="w-full max-h-64 object-contain bg-black/30" />
        </div>
      )}
      <input
        value={mindmap.caption}
        onChange={(e) => setMindmap({ ...mindmap, caption: e.target.value })}
        placeholder="Caption (optional)"
        className={inputCls}
      />
    </div>
  );
};

const keyFor = (chapterId, contentType, language) => `${chapterId}::${contentType}::${language}`;

const isMeaningful = (contentType, payload) => {
  if (contentType === "summary") return !!(payload.body || "").trim();
  if (contentType === "notes") return (payload.notes || []).some((n) => n.trim());
  if (contentType === "quiz") return (payload.questions || []).some((q) => q.question?.trim());
  if (contentType === "flashcards") return (payload.cards || []).some((c) => c.front?.trim() || c.back?.trim());
  if (contentType === "mindmap") return !!payload.image_url;
  return false;
};

const ManualContent = () => {
  const [packs, setPacks] = useState([]);
  const [packId, setPackId] = useState("");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [chapters, setChapters] = useState([]);
  const [chapterId, setChapterId] = useState("");
  const [contentType, setContentType] = useState("summary");
  const [language, setLanguage] = useState("en");
  const [drafts, setDrafts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Pending content, accumulated client-side across chapters/types until "Save content"
  // bundles it all into a single pack-level draft. Keyed by chapter+type+language.
  const [workingSet, setWorkingSet] = useState({});

  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");

  const [body, setBody] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [cards, setCards] = useState([{ front: "", back: "" }]);
  const [mindmap, setMindmap] = useState({ image_url: "", caption: "" });
  const [notes, setNotes] = useState([""]);

  const loadPacks = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
    if (data[0] && !packId) setPackId(data[0].id);
  };
  useEffect(() => { loadPacks(); }, []); // eslint-disable-line

  const loadCourses = useCallback(async (pid) => {
    if (!pid) { setCourses([]); return; }
    const { data } = await api.get("/courses/list", { params: { pack_id: pid } });
    setCourses(data);
    setCourseId((cur) => (data.find((c) => c.id === cur) ? cur : (data[0]?.id || "")));
  }, []);
  useEffect(() => { loadCourses(packId); }, [packId, loadCourses]);

  const loadChapters = useCallback(async (cid) => {
    if (!cid) { setChapters([]); return; }
    const { data } = await api.get("/chapters/list", { params: { course_id: cid } });
    setChapters(data);
    setChapterId((cur) => (data.find((c) => c.id === cur) ? cur : (data[0]?.id || "")));
  }, []);
  useEffect(() => { loadChapters(courseId); }, [courseId, loadChapters]);

  const loadDrafts = useCallback(async (pid) => {
    if (!pid) { setDrafts([]); return; }
    const { data } = await api.get("/content/drafts", { params: { pack_id: pid } });
    setDrafts(data);
  }, []);
  useEffect(() => { loadDrafts(packId); }, [packId, loadDrafts]);

  // Pushes a working-set entry's payload into the visible builder fields. Called directly
  // (not just via effect) so it also works when the target selection is already the current
  // one -- e.g. loading a draft whose first item matches what's already on screen, where
  // chapterId/contentType/language wouldn't actually change and an effect keyed on them
  // would never re-fire.
  const applyHydration = (map, cid, ctype, lang) => {
    const entry = map[keyFor(cid, ctype, lang)];
    const p = entry?.payload || {};
    if (ctype === "summary") setBody(p.body || "");
    if (ctype === "notes") setNotes(p.notes?.length ? p.notes : [""]);
    if (ctype === "quiz") {
      setQuestions(
        p.questions?.length
          ? p.questions.map((q) => ({ ...q, options: q.options || ["", "", "", ""], correct_answer: q.correct_answer || "" }))
          : [emptyQuestion()]
      );
    }
    if (ctype === "flashcards") setCards(p.cards?.length ? p.cards : [{ front: "", back: "" }]);
    if (ctype === "mindmap") setMindmap({ image_url: p.image_url || "", caption: p.caption || "" });
  };

  // Safety net for indirect chapter changes (e.g. auto-selecting a chapter after switching
  // Course, which happens asynchronously via loadChapters and can't call applyHydration directly).
  useEffect(() => {
    if (!chapterId) return;
    applyHydration(workingSet, chapterId, contentType, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, contentType, language]);

  const selectedChapter = chapters.find((c) => c.id === chapterId);

  const buildPayload = () => {
    if (contentType === "summary") return { body };
    if (contentType === "notes") return { notes: notes.map((n) => n.trim()).filter(Boolean) };
    if (contentType === "quiz") {
      return {
        questions: questions.map((q) => ({
          type: q.type,
          question: q.question,
          options: q.type === "mcq" ? q.options.filter((o) => o.trim() !== "") : undefined,
          correct_answer: q.correct_answer || undefined,
        })),
      };
    }
    if (contentType === "flashcards") return { cards };
    if (contentType === "mindmap") return { image_url: mindmap.image_url, caption: mindmap.caption || undefined };
    return {};
  };

  // Persists whatever is currently in the builder fields into the working set (keyed by the
  // CURRENT selection) and returns the updated set synchronously, so callers can switch
  // selection right after without losing in-progress edits.
  const syncCurrent = () => {
    if (!chapterId) return workingSet;
    const key = keyFor(chapterId, contentType, language);
    const payload = buildPayload();
    const next = { ...workingSet };
    if (isMeaningful(contentType, payload)) {
      next[key] = {
        chapter_id: chapterId,
        content_type: contentType,
        language,
        payload,
        chapter_title: selectedChapter?.title,
        course_title: courses.find((c) => c.id === courseId)?.title,
      };
    } else {
      delete next[key];
    }
    setWorkingSet(next);
    return next;
  };

  const switchPack = (pid) => {
    if (Object.keys(workingSet).length > 0) toast("Switched Tutor Pack — pending items cleared.");
    setWorkingSet({});
    setPackId(pid);
  };
  const switchCourse = (cid) => { syncCurrent(); setCourseId(cid); };
  const switchChapter = (cid) => {
    const synced = syncCurrent();
    setChapterId(cid);
    applyHydration(synced, cid, contentType, language);
  };
  const switchContentType = (ct) => {
    const synced = syncCurrent();
    setContentType(ct);
    applyHydration(synced, chapterId, ct, language);
  };
  const switchLanguage = (l) => {
    const synced = syncCurrent();
    setLanguage(l);
    applyHydration(synced, chapterId, contentType, l);
  };

  const addCourse = async () => {
    if (!newCourseTitle.trim() || !packId) return;
    const { data } = await api.post("/courses/create", { pack_id: packId, title: newCourseTitle.trim() });
    setNewCourseTitle("");
    await loadCourses(packId);
    setCourseId(data.id);
    toast.success("Course added");
  };

  const addChapter = async () => {
    if (!newChapterTitle.trim() || !courseId) return;
    const { data } = await api.post("/chapters/create", { course_id: courseId, title: newChapterTitle.trim() });
    setNewChapterTitle("");
    await loadChapters(courseId);
    setChapterId(data.id);
    toast.success("Chapter added");
  };

  const uploadMindmapImage = async (file) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/content/upload-image", form);
      setMindmap((m) => ({ ...m, image_url: data.url }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    }
    setUploading(false);
  };

  const removePending = (key, e) => {
    e.stopPropagation();
    setWorkingSet((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const jumpToPending = (entry) => {
    const synced = syncCurrent();
    if (courses.find((c) => c.id === entry.course_id)) setCourseId(entry.course_id);
    setChapterId(entry.chapter_id);
    setContentType(entry.content_type);
    setLanguage(entry.language);
    applyHydration(synced, entry.chapter_id, entry.content_type, entry.language);
  };

  const save = async () => {
    const finalSet = syncCurrent();
    const items = Object.values(finalSet);
    if (items.length === 0) {
      toast.error("Add content for at least one chapter before saving.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/content/drafts", {
        pack_id: packId,
        items: items.map((it) => ({
          chapter_id: it.chapter_id,
          content_type: it.content_type,
          language: it.language,
          payload: it.payload,
        })),
      });
      toast.success(`Draft ${data.draft_index} saved with ${data.items.length} item(s)`);
      setWorkingSet({});
      setBody("");
      setNotes([""]);
      setQuestions([emptyQuestion()]);
      setCards([{ front: "", back: "" }]);
      setMindmap({ image_url: "", caption: "" });
      await loadDrafts(packId);
    } catch (err2) {
      toast.error(err2?.response?.data?.detail?.[0]?.msg || err2?.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  const confirmDraft = async (id, e) => {
    e.stopPropagation();
    const { data } = await api.post(`/content/drafts/${id}/confirm`);
    toast.success(`Draft ${data.draft_index} confirmed`);
    await loadDrafts(packId);
  };

  const loadDraftIntoWorkingSet = (draft) => {
    const next = {};
    for (const item of draft.items) {
      next[keyFor(item.chapter_id, item.content_type, item.language)] = { ...item };
    }
    setWorkingSet(next);
    const first = draft.items[0];
    if (first) {
      setCourseId(first.course_id);
      setChapterId(first.chapter_id);
      setContentType(first.content_type);
      setLanguage(first.language);
      applyHydration(next, first.chapter_id, first.content_type, first.language);
    }
    toast.success(`Draft ${draft.draft_index} loaded — browse chapters/types below to view or edit each item, then Save to create a new version`);
  };

  const pendingItems = Object.entries(workingSet);

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">Manual content</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Set up content manually</h1>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6" data-testid="manual-form">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">Tutor Pack</label>
              <select value={packId} onChange={(e) => switchPack(e.target.value)} className={inputCls} data-testid="mc-pack">
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">Content type</label>
              <select value={contentType} onChange={(e) => switchContentType(e.target.value)} className={inputCls} data-testid="mc-type">
                {TYPES.map((tp) => <option key={tp.v} value={tp.v}>{tp.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Course</label>
            <div className="mt-1 flex gap-2">
              <select value={courseId} onChange={(e) => switchCourse(e.target.value)} className={inputCls + " flex-1"} data-testid="mc-course">
                {courses.length === 0 && <option value="">No courses yet</option>}
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                placeholder="e.g. History"
                className={smallInputCls + " flex-1"}
                data-testid="mc-new-course"
              />
              <button type="button" onClick={addCourse} className="inline-flex items-center gap-1 rounded-lg border border-[#00f0ff]/40 px-3 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10" data-testid="mc-add-course">
                <Plus size={12} /> Add course
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Language</label>
            <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 p-0.5 font-mono text-xs">
              {["en", "bm"].map((l) => (
                <button
                  key={l}
                  type="button"
                  data-testid={`mc-lang-${l}`}
                  onClick={() => switchLanguage(l)}
                  className={`px-3 py-1 rounded-full ${language === l ? "bg-[#00f0ff] text-black" : "text-white/70"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Chapters</label>
            <div className="mt-1 flex flex-wrap gap-2" data-testid="mc-chapters">
              {chapters.map((c) => {
                const hasPending = Object.keys(workingSet).some((k) => k.startsWith(`${c.id}::`));
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => switchChapter(c.id)}
                    className={`relative rounded-full px-4 py-1.5 text-xs border transition-colors ${
                      chapterId === c.id ? "bg-[#00f0ff] text-black border-[#00f0ff]" : "border-white/15 text-white/70 hover:border-white/30"
                    }`}
                    data-testid={`mc-chapter-${c.id}`}
                  >
                    {c.title}
                    {hasPending && (
                      <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${chapterId === c.id ? "bg-black" : "bg-[#00f0ff]"}`} />
                    )}
                  </button>
                );
              })}
              {chapters.length === 0 && <span className="text-xs text-white/40">No chapters yet — add one below.</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                placeholder="e.g. Bab 1 — Zaman Prasejarah"
                className={smallInputCls + " flex-1"}
                disabled={!courseId}
                data-testid="mc-new-chapter"
              />
              <button
                type="button"
                onClick={addChapter}
                disabled={!courseId}
                className="inline-flex items-center gap-1 rounded-lg border border-[#00f0ff]/40 px-3 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10 disabled:opacity-40"
                data-testid="mc-add-chapter"
              >
                <Plus size={12} /> Add chapter
              </button>
            </div>
          </div>

          {selectedChapter && (
            <div className="pt-2 border-t border-white/10">
              <div className="text-xs text-white/60 mb-2">
                {TYPES.find((t) => t.v === contentType)?.label} for <span className="text-white">{selectedChapter.title}</span>
              </div>

              {contentType === "summary" && (
                <textarea
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={inputCls + " font-mono text-sm leading-relaxed"}
                  placeholder="Write a brief overview of this chapter..."
                  data-testid="mc-body"
                />
              )}
              {contentType === "notes" && <NotesBuilder notes={notes} setNotes={setNotes} />}
              {contentType === "quiz" && <QuizBuilder questions={questions} setQuestions={setQuestions} />}
              {contentType === "flashcards" && <FlashcardsBuilder cards={cards} setCards={setCards} />}
              {contentType === "mindmap" && (
                <MindmapBuilder mindmap={mindmap} setMindmap={setMindmap} uploading={uploading} onUpload={uploadMindmapImage} />
              )}
            </div>
          )}

          {pendingItems.length > 0 && (
            <div className="pt-2 border-t border-white/10">
              <div className="text-xs text-white/60 mb-2">Pending in this draft ({pendingItems.length})</div>
              <div className="flex flex-wrap gap-2" data-testid="pending-list">
                {pendingItems.map(([key, entry]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => jumpToPending(entry)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      key === keyFor(chapterId, contentType, language)
                        ? "border-[#00f0ff] text-[#00f0ff]"
                        : "border-white/15 text-white/70 hover:border-white/30"
                    }`}
                    data-testid={`pending-${key}`}
                  >
                    {entry.chapter_title} · {TYPES.find((t) => t.v === entry.content_type)?.label}
                    <X size={11} onClick={(e) => removePending(key, e)} className="hover:text-white" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
            data-testid="mc-save"
          >
            <FileEdit size={14} />
            {saving ? "Saving…" : "Save content"}
          </button>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
            <div className="overline text-[#00f0ff] mb-3">Drafts</div>
            <div className="space-y-2 max-h-[32rem] overflow-auto" data-testid="drafts-list">
              {drafts.map((d) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={d.id}
                  onClick={() => loadDraftIntoWorkingSet(d)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") loadDraftIntoWorkingSet(d); }}
                  className="w-full flex items-center justify-between gap-3 border-b border-white/5 pb-2 text-left hover:bg-white/5 rounded-lg px-1 -mx-1 transition-colors cursor-pointer"
                  data-testid={`draft-${d.draft_index}`}
                >
                  <div>
                    <div className="text-sm text-white">
                      Draft {d.draft_index}
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40">{d.status}</span>
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">{d.items.length} item(s)</div>
                  </div>
                  {d.status === "confirmed" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#00ff66] uppercase tracking-widest shrink-0">
                      <CheckCircle2 size={12} /> Confirmed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => confirmDraft(d.id, e)}
                      className="text-[10px] uppercase tracking-widest text-[#00f0ff] hover:underline shrink-0"
                      data-testid={`draft-${d.draft_index}-confirm`}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              ))}
              {drafts.length === 0 && <div className="text-xs text-white/40">No drafts yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualContent;
