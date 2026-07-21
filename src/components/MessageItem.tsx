import { Markdown, type MarkdownConfig } from "./markdown/index";
import { ToolCallCard } from "./ToolCallCard";
import { LoadingRow } from "./LoadingRow";
import { useTheme } from "./ThemeProvider";
import type { ChatMessage, ToolCallView } from "@/stores/session-store";

/**
 * Renders one chat message. Assistant messages are left-aligned with avatar +
 * name row; user messages are right-aligned bubbles with no avatar / name.
 */
export function MessageItem({
  message,
  streaming,
  markdownConfig,
  onOpenTool,
}: {
  message: ChatMessage;
  streaming: boolean;
  markdownConfig?: MarkdownConfig;
  /** @deprecated kept for call-site compatibility; unused after compact tools. */
  cwd?: string;
  /** @deprecated kept for call-site compatibility; unused after compact tools. */
  onToast?: (msg: string) => void;
  /** Open tool detail in the right-side panel (Phase 2). */
  onOpenTool?: (tc: ToolCallView) => void;
}) {
  const { theme } = useTheme();
  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div>
          <div className="msg__bubble">
            {message.parts.map((p, i) =>
              p.kind === "text" ? <span key={i}>{p.text}</span> : null
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
