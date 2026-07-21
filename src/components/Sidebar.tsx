import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSessionsStore } from "@/stores/sessions-store";
import { useProjectsStore } from "@/stores/projects-store";
import { IS_MACOS } from "@/lib/platform";
import {
  grokRenameSession,
  grokDeleteSession,
  grokSetSessionPinned,
  grokSetSessionArchived,
} from "@/lib/grok-client";
import type { SessionSummary } from "@/lib/types";
import {
  WbNewTaskIcon,
  WbAssistantNavIcon,
  WbProjectNavIcon,
  WbExpertNavIcon,
  WbAutomationNavIcon,
  WbMoreNavIcon,
  SearchIcon,
  FilterIcon,
  SidebarToggleIcon,
  BellIcon,
  UserIcon,
  SettingsIcon,
  ChevronDownIcon,
  PinFilledIcon,
  DeleteIcon,
  EditToolIcon,
  MoreDotsIcon,
  ArchiveIcon,
  WbPinIcon,
  WbUnpinIcon,
  MyFilesIconV2,
  MoreMenuImaKnowledgeIcon,
  MoreMenuInspirationIcon,
  MoreMenuTencentDocsIcon,
  MoreMenuTencentLexiangIcon,
} from "@/foundation/components/Icon/icons";
import { APP_VERSION } from "@/lib/app-version";

const NAV = [
  { label: "助理", icon: WbAssistantNavIcon },
  { label: "项目", icon: WbProjectNavIcon },
  { label: "专家·技能·连接器", icon: WbExpertNavIcon },
  { label: "自动化", icon: WbAutomationNavIcon },
];

/** Last path segment of a working directory, used as a 空间 node label. */
function basename(p: string): string {
  if (!p) return "默认空间";
  const norm = p.replace(/[\\/]+$/, "");
  const i = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  const name = i >= 0 ? norm.slice(i + 1) : norm;
  return name || "默认空间";
}

/** Compact, locale-friendly relative time for the sidebar row tail. */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day}天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Pinned entries first; within a pin tier, most-recently-active first
 *  (by `updatedAt`) so a session you just chatted in rises to the top and its
 *  relative-time tail stays honest. Insertion order breaks remaining ties. */
function sortPinnedFirst<
  T extends { pinned?: boolean; updatedAt?: string },
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pin = Number(!!b.pinned) - Number(!!a.pinned);
    if (pin !== 0) return pin;
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bt - at;
  });
}

/** Small project icon for sidebar nodes (three connected circles). */
function ProjectNodeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="6" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="17.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.7 8.4 10.5 15.6M16.3 8.4 13.5 15.6M8 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  sessionId: string;
  sessionTitle: string;
  isPinned: boolean;
  onClose: () => void;
  onRename: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
  onPin: (sessionId: string, pinned: boolean) => void;
  onArchive: (sessionId: string) => void;
}

function SessionContextMenu({ x, y, sessionId, sessionTitle, isPinned, onClose, onRename, onDelete, onPin, onArchive }: ContextMenuProps) {
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(sessionTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onClose]);

  const handleRename = () => {
    if (newTitle.trim() && newTitle !== sessionTitle) {
      onRename(sessionId, newTitle.trim());
    }
    setRenaming(false);
    onClose();
  };

  return (
    <div
      className="context-menu"
      style={{ position: "fixed", left: x, top: y, zIndex: 1000 }}
      onClick={(e) => e.stopPropagation()}
    >
      {renaming ? (
        <div className="context-menu__rename">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="context-menu__rename-input"
          />
        </div>
      ) : (
        <>
          <button className="context-menu__item" onClick={() => setRenaming(true)}>
            <EditToolIcon size="sm" />
            <span>重命名</span>
          </button>
          <button className="context-menu__item" onClick={() => { onPin(sessionId, !isPinned); onClose(); }}>
            <PinFilledIcon size="sm" />
            <span>{isPinned ? "取消置顶" : "置顶"}</span>
          </button>
          <button className="context-menu__item" onClick={() => { onArchive(sessionId); onClose(); }}>
            <ArchiveIcon size="sm" />
            <span>归档</span>
          </button>
          <button className="context-menu__item context-menu__item--danger" onClick={() => { onDelete(sessionId); onClose(); }}>
            <DeleteIcon size="sm" />
            <span>删除</span>
          </button>
        </>
      )}
    </div>
  );
}

/**
 * "更多" 侧栏按钮的弹出菜单 — 对齐 WorkBuddy：
 * - hover 打开，向右浮出（不向下盖住会话列表）
 * - 菜单项：我的文件 / 腾讯文档 / ima知识库 / 乐享知识库 / 灵感
 *
 * 腾讯系三项在 OpenBuddy 暂无完整对接，点击给 toast；可导航项走 onNavigate。
 */
function MoreDropdown({
  onNavigate,
  onToast,
  activeNav,
}: {
  onNavigate: (label: string) => void;
  onToast?: (message: string) => void;
  activeNav: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    // Small grace so the cursor can move from trigger → popover without flicker.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const openMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  const isActive =
    activeNav === "更多" ||
    activeNav === "资料库" ||
    activeNav === "灵感" ||
    activeNav === "我的文件" ||
    activeNav === "腾讯文档" ||
    activeNav === "ima知识库" ||
    activeNav === "乐享知识库";

  const ITEMS: {
    id: string;
    label: string;
    icon: React.ReactNode;
    action: () => void;
  }[] = [
    {
      id: "my_files",
      label: "我的文件",
      icon: <MyFilesIconV2 size="md" />,
      action: () => {
        setOpen(false);
        onNavigate("我的文件");
      },
    },
    {
      id: "tencent_docs",
      label: "腾讯文档",
      icon: <MoreMenuTencentDocsIcon size="md" />,
      action: () => {
        setOpen(false);
        onToast?.("腾讯文档对接开发中");
      },
    },
    {
      id: "ima_kb",
      label: "ima知识库",
      icon: <MoreMenuImaKnowledgeIcon size="md" />,
      action: () => {
        setOpen(false);
        onToast?.("ima 知识库对接开发中");
      },
    },
    {
      id: "lexiang_kb",
      label: "乐享知识库",
      icon: <MoreMenuTencentLexiangIcon size="md" />,
      action: () => {
        setOpen(false);
        onToast?.("乐享知识库对接开发中");
      },
    },
    {
      id: "inspiration",
      label: "灵感",
      icon: <MoreMenuInspirationIcon size="md" />,
      action: () => {
        setOpen(false);
        onNavigate("灵感");
      },
    },
  ];

  return (
    <div
      className={"sidebar__more-wrap" + (open ? " sidebar__more-wrap--open" : "")}
      ref={containerRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={
          "sidebar__nav-item" +
          (isActive || open ? " sidebar__nav-item--active" : "")
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={openMenu}
      >
        <WbMoreNavIcon size="md" />
        <span>更多</span>
        <span className="sidebar__nav-sub">资料库·灵感</span>
      </button>
      {open && (
        <div className="sidebar__more-popover" role="menu">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                "sidebar__more-item" +
                (activeNav === item.label ? " sidebar__more-item--active" : "")
              }
              role="menuitem"
              onClick={item.action}
            >
              <span className="sidebar__more-item-icon">{item.icon}</span>
              <span className="sidebar__more-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * WorkBuddy 风格侧栏:品牌行 / 导航 / 双分组(任务 + 空间) / 底部用户区。
 *
 * 任务分组列「独立会话」(cwd 为空);空间分组列本地工作目录节点,每个节点可
 * 展开懒加载其下的会话。详见 sessions-store 的双分组模型。
 */
export function Sidebar({
  onNewSession,
  onSelect,
  onNavigate,
  onOpenSettings,
  onToggleCollapse,
  onToggleWorkspace,
  onOpenSearch,
  onPlaceholder,
  onToast,
  onOpenProject,
  activeNav,
}: {
  onNewSession: () => void;
  onSelect: (sessionId: string, cwd?: string) => void;
  onNavigate: (label: string) => void;
  onOpenSettings: () => void;
  /** Collapse the sidebar; an expand affordance is rendered over the main area. */
  onToggleCollapse: () => void;
  /** Expand/collapse a 空间 (workspace) node; lazy-loads its sessions. */
  onToggleWorkspace: (cwd: string, next: boolean) => void;
  /** Open the session search overlay. */
  onOpenSearch: () => void;
  onPlaceholder: (label: string) => void;
  /** Surface transient feedback (e.g. rename/delete failures). */
  onToast?: (message: string) => void;
  /** Open a project detail view from the sidebar. */
  onOpenProject?: (projectId: string) => void;
  activeNav: string;
}) {
  const independent = useSessionsStore((s) => s.independent);
  const workspaces = useSessionsStore((s) => s.workspaces);
  const homeCwd = useSessionsStore((s) => s.homeCwd);
  const workspaceSessions = useSessionsStore((s) => s.workspaceSessions);
  const tasksOpen = useSessionsStore((s) => s.tasksOpen);
  const spacesOpen = useSessionsStore((s) => s.spacesOpen);
  const expanded = useSessionsStore((s) => s.expanded);
  const currentSessionId = useSessionsStore((s) => s.currentSessionId);
  const upsertSession = useSessionsStore((s) => s.upsert);
  const removeSession = useSessionsStore((s) => s.remove);
  const setTasksOpen = useSessionsStore((s) => s.setTasksOpen);
  const setSpacesOpen = useSessionsStore((s) => s.setSpacesOpen);

  // Projects from the local store — shown as expandable nodes in 空间.
  const projects = useProjectsStore((s) => s.projects);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
    sessionTitle: string;
    isPinned: boolean;
  } | null>(null);

  // Flat view across both groups — used to look up a session's cwd for the
  // rename/delete/pin round-trips (the entries may live in either group).
  const allSessions = useMemo<SessionSummary[]>(
    () => [...independent, ...Object.values(workspaceSessions).flat()],
    [independent, workspaceSessions],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string, sessionTitle: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId, sessionTitle, isPinned });
  }, []);

  // Rename via grok's `x.ai/session/rename`. grok broadcasts
  // SessionSummaryGenerated on success (grok://summary → store upsert); we also
  // update optimistically to avoid flicker.
  const handleRename = useCallback(async (sessionId: string, newTitle: string) => {
    const session = allSessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    try {
      await grokRenameSession(sessionId, newTitle, session.cwd);
      upsertSession({ ...session, title: newTitle });
    } catch (e) {
      onToast?.(`重命名失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [allSessions, upsertSession, onToast]);

  // Delete via grok's `x.ai/session/delete` — removes the on-disk session
  // directory. Only drop the sidebar entry once the backend confirms.
  const handleDelete = useCallback(async (sessionId: string) => {
    const session = allSessions.find(s => s.sessionId === sessionId);
    const cwd = session?.cwd;
    try {
      await grokDeleteSession(sessionId, cwd);
      removeSession(sessionId);
    } catch (e) {
      onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [allSessions, removeSession, onToast]);

  // Pin/unpin — OpenBuddy-only state (~/.grok/openbuddy-state.json).
  const handlePin = useCallback(async (sessionId: string, pinned: boolean) => {
    const session = allSessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    try {
      await grokSetSessionPinned(sessionId, pinned);
      upsertSession({ ...session, pinned });
    } catch (e) {
      onToast?.(`置顶失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [allSessions, upsertSession, onToast]);

  // Archive — OpenBuddy-only state; archived sessions are filtered out of
  // list_sessions, so drop the sidebar entry immediately on success.
  const handleArchive = useCallback(async (sessionId: string) => {
    try {
      await grokSetSessionArchived(sessionId, true);
      removeSession(sessionId);
    } catch (e) {
      onToast?.(`归档失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [removeSession, onToast]);

  // Open the row's context menu anchored to its 更多 hover button.
  const openMenuFromButton = useCallback((e: React.MouseEvent, sessionId: string, sessionTitle: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.bottom + 4, sessionId, sessionTitle, isPinned });
  }, []);

  // One session row, shared by the 任务 group and 空间 node children.
  // No leading icon (WorkBuddy parity); hover reveals 更多/归档/置顶 actions
  // in place of the relative-time tail.
  const renderConv = (s: SessionSummary) => (
    <button
      key={s.sessionId}
      className={
        "sidebar__conv" +
        (s.sessionId === currentSessionId ? " sidebar__conv--active" : "") +
        (s.pinned ? " sidebar__conv--pinned" : "")
      }
      onClick={() => onSelect(s.sessionId, s.cwd)}
      onContextMenu={(e) => handleContextMenu(e, s.sessionId, s.title || "未命名会话", s.pinned || false)}
      title={s.title}
    >
      <span className="sidebar__conv-title">{s.title || "未命名会话"}</span>
      {s.pinned && <PinFilledIcon size="sm" className="sidebar__conv-pin" />}
      {s.updatedAt && <span className="sidebar__conv-time">{relativeTime(s.updatedAt)}</span>}
      <span className="sidebar__conv-actions" onClick={(e) => e.stopPropagation()}>
        <span
          role="button"
          className="sidebar__conv-action"
          aria-label="更多"
          data-tip="更多"
          onClick={(e) => openMenuFromButton(e, s.sessionId, s.title || "未命名会话", s.pinned || false)}
        >
          <MoreDotsIcon size="sm" />
        </span>
        <span
          role="button"
          className="sidebar__conv-action"
          aria-label="归档"
          data-tip="归档"
          onClick={() => handleArchive(s.sessionId)}
        >
          <ArchiveIcon size="sm" />
        </span>
        <span
          role="button"
          className="sidebar__conv-action"
          aria-label={s.pinned ? "取消置顶" : "置顶"}
          data-tip={s.pinned ? "取消置顶" : "置顶"}
          onClick={() => handlePin(s.sessionId, !s.pinned)}
        >
          {s.pinned ? <WbUnpinIcon size="sm" /> : <WbPinIcon size="sm" />}
        </span>
      </span>
    </button>
  );

  // 空间 nodes = every workspace except the inbox (homeCwd), whose sessions
  // already appear in the 任务 group.
  const spaceNodes = workspaces.filter((w) => w.cwd !== homeCwd);

  return (
    <aside className="sidebar">
      {/* macOS Overlay 标题栏:红绿灯悬浮在 logo 行左上,整行作为拖拽区
          (Windows 的窗口拖拽由自绘 TitleBar 负责,故仅在 mac 加属性)。 */}
      <div className="sidebar__logo-row" {...(IS_MACOS ? { "data-tauri-drag-region": true } : {})}>
        <div className="sidebar__logo-col" {...(IS_MACOS ? { "data-tauri-drag-region": true } : {})}>
          <span className="sidebar__logo">OpenBuddy</span>
          <span className="sidebar__version">v{APP_VERSION}</span>
        </div>
        <div className="sidebar__logo-spacer" {...(IS_MACOS ? { "data-tauri-drag-region": true } : {})} />
        <button
          className="sidebar__icon-btn"
          aria-label="收起侧边栏"
          data-tip="收起侧边栏"
          onClick={onToggleCollapse}
        >
          <SidebarToggleIcon size="md" />
        </button>
        <button className="sidebar__icon-btn" aria-label="搜索" onClick={onOpenSearch}>
          <SearchIcon size="md" />
        </button>
        <button className="sidebar__icon-btn" aria-label="筛选" onClick={() => onPlaceholder("筛选")}>
          <FilterIcon size="md" />
        </button>
      </div>

      <nav className="sidebar__nav">
        <button
          className={
            "sidebar__nav-item" +
            (activeNav === "新建任务" ? " sidebar__nav-item--active" : "")
          }
          onClick={onNewSession}
        >
          <WbNewTaskIcon size="md" />
          <span>新建任务</span>
        </button>
        {NAV.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={
              "sidebar__nav-item" +
              (activeNav === label ? " sidebar__nav-item--active" : "")
            }
            onClick={() => onNavigate(label)}
          >
            <Icon size="md" />
            <span>{label}</span>
          </button>
        ))}
        <MoreDropdown onNavigate={onNavigate} onToast={onToast} activeNav={activeNav} />
      </nav>

      <div className="sidebar__content">
        {/* 任务分组: 收件箱(初始目录)下的会话 */}
        <button className="sidebar__section-label" onClick={() => setTasksOpen(!tasksOpen)}>
          <span>任务 ({independent.length})</span>
          <ChevronDownIcon
            size="sm"
            className={"sidebar__chevron" + (tasksOpen ? "" : " sidebar__chevron--collapsed")}
          />
        </button>
        {tasksOpen && (
          <div className="sidebar__group">
            {independent.length === 0 && <div className="sidebar__empty">暂无任务</div>}
            {sortPinnedFirst(independent).map(renderConv)}
          </div>
        )}

        {/* 空间分组: 项目节点 + 本地工作目录节点 */}
        <button className="sidebar__section-label" onClick={() => setSpacesOpen(!spacesOpen)}>
          <span>空间 ({projects.length + spaceNodes.length})</span>
          <ChevronDownIcon
            size="sm"
            className={"sidebar__chevron" + (spacesOpen ? "" : " sidebar__chevron--collapsed")}
          />
        </button>
        {spacesOpen && (
          <div className="sidebar__group">
            {/* 项目节点 */}
            {projects.length === 0 && spaceNodes.length === 0 && (
              <div className="sidebar__empty">暂无空间</div>
            )}
            {projects.map((proj) => {
              const open = !!expandedProjects[proj.id];
              return (
                <div key={proj.id} className="sidebar__node-wrap">
                  <button
                    className="sidebar__node sidebar__node--project"
                    onClick={() => onOpenProject?.(proj.id)}
                    title={proj.name}
                  >
                    <ProjectNodeIcon />
                    <span className="sidebar__node-name">{proj.name}</span>
                    <ChevronDownIcon
                      size="sm"
                      className={"sidebar__chevron" + (open ? "" : " sidebar__chevron--collapsed")}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setExpandedProjects((prev) => ({ ...prev, [proj.id]: !prev[proj.id] }));
                      }}
                    />
                  </button>
                  {open && (
                    <div className="sidebar__children">
                      {proj.tasks.length === 0 && (
                        <div className="sidebar__empty">暂无任务</div>
                      )}
                      {proj.tasks.map((task) => (
                        <div key={task.id} className="sidebar__project-task">
                          <span className="sidebar__project-task-title">{task.title}</span>
                          {task.status === "in_progress" && (
                            <span className="sidebar__project-task-spinner" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* 工作目录节点 */}
            {spaceNodes.map((ws) => {
              const open = !!expanded[ws.cwd];
              const children = workspaceSessions[ws.cwd];
              return (
                <div key={ws.cwd} className="sidebar__node-wrap">
                  <button
                    className="sidebar__node"
                    onClick={() => onToggleWorkspace(ws.cwd, !open)}
                    title={ws.cwd}
                  >
                    <WbExpertNavIcon size="sm" />
                    <span className="sidebar__node-name">{basename(ws.cwd)}</span>
                    <ChevronDownIcon
                      size="sm"
                      className={"sidebar__chevron" + (open ? "" : " sidebar__chevron--collapsed")}
                    />
                  </button>
                  {open && (
                    <div className="sidebar__children">
                      {children === undefined && <div className="sidebar__empty">加载中…</div>}
                      {children && children.length === 0 && <div className="sidebar__empty">暂无会话</div>}
                      {children && sortPinnedFirst(children).map(renderConv)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__user" onClick={() => onPlaceholder("用户中心")}>
          <UserIcon size="md" />
          <span>本地用户</span>
        </button>
        <div className="sidebar__logo-spacer" />
        <button className="sidebar__icon-btn" aria-label="通知" onClick={() => onPlaceholder("通知")}>
          <BellIcon size="md" />
        </button>
        <button className="sidebar__icon-btn" aria-label="设置" onClick={onOpenSettings}>
          <SettingsIcon size="md" />
        </button>
      </div>

      {contextMenu && (
        <SessionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sessionId={contextMenu.sessionId}
          sessionTitle={contextMenu.sessionTitle}
          isPinned={contextMenu.isPinned}
          onClose={() => setContextMenu(null)}
          onRename={handleRename}
          onDelete={handleDelete}
          onPin={handlePin}
          onArchive={handleArchive}
        />
      )}
    </aside>
  );
}
