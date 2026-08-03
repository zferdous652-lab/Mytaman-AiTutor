import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, PanelRightClose, Plus, Send, Lightbulb, ChevronLeft, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { RailTooltip } from "@/components/SidebarToggle";

const WIDTH_KEY = "mytaman:socratic:width";
const MIN_WIDTH = 300;
const MAX_WIDTH = 680;
const DEFAULT_WIDTH = 380;

// Drag-to-resize on the panel's left edge. Width is measured from the right of the
// viewport (the panel is right-docked) and persisted, so a student who widens the tutor
// once keeps it that way across lessons and sessions.
const useResizableWidth = () => {
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const onUp = () => setDragging(false);
    // Suppress text selection while dragging, or the lesson behind the handle
    // highlights as the pointer sweeps across it.
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // best-effort — a panel that can't remember its width still works
    }
  }, [width]);

  // Keyboard resizing, so the handle isn't mouse-only.
  const onHandleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") setWidth((w) => Math.min(MAX_WIDTH, w + 24));
    else if (e.key === "ArrowRight") setWidth((w) => Math.max(MIN_WIDTH, w - 24));
    else return;
    e.preventDefault();
  }, []);

  return { width, dragging, startDrag: () => setDragging(true), onHandleKeyDown };
};

// Conversation starters are per content type, because "what should I ask the tutor?" is
// the hardest moment for a student and a generic prompt list doesn't help them past it.
const STARTERS = {
  summary: ["Explain this in simpler words", "Why does this matter?", "Quiz me on this summary"],
  notes: ["Which of these points is most important?", "Help me connect these ideas", "Test my understanding"],
  flashcards: ["Ask me these as questions", "I keep forgetting one of these", "Give me a memory trick"],
  mindmap: ["How do these branches relate?", "Walk me through this map", "What's the big idea here?"],
  quiz: ["I'm stuck on a question", "Help me think this through", "What concept is this testing?"],
};

const PHASE_LABEL = { probe: "Probing", hint: "Hint", challenge: "Challenge", consolidate: "Consolidating" };

const Bubble = ({ turn, tutorName }) => {
  const mine = turn.role === "student";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`socratic-turn-${turn.role}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          mine
            ? "bg-[#00f0ff]/12 border border-[#00f0ff]/25 text-white"
            : "bg-white/[0.04] border border-white/10 text-white/85"
        }`}
      >
        {!mine && (
          <div className="overline text-[10px] text-[#8a2be2] mb-1">
            {tutorName}
            {turn.phase && ` · ${PHASE_LABEL[turn.phase] || turn.phase}`}
            {turn.hint_level > 0 && ` · hint ${turn.hint_level}`}
          </div>
        )}
        {turn.text}
      </div>
    </div>
  );
};

// The collapsed state is a thin icon rail, matching how the course navigator on the other
// side of the player collapses -- the tutor stays one click away instead of disappearing.
const CollapsedRail = ({ onExpand, unavailable }) => (
  <aside
    className="w-[56px] shrink-0 border-l border-white/8 bg-[#0a0514]/80 backdrop-blur-xl flex flex-col items-center py-4 gap-3"
    data-testid="socratic-rail"
  >
    <button
      type="button"
      onClick={onExpand}
      disabled={unavailable}
      data-testid="socratic-expand"
      title="Socratic tutor"
      className="group relative h-10 w-10 grid place-items-center rounded-xl border border-[#8a2be2]/40 bg-[#8a2be2]/10 text-[#c9a3ff] hover:border-[#8a2be2] hover:text-white transition-colors disabled:opacity-30"
    >
      <Sparkles size={17} />
      <RailTooltip>Socratic tutor</RailTooltip>
    </button>
    <div className="flex-1" />
    <ChevronLeft size={14} className="text-white/25" />
  </aside>
);

const SocraticPanel = ({ contentId, contentType, language, collapsed, onToggle, onXp }) => {
  const { user } = useAuth();
  const { t } = useLang();

  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const scrollRef = useRef(null);
  const { width, dragging, startDrag, onHandleKeyDown } = useResizableWidth();

  // A session is scoped to one lesson in one language, so switching lesson or language
  // swaps the whole conversation rather than carrying the old thread across.
  useEffect(() => {
    let cancelled = false;
    if (!contentId) return undefined;
    setStatus("loading");
    setSession(null);
    setDraft("");
    (async () => {
      try {
        const { data } = await api.post("/socratic/session", { content_id: contentId, language });
        if (cancelled) return;
        setSession(data);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setReason(e?.response?.data?.detail || "The tutor isn't available for this lesson.");
        setStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [contentId, language]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [session?.turns?.length, sending]);

  const turns = session?.turns || [];
  const tutorName = session?.tutor_name || "";
  const starters = useMemo(() => STARTERS[contentType] || STARTERS.summary, [contentType]);
  const atTurnLimit = session && session.turn_count >= session.max_turns_per_session;
  const atDailyLimit = session && session.messages_used_today >= session.daily_message_cap;

  const send = async (text, requestHint = false) => {
    const body = (text ?? draft).trim();
    if (!body || sending || !session) return;
    setSending(true);
    setDraft("");
    try {
      const { data } = await api.post(`/socratic/session/${session.id}/message`, {
        text: body,
        request_hint: requestHint,
      });
      setSession(data.session);
      if (data.xp_awarded > 0) {
        toast.success(`+${data.xp_awarded} XP`);
        onXp?.(data.xp_awarded);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't reach the tutor. Try again.");
      setDraft(body); // don't lose what they typed
    } finally {
      setSending(false);
    }
  };

  const newChat = async () => {
    if (!session || resetting) return;
    setResetting(true);
    // Clear on screen immediately. The student pressed "new chat" -- the thread should
    // visibly go away at once rather than after a round trip, and if the request fails
    // the reload below puts back whatever the server actually still has.
    setSession((prev) => (prev ? { ...prev, turns: [] } : prev));
    try {
      const { data } = await api.post(`/socratic/session/${session.id}/reset`);
      setSession(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't start a new chat.");
      try {
        const { data } = await api.post("/socratic/session", { content_id: contentId, language });
        setSession(data);
      } catch (reloadErr) {
        // leave the optimistic empty state -- sending a message will surface the error
      }
    } finally {
      setResetting(false);
    }
  };

  if (collapsed) return <CollapsedRail onExpand={onToggle} unavailable={status === "unavailable"} />;

  return (
    // Below lg the course navigator and the reading pane already fill the width, so the
    // dock floats over the content instead of squeezing it into an unreadable column.
    // From lg up it becomes a real third column, as in the course-player layout.
    <aside
      style={{ width }}
      className={`absolute inset-y-0 right-0 z-40 shadow-2xl lg:static lg:z-auto lg:shadow-none shrink-0 border-l bg-[#0a0514]/95 lg:bg-[#0a0514]/85 backdrop-blur-xl flex flex-col ${
        dragging ? "border-[#8a2be2] select-none" : "border-white/8"
      }`}
      data-testid="socratic-panel"
    >
      {/* Drag handle on the panel's own left edge. Sits above the content with a wider
          hit area than its visible line, so it's grabbable without being obtrusive. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tutor panel"
        tabIndex={0}
        onMouseDown={(e) => { e.preventDefault(); startDrag(); }}
        onKeyDown={onHandleKeyDown}
        data-testid="socratic-resize"
        title="Drag to resize"
        className="group absolute left-0 inset-y-0 w-1.5 -ml-0.5 cursor-col-resize z-50 focus:outline-none"
      >
        <div
          className={`h-full w-px mx-auto transition-colors group-hover:bg-[#8a2be2] group-focus:bg-[#8a2be2] ${
            dragging ? "bg-[#8a2be2]" : "bg-transparent"
          }`}
        />
      </div>

      <div className="shrink-0 border-b border-white/8 px-4 py-3 flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-[#8a2be2]/15 border border-[#8a2be2]/35">
          <Sparkles size={15} className="text-[#c9a3ff]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-white leading-tight truncate" data-testid="socratic-title">
            {tutorName ? `${tutorName} ${t("socratic_tutor_suffix")}` : t("socratic_tutor")}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#8a2be2]">{t("premium_label")}</div>
        </div>
        <button
          type="button"
          onClick={newChat}
          disabled={status !== "ready" || resetting || !turns.length}
          data-testid="socratic-new-chat"
          title={t("socratic_new_chat")}
          className="group relative rounded-lg p-1.5 text-white/50 hover:text-[#00f0ff] transition-colors disabled:opacity-30"
        >
          <Plus size={16} />
          <RailTooltip>{t("socratic_new_chat")}</RailTooltip>
        </button>
        <button
          type="button"
          onClick={onToggle}
          data-testid="socratic-collapse"
          title={t("socratic_collapse")}
          className="group relative rounded-lg p-1.5 text-white/50 hover:text-white transition-colors"
        >
          <PanelRightClose size={16} />
          <RailTooltip>{t("socratic_collapse")}</RailTooltip>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {status === "loading" && <div className="text-sm text-white/40">Loading…</div>}

        {status === "unavailable" && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60" data-testid="socratic-unavailable">
            {reason}
          </div>
        )}

        {status === "ready" && turns.length === 0 && (
          <div data-testid="socratic-greeting">
            <div className="font-display text-xl tracking-tight text-[#c9a3ff]">
              {t("socratic_hi")} {user?.name?.split(" ")[0] || ""}.
            </div>
            <div className="font-display text-xl tracking-tight text-white mb-4">{t("socratic_how_help")}</div>

            {/* The tutor's opening line is rendered here rather than generated: it costs
                nothing, appears instantly, and never varies in quality. It introduces the
                tutor by name and sets the expectation that it won't hand over answers. */}
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-white/85">
              <div className="overline text-[10px] text-[#8a2be2] mb-1">{tutorName}</div>
              {t("socratic_intro")
                .replace("{name}", tutorName)
                .replace("{lesson}", session?.content_title || t("socratic_this_lesson"))}
            </div>

            <div className="space-y-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  data-testid="socratic-starter"
                  className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-white/80 hover:border-[#8a2be2]/50 hover:text-white transition-colors flex items-center gap-2.5"
                >
                  <Sparkles size={13} className="shrink-0 text-[#8a2be2]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => <Bubble key={turn.id} turn={turn} tutorName={tutorName} />)}

        {sending && (
          <div className="flex justify-start" data-testid="socratic-thinking">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/50 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> {t("socratic_thinking")}
            </div>
          </div>
        )}

        {session?.mastered && (
          <div className="rounded-xl border border-[#00f0ff]/30 bg-[#00f0ff]/8 p-3 text-sm text-[#00f0ff] flex items-start gap-2" data-testid="socratic-mastered">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <div>
              {t("socratic_mastered")}
              {session.concepts_covered?.length > 0 && (
                <div className="mt-1 text-xs text-white/60">{session.concepts_covered.join(" · ")}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {status === "ready" && (
        <div className="shrink-0 border-t border-white/8 p-3 space-y-2">
          {(atTurnLimit || atDailyLimit) && (
            <div className="rounded-lg border border-[#ff0055]/30 bg-[#ff0055]/8 px-3 py-2 text-xs text-[#ff8fb0]" data-testid="socratic-limit">
              {atDailyLimit ? t("socratic_daily_limit") : t("socratic_turn_limit")}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={t("socratic_placeholder")}
              disabled={sending || atTurnLimit || atDailyLimit}
              data-testid="socratic-input"
              className="flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#8a2be2] outline-none max-h-32 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={sending || !draft.trim() || atTurnLimit || atDailyLimit}
              data-testid="socratic-send"
              className="shrink-0 h-10 w-10 grid place-items-center rounded-xl bg-[#8a2be2] text-white hover:bg-[#a04dff] transition-colors disabled:opacity-30"
            >
              <Send size={15} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => send(t("socratic_stuck_msg"), true)}
              disabled={sending || !turns.length || atTurnLimit || atDailyLimit}
              data-testid="socratic-hint"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-[#ffb300]/50 hover:text-[#ffb300] transition-colors disabled:opacity-30"
            >
              <Lightbulb size={12} /> {t("socratic_stuck")}
              {session?.hint_level > 0 && ` (${session.hint_level}/3)`}
            </button>
            <span className="text-[10px] text-white/30 font-mono">
              {session?.messages_used_today ?? 0}/{session?.daily_message_cap ?? 0}
            </span>
          </div>

          {/* Two things a minor is owed up front: that this is a machine, and that an
              adult can read it. Neither should be buried in a settings page. */}
          <p className="text-[10px] leading-relaxed text-white/30">{t("socratic_disclaimer")}</p>
        </div>
      )}
    </aside>
  );
};

export default SocraticPanel;
