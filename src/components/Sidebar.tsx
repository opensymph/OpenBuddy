import { useState, useCallback, useRef, useEffect } from "react";
import { useSessionsStore } from "@/stores/sessions-store";
import {
  grokRenameSession,
  grokDeleteSession,
  grokSetSessionPinned,
} from "@/lib/grok-client";
import {
  WbNewTaskIcon,
  WbAssistantNavIcon,
  WbProjectNavIcon,
  WbExpertNavIcon,
  WbAutomationNavIcon,
  WbMoreNavIcon,
  SearchIcon,
  FilterIcon,
  BellIcon,
  UserIcon,
  SettingsIcon,
  ChatBubbleIcon,
  ChevronDownIcon,
  PinFilledIcon,
  DeleteIcon,
  EditToolIcon,
} from "@/foundation/components/Icon/icons";

const NAV = [
  { label: "助理", icon: WbAssistantNavIcon },
  { label: "项目", icon: WbProjectNavIcon },
  { label: "专家·技能·连接器", icon: WbExpertNavIcon },
  { label: "自动化", icon: WbAutomationNavIcon },
];

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
}

function SessionContextMenu({ x, y, sessionId, sessionTitle, isPinned, onClose, onRename, onDelete, onPin }: ContextMenuProps) {
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
          <button className="context-menu__item context-menu__item--danger" onClick={() => { onDelete(sessionId); onClose(); }}>
            <DeleteIcon size="sm" />
            <span>删除</span>
          </button>
        </>
      )}
    </div>
  );
}

/** WorkBuddy 风格侧栏(264px):品牌行 / 导航 / 空间会话列表 / 底部用户区。 */
export function Sidebar({
  onNewSession,
  onSelect,
  onNavigate,
  onOpenSettings,
  onOpenSearch,
  onPlaceholder,
  onToast,
  activeNav,
}: {
  onNewSession: () => void;
  onSelect: (sessionId: string) => void;
  onNavigate: (label: string) => void;
  onOpenSettings: () => void;
  /** Open the session search overlay. */
  onOpenSearch: () => void;
  onPlaceholder: (label: string) => void;
  /** Surface transient feedback (e.g. rename/delete failures). */
  onToast?: (message: string) => void;
  activeNav: string;
}) {
  const sessions = useSessionsStore((s) => s.sessions);
  const currentSessionId = useSessionsStore((s) => s.currentSessionId);
  const upsertSession = useSessionsStore((s) => s.upsert);
  const removeSession = useSessionsStore((s) => s.remove);
  const [spaceOpen, setSpaceOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
    sessionTitle: string;
    isPinned: boolean;
  } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string, sessionTitle: string, isPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId, sessionTitle, isPinned });
  }, []);

  // Rename via grok's `x.ai/session/rename`. We DON'T optimistically update —
  // grok broadcasts SessionSummaryGenerated on success, which arrives via the
  // grok://summary event and updates the store. On error we surface a toast
  // and leave the entry untouched.
  const handleRename = useCallback(async (sessionId: string, newTitle: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    try {
      await grokRenameSession(sessionId, newTitle, session.cwd);
      // Optimistic update to avoid flicker; the summary event will confirm.
      upsertSession({ ...session, title: newTitle });
    } catch (e) {
      onToast?.(`重命名失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [sessions, upsertSession, onToast]);

  // Delete via grok's `x.ai/session/delete` — removes the on-disk session
  // directory. Only drop the sidebar entry once the backend confirms.
  const handleDelete = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    const cwd = session?.cwd;
    try {
      await grokDeleteSession(sessionId, cwd);
      removeSession(sessionId);
    } catch (e) {
      onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [sessions, removeSession, onToast]);

  // Pin/unpin — OpenBuddy-only state (~/.grok/openbuddy-state.json), no grok
  // round-trip needed, but we still await the command so failures surface.
  const handlePin = useCallback(async (sessionId: string, pinned: boolean) => {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;
    try {
      await grokSetSessionPinned(sessionId, pinned);
      upsertSession({ ...session, pinned });
    } catch (e) {
      onToast?.(`置顶失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [sessions, upsertSession, onToast]);

  // Sort sessions: pinned first, then by last activity
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar__logo-row">
        <span className="sidebar__logo">OpenBuddy</span>
        <span className="sidebar__version">v 0.1.0</span>
        <div className="sidebar__logo-spacer" />
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
        <button className="sidebar__nav-item" onClick={() => onNavigate("更多")}>
          <WbMoreNavIcon size="md" />
          <span>更多</span>
          <span className="sidebar__nav-sub">资料库·灵感</span>
        </button>
      </nav>

      <div className="sidebar__content">
        <button className="sidebar__section-label" onClick={() => setSpaceOpen(!spaceOpen)}>
          <span>空间</span>
          <ChevronDownIcon
            size="sm"
            className={spaceOpen ? "" : "sidebar__chevron--collapsed"}
          />
        </button>
        {spaceOpen && (
          <div className="sidebar__space">
            <div className="sidebar__space-title">默认空间</div>
            {sortedSessions.length === 0 && <div className="sidebar__empty">暂无会话</div>}
            {sortedSessions.map((s) => (
              <button
                key={s.sessionId}
                className={
                  "sidebar__conv" +
                  (s.sessionId === currentSessionId ? " sidebar__conv--active" : "") +
                  (s.pinned ? " sidebar__conv--pinned" : "")
                }
                onClick={() => onSelect(s.sessionId)}
                onContextMenu={(e) => handleContextMenu(e, s.sessionId, s.title || "未命名会话", s.pinned || false)}
                title={s.title}
              >
                <ChatBubbleIcon size="sm" />
                <span className="sidebar__conv-title">{s.title || "未命名会话"}</span>
                {s.pinned && <PinFilledIcon size="sm" className="sidebar__conv-pin" />}
              </button>
            ))}
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
        />
      )}
    </aside>
  );
}
