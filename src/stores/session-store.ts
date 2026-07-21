import { create } from "zustand";
import type {
  Plan,
  PlanUpdate,
  PromptComplete,
  SessionUpdate,
  ToolCallContent,
  ToolCallUpdate,
  UsageUpdate,
} from "@/lib/types";

/**
 * A single chat message in the transcript the UI renders.
 *
 * `assistant` messages accumulate `agent_message_chunk` text deltas and may
 * carry tool-call cards interleaved with text. We model the body as an
 * ordered list of "parts" so streaming stays in order.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  /** False while the assistant is still streaming this message. */
  complete: boolean;
}

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool_call"; toolCall: ToolCallView };

/** A tool-call card rendered inline. Mirrors a subset of ToolCallUpdate. */
export interface ToolCallView {
  toolCallId: string;
  title: string;
  kind: string;
  status: "in_progress" | "completed" | "failed";
  content: ToolCallUpdate["content"];
  rawInput?: unknown;
}

interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Per-session transcript — the single source of truth.
 *
 * Historically the store kept ONE global `messages`/`streamingMessageId` and
 * wiped them on every session switch, which lost the locally-optimistic user
 * bubbles and had nowhere to accumulate a session that kept streaming in the
 * background after the user switched away. Now every session owns its own
 * transcript, and the top-level `messages`/`streaming`/`usage`/`plan` fields
 * are just a *mirror* of the currently-focused session's transcript (so every
 * existing reader keeps working unchanged).
 *
 * `suppressReplay` is set when we switch back to a session we already have a
 * cached transcript for: the cache IS the truth, so the history replay that
 * `grokLoadSession` re-streams must be ignored for the message-streaming
 * cases (otherwise turns merge and historical usage overwrites the live one).
 */
export interface SessionTranscript {
  messages: ChatMessage[];
  /** Non-null while this session has an in-flight assistant message. Doubles
   *  as the per-session "is streaming" flag. */
  streamingMessageId: string | null;
  usage: Usage;
  plan: Plan | null;
  suppressReplay: boolean;
}

interface SessionState {
  /** Currently focused session. Top-level mirrors below reflect this one. */
  sessionId: string | null;
  /** Per-session transcripts (single source of truth). */
  transcripts: Record<string, SessionTranscript>;

  // --- mirrors of transcripts[sessionId] (read by the UI) ---
  messages: ChatMessage[];
  /** True between `grok_send` and `grok://complete` for the focused session. */
  streaming: boolean;
  /** Last assistant message id being streamed in the focused session. */
  streamingMessageId: string | null;
  usage: Usage;
  plan: Plan | null;

  error: string | null;
  /** Plan mode on/off — toggled by user or by grok via notification. */
  planMode: boolean;

  // --- lifecycle ---
  setSession: (id: string | null) => void;
  reset: () => void;
  startStreaming: () => void;
  markComplete: (p: PromptComplete) => void;
  setError: (e: string | null) => void;
  /** Stop the focused session's stream locally (cancel button): keep any
   *  text already streamed, mark the in-flight message complete, clear the
   *  streaming flag. Does NOT talk to the backend (caller does grokCancel). */
  stopStreaming: () => void;
  /** Drop a session's cached transcript so the next focus reloads it from
   *  grok (used after a rewind that rewrites backend history). */
  dropSessionCache: (id: string) => void;
  /** Re-enable replay ingestion for a session once its grokLoadSession call
   *  has finished (so a *new* turn's updates aren't suppressed). */
  clearReplaySuppression: (id?: string) => void;

  // --- transcript ops ---
  /** Append a user message (sent optimistically before the round-trip). */
  pushUser: (text: string) => void;
  /** Append an assistant message (for preview mode simulation). */
  pushAssistant: (text: string) => void;
  /** Apply a streamed session/update from the backend. The update is routed
   *  to the transcript it belongs to (`__sessionId`, falling back to the
   *  focused session) so background sessions keep accumulating. */
  applyUpdate: (u: SessionUpdate & { __sessionId?: string }) => void;
  /** Bulk-replace the focused session's messages (history load fallback). */
  setMessages: (msgs: ChatMessage[]) => void;
  /** Replace the focused session's plan. */
  setPlan: (plan: Plan | null) => void;
  /** Toggle plan mode (user-initiated or grok notification). */
  setPlanMode: (enabled: boolean) => void;
}

let seq = 0;
const nextId = () => `m${Date.now()}_${seq++}`;

const EMPTY_TRANSCRIPT: SessionTranscript = {
  messages: [],
  streamingMessageId: null,
  usage: {},
  plan: null,
  suppressReplay: false,
};

// Side-channel update listeners: keyed by session id. The inspiration panel
// registers one to accumulate grok's streamed JSON output for a side session.
// When present, applyUpdate forwards matching updates to the listener IN
// ADDITION to (not instead of) routing them into that session's transcript —
// but the inspiration session is never focused, so the transcript stays inert.
const foreignUpdateListeners = new Map<string, (u: SessionUpdate) => void>();

/** Register a side-channel listener for a specific session id. Returns an
 *  unsubscribe function. */
export function registerForeignUpdateListener(
  sessionId: string,
  cb: (u: SessionUpdate) => void,
): () => void {
  foreignUpdateListeners.set(sessionId, cb);
  return () => {
    // Only delete if still ours (avoids clobbering a re-registration).
    if (foreignUpdateListeners.get(sessionId) === cb) {
      foreignUpdateListeners.delete(sessionId);
    }
  };
}

/**
 * Normalize ACP wire-format `ToolCallContent[]` into the shape the frontend
 * `ToolCallCard` expects.
 *
 * ACP (agent-client-protocol-schema 0.11.x) serializes content as:
 *   - text:  { type: "content", content: { type: "text", text: "…" } }
 *   - diff:  { type: "diff", path, oldText, newText }
 *   - term:  { type: "terminal", terminalId }
 *
 * The frontend expects:
 *   - text:  { type: "text", text: "…" }
 *   - diff:  { type: "diff", diff: { path, old, new } }
 *   - cmd:   { type: "command_output", command?, output }
 */
function normalizeToolCallContent(raw: unknown): ToolCallContent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((item) => {
    const t = item.type as string;

    // ACP wraps text/images/etc inside { type:"content", content: ContentBlock }.
    if (t === "content") {
      const inner = item.content as Record<string, unknown> | undefined;
      if (inner?.type === "text") {
        return { type: "text" as const, text: (inner.text as string) ?? "" };
      }
      // Image / audio / resource — fall back to showing nothing for now.
      return { type: "text" as const, text: "" };
    }

    // ACP diff uses flat oldText/newText; frontend expects nested diff.old/new.
    if (t === "diff") {
      return {
        type: "diff" as const,
        diff: {
          path: (item.path as string) ?? "",
          old: (item.oldText as string) ?? "",
          new: (item.newText as string) ?? "",
        },
      };
    }

    // ACP terminal → frontend command_output placeholder.
    if (t === "terminal") {
      return {
        type: "command_output" as const,
        command: undefined,
        output: `[terminal ${(item.terminalId as string) ?? ""}]`,
      };
    }

    // Already in frontend format (text / diff / command_output) — pass through.
    return item as unknown as ToolCallContent;
  });
}

function ensureStreamingAssistant(
  messages: ChatMessage[],
  streamingMessageId: string | null
): { messages: ChatMessage[]; id: string } {
  // Reuse the existing streaming assistant message if it's still incomplete
  // and its last part isn't a terminal tool_call.
  if (streamingMessageId) {
    const idx = messages.findIndex((m) => m.id === streamingMessageId);
    if (idx !== -1 && !messages[idx].complete) {
      return { messages, id: streamingMessageId };
    }
  }
  const id = nextId();
  const asst: ChatMessage = {
    id,
    role: "assistant",
    parts: [],
    complete: false,
  };
  return { messages: [...messages, asst], id };
}

function appendText(
  msg: ChatMessage,
  kind: "text" | "thought",
  delta: string
): ChatMessage {
  const parts = [...msg.parts];
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) {
    parts[parts.length - 1] = { kind, text: last.text + delta } as MessagePart;
  } else {
    parts.push({ kind, text: delta } as MessagePart);
  }
  return { ...msg, parts };
}

function upsertToolCall(msg: ChatMessage, tc: ToolCallView): ChatMessage {
  const parts = [...msg.parts];
  const idx = parts.findIndex(
    (p) => p.kind === "tool_call" && p.toolCall.toolCallId === tc.toolCallId
  );
  if (idx === -1) {
    parts.push({ kind: "tool_call", toolCall: tc });
  } else {
    parts[idx] = { kind: "tool_call", toolCall: tc };
  }
  return { ...msg, parts };
}

/** Derive the top-level mirror fields from a (possibly null) transcript. */
function mirrorOf(t: SessionTranscript | undefined) {
  return {
    messages: t?.messages ?? [],
    streamingMessageId: t?.streamingMessageId ?? null,
    streaming: (t?.streamingMessageId ?? null) != null,
    usage: t?.usage ?? {},
    plan: t?.plan ?? null,
  };
}

export const useSessionStore = create<SessionState>((set, get) => {
  /**
   * Apply a pure reducer to one session's transcript and, if that session is
   * the focused one, refresh the top-level mirror in the same `set` call so
   * readers never see a half-updated pair.
   */
  const applyToTranscript = (
    sid: string | null,
    reducer: (t: SessionTranscript) => SessionTranscript,
  ) =>
    set((s) => {
      if (!sid) return s; // nowhere to route — drop
      const prev = s.transcripts[sid] ?? { ...EMPTY_TRANSCRIPT };
      const next = reducer(prev);
      if (next === prev) return s;
      const transcripts = { ...s.transcripts, [sid]: next };
      // If we mutated the focused session, keep the mirror in lock-step.
      if (sid === s.sessionId) {
        return { transcripts, ...mirrorOf(next) };
      }
      return { transcripts };
    });

  return {
    sessionId: null,
    transcripts: {},
    messages: [],
    streaming: false,
    streamingMessageId: null,
    usage: {},
    plan: null,
    error: null,
    planMode: false,

    setSession: (id) =>
      set((s) => {
        // Switching focus never destroys transcripts. If we have a cached
        // transcript for the target, it's the truth: arm replay suppression
        // so grokLoadSession's re-streamed history can't merge/overwrite it,
        // and mirror it (streaming stays true if it was mid-stream). If we
        // don't (first open / after restart), seed an empty, non-suppressed
        // transcript that the upcoming replay will fill.
        const hasCache =
          id != null && Object.prototype.hasOwnProperty.call(s.transcripts, id);
        let transcripts = s.transcripts;
        if (id != null && !hasCache) {
          transcripts = { ...s.transcripts, [id]: { ...EMPTY_TRANSCRIPT } };
        } else if (id != null && hasCache) {
          const t = s.transcripts[id];
          if (!t.suppressReplay) {
            transcripts = {
              ...s.transcripts,
              [id]: { ...t, suppressReplay: true },
            };
          }
        }
        const focused = id != null ? transcripts[id] : undefined;
        return {
          sessionId: id,
          transcripts,
          ...mirrorOf(focused),
          error: null,
        };
      }),

    reset: () =>
      set(() => ({
        sessionId: null,
        // Keep transcripts (so a stray background stream can still land and a
        // later refocus restores it); just clear the focused mirror.
        ...mirrorOf(undefined),
        error: null,
      })),

    startStreaming: () => {
      // Optimistically insert an empty assistant placeholder so the avatar +
      // "preparing" loading row appears immediately after the user message,
      // instead of a blank gap until the first streamed chunk arrives.
      const sid = get().sessionId;
      if (!sid) return;
      applyToTranscript(sid, (t) => {
        const id = nextId();
        const placeholder: ChatMessage = {
          id,
          role: "assistant",
          parts: [],
          complete: false,
        };
        return {
          ...t,
          streamingMessageId: id,
          messages: [...t.messages, placeholder],
        };
      });
      // Local error banner doesn't belong to the transcript; clear it globally.
      set({ error: null });
    },

    markComplete: (p) => {
      // Route by the complete's own sessionId so a background session finishing
      // after we switched away finalizes ITS transcript (clearing its streaming
      // flag) instead of clobbering the focused one.
      const target = (p as { sessionId?: string }).sessionId ?? get().sessionId;
      applyToTranscript(target, (t) => {
        const messages = t.messages
          .map((m) =>
            m.id === t.streamingMessageId ? { ...m, complete: true } : m
          )
          // Drop the placeholder if nothing was ever streamed into it —
          // otherwise we'd be left with an empty avatar bubble.
          .filter(
            (m) => !(m.id === t.streamingMessageId && m.parts.length === 0)
          );
        return {
          ...t,
          messages,
          streamingMessageId: null,
          usage: { ...t.usage, ...p.usage },
        };
      });
    },

    setError: (e) => {
      // Error is a global UI banner; also finalize the focused transcript's
      // empty placeholder so the spinner doesn't hang.
      const sid = get().sessionId;
      if (sid) {
        applyToTranscript(sid, (t) => ({
          ...t,
          streamingMessageId: null,
          messages: t.messages.filter(
            (m) => !(m.id === t.streamingMessageId && m.parts.length === 0)
          ),
        }));
      }
      set({ error: e });
    },

    stopStreaming: () => {
      // Cancel button: keep whatever already streamed, just close the turn.
      const sid = get().sessionId;
      if (!sid) {
        set({ error: null });
        return;
      }
      applyToTranscript(sid, (t) => {
        if (t.streamingMessageId == null) return t;
        const messages = t.messages
          .map((m) =>
            m.id === t.streamingMessageId ? { ...m, complete: true } : m
          )
          .filter(
            (m) => !(m.id === t.streamingMessageId && m.parts.length === 0)
          );
        return { ...t, messages, streamingMessageId: null };
      });
    },

    dropSessionCache: (id) =>
      set((s) => {
        if (!Object.prototype.hasOwnProperty.call(s.transcripts, id)) return {};
        const transcripts = { ...s.transcripts };
        delete transcripts[id];
        // If we just dropped the focused session, refresh the mirror to empty
        // (a subsequent setSession+load will refill it from grok).
        if (id === s.sessionId) {
          return { transcripts, ...mirrorOf(undefined) };
        }
        return { transcripts };
      }),

    clearReplaySuppression: (id) => {
      const target = id ?? get().sessionId;
      if (!target) return;
      applyToTranscript(target, (t) =>
        t.suppressReplay ? { ...t, suppressReplay: false } : t
      );
    },

    pushUser: (text) => {
      const sid = get().sessionId;
      if (!sid) return;
      applyToTranscript(sid, (t) => ({
        ...t,
        messages: [
          ...t.messages,
          {
            id: nextId(),
            role: "user",
            parts: [{ kind: "text", text }],
            complete: true,
          },
        ],
      }));
    },

    pushAssistant: (text) => {
      const sid = get().sessionId;
      if (!sid) return;
      applyToTranscript(sid, (t) => ({
        ...t,
        streamingMessageId: null,
        messages: [
          ...t.messages,
          {
            id: nextId(),
            role: "assistant",
            parts: [{ kind: "text", text }],
            complete: true,
          },
        ],
      }));
    },

    applyUpdate: (u) => {
      const foreignSid = (u as { __sessionId?: string }).__sessionId;
      // Side-channel (inspiration panel) still gets a copy when registered.
      if (foreignSid) {
        const cb = foreignUpdateListeners.get(foreignSid);
        if (cb) cb(u);
      }
      // Route into the transcript this update belongs to. No attribution and
      // no focused session → nowhere to put it, drop (don't pollute).
      const target = foreignSid ?? get().sessionId;
      if (!target) return;

      // ACP's SessionUpdate uses `sessionUpdate` as the tag field (not `type`).
      // Some updates may use `type` (older path); accept both.
      const t = ((u as { sessionUpdate?: string }).sessionUpdate ??
        (u as { type?: string }).type) as string;

      // Replay-suppression gate: when we refocused a cached transcript, the
      // history grok re-streams must NOT touch the message stream (it would
      // merge turns / overwrite usage). Usage/plan are also part of the cache,
      // so suppress them too during replay.
      const REPLAY_SUPPRESSED = new Set([
        "agent_message_chunk",
        "agent_thought_chunk",
        "tool_call",
        "tool_call_update",
        "usage_update",
        "plan",
      ]);

      applyToTranscript(target, (tr) => {
        if (tr.suppressReplay && REPLAY_SUPPRESSED.has(t)) return tr;

        // Extract text delta from a content field that may be a single
        // TextContent object ({type:"text",text:"..."}) OR an array of them.
        const extractDelta = (content: unknown): string => {
          if (!content) return "";
          if (Array.isArray(content)) {
            return content.map((c: { text?: string }) => c.text ?? "").join("");
          }
          return (content as { text?: string }).text ?? "";
        };

        switch (t) {
          case "agent_message_chunk": {
            const delta = extractDelta((u as { content?: unknown }).content);
            if (!delta) return tr;
            const { messages, id } = ensureStreamingAssistant(
              tr.messages,
              tr.streamingMessageId
            );
            const idx = messages.findIndex((m) => m.id === id);
            messages[idx] = appendText(messages[idx], "text", delta);
            return { ...tr, messages: [...messages], streamingMessageId: id };
          }
          case "agent_thought_chunk": {
            const delta = extractDelta((u as { content?: unknown }).content);
            if (!delta) return tr;
            const { messages, id } = ensureStreamingAssistant(
              tr.messages,
              tr.streamingMessageId
            );
            const idx = messages.findIndex((m) => m.id === id);
            messages[idx] = appendText(messages[idx], "thought", delta);
            return { ...tr, messages: [...messages], streamingMessageId: id };
          }
          case "tool_call": {
            const raw = u as unknown as Record<string, unknown>;
            const { messages, id } = ensureStreamingAssistant(
              tr.messages,
              tr.streamingMessageId
            );
            const idx = messages.findIndex((m) => m.id === id);
            // ACP omits `kind` when it's "other" and `status` when it's
            // "pending" (the defaults). Provide sensible fallbacks.
            const status = (raw.status as string) || "in_progress";
            const view: ToolCallView = {
              toolCallId:
                (raw.toolCallId as string) ??
                (raw.tool_call_id as string) ??
                "",
              title: (raw.title as string) ?? "",
              kind: (raw.kind as string) ?? "other",
              status: status as ToolCallView["status"],
              content: normalizeToolCallContent(raw.content),
              rawInput: raw.rawInput ?? raw.raw_input,
            };
            messages[idx] = upsertToolCall(messages[idx], view);
            return { ...tr, messages: [...messages], streamingMessageId: id };
          }
          case "tool_call_update": {
            // ACP serializes ToolCallUpdate with `#[serde(flatten)]` on the
            // fields struct, so status/content/etc. sit at the TOP LEVEL of
            // the JSON alongside toolCallId — there is no nested `update` key.
            const raw = u as unknown as Record<string, unknown>;
            const tcId =
              (raw.toolCallId as string) ?? (raw.tool_call_id as string);
            const deltaFields: Record<string, unknown> = {};
            for (const key of [
              "kind",
              "status",
              "title",
              "content",
              "rawInput",
              "rawOutput",
              "locations",
            ] as const) {
              if (raw[key] !== undefined) deltaFields[key] = raw[key];
            }
            if (raw.raw_input !== undefined && deltaFields.rawInput === undefined)
              deltaFields.rawInput = raw.raw_input;
            if (raw.raw_output !== undefined && deltaFields.rawOutput === undefined)
              deltaFields.rawOutput = raw.raw_output;
            if (deltaFields.content !== undefined) {
              deltaFields.content = normalizeToolCallContent(
                deltaFields.content
              );
            }
            // Patch the matching tool card across the transcript (not only the
            // streaming message — a late update may target an older turn).
            const messages = tr.messages.map((m) => {
              const has = m.parts.some(
                (p) =>
                  p.kind === "tool_call" && p.toolCall.toolCallId === tcId
              );
              if (!has) return m;
              const parts = m.parts.map((p) => {
                if (p.kind !== "tool_call") return p;
                if (p.toolCall.toolCallId !== tcId) return p;
                return {
                  ...p,
                  toolCall: { ...p.toolCall, ...deltaFields } as ToolCallView,
                };
              });
              return { ...m, parts };
            });
            return { ...tr, messages };
          }
          case "usage_update": {
            const uu = u as unknown as UsageUpdate;
            return { ...tr, usage: { ...tr.usage, ...uu.usage } };
          }
          case "plan": {
            const uu = u as unknown as PlanUpdate;
            return { ...tr, plan: uu.plan ?? null };
          }
          default:
            return tr;
        }
      });
    },

    setMessages: (msgs) => {
      const sid = get().sessionId;
      if (!sid) return;
      applyToTranscript(sid, (t) => ({ ...t, messages: msgs }));
    },

    setPlan: (plan) => {
      const sid = get().sessionId;
      if (!sid) return;
      applyToTranscript(sid, (t) => ({ ...t, plan }));
    },

    setPlanMode: (enabled) => set({ planMode: enabled }),
  };
});

export type { ToolCallUpdate };
