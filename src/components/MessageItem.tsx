import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";
import type { ChatMessage } from "@/stores/session-store";

/**
 * Renders one chat message. Assistant messages are left-aligned and stream
 * their parts (text / thought / tool calls) in order; a blinking caret marks
 * the streaming message. User messages are right-aligned bubbles.
 */
export function MessageItem({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <div className="msg__bubble">
          {message.parts.map((p, i) =>
            p.kind === "text" ? <span key={i}>{p.text}</span> : null
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg--assistant">
      <div className="msg__avatar">◆</div>
      <div className="msg__body">
        {message.parts.map((p, i) => {
          if (p.kind === "text") {
            return <Markdown key={i}>{p.text}</Markdown>;
          }
          if (p.kind === "thought") {
            return (
              <details key={i} className="msg__thought">
                <summary>思考过程</summary>
                <Markdown>{p.text}</Markdown>
              </details>
            );
          }
          return <ToolCallCard key={i} tc={p.toolCall} />;
        })}
        {streaming && message.complete === false && (
          <span className="msg__caret">▋</span>
        )}
      </div>
    </div>
  );
}
