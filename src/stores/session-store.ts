import { create } from "zustand";
import type {
  Plan,
  PlanUpdate,
  PromptComplete,
  SessionUpdate,
  ToolCallDeltaUpdate,
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

interface SessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  /** True between `grok_send` and `grok://complete`. */
  streaming: boolean;
  /** Last assistant message id being streamed (target of text chunks). */
  streamingMessageId: string | null;
  usage: Usage;
  error: string | null;
  /** Live execution plan (ACP `Plan`). Replaced wholesale on each plan update.
   *  Null = no plan for this session yet. */
  plan: Plan | null;
  /** Plan mode on/off — toggled by user or by grok via notification. */
  planMode: boolean;

  // --- lifecycle ---
  setSession: (id: string | null) => void;
  reset: () => void;
  startStreaming: () => void;
  markComplete: (p: PromptComplete) => void;
  setError: (e: string | null) => void;

  // --- transcript ops ---
  /** Append a user message (sent optimistically before the round-trip). */
  pushUser: (text: string) => void;
  /** Append an assistant message (for preview mode simulation). */
  pushAssistant: (text: string) => void;
  /** Apply a streamed session/update from the backend. Updates whose
   *  `__sessionId` doesn't match the current session are forwarded to
   *  `onForeignUpdate` (if registered) instead of polluting the transcript. */
  applyUpdate: (u: SessionUpdate & { __sessionId?: string }) => void;
  /** Bulk-replace messages (used when loading a session from history). */
  setMessages: (msgs: ChatMessage[]) => void;
  /** Replace the current plan (called from applyUpdate on plan updates). */
  setPlan: (plan: Plan | null) => void;
  /** Toggle plan mode (user-initiated or grok notification). */
  setPlanMode: (enabled: boolean) => void;
}

let seq = 0;
const nextId = () => `m${Date.now()}_${seq++}`;

// Side-channel update listeners: keyed by session id. When applyUpdate sees
// an update whose `__sessionId` doesn't match the current session, it looks
// up a listener here and forwards the update instead of touching transcript.
// Used by the inspiration panel to accumulate grok's streamed JSON output.
const foreignUpdateListeners = new Map<string, (u: SessionUpdate) => void>();

/** Register a side-channel listener for a specific session id. Returns an
 *  unsubscribe function. While registered, any session/update with this
 *  sessionId is forwarded to `cb` and skipped by the main transcript store. */
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

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  messages: [],
  streaming: false,
  streamingMessageId: null,
  usage: {},
  error: null,
  plan: null,
  planMode: false,

  setSession: (id) =>
    set({ sessionId: id, messages: [], streaming: false, streamingMessageId: null, usage: {}, error: null, plan: null }),

  reset: () =>
    set({ sessionId: null, messages: [], streaming: false, streamingMessageId: null, usage: {}, error: null, plan: null }),

  startStreaming: () => {
    set({ streaming: true, error: null, streamingMessageId: null });
  },

  markComplete: (p) => {
    set((s) => {
      const messages = s.messages.map((m) =>
        m.id === s.streamingMessageId ? { ...m, complete: true } : m
      );
      return {
        messages,
        streaming: false,
        streamingMessageId: null,
        usage: { ...s.usage, ...p.usage },
      };
    });
  },

  setError: (e) => set({ error: e, streaming: false, streamingMessageId: null }),

  pushUser: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: "user", parts: [{ kind: "text", text }], complete: true },
      ],
    })),

  pushAssistant: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextId(), role: "assistant", parts: [{ kind: "text", text }], complete: true },
      ],
      streaming: false,
    })),

  applyUpdate: (u) =>
    set((s) => {
      // Route updates for other sessions (e.g. inspiration generation) to a
      // separate listener so they don't pollute the active transcript.
      const foreignSid = (u as { __sessionId?: string }).__sessionId;
      if (foreignSid && s.sessionId && foreignSid !== s.sessionId) {
        const cb = foreignUpdateListeners.get(foreignSid);
        if (cb) {
          cb(u);
          return s; // no state change
        }
      }
      // ACP's SessionUpdate uses `sessionUpdate` as the tag field (not `type`).
      // Some updates may use `type` (older path); accept both.
      const t = ((u as { sessionUpdate?: string }).sessionUpdate ??
        (u as { type?: string }).type) as string;
      // Extract text delta from a content field that may be a single
      // TextContent object ({type:"text",text:"..."}) OR an array of them.
      // ACP's wire format sends a single object, not an array.
      const extractDelta = (content: unknown): string => {
        if (!content) return "";
        if (Array.isArray(content)) {
          return content.map((c: { text?: string }) => c.text ?? "").join("");
        }
        // Single object.
        return (content as { text?: string }).text ?? "";
      };
      switch (t) {
        case "agent_message_chunk": {
          const delta = extractDelta((u as { content?: unknown }).content);
          if (!delta) return s;
          const { messages, id } = ensureStreamingAssistant(s.messages, s.streamingMessageId);
          const idx = messages.findIndex((m) => m.id === id);
          const updated = appendText(messages[idx], "text", delta);
          messages[idx] = updated;
          return { messages: [...messages], streamingMessageId: id };
        }
        case "agent_thought_chunk": {
          const delta = extractDelta((u as { content?: unknown }).content);
          if (!delta) return s;
          const { messages, id } = ensureStreamingAssistant(s.messages, s.streamingMessageId);
          const idx = messages.findIndex((m) => m.id === id);
          const updated = appendText(messages[idx], "thought", delta);
          messages[idx] = updated;
          return { messages: [...messages], streamingMessageId: id };
        }
        case "tool_call": {
          const uu = u as unknown as ToolCallUpdate;
          const { messages, id } = ensureStreamingAssistant(s.messages, s.streamingMessageId);
          const idx = messages.findIndex((m) => m.id === id);
          const view: ToolCallView = {
            toolCallId: uu.toolCallId,
            title: uu.title,
            kind: uu.kind,
            status: uu.status,
            content: uu.content ?? [],
            rawInput: uu.rawInput,
          };
          messages[idx] = upsertToolCall(messages[idx], view);
          return { messages: [...messages], streamingMessageId: id };
        }
        case "tool_call_update": {
          const uu = u as unknown as ToolCallDeltaUpdate;
          // Best-effort: apply field updates (e.g. status change) to existing cards.
          const messages = s.messages.map((m) => {
            if (m.id !== s.streamingMessageId) return m;
            const parts = m.parts.map((p) => {
              if (p.kind !== "tool_call") return p;
              if (p.toolCall.toolCallId !== uu.toolCallId) return p;
              return { ...p, toolCall: { ...p.toolCall, ...uu.update } as ToolCallView };
            });
            return { ...m, parts };
          });
          return { messages };
        }
        case "usage_update": {
          const uu = u as unknown as UsageUpdate;
          return { usage: { ...s.usage, ...uu.usage } };
        }
        case "plan": {
          // ACP Plan: replaces the whole plan on each update.
          const uu = u as unknown as PlanUpdate;
          return { plan: uu.plan ?? null };
        }
        default:
          // Other extension updates (x.ai/*) not modeled in the transcript.
          return s;
      }
    }),

  setMessages: (msgs) => set({ messages: msgs }),

  setPlan: (plan) => set({ plan }),

  setPlanMode: (enabled) => set({ planMode: enabled }),
}));

export type { ToolCallUpdate };
