import { create } from "zustand";
import type { SessionSummary } from "@/lib/types";
import type { WorkspaceInfo } from "@/lib/grok-client";

/**
 * Sentinel draft keys for sessions that don't have a real sessionId yet.
 * Used when the user is typing on HomePage ("新建任务") or LocalAssistantView
 * before any session has been created. Kept here so callers don't hardcode
 * magic strings.
 */
export const HOME_DRAFT_KEY = "__home__";
export const ASSISTANT_DRAFT_KEY = "__assistant__";

/**
 * Sidebar session list — WorkBuddy-style two-section model.
 *
 * The sidebar no longer shows a single cwd's sessions flat under one "默认空间".
 * Instead it renders two collapsible groups:
 *
 *   任务 (N)  — `independent`: sessions with an empty cwd (playground / 独立任务).
 *               Sourced from `grokListSessions("")`, which the Rust backend
 *               already filters to cwd-less sessions (sessions.rs:111).
 *   空间 (M)  — `workspaces`: one expandable node per local working directory
 *               (sourced from `grokListWorkspaces()`). Expanding a node lazily
 *               loads that cwd's sessions into `workspaceSessions[cwd]`.
 *
 * Kept separate from the active-session transcript store so switching sessions
 * doesn't thrash the list, and each group can refresh independently.
 */
interface SessionsState {
  /** 任务分组: cwd-less (independent) sessions. */
  independent: SessionSummary[];
  /** 空间分组: one node per working directory grok has seen. */
  workspaces: WorkspaceInfo[];
  /** 空间节点展开后的子会话缓存, keyed by cwd. Absent key = not yet loaded. */
  workspaceSessions: Record<string, SessionSummary[]>;
  /** 任务分组 collapsed? (default expanded). */
  tasksOpen: boolean;
  /** 空间分组 collapsed? (default expanded). */
  spacesOpen: boolean;
  /** Per-cwd expand state for 空间 nodes. */
  expanded: Record<string, boolean>;
  /** The "inbox" cwd = the directory grok started in. Sessions in this cwd
   *  form the 任务 group; every other cwd is a 空间 node. (grok rejects empty
   *  cwd, so we cannot use a cwd-less session as the inbox.) */
  homeCwd: string;
  currentSessionId: string | null;
  loading: boolean;
  error: string | null;
  /** Search query for the session search overlay (empty = no filter). */
  query: string;
  /**
   * Per-session Composer drafts (unsent textarea text), keyed by sessionId.
   * UI-only state: grok has no concept of "user hasn't pressed send yet", so
   * we keep it here the same way we keep pinned/archived (see meta.rs).
   * Two sentinel keys cover sessions that don't have an id yet:
   *   - `__home__`      HomePage ("新建任务") input
   *   - `__assistant__` LocalAssistantView input
   */
  drafts: Record<string, string>;

  setIndependent: (list: SessionSummary[]) => void;
  setWorkspaces: (list: WorkspaceInfo[]) => void;
  setWorkspaceSessions: (cwd: string, list: SessionSummary[]) => void;
  setTasksOpen: (b: boolean) => void;
  setSpacesOpen: (b: boolean) => void;
  setExpanded: (cwd: string, b: boolean) => void;
  setHomeCwd: (cwd: string) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  setCurrent: (id: string | null) => void;
  setQuery: (q: string) => void;
  /** Save the draft for one session id. Empty string deletes the entry so
   *  the map stays tidy and `drafts[id] ?? ""` always reflects truth. */
  setDraft: (id: string, text: string) => void;
  /** Drop the draft for one session id (no-op if absent). */
  clearDraft: (id: string) => void;
  /** Insert or merge a session entry, routing it into the correct group by
   *  cwd. On update (id already present) the entry is merged in place wherever
   *  it lives, so a cwd-less `{ sessionId, title }` (e.g. grok://summary)
   *  updates the right group without needing the cwd. */
  upsert: (s: Partial<SessionSummary> & { sessionId: string }) => void;
  /** Remove a session from every group and decrement its workspace node count. */
  remove: (id: string) => void;
}

export const useSessionsStore = create<SessionsState>((set) => ({
  independent: [],
  workspaces: [],
  workspaceSessions: {},
  tasksOpen: true,
  spacesOpen: true,
  expanded: {},
  homeCwd: "",
  currentSessionId: null,
  loading: false,
  error: null,
  query: "",
  drafts: {},

  setIndependent: (independent) => set({ independent }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setWorkspaceSessions: (cwd, list) =>
    set((state) => ({
      workspaceSessions: { ...state.workspaceSessions, [cwd]: list },
    })),
  setTasksOpen: (tasksOpen) => set({ tasksOpen }),
  setSpacesOpen: (spacesOpen) => set({ spacesOpen }),
  setExpanded: (cwd, b) =>
    set((state) => ({ expanded: { ...state.expanded, [cwd]: b } })),
  setHomeCwd: (homeCwd) => set({ homeCwd }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setCurrent: (id) => set({ currentSessionId: id }),
  setQuery: (query) => set({ query }),
  setDraft: (id, text) =>
    set((state) => {
      // Avoid a new object reference when nothing changes (no text + absent).
      if (text === "") {
        if (!Object.prototype.hasOwnProperty.call(state.drafts, id)) return {};
        const next = { ...state.drafts };
        delete next[id];
        return { drafts: next };
      }
      if (state.drafts[id] === text) return {};
      return { drafts: { ...state.drafts, [id]: text } };
    }),
  clearDraft: (id) =>
    set((state) => {
      if (!Object.prototype.hasOwnProperty.call(state.drafts, id)) return {};
      const next = { ...state.drafts };
      delete next[id];
      return { drafts: next };
    }),

  upsert: (s) =>
    set((state) => {
      const id = s.sessionId;

      // 1) Update in place if it already lives in the 任务 group.
      const iIdx = state.independent.findIndex((x) => x.sessionId === id);
      if (iIdx !== -1) {
        const independent = [...state.independent];
        independent[iIdx] = { ...independent[iIdx], ...s };
        return { independent };
      }

      // 2) Update in place if it already lives in some 空间 node's cache.
      for (const cwd of Object.keys(state.workspaceSessions)) {
        const list = state.workspaceSessions[cwd];
        const wIdx = list.findIndex((x) => x.sessionId === id);
        if (wIdx !== -1) {
          const next = [...list];
          next[wIdx] = { ...next[wIdx], ...s };
          return { workspaceSessions: { ...state.workspaceSessions, [cwd]: next } };
        }
      }

      // 3) New entry — route by cwd. The 任务 group is the "inbox" = the cwd
      // grok started in (homeCwd); grok rejects empty cwd so every session has
      // an absolute path. A session whose cwd equals homeCwd (or, defensively,
      // an empty cwd) is independent; everything else belongs to a 空间 node.
      const cwd = s.cwd ?? "";
      const isInbox = !cwd || cwd === state.homeCwd;
      if (isInbox) {
        const inserted: SessionSummary = {
          title: "未命名会话",
          cwd: state.homeCwd,
          ...s,
          // Fresh sessions must carry a timestamp so the sidebar's
          // recently-active sort pins them to the top instead of sinking.
          updatedAt: s.updatedAt ?? new Date().toISOString(),
        };
        return { independent: [inserted, ...state.independent] };
      }

      // Non-empty cwd ⇒ belongs to a 空间 node. Only insert if that node's
      // cache is loaded (expanded); otherwise the node's sessionCount carries
      // the truth until the user expands it (or a refresh repopulates it).
      if (Object.prototype.hasOwnProperty.call(state.workspaceSessions, cwd)) {
        const inserted: SessionSummary = {
          title: "未命名会话",
          cwd,
          ...s,
          updatedAt: s.updatedAt ?? new Date().toISOString(),
        };
        return {
          workspaceSessions: {
            ...state.workspaceSessions,
            [cwd]: [inserted, ...state.workspaceSessions[cwd]],
          },
        };
      }

      // Node not expanded — nothing to insert into right now.
      return {};
    }),

  remove: (id) =>
    set((state) => {
      const independent = state.independent.filter((x) => x.sessionId !== id);

      // Drop from any 空间 node cache that holds it, remembering which cwd
      // lost a session so we can keep that node's count in sync.
      let removedCwd: string | null = null;
      const workspaceSessions: Record<string, SessionSummary[]> = {};
      for (const cwd of Object.keys(state.workspaceSessions)) {
        const list = state.workspaceSessions[cwd];
        const next = list.filter((x) => x.sessionId !== id);
        workspaceSessions[cwd] = next;
        if (next.length !== list.length) removedCwd = cwd;
      }

      // Optimistically decrement the affected node's count (floored at 0).
      // A subsequent refresh corrects this against the on-disk truth.
      const workspaces =
        removedCwd == null
          ? state.workspaces
          : state.workspaces.map((w) =>
              w.cwd === removedCwd
                ? { ...w, sessionCount: Math.max(0, w.sessionCount - 1) }
                : w,
            );

      // Drop the deleted session's draft too, so the map doesn't grow forever.
      let drafts = state.drafts;
      if (Object.prototype.hasOwnProperty.call(state.drafts, id)) {
        drafts = { ...state.drafts };
        delete drafts[id];
      }

      return {
        independent,
        workspaceSessions,
        workspaces,
        drafts,
        currentSessionId:
          state.currentSessionId === id ? null : state.currentSessionId,
      };
    }),
}));
