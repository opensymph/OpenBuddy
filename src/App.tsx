import { useEffect, useRef, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./components/HomePage";
import { ChatView } from "./components/ChatView";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { Toast } from "./components/Toast";
import { PermissionDialog } from "./components/PermissionDialog";
import { ThemeProvider } from "./components/ThemeProvider";
import { SettingsPanel } from "./components/SettingsPanel";
import { SearchOverlay } from "./components/SearchOverlay";
import { AboutDialog } from "./components/AboutDialog";
import { FolderTrustDialog } from "./components/FolderTrustDialog";
import { TasksPanel } from "./components/TasksPanel";
import { SidebarToggleIcon, WbNewTaskIcon } from "./foundation/components/Icon/icons";
import type { ModelOption } from "./components/ModelSelector";
import { useSessionStore } from "./stores/session-store";
import { useSessionsStore } from "./stores/sessions-store";
import { usePermissionStore } from "./stores/permission-store";
import { TopbarTitle } from "./components/TopbarTitle";
import {
  grokInit,
  grokNewSession,
  grokSend,
  grokCancel,
  grokLoadSession,
  grokListSessions,
  grokListWorkspaces,
  grokRenameSession,
  grokSetModel,
  providersList,
  notificationAppend,
  subscribeGrokEvents,
  type InitResult,
  type WorkspaceInfo,
} from "./lib/grok-client";
import type { AgentEntry } from "./lib/types";
import type { ProjectMeta } from "./stores/projects-store";
import { IS_MACOS } from "./lib/platform";

/**
 * Derive a short sidebar title from the user's first message.
 * Mirrors grok's `title_fallback_from_user_text`: strip system/skill markup,
 * take the first ~10 words, cap at 40 chars.
 */
function deriveTitle(text: string): string {
  // Strip <system-reminder>…</system-reminder> blocks (system-injected context).
  let clean = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  // Strip skill XML markup (<command-name>…</command-name> etc.).
  clean = clean.replace(/<\/?command-(?:name|message|args)>/g, "").trim();
  if (!clean) clean = text.trim();
  // Take first 10 whitespace-delimited words.
  const words = clean.split(/\s+/).slice(0, 10).join(" ");
  if (!words) return "新会话";
  return words.length > 40 ? words.slice(0, 40) + "…" : words;
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const [init, setInit] = useState<InitResult | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [trustRequest, setTrustRequest] = useState<{ cwd?: string; reason?: string } | null>(null);
  const [taskRefreshSignal, setTaskRefreshSignal] = useState(0);
  const [placeholderView, setPlaceholderView] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string | undefined>(undefined);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cwdRef = useRef<string>("");

  const sessionStore = useSessionStore;
  const sessionsStore = useSessionsStore;
  const permissionStore = usePermissionStore;

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const result = await grokInit();
        // grok rejects an empty cwd ("Path is not absolute"), so every session
        // needs an absolute path. We treat grok's initial cwd as the "inbox":
        // 新建任务 aims at it (⇒ 任务 group), and the user can re-aim a new
        // session at another directory via the Composer workspace picker
        // (⇒ that 空间 node). homeCwd drives the store's group routing.
        cwdRef.current = result.cwd;
        sessionsStore.getState().setHomeCwd(result.cwd);
        setInit(result);
        setCurrentModelId(result.defaultModelId);

        unlisten = await subscribeGrokEvents({
          onUpdate: (u) => {
            console.log('[OpenBuddy] Received grok://update:', u);
            sessionStore.getState().applyUpdate(u);
          },
          onPermission: (p) => {
            console.log('[OpenBuddy] Received grok://permission:', p);
            permissionStore.getState().request(p);
            void notificationAppend(
              "permission",
              p.options?.[0]?.title ?? "工具执行权限请求",
              undefined,
              p.sessionId,
              "warn",
            );
          },
          onComplete: (p) => {
            console.log('[OpenBuddy] Received grok://complete:', p);
            // Ignore completes for side-channel sessions (inspiration generation)
            // — they're handled by their own listeners, not the main transcript.
            const currentSessionId = sessionStore.getState().sessionId;
            if (currentSessionId && p.sessionId && p.sessionId !== currentSessionId) {
              return;
            }
            sessionStore.getState().markComplete(p);
            void notificationAppend(
              "session_complete",
              `会话完成（${p.stopReason ?? "end_turn"}）`,
              undefined,
              p.sessionId,
              "info",
            );
          },
          onSummary: ({ sessionId, title }) => {
            // grok generated (or we renamed) a session title — update the
            // sidebar entry in place. This overrides the "新会话" placeholder
            // set optimistically in handleSendNew. Stamp updatedAt so the
            // sidebar can re-sort the freshly-active session to the top.
            console.log('[OpenBuddy] Received grok://summary:', { sessionId, title });
            sessionsStore.getState().upsert({
              sessionId,
              title,
              updatedAt: new Date().toISOString(),
            });
            void notificationAppend(
              "summary",
              `生成会话标题：${title}`,
              undefined,
              sessionId,
              "info",
            );
          },
          onFolderTrust: (p) => {
            // grok asks the user to trust a folder before running tools.
            const req = (p ?? {}) as { cwd?: string; reason?: string };
            setTrustRequest({ cwd: req.cwd, reason: req.reason });
            void notificationAppend(
              "folder_trust",
              `请求信任文件夹：${req.cwd ?? "(unknown)"}`,
              req.reason,
              undefined,
              "warn",
            );
          },
          onPlanMode: (p) => {
            // Plan mode toggled (by us or by grok). Mirror into the session store.
            const payload = (p ?? {}) as { enabled?: boolean };
            if (typeof payload.enabled === "boolean") {
              sessionStore.getState().setPlanMode(payload.enabled);
              void notificationAppend(
                "plan_mode",
                payload.enabled ? "进入计划模式" : "退出计划模式",
                undefined,
                undefined,
                "info",
              );
            }
          },
          onMcpStatus: (p) => {
            void notificationAppend(
              "mcp_status",
              "MCP 连接器状态变化",
              typeof p === "string" ? p : JSON.stringify(p).slice(0, 200),
              undefined,
              "info",
            );
          },
          onModelsUpdate: (p) => {
            // grok reloaded its model catalog — refresh the picker so new
            // providers appear without a restart.
            providersList().then((list) => {
              setModels(list.map((m) => ({ id: m.modelId, label: m.name || m.modelId })));
            }).catch(() => {});
            void notificationAppend(
              "models_update",
              "模型列表已更新",
              typeof p === "string" ? p : JSON.stringify(p).slice(0, 200),
              undefined,
              "info",
            );
          },
          onTaskUpdate: () => {
            // A background task changed state — bump the signal so TasksPanel refreshes.
            setTaskRefreshSignal((n) => n + 1);
            void notificationAppend(
              "task_update",
              "后台任务状态变化",
              undefined,
              undefined,
              "info",
            );
          },
        });

        // Sidebar now shows two groups: 任务 (the inbox cwd's sessions) +
        // 空间 (one node per other working directory). Load both up front;
        // 空间 node children are lazy-loaded when a node is expanded.
        const [independent, ws] = await Promise.all([
          grokListSessions(result.cwd),
          grokListWorkspaces(),
        ]);
        sessionsStore.getState().setIndependent(independent);
        sessionsStore.getState().setWorkspaces(ws);
        setWorkspaces(ws);

        // Load the model list (from config.toml [model.*]) for the picker.
        // Each provider becomes one ModelOption; the id is the grok routing slug.
        const providers = await providersList();
        const providerOptions = providers.map((p) => ({ id: p.modelId, label: p.name || p.modelId }));
        setModels(providerOptions);

        // IMPORTANT: grok's initialize response reports `currentModelId` from
        // its internal catalog, which defaults to `grok-build` (the built-in
        // bundled model) when the user's configured custom model (e.g. glm-5
        // via a BYOK [model.*] entry) isn't recognized as a catalog entry.
        // If we trust grok's default blindly, every prompt goes out with
        // modelId="grok-build" and gets rejected by the user's provider
        // (which only knows their custom model id). So: when the user has
        // configured at least one BYOK provider, prefer the first one over
        // grok's reported default. This matches the "set [models] default"
        // intent and makes the out-of-box BYOK experience work.
        if (providerOptions.length > 0) {
          const grokDefault = result.defaultModelId;
          const grokDefaultIsKnownProvider = providerOptions.some(
            (p) => p.id === grokDefault,
          );
          if (!grokDefaultIsKnownProvider) {
            // grok's default (likely "grok-build") isn't in our provider list —
            // fall back to the first configured provider so prompts actually
            // reach the user's endpoint.
            setCurrentModelId(providerOptions[0].id);
          }
        }
      } catch (e) {
        setInitError(String(e));
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [sessionStore, sessionsStore, permissionStore]);

  const currentSessionId = sessionsStore((s) => s.currentSessionId);
  // The active session's sidebar entry (title + cwd), looked up across the
  // 任务 + 空间 groups — drives the topbar title on the conversation page and
  // the cwd scoping of a manual rename (mirrors WorkBuddy's topbar).
  const currentEntry = sessionsStore((s) => {
    const id = s.currentSessionId;
    if (!id) return undefined;
    const inTasks = s.independent.find((x) => x.sessionId === id);
    if (inTasks) return inTasks;
    for (const cwd of Object.keys(s.workspaceSessions)) {
      const hit = s.workspaceSessions[cwd].find((x) => x.sessionId === id);
      if (hit) return hit;
    }
    return undefined;
  });
  const currentTitle = currentEntry?.title || "";
  const streaming = sessionStore((s) => s.streaming);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  const handlePlaceholder = (label: string) => {
    // Route a few sidebar shortcut buttons to real panels instead of toasts.
    if (label === "筛选") {
      setSearchOpen(true);
      return;
    }
    if (label === "用户中心") {
      setSettingsOpen(true);
      return;
    }
    if (label === "通知") {
      // Open the settings → 智能体邮箱（会话通知中心）tab where all grok
      // events are logged.
      setSettingsOpen(true);
      return;
    }
    showToast(`${label} 即将上线`);
  };
  const handleNavigate = (label: string) => {
    setPlaceholderView(label);
    sessionsStore.getState().setCurrent(null);
    sessionStore.getState().reset();
  };

  const handleSendNew = async (text: string) => {
    console.log('[OpenBuddy] handleSendNew called with:', text);
    try {
      const cwd = cwdRef.current;
      console.log('[OpenBuddy] Creating new session with cwd:', cwd, 'modelId:', currentModelId);
      const sessionId = await grokNewSession(cwd, currentModelId);
      console.log('[OpenBuddy] New session created:', sessionId);
      sessionsStore.getState().setCurrent(sessionId);
      // 从占位视图（如「本地助理」页）发起会话后，切到 ChatView 看回复。
      setPlaceholderView(null);
      // Placeholder title derived from the user's first message. grok will
      // push the LLM-generated title via the grok://summary event
      // (SessionSummaryGenerated) within a few seconds, which our onSummary
      // handler applies to the same store entry, overriding this fallback.
      sessionsStore.getState().upsert({ sessionId, title: deriveTitle(text), cwd });
      sessionStore.getState().setSession(sessionId);
      sessionStore.getState().pushUser(text);
      sessionStore.getState().startStreaming();
      console.log('[OpenBuddy] Sending prompt to grok...');
      await grokSend(sessionId, text);
      console.log('[OpenBuddy] Prompt sent successfully, waiting for events...');
    } catch (e) {
      console.error('[OpenBuddy] handleSendNew error:', e);
      sessionStore.getState().setError(String(e));
    }
  };

  const handleSendCurrent = async (text: string) => {
    if (!currentSessionId) return handleSendNew(text);
    // Guard against double-send / send-during-streaming. Composer also guards
    // via its `streaming` prop, but that value can be stale within the same
    // render tick; the store flag is the source of truth. A second pushUser +
    // startStreaming would orphan an empty placeholder that never completes.
    if (sessionStore.getState().streaming) return;
    try {
      sessionStore.getState().pushUser(text);
      sessionStore.getState().startStreaming();
      await grokSend(currentSessionId, text);
    } catch (e) {
      sessionStore.getState().setError(String(e));
    }
  };

  const handleCancel = async () => {
    if (!currentSessionId) return;
    try {
      await grokCancel(currentSessionId);
    } catch (e) {
      sessionStore.getState().setError(String(e));
    } finally {
      // Don't rely on the backend emitting a `complete` for the cancel (it may
      // be dropped by routing after a fast switch). Finalize locally so the
      // Composer's stop button and the loading row don't hang. Already-streamed
      // text is kept; only the in-flight flag is cleared.
      sessionStore.getState().stopStreaming();
    }
  };

  // Topbar title rename — grok's `x.ai/session/rename`. grok broadcasts
  // SessionSummaryGenerated on success (grok://summary → onSummary upserts the
  // same entry); we also upsert optimistically to avoid a flicker while the
  // event round-trips. On failure we rethrow so TopbarTitle reverts its draft.
  const handleRenameTitle = async (newTitle: string) => {
    if (!currentEntry) return;
    try {
      await grokRenameSession(currentEntry.sessionId, newTitle, currentEntry.cwd);
      sessionsStore.getState().upsert({
        sessionId: currentEntry.sessionId,
        title: newTitle,
      });
    } catch (e) {
      showToast(`重命名失败：${String(e).replace(/^Error:\s*/, "")}`);
      throw e;
    }
  };

  // Model picker: switch the current session's model via grok's set_model.
  // If there's no session yet, we just remember the choice and apply it in
  // handleSendNew when the session is created.
  const handleModelChange = async (modelId: string) => {
    setCurrentModelId(modelId);
    if (currentSessionId) {
      try {
        await grokSetModel(currentSessionId, modelId);
      } catch (e) {
        // grok rejects with MODEL_SWITCH_INCOMPATIBLE_AGENT when the session
        // has turns and the new model needs a different harness — suggest a
        // new session.
        const msg = String(e);
        showToast(
          /incompatible|start_new_session/i.test(msg)
            ? "该会话无法切换到此模型，请新建会话"
            : `模型切换失败：${msg}`
        );
      }
    }
  };

  // Workspace picker: only re-aim the "target cwd" for the NEXT new session.
  // In the two-section model the sidebar already shows every workspace, so we
  // must NOT clear the current transcript or rebuild the list here — picking a
  // directory just decides which group the next 新建任务 lands in (empty =
  // 任务 group, a real dir = that 空间 node).
  const handleSelectWorkspace = (newCwd: string) => {
    cwdRef.current = newCwd;
  };

  const handleNewSession = () => {
    setPlaceholderView(null);
    sessionsStore.getState().setCurrent(null);
    sessionStore.getState().reset();
  };

  /** Re-fetch the provider list and update the model picker. Called after
   *  saving/deleting a provider in Settings so the change is visible
   *  immediately without restarting. */
  const refreshModels = async () => {
    try {
      const list = await providersList();
      setModels(list.map((m) => ({ id: m.modelId, label: m.name || m.modelId })));
    } catch {
      // Non-fatal — the picker keeps its previous list.
    }
  };

  // 空间节点展开/折叠: 记录展开态, 首次展开时懒加载该 cwd 的子会话。
  const handleToggleWorkspace = async (cwd: string, next: boolean) => {
    sessionsStore.getState().setExpanded(cwd, next);
    if (next && sessionsStore.getState().workspaceSessions[cwd] === undefined) {
      try {
        const list = await grokListSessions(cwd);
        sessionsStore.getState().setWorkspaceSessions(cwd, list);
      } catch (e) {
        showToast(`加载空间会话失败：${String(e)}`);
      }
    }
  };

  const handleSelectSession = async (sessionId: string, sessionCwd?: string) => {
    setPlaceholderView(null);
    sessionsStore.getState().setCurrent(sessionId);
    // setSession no longer wipes the transcript — it just moves focus. If we
    // already have a cached transcript for this session it arms replay
    // suppression so grok's history re-stream can't duplicate/merge it; if we
    // don't (first open / post-restart) the upcoming replay fills the empty
    // transcript. Either way the focused mirror is refreshed in one step.
    sessionStore.getState().setSession(sessionId);
    try {
      // Load with the session's OWN cwd (independent sessions have cwd="").
      // Viewing a 空间 child must NOT re-aim the new-session target directory.
      await grokLoadSession(sessionId, sessionCwd ?? "");
    } catch (e) {
      sessionStore.getState().setError(String(e));
    } finally {
      // Replay window is over: a *new* turn's updates for this session must be
      // ingested again. (No-op when there was no cached transcript to suppress.)
      sessionStore.getState().clearReplaySuppression(sessionId);
    }
  };

  // Rewind rewrites the backend history, so our cached transcript is stale —
  // drop it and reload from grok so the UI matches the rolled-back state.
  const handleRewound = () => {
    const id = sessionStore.getState().sessionId;
    if (!id) return;
    sessionStore.getState().dropSessionCache(id);
    sessionStore.getState().setSession(id); // empty cache → replay refills
    void grokLoadSession(id, cwdRef.current).catch((e) =>
      sessionStore.getState().setError(String(e))
    );
  };

  // Fork copies the session to a new id — jump to it so the user sees the
  // branch they just created (and it appears in the sidebar).
  const handleForked = (newId: string) => {
    const cwd = cwdRef.current;
    setPlaceholderView(null);
    sessionsStore.getState().setCurrent(newId);
    sessionsStore.getState().upsert({ sessionId: newId, title: "分叉会话", cwd });
    sessionStore.getState().setSession(newId);
    void grokLoadSession(newId, cwd).catch((e) =>
      sessionStore.getState().setError(String(e))
    );
  };

  // Start a new chat guided by an expert/assistant. grok has no session-level
  // "switch agent" ACP method, so we open a fresh empty session and seed it
  // with a one-shot system-style preamble built from the agent's description.
  // The user can then type their actual task; grok will honor the framing.
  const handleStartWithExpert = async (agent: AgentEntry) => {
    setPlaceholderView(null);
    try {
      const cwd = cwdRef.current;
      const sessionId = await grokNewSession(cwd, currentModelId);
      sessionsStore.getState().setCurrent(sessionId);
      sessionsStore.getState().upsert({ sessionId, title: agent.name, cwd });
      sessionStore.getState().setSession(sessionId);
      // Send a quiet preamble so grok adopts the agent's persona for this turn.
      // We don't display it as a user bubble — it's scaffolding. The simplest
      // implementation is to prepend it to the user's first real message; we
      // achieve that here by pushing a non-streaming seed and letting the user
      // continue. (If grok had a session-level systemPrompt meta field we'd
      // use that instead.)
      const preamble =
        `（本次对话使用助理「${agent.name}」：${agent.description ?? "通用助理"}）`;
      sessionStore.getState().pushUser(preamble);
      sessionStore.getState().startStreaming();
      await grokSend(sessionId, preamble);
    } catch (e) {
      sessionStore.getState().setError(String(e));
      showToast(`启动助理失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  // Discover launcher: open a new session and send the wizard's prompt. If an
  // agent is chosen, prepend its persona as a preamble (same pattern as
  // handleStartWithExpert). Closes the placeholder view so the chat shows.
  const handleLaunchDiscover = async (prompt: string, agent?: AgentEntry) => {
    setPlaceholderView(null);
    try {
      const cwd = cwdRef.current;
      const sessionId = await grokNewSession(cwd, currentModelId);
      sessionsStore.getState().setCurrent(sessionId);
      sessionsStore.getState().upsert({
        sessionId,
        title: agent ? agent.name : deriveTitle(prompt),
        cwd,
      });
      sessionStore.getState().setSession(sessionId);
      const body = agent
        ? `（使用助理「${agent.name}」：${agent.description ?? ""}）\n\n${prompt}`
        : prompt;
      sessionStore.getState().pushUser(body);
      sessionStore.getState().startStreaming();
      await grokSend(sessionId, body);
    } catch (e) {
      sessionStore.getState().setError(String(e));
      showToast(`启动失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  // 进入本地项目：把种子会话瞄到项目关联目录（使其归入对应空间节点），
  // 新建会话并注入项目说明作为种子消息。
  const handleStartProject = async (project: ProjectMeta) => {
    try {
      if (project.cwd) {
        cwdRef.current = project.cwd;
      }
      setPlaceholderView(null);
      const cwd = cwdRef.current;
      const sessionId = await grokNewSession(cwd, currentModelId);
      sessionsStore.getState().setCurrent(sessionId);
      sessionsStore.getState().upsert({ sessionId, title: project.name, cwd });
      sessionStore.getState().setSession(sessionId);
      const seed = project.instructions?.trim()
        ? project.instructions
        : `你好，我们开始「${project.name}」项目吧。`;
      sessionStore.getState().pushUser(seed);
      sessionStore.getState().startStreaming();
      await grokSend(sessionId, seed);
    } catch (e) {
      sessionStore.getState().setError(String(e));
      showToast(`启动项目失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  const activeNav = placeholderView ?? (currentSessionId ? "" : "新建任务");

  return (
    <div className={"app" + (IS_MACOS ? " app--macos" : "")}>
      {/* macOS 使用系统原生 Overlay 标题栏(红绿灯 + 原生菜单栏),
          不再渲染自绘 TitleBar;Windows/Linux 保持自绘。 */}
      {!IS_MACOS && (
        <TitleBar onPlaceholder={handlePlaceholder} onShowAbout={() => setAboutOpen(true)} />
      )}
      <div className={"app__body" + (sidebarCollapsed ? " app__body--collapsed" : "")}>
        <Sidebar
          onNewSession={handleNewSession}
          onSelect={handleSelectSession}
          onNavigate={handleNavigate}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleCollapse={() => setSidebarCollapsed(true)}
          onToggleWorkspace={handleToggleWorkspace}
          onOpenSearch={() => setSearchOpen(true)}
          onPlaceholder={handlePlaceholder}
          onToast={showToast}
          activeNav={activeNav}
        />
        <main className="app__main">
          {/* 自动化面板的页签工具栏本身就是顶部拖拽条（对齐 WorkBuddy），
              侧栏展开时隐藏全局 topbar，避免把页签压低 48px。
              侧栏折叠时保留 topbar（展开/新建任务按钮的唯一直达入口）。
              注:Tauri 2 只认 data-tauri-drag-region(CSS 的 -webkit-app-region
              不生效);按钮等子元素不是拖拽目标,不影响点击。 */}
          {!(placeholderView === "自动化" && !sidebarCollapsed) && (
          <header className="main-topbar" data-tauri-drag-region>
            <div className="main-topbar__left">
              {sidebarCollapsed && (
                <>
                  <button
                    className="main-topbar__btn"
                    aria-label="展开侧边栏"
                    data-tip="展开侧边栏"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <SidebarToggleIcon size="md" />
                  </button>
                  <button
                    className="main-topbar__btn"
                    aria-label="新建任务"
                    data-tip="新建任务"
                    onClick={handleNewSession}
                  >
                    <WbNewTaskIcon size="md" />
                  </button>
                </>
              )}
              {!placeholderView && currentSessionId && (
                <TopbarTitle title={currentTitle} onRename={handleRenameTitle} />
              )}
            </div>
          </header>
          )}
          {initError ? (
            <div className="app__notice app__notice--err">
              初始化失败:{initError}
              <br />
              请确认已在终端运行 <code>grok login</code> 完成 grok 登录后重试。
            </div>
          ) : !init ? (
            <div className="app__notice">正在启动 grok agent…</div>
          ) : !init.ok ? (
            <div className="app__notice app__notice--err">
              grok 未就绪:{init.auth.reason ?? "未知原因"}
              <br />
              请在终端运行 <code>grok login</code> 后重启 OpenBuddy。
            </div>
          ) : placeholderView ? (
            <PlaceholderPage
              label={placeholderView}
              onPlaceholder={handlePlaceholder}
              onNavigate={handleNavigate}
              onStartWithExpert={handleStartWithExpert}
              onToast={showToast}
              cwd={cwdRef.current}
              onSelectWorkspace={handleSelectWorkspace}
              sessionId={currentSessionId ?? undefined}
              onLaunch={handleLaunchDiscover}
              onSend={handleSendNew}
              streaming={streaming}
              apiReady={init.auth.ready}
              onOpenSettings={() => setSettingsOpen(true)}
              modelId={currentModelId}
              models={models}
              onModelChange={handleModelChange}
              onStartProject={handleStartProject}
            />
          ) : currentSessionId ? (
            <ChatView
              onSend={handleSendCurrent}
              onCancel={handleCancel}
              modelId={currentModelId}
              models={models}
              onModelChange={handleModelChange}
              cwd={cwdRef.current}
              workspaces={workspaces}
              onSelectWorkspace={handleSelectWorkspace}
              onRewound={handleRewound}
              onForked={handleForked}
              onToast={showToast}
            />
          ) : (
            <HomePage
              onSend={handleSendNew}
              streaming={streaming}
              apiReady={init.auth.ready}
              onOpenSettings={() => setSettingsOpen(true)}
              onPlaceholder={handlePlaceholder}
              modelId={currentModelId}
              models={models}
              onModelChange={handleModelChange}
              cwd={cwdRef.current}
              workspaces={workspaces}
              onSelectWorkspace={handleSelectWorkspace}
            />
          )}
        </main>
      </div>
      <Toast message={toast} />
      <PermissionDialog />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectSession}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onModelsChanged={refreshModels} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} init={init} />
      <FolderTrustDialog
        request={trustRequest}
        onResolve={() => setTrustRequest(null)}
        onToast={showToast}
      />
      <TasksPanel refreshSignal={taskRefreshSignal} onToast={showToast} />
    </div>
  );
}
