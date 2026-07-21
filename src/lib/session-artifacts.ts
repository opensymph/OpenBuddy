import type { ChatMessage, ToolCallView } from "@/stores/session-store";
import type { DiffContent } from "@/lib/types";

/** A file (or path) produced / touched by tools in the current transcript. */
export interface SessionArtifact {
  id: string;
  path: string;
  /** Tool kind that last touched this path (edit / shell / …). */
  kind: string;
  /** Last tool call title. */
  title: string;
  toolCallId: string;
  status: ToolCallView["status"];
}

/**
 * Collect unique file paths from tool-call parts in the transcript.
 * Used by the Artifacts side panel (Phase 3).
 */
export function collectSessionArtifacts(messages: ChatMessage[]): SessionArtifact[] {
  const byPath = new Map<string, SessionArtifact>();

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (part.kind !== "tool_call") continue;
      const tc = part.toolCall;
      for (const path of extractPathsFromToolCall(tc)) {
        const key = path.replace(/\\/g, "/").toLowerCase();
        byPath.set(key, {
          id: key,
          path,
          kind: tc.kind,
          title: tc.title,
          toolCallId: tc.toolCallId,
          status: tc.status,
        });
      }
    }
  }

  return Array.from(byPath.values());
}

function extractPathsFromToolCall(tc: ToolCallView): string[] {
  const out: string[] = [];

  for (const c of tc.content) {
    if (c.type === "diff") {
      const d = c as DiffContent;
      if (d.diff?.path) out.push(d.diff.path);
    }
  }

  // rawInput may carry path / file / target fields from grok tools.
  if (tc.rawInput && typeof tc.rawInput === "object") {
    const o = tc.rawInput as Record<string, unknown>;
    for (const key of ["path", "file", "file_path", "filepath", "target", "filename"]) {
      const v = o[key];
      if (typeof v === "string" && looksLikePath(v)) out.push(v);
    }
    // arrays of paths
    for (const key of ["paths", "files"]) {
      const v = o[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === "string" && looksLikePath(item)) out.push(item);
        }
      }
    }
  }

  // Title heuristics: Write `C:\…\foo.txt`
  const m = tc.title.match(
    /(?:Write|Edit|Read|Create|Delete|Open)\s+[`'"]?([A-Za-z]:\\[^\s`'"]+|\/[^\s`'"]+|~\/[^\s`'"]+|[^`'"]+\.[A-Za-z0-9]{1,8})[`'"]?/i,
  );
  if (m?.[1] && looksLikePath(m[1])) out.push(m[1]);

  return out;
}

function looksLikePath(s: string): boolean {
  if (!s || s.length < 2 || s.length > 512) return false;
  if (s.includes("\n")) return false;
  // Windows drive, UNC, unix absolute, home, or relative with extension/slash
  return (
    /^[A-Za-z]:[\\/]/.test(s) ||
    s.startsWith("\\\\") ||
    s.startsWith("/") ||
    s.startsWith("~/") ||
    /[\\/]/.test(s) ||
    /\.[A-Za-z0-9]{1,8}$/.test(s)
  );
}

/** Find a tool call by id across the transcript. */
export function findToolCall(
  messages: ChatMessage[],
  toolCallId: string,
): ToolCallView | undefined {
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.kind === "tool_call" && part.toolCall.toolCallId === toolCallId) {
        return part.toolCall;
      }
    }
  }
  return undefined;
}
