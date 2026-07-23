import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSessionStore, type ToolCallView } from "@/stores/session-store";
import { useSessionsStore } from "@/stores/sessions-store";
import { createMarkdownHostConfig } from "@/lib/markdown-host";
import { rewindExecute, rewindPoints } from "@/lib/grok-client";
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
  const plan = useSessionStore((s) => s.plan);
  const sessionId = useSessionStore((s) => s.sessionId);
  // 按会话持久化的输入草稿:切到本会话时回填,每次输入回写 store。
  // 选 setDraft 的稳定引用做回调,避免 sessionId 变化时让 Composer 收到新函数。
  const setDraft = useSessionsStore((s) => s.setDraft);
  const draft = useSessionsStore((s) =>
    sessionId ? s.drafts[sessionId] ?? "" : ""
  );
  // Read the expert name bound to the current session (for the composer badge).
  const activeExpertName = useSessionsStore((s) => {
    if (!sessionId) return undefined;
    const entry = s.independent.find((x) => x.sessionId === sessionId)
      ?? Object.values(s.workspaceSessions).flat().find((x) => x.sessionId === sessionId);
    return entry?.expertName;
  });
  const [planOpen, setPlanOpen] = useState(false);

  // ---- 消息"编辑重发":把消息文本回填到输入框 ----
  const [resendText, setResendText] = useState<string | undefined>(undefined);
  const [resendNonce, setResendNonce] = useState(0);
  const handleEditResend = useCallback((text: string) => {
    if (!text.trim()) return;
    setResendText(text);
    setResendNonce((n) => n + 1);
  }, []);

  // ---- 消息级"重试":回溯到最后一条用户 prompt 并重新发送（重新生成回复） ----
  const [retrying, setRetrying] = useState(false);
  const handleRetry = useCallback(async () => {
    if (!sessionId || streaming || retrying) return;
    // Find the last user message text.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      onToast?.("没有可重试的消息");
      return;
    }
    const userText = lastUserMsg.parts
      .filter((p) => p.kind === "text")
      .map((p) => p.text)
      .join("\n");
    if (!userText.trim()) return;

    setRetrying(true);
    try {
      // Rewind the conversation to the last user prompt (conversation only —
      // don't touch files), which drops the assistant turn we're regenerating.
      const points = await rewindPoints(sessionId);
      if (points.length === 0) {
        // Nothing to rewind — bailing here is important: without a rewind we
        // would just append a duplicate user turn on top of the old one.
        onToast?.("没有可回退的点，无法重试");
        return;
      }
      // Pick the latest point explicitly by promptIndex — don't rely on the
      // points array being sorted ascending (the order isn't documented).
      const lastPoint = points.reduce((a, b) =>
        b.promptIndex > a.promptIndex ? b : a,
      );
      await rewindExecute(sessionId, lastPoint.promptIndex, "conversation", true);
      onRewound?.();
      onSend(userText);
    } catch (e) {
      onToast?.(`重试失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setRetrying(false);
    }
  }, [sessionId, streaming, retrying, messages, onSend, onRewound, onToast]);

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
                <PlanPanel
                  sessionId={sessionId ?? undefined}
                  onSend={onSend}
                  onToast={onToast}
                />
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
            {messages.map((m, idx) => {
              // 重试只对最后一条 assistant 消息开放（重试中间消息没有语义）。
              const isLastAssistant =
                m.role === "assistant" && idx === messages.length - 1;
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  streaming={streaming && m.id === streamingMessageId}
                  markdownConfig={markdownConfig}
                  cwd={cwd}
                  onToast={onToast}
                  onOpenTool={handleOpenTool}
                  onEditResend={handleEditResend}
                  onRetry={
                    isLastAssistant && !streaming && m.complete
                      ? handleRetry
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
        <div className="chatview__footer">
          {/* Inline permission / question cards: session-scoped, never block sidebar. */}
          <PermissionInlineCard sessionId={sessionId} />
          <QuestionInlineCard sessionId={sessionId} />
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
            externalText={resendText}
            externalTextNonce={resendNonce}
            onSelectMode={onSelectMode}
            onSelectExpert={onSelectExpert}
            onNavigateConnectors={onNavigateConnectors}
            activeExpertName={activeExpertName}
            usageSessionId={sessionId ?? undefined}
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
