import { create } from "zustand";
import type { SessionSummary } from "@/lib/types";

/**
 * Sidebar session list. Kept separate from the active-session transcript so
 * switching sessions doesn't thrash the list, and the list can refresh
 * independently (e.g. after a new session is created).
 */
interface SessionsState {
  /** The working directory the list is scoped to. */
  cwd: string | null;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  loading: boolean;
  error: string | null;
  /** Search query for the session list overlay (empty = no filter). */
  query: string;

  setCwd: (cwd: string | null) => void;
  set: (sessions: SessionSummary[]) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  setCurrent: (id: string | null) => void;
  /** Insert or merge a session entry. Accepts a partial update (e.g. just
   *  `{ sessionId, title }` from a grok://summary event) — missing fields
   *  are preserved from the existing entry, or defaulted on insert. */
  upsert: (s: Partial<SessionSummary> & { sessionId: string }) => void;
  remove: (id: string) => void;
  setQuery: (q: string) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  cwd: null,
  sessions: [],
  currentSessionId: null,
  loading: false,
  error: null,
  query: "",

  setCwd: (cwd) => set({ cwd }),
  set: (sessions) => set({ sessions, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setCurrent: (id) => set({ currentSessionId: id }),
  setQuery: (query) => set({ query }),

  upsert: (s) =>
    set((state) => {
      const idx = state.sessions.findIndex((x) => x.sessionId === s.sessionId);
      if (idx === -1) {
        // New entry — backfill required fields that the caller didn't supply.
        // Spread `s` first so explicit defaults only fill in the gaps.
        const inserted: SessionSummary = {
          title: "未命名会话",
          cwd: state.cwd ?? "",
          ...s,
        };
        return { sessions: [inserted, ...state.sessions] };
      }
      const sessions = [...state.sessions];
      sessions[idx] = { ...sessions[idx], ...s };
      return { sessions };
    }),

  remove: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((x) => x.sessionId !== id),
      currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
    })),
}));
