import { useCallback } from "react";
import { Markdown, type MarkdownConfig } from "./markdown/index";
import { ToolCallCard } from "./ToolCallCard";
import { LoadingRow } from "./LoadingRow";
import { useTheme } from "./ThemeProvider";
import type { ChatMessage, ToolCallView } from "@/stores/session-store";
import { EXPERT_PERSONA_BEGIN, EXPERT_PERSONA_END } from "@/App";

/** Strip the hidden expert persona block from text (used on history replay). */
function stripPersona(text: string): string {
  const begin = text.indexOf(EXPERT_PERSONA_BEGIN);
  if (begin === -1) return text;
  const end = text.indexOf(EXPERT_PERSONA_END, begin);
  if (end === -1) return text;
  const after = end + EXPERT_PERSONA_END.length;
  // Also strip trailing newlines after the end marker.
  const rest = text.slice(after).replace(/^\n+/, "");
  return (text.slice(0, begin) + rest).trim();
}

/**
 * Renders one chat message. Assistant messages are left-aligned with avatar +
 * name row; user messages are right-aligned bubbles with no avatar / name.
 *
 * Hover action bar (对齐 WorkBuddy):
 *  - user: 复制 / 编辑重发
 *  - assistant: 复制 / 复制 Markdown
 */
export function MessageItem({
  message,
  streaming,
  markdownConfig,
  onOpenTool,
  onEditResend,
  onRetry,
  onToast,
}: {
  message: ChatMessage;
  streaming: boolean;
  markdownConfig?: MarkdownConfig;
  /** @deprecated kept for call-site compatibility; unused after compact tools. */
  cwd?: string;
  onToast?: (msg: string) => void;
  /** Open tool detail in the right-side panel (Phase 2). */
  onOpenTool?: (tc: ToolCallView) => void;
  /** Put text back into the composer for re-editing (user messages only). */
  onEditResend?: (text: string) => void;
  /** Regenerate this response (last assistant message only): rewinds the
   *  conversation to the preceding user prompt and resends it. */
  onRetry?: () => void;
}) {
  const { theme } = useTheme();

  const copyText = useCallback(
    (text: string, label: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => onToast?.(label))
          .catch(() => onToast?.("复制失败"));
      } else {
        onToast?.("当前环境不支持剪贴板");
      }
    },
    [onToast],
  );

  /** Extract plain text from all text parts (for copy), stripping hidden persona. */
  const plainText = message.parts
    .filter((p) => p.kind === "text")
    .map((p) => (message.role === "user" ? stripPersona(p.text) : p.text))
    .join("\n");

  /** Extract markdown (text + thought) for "copy as markdown". */
  const markdownText = message.parts
    .map((p) => {
      if (p.kind === "text") return p.text;
      if (p.kind === "thought") return `<details>\n<summary>深度思考</summary>\n\n${p.text}\n\n</details>`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div>
          <div className="msg__bubble">
            {message.parts.map((p, i) =>
              p.kind === "text" ? <span key={i}>{stripPersona(p.text)}</span> : null
            )}
          </div>
          {/* Hover actions */}
          <div className="msg__actions">
            <button
              type="button"
              className="msg__action-btn"
              onClick={() => copyText(plainText, "已复制")}
              title="复制"
            >
              复制
            </button>
            {onEditResend && (
              <button
                type="button"
                className="msg__action-btn"
                onClick={() => onEditResend(plainText)}
                title="编辑并重新发送"
              >
                编辑
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg--assistant">
      <div>
        <div className="msg__header">
          <span className="msg__avatar">B</span>
          <span className="msg__name">Buddy</span>
          {/* Hover actions — inline in header for assistant messages */}
          {message.complete && (
            <div className="msg__actions msg__actions--inline">
              <button
                type="button"
                className="msg__action-btn"
                onClick={() => copyText(plainText, "已复制")}
                title="复制纯文本"
              >
                复制
              </button>
              <button
                type="button"
                className="msg__action-btn"
                onClick={() => copyText(markdownText, "已复制 Markdown")}
                title="复制 Markdown 源码"
              >
                MD
              </button>
              {onRetry && (
                <button
                  type="button"
                  className="msg__action-btn"
                  onClick={onRetry}
                  title="重新生成回复（回溯后重发）"
                >
                  重试
                </button>
              )}
            </div>
          )}
        </div>
        <div className="msg__body">
          {/* Placeholder state: the assistant message exists but no content
              has streamed in yet. Render the avatar (header above) + the
              shimmering "preparing / waiting for model" loading row with a
              rotating tip — mirrors WorkBuddy's pending-assistant view. */}
          {message.parts.length === 0 && !message.complete && <LoadingRow />}
          {message.parts.map((p, i) => {
            if (p.kind === "text") {
              return (
                <Markdown
                  key={i}
                  complete={message.complete}
                  markdownTheme="loose"
                  theme={theme}
                  config={markdownConfig}
                >
                  {p.text}
                </Markdown>
              );
            }
            if (p.kind === "thought") {
              return (
                <details key={i} className="msg__thought">
                  <summary>深度思考</summary>
                  <div className="msg__thought-body">
                    <Markdown
                      complete={message.complete}
                      markdownTheme="reasoning"
                      theme={theme}
                      config={markdownConfig}
                    >
                      {p.text}
                    </Markdown>
                  </div>
                </details>
              );
            }
            return (
              <ToolCallCard
                key={p.toolCall.toolCallId || i}
                tc={p.toolCall}
                onOpen={onOpenTool}
              />
            );
          })}
          {streaming &&
            message.complete === false &&
            message.parts.length > 0 && (
              <span className="msg__caret">▋</span>
            )}
        </div>
      </div>
    </div>
  );
}
