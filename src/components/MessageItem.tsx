import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";
import { LoadingRow } from "./LoadingRow";
import type { ChatMessage } from "@/stores/session-store";

/**
 * Renders one chat message. Assistant messages are left-aligned with avatar +
 * name row; user messages are right-aligned bubbles with no avatar / name.
 */
export function MessageItem({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
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
              return <Markdown key={i}>{p.text}</Markdown>;
            }
            if (p.kind === "thought") {
              return (
                <details key={i} className="msg__thought">
                  <summary>深度思考</summary>
                  <div className="msg__thought-body">
                    <Markdown>{p.text}</Markdown>
                  </div>
                </details>
              );
            }
            return <ToolCallCard key={i} tc={p.toolCall} />;
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
