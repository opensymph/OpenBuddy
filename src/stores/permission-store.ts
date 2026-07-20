import { create } from "zustand";
import type { PermissionRequest } from "@/lib/types";

/**
 * Permission requests queue. The backend emits `grok://permission` whenever
 * the agent asks for approval (write/edit/execute). The UI shows the head of
 * the queue as a modal; resolving it calls `grok_resolve_permission` and the
 * backend unblocks the agent's oneshot.
 *
 * Note: Zustand store objects are plain records — no JS getters. Components
 * read `queue[0]` via the selector hook instead.
 */
interface PermissionState {
  queue: PermissionRequest[];
  /** Push a new request emitted by the backend. */
  request: (p: PermissionRequest) => void;
  /** Remove a request from the queue (without resolving the agent). */
  dismiss: (requestId: string) => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  queue: [],
  request: (p) => set((s) => ({ queue: [...s.queue, p] })),
  dismiss: (requestId) =>
    set((s) => ({ queue: s.queue.filter((q) => q.requestId !== requestId) })),
}));

/** Selector for the head of the queue (the modal to render). */
export const selectPermissionHead = (s: PermissionState): PermissionRequest | null =>
  s.queue[0] ?? null;
