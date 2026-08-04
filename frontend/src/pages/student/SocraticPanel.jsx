import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, PanelRightClose, Plus, Send, Lightbulb, ChevronLeft, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LangContext";
import { RailTooltip } from "@/components/SidebarToggle";

// Versioned: a width saved against the old 17px type scale is too narrow for 19px, so
// bumping the key retires those saved values and lets the new default apply once. Anyone
// who re-drags it keeps their choice from then on.
const WIDTH_KEY = "mytaman:socratic:width:v2";
const MIN_WIDTH = 340;
const MAX_WIDTH = 680;
const DEFAULT_WIDTH = 480;

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

// Small caps label above each tutor reply. Deliberately not the global `.overline`
// class: that is declared after Tailwind's utilities and hard-codes its own size and
// colour, so it can't be tuned for this surface.
const MetaLabel = ({ children }) => (
  <div className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--soc-accent)]">
    {children}
  </div>
);

const Bubble = ({ turn, tutorName }) => {
  const mine = turn.role === "student";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`socratic-turn-${turn.role}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3.5 text-[19px] leading-[1.65] whitespace-pre-wrap break-words ${
          mine
            ? "bg-[color:var(--soc-accent-soft)] border border-[color:var(--soc-accent)]/25 text-[color:var(--soc-ink)]"
            : "bg-[color:var(--soc-raised)] border border-[color:var(--soc-line)] text-[color:var(--soc-ink)] shadow-[0_1px_2px_rgba(59,47,26,0.05)]"
        }`}
      >
        {!mine && (
          <MetaLabel>
            {tutorName}
            {turn.phase && ` · ${PHASE_LABEL[turn.phase] || turn.phase}`}
            {turn.hint_level > 0 && ` · hint ${turn.hint_level}`}
          </MetaLabel>
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
    className="socratic-surface w-[56px] shrink-0 border-l border-[color:var(--soc-line)] flex flex-col items-center py-4 gap-3"
    data-testid="socratic-rail"
  >
    <button
      type="button"
      onClick={onExpand}
      disabled={unavailable}
      data-testid="socratic-expand"
      title="Socratic tutor"
      className="group relative h-10 w-10 grid place-items-center rounded-xl border border-[color:var(--soc-accent)]/35 bg-[color:var(--soc-accent-soft)] text-[color:var(--soc-accent)] hover:border-[color:var(--soc-accent)] transition-colors disabled:opacity-30"
    >
      <Sparkles size={18} />
      <RailTooltip>Socratic tutor</RailTooltip>
    </button>
    <div className="flex-1" />
    <ChevronLeft size={14} className="text-[color:var(--soc-ink-faint)]" />
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
      className={`socratic-surface absolute inset-y-0 right-0 z-40 shadow-2xl lg:static lg:z-auto lg:shadow-none shrink-0 border-l flex flex-col ${
        dragging ? "border-[color:var(--soc-accent)] select-none" : "border-[color:var(--soc-line)]"
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
          className={`h-full w-px mx-auto transition-colors group-hover:bg-[color:var(--soc-accent)] group-focus:bg-[color:var(--soc-accent)] ${
            dragging ? "bg-[color:var(--soc-accent)]" : "bg-transparent"
          }`}
        />
      </div>

      <div className="shrink-0 border-b border-[color:var(--soc-line)] bg-[color:var(--soc-header)] px-4 py-3.5 flex items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-[color:var(--soc-accent-soft)] border border-[color:var(--soc-accent)]/30">
          <Sparkles size={17} className="text-[color:var(--soc-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[19px] font-semibold text-[color:var(--soc-ink)] leading-tight truncate" data-testid="socratic-title">
            {tutorName ? `${tutorName} ${t("socratic_tutor_suffix")}` : t("socratic_tutor")}
          </div>
          <div className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--soc-accent)]">{t("premium_label")}</div>
        </div>
        <button
          type="button"
          onClick={newChat}
          disabled={status !== "ready" || resetting || !turns.length}
          data-testid="socratic-new-chat"
          title={t("socratic_new_chat")}
          className="group relative rounded-lg p-2 text-[color:var(--soc-ink-soft)] hover:bg-black/[0.05] hover:text-[color:var(--soc-accent)] transition-colors disabled:opacity-25"
        >
          <Plus size={18} />
          <RailTooltip placement="bottom-end">{t("socratic_new_chat")}</RailTooltip>
        </button>
        <button
          type="button"
          onClick={onToggle}
          data-testid="socratic-collapse"
          title={t("socratic_collapse")}
          className="group relative rounded-lg p-2 text-[color:var(--soc-ink-soft)] hover:bg-black/[0.05] hover:text-[color:var(--soc-ink)] transition-colors"
        >
          <PanelRightClose size={18} />
          <RailTooltip placement="bottom-end">{t("socratic_collapse")}</RailTooltip>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-3.5">
        {status === "loading" && <div className="text-[18px] text-[color:var(--soc-ink-faint)]">Loading…</div>}

        {status === "unavailable" && (
          <div className="rounded-xl border border-[color:var(--soc-line)] bg-[color:var(--soc-raised)] p-4 text-[17px] leading-[1.6] text-[color:var(--soc-ink-soft)]" data-testid="socratic-unavailable">
            {reason}
          </div>
        )}

        {status === "ready" && turns.length === 0 && (
          <div data-testid="socratic-greeting">
            <div className="font-display text-[29px] font-semibold tracking-tight text-[color:var(--soc-accent)]">
              {t("socratic_hi")} {user?.name?.split(" ")[0] || ""}.
            </div>
            <div className="font-display text-[29px] font-semibold tracking-tight text-[color:var(--soc-ink)] mb-5">{t("socratic_how_help")}</div>

            {/* The tutor's opening line is rendered here rather than generated: it costs
                nothing, appears instantly, and never varies in quality. It introduces the
                tutor by name and sets the expectation that it won't hand over answers. */}
            <div className="mb-5 rounded-2xl border border-[color:var(--soc-line)] bg-[color:var(--soc-raised)] px-4 py-4 text-[19px] leading-[1.65] text-[color:var(--soc-ink)] shadow-[0_1px_2px_rgba(59,47,26,0.05)]">
              <MetaLabel>{tutorName}</MetaLabel>
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
                  className="w-full text-left rounded-xl border border-[color:var(--soc-line)] bg-[color:var(--soc-raised)] px-4 py-4 text-[17px] leading-snug text-[color:var(--soc-ink)] hover:border-[color:var(--soc-accent)]/45 hover:bg-[color:var(--soc-accent-soft)] transition-colors flex items-center gap-3"
                >
                  <Sparkles size={16} className="shrink-0 text-[color:var(--soc-accent)]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => <Bubble key={turn.id} turn={turn} tutorName={tutorName} />)}

        {sending && (
          <div className="flex justify-start" data-testid="socratic-thinking">
            <div className="rounded-2xl border border-[color:var(--soc-line)] bg-[color:var(--soc-raised)] px-4 py-3.5 text-[19px] text-[color:var(--soc-ink-soft)] flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" /> {t("socratic_thinking")}
            </div>
          </div>
        )}

        {session?.mastered && (
          <div className="rounded-xl border border-[color:var(--soc-success)]/30 bg-[color:var(--soc-success)]/[0.08] p-4 text-[17px] leading-[1.6] text-[color:var(--soc-success)] flex items-start gap-2.5" data-testid="socratic-mastered">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              {t("socratic_mastered")}
              {session.concepts_covered?.length > 0 && (
                <div className="mt-1.5 text-[15px] text-[color:var(--soc-ink-soft)]">{session.concepts_covered.join(" · ")}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {status === "ready" && (
        <div className="shrink-0 border-t border-[color:var(--soc-line)] bg-[color:var(--soc-header)] p-3.5 space-y-2.5">
          {(atTurnLimit || atDailyLimit) && (
            <div className="rounded-lg border border-[color:var(--soc-danger)]/30 bg-[color:var(--soc-danger)]/[0.07] px-3.5 py-2.5 text-[15px] leading-[1.55] text-[color:var(--soc-danger)]" data-testid="socratic-limit">
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
              className="flex-1 resize-none rounded-xl border border-[color:var(--soc-line-strong)] bg-[color:var(--soc-raised)] px-4 py-3.5 text-[18px] leading-[1.5] text-[color:var(--soc-ink)] focus:border-[color:var(--soc-accent)] outline-none max-h-48 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={sending || !draft.trim() || atTurnLimit || atDailyLimit}
              data-testid="socratic-send"
              className="shrink-0 h-12 w-12 grid place-items-center rounded-xl bg-[color:var(--soc-accent)] text-[color:var(--soc-on-accent)] hover:bg-[#5b21b6] transition-colors disabled:opacity-25"
            >
              <Send size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => send(t("socratic_stuck_msg"), true)}
              disabled={sending || !turns.length || atTurnLimit || atDailyLimit}
              data-testid="socratic-hint"
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--soc-line-strong)] bg-[color:var(--soc-raised)] px-4 py-2.5 text-[15px] text-[color:var(--soc-ink-soft)] hover:border-[color:var(--soc-warn)]/60 hover:text-[color:var(--soc-warn)] transition-colors disabled:opacity-35"
            >
              <Lightbulb size={15} /> {t("socratic_stuck")}
              {session?.hint_level > 0 && ` (${session.hint_level}/3)`}
            </button>
            <span className="text-[13px] text-[color:var(--soc-ink-faint)] font-mono">
              {session?.messages_used_today ?? 0}/{session?.daily_message_cap ?? 0}
            </span>
          </div>

          {/* Two things a minor is owed up front: that this is a machine, and that an
              adult can read it. Neither should be buried in a settings page. */}
          <p className="text-[13px] leading-[1.55] text-[color:var(--soc-ink-faint)]">{t("socratic_disclaimer")}</p>
        </div>
      )}
    </aside>
  );
};

export default SocraticPanel;
