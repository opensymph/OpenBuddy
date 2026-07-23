/**
 * Pending-expert store — tracks an expert that has been "summoned" from the
 * marketplace but whose conversation hasn't started yet (user hasn't hit send).
 *
 * Mirrors WorkBuddy's `pendingExpertActivation` / `setPendingExpert` pattern:
 * summon → set pending → navigate home → composer shows badge + pre-fills
 * quickPrompt → user sends → session created with hidden persona → cleared.
 */
import { create } from "zustand";

export interface PendingExpert {
  /** Display name (profession/title). */
  name: string;
  /** Full system prompt body (from agents/*.md, frontmatter stripped). */
  prompt: string;
  /** Short description (fallback / display). */
  description: string;
  /** Default init prompt to pre-fill in the composer. */
  quickPrompt?: string;
  /** Expert id for persistence. */
  expertId: string;
  /** Source: "marketplace" | "local". */
  source: string;
  /** Avatar preset or path (for the composer badge). */
  avatarLocal?: string;
}

interface PendingExpertState {
  /** The pending expert, or null if none selected. */
  expert: PendingExpert | null;
  /** Set the pending expert (called after "召唤" in the detail modal). */
  set: (expert: PendingExpert) => void;
  /** Clear the pending expert (called after send or manual dismiss). */
  clear: () => void;
}

export const usePendingExpertStore = create<PendingExpertState>((set) => ({
  expert: null,
  set: (expert) => set({ expert }),
  clear: () => set({ expert: null }),
}));
