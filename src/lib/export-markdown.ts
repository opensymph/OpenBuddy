/**
 * 会话导出为 Markdown — 从 session-store 的 messages 构建一份可读的
 * Markdown 文档（用户问题 / 助手回答 / 思考过程 / 工具调用摘要）。
 *
 * 对齐 WorkBuddy 的"导出对话"功能。
 */
import type { ChatMessage } from "@/stores/session-store";

/** Build a Markdown document from a session's message list. */
export function buildSessionMarkdown(
  messages: ChatMessage[],
  title?: string,
): string {
  const lines: string[] = [];
  lines.push(`# ${title || "对话导出"}`);
  lines.push("");
  lines.push(`> 导出于 ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const m of messages) {
    if (m.role === "user") {
      const text = m.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
      if (!text.trim()) continue;
      lines.push("## 🧑 用户");
      lines.push("");
      lines.push(text);
      lines.push("");
    } else {
      // Assistant message: text + thought + tool calls.
      const textParts: string[] = [];
      const thoughtParts: string[] = [];
      const toolCalls: { title: string; status: string; kind: string }[] = [];

      for (const p of m.parts) {
        if (p.kind === "text") textParts.push(p.text);
        else if (p.kind === "thought") thoughtParts.push(p.text);
        else if (p.kind === "tool_call") {
          toolCalls.push({
            title: p.toolCall.title,
            status: p.toolCall.status,
            kind: p.toolCall.kind,
          });
        }
      }

      if (textParts.length === 0 && thoughtParts.length === 0 && toolCalls.length === 0) continue;

      lines.push("## 🤖 Buddy");
      lines.push("");

      for (const t of thoughtParts) {
        lines.push("> **深度思考**");
        lines.push(">");
        for (const line of t.split("\n")) {
          lines.push(`> ${line}`);
        }
        lines.push("");
      }

      if (textParts.length > 0) {
        lines.push(textParts.join("\n\n"));
        lines.push("");
      }

      if (toolCalls.length > 0) {
        lines.push("**工具调用：**");
        lines.push("");
        for (const tc of toolCalls) {
          const icon = tc.status === "completed" ? "✅" : tc.status === "failed" ? "❌" : "⏳";
          lines.push(`- ${icon} \`${tc.kind}\` — ${tc.title}`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/** Sanitize a string for use as a filename. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80)
    .replace(/^[._]+/, "") || "对话导出";
}
