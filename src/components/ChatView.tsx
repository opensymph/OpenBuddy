import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useSessionsStore } from "@/stores/sessions-store";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import { PlanPanel } from "./PlanPanel";
import { RewindBar } from "./RewindBar";
import type { ModelOption } from "./ModelSelector";
import type { WorkspaceInfo } from "@/lib/grok-client";

/** Center chat column: scrollable message list + composer pinned at bottom. */
export function ChatView({
  onSend,
  onCancel,
  modelId,
  models,
  onModelChange,
  cwd,
  workspaces,
  onSelectWorkspace,
}: {
  onSend: (text: string) => void;
  onCancel: () => void;
  modelId?: string;
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
  cwd?: string;
  workspaces?: WorkspaceInfo[];
  onSelectWorkspace?: (cwd: string) => void;
}) {
  const messages = useSessionStore((s) => s.messages);
  const streaming = useSessionStore((s) => s.streaming);
  const streamingMessageId = useSessionStore((s) => s.streamingMessageId);
  const error = useSessionStore((s) => s.error);
  const usage = useSessionStore((s) => s.usage);
  const plan = useSessionStore((s) => s.plan);
  const sessionId = useSessionStore((s) => s.sessionId);
  // 按会话持久化的输入草稿:切到本会话时回填,每次输入回写 store。
  // 选 setDraft 的稳定引用做回调,避免 sessionId 变化时让 Composer 收到新函数。
  const setDraft = useSessionsStore((s) => s.setDraft);
  const draft = useSessionsStore((s) =>
    sessionId ? s.drafts[sessionId] ?? "" : ""
  );
  const [planOpen, setPlanOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="chatview">
      {error && (
        <div className="chatview__error-banner" role="alert">
          <span className="chatview__error-text">{error}</span>
          <button
            className="chatview__error-close"
            onClick={() => useSessionStore.getState().setError(null)}
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
      )}
      {/* Plan toggle: floating button on the right when there's a plan. */}
      {plan && plan.entries.length > 0 && (
        <>
          <button
            className={`chatview__plan-toggle ${planOpen ? "chatview__plan-toggle--active" : ""}`}
            onClick={() => setPlanOpen((v) => !v)}
            title="执行计划"
          >
            计划 {plan.entries.filter((e) => e.status === "completed").length}/
            {plan.entries.length}
          </button>
          {planOpen && (
            <div className="chatview__plan-panel">
              <PlanPanel />
            </div>
          )}
        </>
      )}
      <div className="chatview__scroll" ref={scrollRef}>
        <div className="chatview__inner">
          {messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              streaming={streaming && m.id === streamingMessageId}
            />
          ))}
        </div>
      </div>
      <div className="chatview__footer">
        {streaming && usage.totalTokens ? (
          <div className="chatview__tokens">{usage.totalTokens} tokens</div>
        ) : null}
        {/* Rewind / fork: 会话级工具，放在输入框正上方（不再漂浮到左上角挡标题栏）。 */}
        {sessionId && !streaming && <RewindBar sessionId={sessionId} />}
        <Composer
          streaming={streaming}
          onSend={onSend}
          onCancel={onCancel}
          modelId={modelId}
          models={models}
          onModelChange={onModelChange}
          cwd={cwd}
          workspaces={workspaces}
          onSelectWorkspace={onSelectWorkspace}
          showDisclaimer
          draft={draft}
          draftKey={sessionId ?? undefined}
          onDraftChange={
            sessionId ? (t) => setDraft(sessionId, t) : undefined
          }
        />
      </div>
    </div>
  );
}
