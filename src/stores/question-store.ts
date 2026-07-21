import { create } from "zustand";

export interface QuestionItem {
  id: string;
  question: string;
  options: string[];
}

export interface QuestionRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  title: string;
  questions: QuestionItem[];
  timeout?: number;
}

interface QuestionState {
  /** sessionId → ordered queue of pending question requests. */
  queues: Record<string, QuestionRequest[]>;
  /** Push a new question request from the backend. */
  request: (q: QuestionRequest) => void;
  /** Remove a question from its session's queue. */
  dismiss: (requestId: string, sessionId?: string) => void;
}

export const useQuestionStore = create<QuestionState>((set) => ({
  queues: {},
  request: (q) =>
    set((s) => {
      const sid = q.sessionId || "__global";
      const prev = s.queues[sid] ?? [];
      return { queues: { ...s.queues, [sid]: [...prev, q] } };
    }),
  dismiss: (requestId, sessionId) =>
    set((s) => {
      if (sessionId) {
        const prev = s.queues[sessionId];
        if (!prev) return s;
        return {
          queues: {
            ...s.queues,
            [sessionId]: prev.filter((q) => q.requestId !== requestId),
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

/** Select the first pending question for a given session. */
export const selectQuestionForSession =
  (sessionId: string | null) =>
  (s: QuestionState): QuestionRequest | null => {
    if (!sessionId) return null;
    return s.queues[sessionId]?.[0] ?? null;
  };
