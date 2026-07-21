import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSessionStore, type ToolCallView } from "@/stores/session-store";
import { useSessionsStore } from "@/stores/sessions-store";
import { createMarkdownHostConfig } from "@/lib/markdown-host";
import {
  collectSessionArtifacts,
  findToolCall,
  type SessionArtifact,
} from "@/lib/session-artifacts";
import { MessageItem } from "./MessageItem";
import { Composer } from "./Composer";
import { PlanPanel } from "./PlanPanel";
import { RewindBar } from "./RewindBar";
import { PermissionInlineCard } from "./PermissionDialog";
import { QuestionInlineCard } from "./QuestionInlineCard";
import { ToolSidePanel, type ToolSidePanelMode } from "./ToolSidePanel";
import type { ModelOption } from "./ModelSelector";
import type { HomeModeId } from "./home-scenes";
import type { AgentEntry } from "@/lib/types";
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
  onRewound,
  onForked,
  onToast,
  onSelectMode,
  onSelectExpert,
  onNavigateConnectors,
}: {
  onSend: (text: string) => void;
  onCancel: () => void;
  modelId?: string;
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
  cwd?: string;
  workspaces?: WorkspaceInfo[];
  onSelectWorkspace?: (cwd: string) => void;
  /** Rewind rewrote backend history — reload the transcript. */
  onRewound?: () => void;
  /** Fork created a new session id — navigate to it. */
  onForked?: (newSessionId: string) => void;
  /** Surface transient feedback from the rewind/fork toolbar. */
  onToast?: (msg: string) => void;
  onSelectMode?: (modeId: HomeModeId) => void;
  onSelectExpert?: (agent: AgentEntry) => void;
  onNavigateConnectors?: () => void;
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

  // ---- Phase 2/3: tool detail + artifacts side panel ----
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<ToolSidePanelMode>("tool");
  const [activeTool, setActiveTool] = useState<ToolCallView | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const artifacts = useMemo(() => collectSessionArtifacts(messages), [messages]);

  // Keep active tool fresh when streaming updates status/content.
  useEffect(() => {
    if (!activeTool) return;
    const fresh = findToolCall(messages, activeTool.toolCallId);
    if (fresh && fresh !== activeTool) setActiveTool(fresh);
  }, [messages, activeTool]);

  // Close panel when switching sessions.
  useEffect(() => {
    setPanelOpen(false);
    setActiveTool(null);
    setPreviewPath(null);
  }, [sessionId]);

  const handleOpenTool = useCallback((tc: ToolCallView) => {
    setActiveTool(tc);
    setPreviewPath(null);
    setPanelMode("tool");
    setPanelOpen(true);
  }, []);

  const handleSelectArtifact = useCallback((a: SessionArtifact) => {
    setPreviewPath(a.path);
    setPanelMode("preview");
    setPanelOpen(true);
  }, []);

  const handleOpenArtifacts = useCallback(() => {
    setPanelMode("artifacts");
    setPanelOpen(true);
  }, []);

  const markdownConfig = useMemo(
    () =>
      createMarkdownHostConfig({
        cwd,
        sessionId,
        onToast,
      }),
    [cwd, sessionId, onToast],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className={"chatview" + (panelOpen ? " chatview--with-panel" : "")}>
      <div className="chatview__main">
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

        {/* Artifacts entry — always available when there are outputs. */}
        {artifacts.length > 0 && (
          <button
            type="button"
            className={
              "chatview__artifacts-toggle" +
              (panelOpen && panelMode === "artifacts"
                ? " chatview__artifacts-toggle--active"
                : "")
            }
            onClick={() => {
              if (panelOpen && panelMode === "artifacts") {
                setPanelOpen(false);
              } else {
                handleOpenArtifacts();
              }
            }}
            title="本会话产物"
          >
            产物 {artifacts.length}
          </button>
        )}

        <div className="chatview__scroll" ref={scrollRef}>
          <div className="chatview__inner">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                streaming={streaming && m.id === streamingMessageId}
                markdownConfig={markdownConfig}
                cwd={cwd}
                onToast={onToast}
                onOpenTool={handleOpenTool}
              />
            ))}
          </div>
        </div>
        <div className="chatview__footer">
          {/* Inline permission / question cards: session-scoped, never block sidebar. */}
          <PermissionInlineCard sessionId={sessionId} />
          <QuestionInlineCard sessionId={sessionId} />
          {streaming && usage.totalTokens ? (
            <div className="chatview__tokens">{usage.totalTokens} tokens</div>
          ) : null}
          {/* Rewind / fork: 会话级工具，放在输入框正上方（不再漂浮到左上角挡标题栏）。 */}
          {sessionId && !streaming && (
            <RewindBar
              sessionId={sessionId}
              cwd={cwd}
              onRewound={onRewound}
              onForked={onForked}
              onToast={onToast}
            />
          )}
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
            permissionInline
            onToast={onToast}
            draft={draft}
            draftKey={sessionId ?? undefined}
            onDraftChange={
              sessionId ? (t) => setDraft(sessionId, t) : undefined
            }
            onSelectMode={onSelectMode}
            onSelectExpert={onSelectExpert}
            onNavigateConnectors={onNavigateConnectors}
          />
        </div>
      </div>

      <ToolSidePanel
        open={panelOpen}
        mode={panelMode}
        toolCall={activeTool}
        artifacts={artifacts}
        previewPath={previewPath}
        cwd={cwd}
        onToast={onToast}
        onClose={() => setPanelOpen(false)}
        onSelectTool={(tc) => {
          setActiveTool(tc);
          setPreviewPath(null);
          setPanelMode("tool");
          setPanelOpen(true);
        }}
        onSelectArtifact={handleSelectArtifact}
        onOpenArtifacts={handleOpenArtifacts}
        findToolCall={(id) => findToolCall(messages, id)}
      />
    </div>
  );
}
