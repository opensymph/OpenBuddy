/**
 * 项目（工作空间）面板 - 对接 grok sessions 的工作目录聚合
 *
 * WorkBuddy 的"项目"是多成员协作空间，依赖腾讯后端（CNB/乐享/TAPD）。
 * OpenBuddy 把"项目"重新定义为 grok 的工作空间（cwd）：
 *  - 每个工作空间 = 一个目录 + 该目录下的所有会话
 *  - 切换工作空间 = 切换 cwd（影响新建会话的位置）
 *  - 添加工作空间 = 选一个目录加入跟踪
 *
 * 这与 Composer 的 WorkspacePicker 一致，只是这里的视图更全面。
 */
import { useCallback, useEffect, useState } from "react";
import {
  ProjectIcon,
  FolderIcon,
  AddCircleIcon,
  SearchIcon,
  ChevronRightIcon,
  RefreshCwIcon,
} from "@/foundation/components/Icon/icons";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { grokListSessions, grokListWorkspaces, type WorkspaceInfo } from "@/lib/grok-client";
import type { SessionSummary } from "@/lib/types";

interface ProjectsPanelProps {
  /** Current active cwd. */
  cwd?: string;
  /** Called when the user picks a workspace to switch to. */
  onSelectWorkspace?: (cwd: string) => void;
  onToast?: (msg: string) => void;
}

export function ProjectsPanel({ cwd, onSelectWorkspace, onToast }: ProjectsPanelProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessionsByWs, setSessionsByWs] = useState<Record<string, SessionSummary[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setWorkspaces(await grokListWorkspaces());
    } catch (e) {
      onToast?.(`加载工作空间失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAddWorkspace = useCallback(async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) return;
      // grok 会在该 cwd 下创建会话时自动纳入跟踪；这里只需切换过去。
      onSelectWorkspace?.(selected as string);
      onToast?.(`已切换到 ${selected}`);
      setTimeout(reload, 500);
    } catch {
      // dialog plugin not available in non-Tauri env — silent
    }
  }, [onSelectWorkspace, onToast, reload]);

  const handleExpand = useCallback(
    async (wsCwd: string) => {
      if (expanded === wsCwd) {
        setExpanded(null);
        return;
      }
      setExpanded(wsCwd);
      if (!sessionsByWs[wsCwd]) {
        setLoadingSessions(wsCwd);
        try {
          const sessions = await grokListSessions(wsCwd);
          setSessionsByWs((prev) => ({ ...prev, [wsCwd]: sessions }));
        } catch (e) {
          onToast?.(`加载会话失败：${String(e).replace(/^Error:\s*/, "")}`);
        } finally {
          setLoadingSessions(null);
        }
      }
    },
    [expanded, sessionsByWs, onToast],
  );

  const filtered = workspaces.filter((w) =>
    w.cwd.toLowerCase().includes(query.toLowerCase()),
  );

  const totalSessions = workspaces.reduce((sum, w) => sum + w.sessionCount, 0);

  return (
    <div className="projects-panel">
      <div className="projects-panel__header">
        <h2 className="projects-panel__title">项目（工作空间）</h2>
        <div className="projects-panel__header-actions">
          <button
            className="projects-panel__action-btn"
            onClick={reload}
            disabled={loading}
            title="刷新"
          >
            <RefreshCwIcon size="sm" /> 刷新
          </button>
          <button
            className="projects-panel__create-btn"
            onClick={handleAddWorkspace}
          >
            <AddCircleIcon size="sm" /> 添加目录
          </button>
        </div>
      </div>

      <div className="projects-panel__search">
        <SearchIcon size="md" className="projects-panel__search-icon" />
        <input
          type="text"
          className="projects-panel__search-input"
          placeholder="搜索工作空间…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="projects-panel__stats">
        {workspaces.length} 个工作空间 · {totalSessions} 个会话
        {cwd && (
          <>
            {" · 当前："}
            <code title={cwd}>{cwd}</code>
          </>
        )}
      </div>

      <div className="projects-panel__list">
        {filtered.length === 0 && !loading && (
          <div className="projects-panel__empty">
            <ProjectIcon size="xl" color="var(--wb-text-tertiary)" />
            <p>暂无工作空间。grok 在某目录下开始对话后会自动记录。</p>
            <p>点击「添加目录」手动加入。</p>
          </div>
        )}
        {filtered.map((ws) => {
          const isActive = ws.cwd === cwd;
          const isExpanded = expanded === ws.cwd;
          const sessions = sessionsByWs[ws.cwd] ?? [];
          return (
            <div
              key={ws.cwd}
              className={`projects-panel__item ${isActive ? "projects-panel__item--active" : ""}`}
            >
              <div className="projects-panel__item-row">
                <button
                  className="projects-panel__item-main"
                  onClick={() => onSelectWorkspace?.(ws.cwd)}
                  title={`切换到 ${ws.cwd}`}
                >
                  <div className="projects-panel__item-icon">
                    <FolderIcon size="md" />
                  </div>
                  <div className="projects-panel__item-content">
                    <div className="projects-panel__item-name">
                      {ws.cwd.replace(/\\/g, "/").split("/").pop() || ws.cwd}
                      {isActive && (
                        <span className="projects-panel__item-badge">当前</span>
                      )}
                    </div>
                    <div className="projects-panel__item-path" title={ws.cwd}>
                      {ws.cwd}
                    </div>
                    <div className="projects-panel__item-meta">
                      {ws.sessionCount} 个会话
                      {ws.lastTitle ? ` · 最近：${ws.lastTitle}` : ""}
                    </div>
                  </div>
                </button>
                <button
                  className="projects-panel__expand-btn"
                  onClick={() => handleExpand(ws.cwd)}
                  title={isExpanded ? "收起" : "展开会话"}
                >
                  <ChevronRightIcon
                    size="sm"
                    className={isExpanded ? "projects-panel__chevron--open" : ""}
                  />
                </button>
              </div>
              {isExpanded && (
                <div className="projects-panel__sessions">
                  {loadingSessions === ws.cwd && <div>加载中…</div>}
                  {!loadingSessions && sessions.length === 0 && (
                    <div className="projects-panel__sessions-empty">无会话</div>
                  )}
                  {sessions.slice(0, 20).map((s) => (
                    <div key={s.sessionId} className="projects-panel__session">
                      <span className="projects-panel__session-title">
                        {s.title || "未命名"}
                      </span>
                      {s.updatedAt && (
                        <span className="projects-panel__session-time">
                          {new Date(s.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                      {s.pinned && <span className="projects-panel__session-pin">★</span>}
                    </div>
                  ))}
                  {sessions.length > 20 && (
                    <div className="projects-panel__sessions-more">
                      还有 {sessions.length - 20} 个会话…
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {loading && <div className="projects-panel__empty">加载中…</div>}
      </div>
    </div>
  );
}
