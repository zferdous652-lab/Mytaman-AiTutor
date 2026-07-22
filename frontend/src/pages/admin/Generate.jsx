import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, X, Upload, CheckCircle2, FileEdit, ListChecks, Trash2, MoreVertical, XCircle, Pencil, Copy, Sparkles, FileText } from "lucide-react";
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
                    name={`gen-correct-${idx}`}
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

// ---------- Mind map builder (image upload -- not AI-generatable) ----------
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
        onClick={() => document.getElementById("gen-mindmap-file-input").click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-[#00f0ff] bg-[#00f0ff]/5" : "border-white/15 bg-white/5"
        }`}
        data-testid="mindmap-dropzone"
      >
        <input
          id="gen-mindmap-file-input"
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload size={22} className="mx-auto text-white/40" />
        <div className="mt-2 text-sm text-white/70">
          {uploading ? "Uploading…" : "Drag & drop a mind map image, or click to upload"}
        </div>
        <div className="mt-1 text-[10px] text-white/30">PNG, JPEG, WEBP, GIF · max 5MB · AI can't generate images yet</div>
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

// ---------- Source material builder (PDF upload -> extracted text, shared per chapter) ----------
const SourceMaterialUploader = ({ file, uploading, onUpload, onRemove }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    const dropped = files?.[0];
    if (dropped) onUpload(dropped);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => document.getElementById("gen-source-file-input").click()}
      className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
        dragOver ? "border-[#00f0ff] bg-[#00f0ff]/5" : "border-white/15 bg-white/5"
      }`}
      data-testid="gen-source-dropzone"
    >
      <input
        id="gen-source-file-input"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {file && !uploading && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 text-white/40 hover:text-red-400"
          title="Remove uploaded PDF"
          data-testid="gen-source-remove"
        >
          <X size={16} />
        </button>
      )}
      <FileText size={20} className="mx-auto text-white/40" />
      <div className="mt-2 text-sm text-white/70">
        {uploading ? (
          "Extracting text…"
        ) : file ? (
          <>
            Uploaded:{" "}
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#00f0ff] hover:underline"
              data-testid="gen-source-view"
            >
              {file.filename}
            </a>{" "}
            — click or drop to replace
          </>
        ) : (
          "Drag & drop a course material PDF, or click to upload"
        )}
      </div>
      <div className="mt-1 text-[10px] text-white/30">PDF only · max 15MB · shared across all content types for this chapter</div>
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

const Generate = () => {
  const [searchParams] = useSearchParams();
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
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingSource, setUploadingSource] = useState(false);

  // Pending content, accumulated client-side across chapters/types until "Save content"
  // bundles it all into a single pack-level draft. Keyed by chapter+type+language.
  const [workingSet, setWorkingSet] = useState({});
  // Source material (extracted from an uploaded PDF) is kept per CHAPTER only -- not
  // per type/language -- since it's the same reference material regardless of which
  // content type is being generated from it. Separate from workingSet since it's only
  // an AI-generation input, not part of the saved content payload.
  const [sourceTexts, setSourceTexts] = useState({});
  // { [chapterId]: { filename, url } } -- the uploaded PDF itself (not just its text),
  // so a saved draft can show/remove which PDF a chapter's content was generated from.
  const [sourceFiles, setSourceFiles] = useState({});
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [draftSort, setDraftSort] = useState("number");
  const [markMode, setMarkMode] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);

  // Resizable split between the form and the Drafts panel (desktop only -- narrower
  // viewports keep the original stacked layout via CSS grid).
  const splitContainerRef = useRef(null);
  const resizingRef = useRef(false);
  const [draftsPanelPct, setDraftsPanelPct] = useState(40);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const startResize = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!resizingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((rect.right - e.clientX) / rect.width) * 100;
      setDraftsPanelPct(Math.min(60, Math.max(25, pct)));
    };
    const onMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  const [renamingDraftId, setRenamingDraftId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [renamingCourse, setRenamingCourse] = useState(false);
  const [courseRenameValue, setCourseRenameValue] = useState("");
  const [renamingChapterId, setRenamingChapterId] = useState(null);
  const [chapterRenameValue, setChapterRenameValue] = useState("");

  const [body, setBody] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [cards, setCards] = useState([{ front: "", back: "" }]);
  const [mindmap, setMindmap] = useState({ image_url: "", caption: "" });
  const [notes, setNotes] = useState([""]);

  const loadPacks = async () => {
    const { data } = await api.get("/packs/list");
    setPacks(data);
    const requested = searchParams.get("pack");
    if (requested && data.find((p) => p.id === requested)) {
      setPackId(requested);
    } else if (data[0] && !packId) {
      setPackId(data[0].id);
    }
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
    const { data } = await api.get("/content/drafts", { params: { pack_id: pid, source: "ai" } });
    setDrafts(data);
  }, []);
  useEffect(() => { loadDrafts(packId); }, [packId, loadDrafts]);

  // Pushes a working-set entry's payload into the visible builder fields, and the chapter's
  // uploaded source material (shared across content types/languages for that chapter) into
  // the source-material box. Called directly (not just via effect) so it also works when the
  // target selection is already the current one -- e.g. loading a draft whose first item
  // matches what's already on screen, where chapterId/contentType/language wouldn't change.
  const applyHydration = (map, srcMap, fileMap, cid, ctype, lang) => {
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
    setSourceText(srcMap[cid] || "");
    setSourceFile(fileMap[cid] || null);
  };

  // Safety net for indirect chapter changes (e.g. auto-selecting a chapter after switching
  // Course, which happens asynchronously via loadChapters and can't call applyHydration directly).
  useEffect(() => {
    if (!chapterId) return;
    applyHydration(workingSet, sourceTexts, sourceFiles, chapterId, contentType, language);
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

  // Persists whatever is currently in the builder fields (keyed by the CURRENT selection) and
  // the chapter's source material (keyed by chapter only) into their respective maps, and
  // returns the updated maps synchronously so callers can switch selection right after
  // without losing in-progress edits.
  const syncCurrent = () => {
    if (!chapterId) return { workingSet, sourceTexts, sourceFiles };
    const key = keyFor(chapterId, contentType, language);
    const payload = buildPayload();
    const nextWorking = { ...workingSet };
    if (isMeaningful(contentType, payload)) {
      nextWorking[key] = {
        chapter_id: chapterId,
        content_type: contentType,
        language,
        payload,
        chapter_title: selectedChapter?.title,
        course_title: courses.find((c) => c.id === courseId)?.title,
      };
    } else {
      delete nextWorking[key];
    }
    setWorkingSet(nextWorking);
    const nextSource = { ...sourceTexts, [chapterId]: sourceText };
    const nextFiles = { ...sourceFiles, [chapterId]: sourceFile };
    setSourceTexts(nextSource);
    setSourceFiles(nextFiles);
    return { workingSet: nextWorking, sourceTexts: nextSource, sourceFiles: nextFiles };
  };

  const switchPack = (pid) => {
    if (Object.keys(workingSet).length > 0) toast("Switched Tutor Pack — pending items cleared.");
    setWorkingSet({});
    setSourceTexts({});
    setSourceFiles({});
    setActiveDraftId(null);
    setPackId(pid);
  };
  const switchCourse = (cid) => { syncCurrent(); setCourseId(cid); };
  const switchChapter = (cid) => {
    const synced = syncCurrent();
    setChapterId(cid);
    applyHydration(synced.workingSet, synced.sourceTexts, synced.sourceFiles, cid, contentType, language);
  };
  const switchContentType = (ct) => {
    const synced = syncCurrent();
    setContentType(ct);
    applyHydration(synced.workingSet, synced.sourceTexts, synced.sourceFiles, chapterId, ct, language);
  };
  const switchLanguage = (l) => {
    const synced = syncCurrent();
    setLanguage(l);
    applyHydration(synced.workingSet, synced.sourceTexts, synced.sourceFiles, chapterId, contentType, l);
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

  const startRenameCourse = () => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setCourseRenameValue(course.title);
    setRenamingCourse(true);
  };
  const cancelRenameCourse = () => setRenamingCourse(false);
  const submitRenameCourse = async () => {
    if (!renamingCourse) return;
    const title = courseRenameValue.trim();
    setRenamingCourse(false);
    if (!title || !courseId) return;
    await api.patch(`/courses/${courseId}`, { title });
    toast.success("Course renamed");
    await loadCourses(packId);
  };
  const deleteCourseHandler = async () => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    if (!window.confirm(`Delete course "${course.title}"? This deletes all its chapters and content. This cannot be undone.`)) return;
    const removedChapterIds = new Set(chapters.map((c) => c.id));
    await api.delete(`/courses/${courseId}`);
    toast.success("Course deleted");
    setWorkingSet((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (removedChapterIds.has(next[k].chapter_id)) delete next[k]; });
      return next;
    });
    setSourceTexts((prev) => {
      const next = { ...prev };
      removedChapterIds.forEach((id) => delete next[id]);
      return next;
    });
    setSourceFiles((prev) => {
      const next = { ...prev };
      removedChapterIds.forEach((id) => delete next[id]);
      return next;
    });
    await loadCourses(packId);
  };

  const startRenameChapter = (chapter, e) => {
    e.stopPropagation();
    setRenamingChapterId(chapter.id);
    setChapterRenameValue(chapter.title);
  };
  const cancelRenameChapter = () => setRenamingChapterId(null);
  const submitRenameChapter = async (id) => {
    if (renamingChapterId !== id) return;
    const title = chapterRenameValue.trim();
    setRenamingChapterId(null);
    if (!title) return;
    await api.patch(`/chapters/${id}`, { title });
    toast.success("Chapter renamed");
    await loadChapters(courseId);
  };
  const deleteChapterHandler = async (chapter, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete chapter "${chapter.title}"? This deletes its content. This cannot be undone.`)) return;
    await api.delete(`/chapters/${chapter.id}`);
    toast.success("Chapter deleted");
    setWorkingSet((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${chapter.id}::`)) delete next[k]; });
      return next;
    });
    setSourceTexts((prev) => {
      const next = { ...prev };
      delete next[chapter.id];
      return next;
    });
    setSourceFiles((prev) => {
      const next = { ...prev };
      delete next[chapter.id];
      return next;
    });
    await loadChapters(courseId);
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

  const uploadSourcePdf = async (file) => {
    if (!chapterId) {
      toast.error("Select a chapter first.");
      return;
    }
    setUploadingSource(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/content/extract-pdf", form);
      setSourceText(data.text);
      setSourceFile({ filename: data.filename || file.name, url: data.url });
      toast.success(`Extracted text from ${data.filename || file.name}`);
    } catch (err) {
      const status = err?.response?.status;
      toast.error(
        err?.response?.data?.detail ||
          (status ? `Could not extract text from this PDF (server returned HTTP ${status})` : "Could not extract text from this PDF -- check your connection")
      );
    }
    setUploadingSource(false);
  };

  const removeSourcePdf = () => {
    setSourceFile(null);
    setSourceText("");
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
    applyHydration(synced.workingSet, synced.sourceTexts, synced.sourceFiles, entry.chapter_id, entry.content_type, entry.language);
  };

  const generateWithAi = async () => {
    if (!chapterId) {
      toast.error("Select a chapter first.");
      return;
    }
    if (sourceText.trim().length < 10) {
      toast.error("Upload a course material PDF for this chapter first.");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post("/content/ai-draft", {
        chapter_id: chapterId,
        content_type: contentType,
        language,
        source_text: sourceText,
      });
      if (contentType === "summary") setBody(data.payload.body || "");
      if (contentType === "notes") setNotes(data.payload.notes?.length ? data.payload.notes : [""]);
      if (contentType === "quiz") {
        setQuestions(
          data.payload.questions?.length
            ? data.payload.questions.map((q) => ({ ...q, options: q.options || ["", "", "", ""], correct_answer: q.correct_answer || "" }))
            : [emptyQuestion()]
        );
      }
      if (contentType === "flashcards") setCards(data.payload.cards?.length ? data.payload.cards : [{ front: "", back: "" }]);
      toast.success(`Generated via ${data.provider} (${data.model}) — review, then Save content`);
    } catch (err) {
      toast.error(err?.response?.data?.detail?.message || err?.response?.data?.detail || "AI generation failed");
    }
    setGenerating(false);
  };

  const save = async () => {
    const synced = syncCurrent();
    const items = Object.values(synced.workingSet);
    if (items.length === 0) {
      toast.error("Add content for at least one chapter before saving.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/content/drafts", {
        pack_id: packId,
        source: "ai",
        items: items.map((it) => {
          const file = synced.sourceFiles[it.chapter_id];
          const text = synced.sourceTexts[it.chapter_id];
          return {
            chapter_id: it.chapter_id,
            content_type: it.content_type,
            language: it.language,
            payload: it.payload,
            source_pdf: file ? { filename: file.filename, url: file.url, text: text || "" } : undefined,
          };
        }),
      });
      toast.success(`Draft ${data.draft_index} saved with ${data.items.length} item(s)`);
      // Source material stays loaded (per chapter) since it's reference material, not part of
      // the draft itself -- the admin will likely generate more content types from it next.
      setWorkingSet({});
      setActiveDraftId(null);
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
    e?.stopPropagation();
    const { data } = await api.post(`/content/drafts/${id}/confirm`);
    toast.success(`Draft ${data.draft_index} confirmed`);
    setOpenMenuId(null);
    await loadDrafts(packId);
  };

  const denyDraft = async (id, e) => {
    e?.stopPropagation();
    const { data } = await api.post(`/content/drafts/${id}/deny`);
    toast.success(`Draft ${data.draft_index} denied — reverted to draft`);
    setOpenMenuId(null);
    await loadDrafts(packId);
  };

  const duplicateDraft = async (id, e) => {
    e?.stopPropagation();
    const { data } = await api.post(`/content/drafts/${id}/duplicate`);
    toast.success(`Duplicated as Draft ${data.draft_index}`);
    setOpenMenuId(null);
    await loadDrafts(packId);
  };

  const startRename = (draft, e) => {
    e?.stopPropagation();
    setRenamingDraftId(draft.id);
    setRenameValue(draft.name || "");
    setOpenMenuId(null);
  };

  const submitRename = async (draftId) => {
    const { data } = await api.patch(`/content/drafts/${draftId}`, { name: renameValue });
    toast.success(`Draft ${data.draft_index} renamed`);
    setRenamingDraftId(null);
    await loadDrafts(packId);
  };

  const cancelRename = () => setRenamingDraftId(null);

  const deleteDraft = async (draft, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Delete Draft ${draft.draft_index}? This cannot be undone.`)) return;
    await api.delete(`/content/drafts/${draft.id}`);
    toast.success(`Draft ${draft.draft_index} deleted`);
    setOpenMenuId(null);
    if (activeDraftId === draft.id) {
      setActiveDraftId(null);
      setWorkingSet({});
    }
    await loadDrafts(packId);
  };

  const toggleSelectMode = () => {
    setMarkMode((m) => !m);
    setSelectedDraftIds(new Set());
    setOpenMenuId(null);
    setRenamingDraftId(null);
  };

  const toggleSelectDraft = (id, e) => {
    e.stopPropagation();
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedDraftIds((prev) =>
      prev.size === sortedDrafts.length ? new Set() : new Set(sortedDrafts.map((d) => d.id))
    );
  };

  const bulkDeleteSelected = async () => {
    const ids = Array.from(selectedDraftIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected draft(s)? This cannot be undone.`)) return;
    const { data } = await api.post("/content/drafts/bulk-delete", { ids });
    toast.success(`Deleted ${data.deleted_count} draft(s)`);
    if (ids.includes(activeDraftId)) {
      setActiveDraftId(null);
      setWorkingSet({});
    }
    setSelectedDraftIds(new Set());
    setMarkMode(false);
    await loadDrafts(packId);
  };

  const sortedDrafts = [...drafts].sort((a, b) => {
    if (draftSort === "newest") return new Date(b.created_at) - new Date(a.created_at);
    return a.draft_index - b.draft_index;
  });

  const loadDraftIntoWorkingSet = (draft) => {
    const synced = syncCurrent();
    const next = {};
    const nextSourceTexts = {};
    const nextSourceFiles = {};
    for (const item of draft.items) {
      next[keyFor(item.chapter_id, item.content_type, item.language)] = { ...item };
      if (item.source_pdf) {
        nextSourceTexts[item.chapter_id] = item.source_pdf.text || "";
        nextSourceFiles[item.chapter_id] = { filename: item.source_pdf.filename, url: item.source_pdf.url };
      }
    }
    const orphanedKeys = Object.keys(synced.workingSet).filter((k) => !(k in next));
    if (orphanedKeys.length > 0) {
      toast(`Discarded ${orphanedKeys.length} pending item(s) not part of Draft ${draft.draft_index}`);
    }
    setWorkingSet(next);
    setSourceTexts(nextSourceTexts);
    setSourceFiles(nextSourceFiles);
    setActiveDraftId(draft.id);
    const first = draft.items[0];
    if (first) {
      setCourseId(first.course_id);
      setChapterId(first.chapter_id);
      setContentType(first.content_type);
      setLanguage(first.language);
      applyHydration(next, nextSourceTexts, nextSourceFiles, first.chapter_id, first.content_type, first.language);
    }
    toast.success(`Draft ${draft.draft_index} loaded — browse chapters/types below to view or edit each item, then Save to create a new version`);
  };

  const pendingItems = Object.entries(workingSet);

  return (
    <div className="p-8 lg:p-12">
      <div className="overline text-[#00f0ff]">Generate with AI</div>
      <h1 className="font-display text-3xl lg:text-4xl tracking-tighter text-white mt-2 mb-8">Generate content with AI</h1>

      <div ref={splitContainerRef} className={isDesktop ? "flex items-start" : "grid gap-6"}>
        <div
          className="space-y-4 rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6"
          style={isDesktop ? { width: `calc(${100 - draftsPanelPct}% - 10px)`, flexShrink: 0 } : undefined}
          data-testid="generate-form"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">Tutor Pack</label>
              <select value={packId} onChange={(e) => switchPack(e.target.value)} className={inputCls} data-testid="gen-pack">
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">Content type</label>
              <select value={contentType} onChange={(e) => switchContentType(e.target.value)} className={inputCls} data-testid="gen-type">
                {TYPES.map((tp) => <option key={tp.v} value={tp.v}>{tp.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Course</label>
            <div className="mt-1 flex gap-2">
              {renamingCourse ? (
                <input
                  autoFocus
                  value={courseRenameValue}
                  onChange={(e) => setCourseRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRenameCourse(); if (e.key === "Escape") cancelRenameCourse(); }}
                  onBlur={submitRenameCourse}
                  className={inputCls + " flex-1"}
                  data-testid="gen-course-rename-input"
                />
              ) : (
                <select value={courseId} onChange={(e) => switchCourse(e.target.value)} className={inputCls + " flex-1"} data-testid="gen-course">
                  {courses.length === 0 && <option value="">No courses yet</option>}
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={startRenameCourse}
                disabled={!courseId}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-white/60 hover:text-white disabled:opacity-40"
                data-testid="gen-course-rename"
                title="Rename course"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={deleteCourseHandler}
                disabled={!courseId}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-red-400/80 hover:text-red-400 disabled:opacity-40"
                data-testid="gen-course-delete"
                title="Delete course"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                placeholder="e.g. History"
                className={smallInputCls + " flex-1"}
                data-testid="gen-new-course"
              />
              <button type="button" onClick={addCourse} className="inline-flex items-center gap-1 rounded-lg border border-[#00f0ff]/40 px-3 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10" data-testid="gen-add-course">
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
                  data-testid={`gen-lang-${l}`}
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
            <div className="mt-1 flex flex-wrap gap-2" data-testid="gen-chapters">
              {chapters.map((c) => {
                const hasPending = Object.keys(workingSet).some((k) => k.startsWith(`${c.id}::`));
                const isSelected = chapterId === c.id;
                const isRenaming = renamingChapterId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`relative flex items-center gap-1.5 rounded-full pl-4 pr-2 py-1.5 text-xs border transition-colors ${
                      isSelected ? "bg-[#00f0ff] text-black border-[#00f0ff]" : "border-white/15 text-white/70 hover:border-white/30"
                    }`}
                    data-testid={`gen-chapter-${c.id}`}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={chapterRenameValue}
                        onChange={(e) => setChapterRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") submitRenameChapter(c.id); if (e.key === "Escape") cancelRenameChapter(); }}
                        onBlur={() => submitRenameChapter(c.id)}
                        className="w-24 rounded bg-black/20 px-1.5 py-0.5 text-xs text-inherit outline-none"
                        data-testid={`gen-chapter-${c.id}-rename-input`}
                      />
                    ) : (
                      <button type="button" onClick={() => switchChapter(c.id)} className="flex items-center gap-1.5">
                        {c.title}
                        {hasPending && (
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? "bg-black" : "bg-[#00f0ff]"}`} />
                        )}
                      </button>
                    )}
                    {!isRenaming && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => startRenameChapter(c, e)}
                          className="hover:opacity-70"
                          data-testid={`gen-chapter-${c.id}-rename`}
                          title="Rename chapter"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteChapterHandler(c, e)}
                          className="hover:opacity-70"
                          data-testid={`gen-chapter-${c.id}-delete`}
                          title="Delete chapter"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
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
                data-testid="gen-new-chapter"
              />
              <button
                type="button"
                onClick={addChapter}
                disabled={!courseId}
                className="inline-flex items-center gap-1 rounded-lg border border-[#00f0ff]/40 px-3 text-xs text-[#00f0ff] hover:bg-[#00f0ff]/10 disabled:opacity-40"
                data-testid="gen-add-chapter"
              >
                <Plus size={12} /> Add chapter
              </button>
            </div>
          </div>

          {selectedChapter && contentType !== "mindmap" && (
            <div className="pt-2 border-t border-white/10">
              <label className="text-xs text-white/60">
                Source material (PDF) for <span className="text-white">{selectedChapter.title}</span>
              </label>
              <div className="mt-1">
                <SourceMaterialUploader file={sourceFile} uploading={uploadingSource} onUpload={uploadSourcePdf} onRemove={removeSourcePdf} />
              </div>
              {sourceText && (
                <textarea
                  rows={6}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  className={inputCls + " mt-2 font-mono text-xs leading-relaxed"}
                  placeholder="Extracted text will appear here — edit if needed..."
                  data-testid="gen-source"
                />
              )}
            </div>
          )}

          {selectedChapter && (
            <div className={contentType !== "mindmap" ? "" : "pt-2 border-t border-white/10"}>
              <div className="text-xs text-white/60 mb-2">
                {TYPES.find((t) => t.v === contentType)?.label} for <span className="text-white">{selectedChapter.title}</span>
              </div>

              {contentType === "summary" && (
                <textarea
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={inputCls + " font-mono text-sm leading-relaxed"}
                  placeholder="AI output appears here — edit freely before saving..."
                  data-testid="gen-body"
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={generateWithAi}
              disabled={generating || contentType === "mindmap" || !chapterId}
              title={contentType === "mindmap" ? "Mind maps need an uploaded image — AI can't generate one yet" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-[#00f0ff] hover:bg-[#00f0ff] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#00f0ff]"
              data-testid="gen-ai-generate"
            >
              <Sparkles size={14} />
              {generating ? "Generating…" : "AI Generate"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-[#00f0ff] px-6 py-2.5 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-50"
              data-testid="gen-save"
            >
              <FileEdit size={14} />
              {saving ? "Saving…" : "Save content"}
            </button>
          </div>
        </div>

        {isDesktop && (
          <div
            onMouseDown={startResize}
            onDoubleClick={() => setDraftsPanelPct(40)}
            className="w-5 shrink-0 self-stretch cursor-col-resize flex items-center justify-center group"
            data-testid="gen-resize-handle"
            title="Drag to resize · double-click to reset"
          >
            <div className="w-1 h-16 rounded-full bg-white/10 group-hover:bg-[#00f0ff]/60 transition-colors" />
          </div>
        )}

        <div style={isDesktop ? { width: `${draftsPanelPct}%`, flexShrink: 0 } : undefined} className={isDesktop ? undefined : "mt-6"}>
          <div className="rounded-2xl border border-white/10 bg-[#0a0514]/60 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="overline text-[#00f0ff]">Drafts</div>
              <div className="flex items-center gap-2">
                <select
                  value={draftSort}
                  onChange={(e) => setDraftSort(e.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-white/60"
                  data-testid="draft-sort"
                >
                  <option value="number">Draft number</option>
                  <option value="newest">Newest first</option>
                </select>
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] uppercase tracking-widest transition-colors ${
                    markMode ? "border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10" : "border-white/10 text-white/60 hover:border-white/30"
                  }`}
                  data-testid="draft-mark-mode"
                >
                  <ListChecks size={12} /> Mark
                </button>
              </div>
            </div>

            {markMode && (
              <div className="flex items-center justify-between mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sortedDrafts.length > 0 && selectedDraftIds.size === sortedDrafts.length}
                    onChange={toggleSelectAll}
                    data-testid="draft-select-all"
                  />
                  Select all ({selectedDraftIds.size}/{sortedDrafts.length})
                </label>
                <button
                  type="button"
                  onClick={bulkDeleteSelected}
                  disabled={selectedDraftIds.size === 0}
                  className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="draft-bulk-delete"
                >
                  <Trash2 size={12} /> Delete selected ({selectedDraftIds.size})
                </button>
              </div>
            )}

            <div
              className="space-y-2 max-h-[32rem] overflow-auto"
              onScroll={() => { setOpenMenuId(null); setMenuAnchor(null); }}
              data-testid="drafts-list"
            >
              {sortedDrafts.map((d) => {
                const isActive = d.id === activeDraftId;
                const isSelected = selectedDraftIds.has(d.id);
                const isRenaming = renamingDraftId === d.id;
                const isMenuOpen = openMenuId === d.id;
                return (
                <div
                  role="button"
                  tabIndex={0}
                  key={d.id}
                  onClick={() => {
                    setOpenMenuId(null);
                    if (markMode) {
                      setSelectedDraftIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                        return next;
                      });
                    } else if (!isRenaming) {
                      loadDraftIntoWorkingSet(d);
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") loadDraftIntoWorkingSet(d); }}
                  className={`relative w-full flex items-center justify-between gap-3 border pb-2 pt-2 rounded-lg px-3 -mx-1 transition-colors cursor-pointer ${
                    isSelected ? "border-red-400/60 bg-red-400/10" : isActive ? "border-[#00f0ff] bg-[#00f0ff]/10" : "border-transparent border-b-white/5 hover:bg-white/5"
                  }`}
                  data-testid={`draft-${d.draft_index}`}
                  data-active={isActive}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {markMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectDraft(d.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`draft-${d.draft_index}-checkbox`}
                      />
                    )}
                    <div className="min-w-0">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename(d.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                          onBlur={() => submitRename(d.id)}
                          placeholder={`Draft ${d.draft_index}`}
                          className="rounded-lg border border-[#00f0ff]/40 bg-white/5 px-2 py-1 text-sm text-white w-40"
                          data-testid={`draft-${d.draft_index}-rename-input`}
                        />
                      ) : (
                        <div className="text-sm text-white flex items-center gap-1.5 truncate">
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[#00f0ff] shrink-0" />}
                          <span className="truncate">{d.name || `Draft ${d.draft_index}`}</span>
                          <span className="ml-1 text-[10px] uppercase tracking-widest text-white/40 shrink-0">{d.status}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-white/40 mt-0.5">{d.items.length} item(s)</div>
                    </div>
                  </div>
                  {!markMode && !isRenaming && (
                    <div className="flex items-center gap-2 shrink-0">
                      {d.status === "confirmed" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#00ff66] uppercase tracking-widest">
                          <CheckCircle2 size={12} /> Confirmed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isMenuOpen) {
                            setOpenMenuId(null);
                            setMenuAnchor(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuAnchor({ top: rect.bottom + 4, left: rect.right - 160 });
                            setOpenMenuId(d.id);
                          }
                        }}
                        className="text-white/40 hover:text-white p-1"
                        data-testid={`draft-${d.draft_index}-menu`}
                        title="Actions"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {isMenuOpen && menuAnchor && createPortal(
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ position: "fixed", top: menuAnchor.top, left: menuAnchor.left }}
                          className="z-50 w-40 rounded-xl border border-white/10 bg-[#120a1f] shadow-xl py-1"
                          data-testid={`draft-${d.draft_index}-menu-dropdown`}
                        >
                          <button
                            type="button"
                            onClick={(e) => confirmDraft(d.id, e)}
                            disabled={d.status === "confirmed"}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                            data-testid={`draft-${d.draft_index}-action-confirm`}
                          >
                            <CheckCircle2 size={13} /> Confirm
                          </button>
                          <button
                            type="button"
                            onClick={(e) => denyDraft(d.id, e)}
                            disabled={d.status !== "confirmed"}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                            data-testid={`draft-${d.draft_index}-action-deny`}
                          >
                            <XCircle size={13} /> Deny
                          </button>
                          <button
                            type="button"
                            onClick={(e) => startRename(d, e)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
                            data-testid={`draft-${d.draft_index}-action-rename`}
                          >
                            <Pencil size={13} /> Rename
                          </button>
                          <button
                            type="button"
                            onClick={(e) => duplicateDraft(d.id, e)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
                            data-testid={`draft-${d.draft_index}-action-duplicate`}
                          >
                            <Copy size={13} /> Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={(e) => deleteDraft(d, e)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10"
                            data-testid={`draft-${d.draft_index}-action-delete`}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}
                </div>
                );
              })}
              {drafts.length === 0 && <div className="text-xs text-white/40">No drafts yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Generate;
