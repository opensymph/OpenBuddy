/**
 * Context-usage store — per-session cache of grok's context-window snapshot
 * (`x.ai/session/info`) and cumulative token usage (`x.ai/session/usage`),
 * powering the composer's context-usage pill + popover.
 *
 * Kept separate from the session transcript store: this data is a cheap
 * point-in-time snapshot refreshed on demand (after each completed turn, on
 * session switch, and when the popover opens), not part of the message flow.
 *
 * Both fetches fail soft: grok reports "session not found" for sessions that
 * aren't live in the agent (e.g. old sessions never loaded this launch), in
 * which case we just keep whatever data we had and the pill stays hidden.
 */
import { create } from "zustand";
import { grokSessionInfo, grokSessionUsage } from "@/lib/grok-client";
import type { SessionInfoResponse, SessionUsage } from "@/lib/types";

export interface ContextUsageEntry {
  info?: SessionInfoResponse;
  usage?: SessionUsage;
  /** True while a refresh is in flight (avoids duplicate concurrent fetches). */
  loading?: boolean;
}

interface ContextUsageState {
  bySession: Record<string, ContextUsageEntry>;
  /** Refresh both snapshots for a session. Concurrent calls are deduped. */
  refresh: (sessionId: string) => Promise<void>;
  /** Drop cached data (e.g. when a session is deleted). */
  clear: (sessionId: string) => void;
}

export const useContextUsageStore = create<ContextUsageState>((set, get) => ({
  bySession: {},

  refresh: async (sessionId) => {
    if (!sessionId) return;
    const existing = get().bySession[sessionId];
    if (existing?.loading) return;

    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: { ...s.bySession[sessionId], loading: true },
      },
    }));

    // Fetch both independently — usage (cache hit rate) is a nice-to-have,
    // so a usage failure must not take down the context info.
    const [infoRes, usageRes] = await Promise.allSettled([
      grokSessionInfo(sessionId),
      grokSessionUsage(sessionId),
    ]);
    if (infoRes.status === "rejected") {
      console.warn("[OpenBuddy] context usage: session info fetch failed:", infoRes.reason);
    }
    if (usageRes.status === "rejected") {
      console.warn("[OpenBuddy] context usage: session usage fetch failed:", usageRes.reason);
    }

    set((s) => {
      const prev = s.bySession[sessionId] ?? {};
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            info: infoRes.status === "fulfilled" ? infoRes.value : prev.info,
            usage: usageRes.status === "fulfilled" ? usageRes.value : prev.usage,
            loading: false,
          },
        },
      };
    });
  },

  clear: (sessionId) =>
    set((s) => {
      const next = { ...s.bySession };
      delete next[sessionId];
      return { bySession: next };
    }),
}));
