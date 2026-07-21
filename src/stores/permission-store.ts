import { create } from "zustand";
import type { PermissionRequest } from "@/lib/types";

/**
 * Permission requests indexed by sessionId. Each session owns its own queue
 * so the inline permission card only shows requests for the active session,
 * and switching conversations is never blocked.
 */
interface PermissionState {
  /** sessionId → ordered queue of pending permission requests. */
  queues: Record<string, PermissionRequest[]>;
  /** Push a new request emitted by the backend. */
  request: (p: PermissionRequest) => void;
  /** Remove a request from its session's queue (without resolving the agent). */
  dismiss: (requestId: string, sessionId?: string) => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  queues: {},
  request: (p) =>
    set((s) => {
      const sid = p.sessionId || "__global";
      const prev = s.queues[sid] ?? [];
      return { queues: { ...s.queues, [sid]: [...prev, p] } };
    }),
  dismiss: (requestId, sessionId) =>
    set((s) => {
      if (sessionId) {
        const sid = sessionId;
        const prev = s.queues[sid];
        if (!prev) return s;
        return {
          queues: {
            ...s.queues,
            [sid]: prev.filter((q) => q.requestId !== requestId),
          },
        };
      }
      const queues = { ...s.queues };
      for (const sid of Object.keys(queues)) {
        queues[sid] = queues[sid].filter((q) => q.requestId !== requestId);
      }
      return { queues };
    }),
}));

/** Select the first pending permission for a given session. */
export const selectPermissionForSession =
  (sessionId: string | null) =>
  (s: PermissionState): PermissionRequest | null => {
    if (!sessionId) return null;
    return s.queues[sessionId]?.[0] ?? null;
  };

/** Legacy: head of all queues (used nowhere after migration to inline). */
export const selectPermissionHead = (s: PermissionState): PermissionRequest | null => {
  for (const sid of Object.keys(s.queues)) {
    if (s.queues[sid].length > 0) return s.queues[sid][0];
  }
  return null;
};
