import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Folder } from "lucide-react";
import type { WorkspaceInfo } from "@/lib/grok-client";

/**
 * Workspace picker dropdown for the Composer's "选择工作空间" button.
 * Lists every cwd grok has seen (from list_workspaces). Selecting one
 * calls onSelectWorkspace — switching cwd means the next new session will
 * be bound to it (ACP locks cwd per-session, so we don't migrate the
 * current session).
 */
export function WorkspacePicker({
  cwd,
  workspaces,
  onSelectWorkspace,
}: {
  /** Currently active cwd (highlighted in the list). */
  cwd?: string;
  workspaces: WorkspaceInfo[];
  onSelectWorkspace: (cwd: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Shorten a cwd for display: show last 2 path segments.
  const shortName = (p: string) => {
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.slice(-2).join("/") || p;
  };

  const triggerLabel = cwd ? shortName(cwd) : "选择工作空间";

  return (
    <div className="workspace-picker" ref={ref}>
      <button
        className="workspace-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Folder size={14} strokeWidth={1.75} style={{ marginRight: 6 }} />
        <span className="workspace-picker__label">{triggerLabel}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="workspace-picker__arrow" />
      </button>
      {open && (
        <ul className="workspace-picker__menu" role="listbox">
          {workspaces.length === 0 && (
            <li className="workspace-picker__empty">暂无历史工作空间</li>
          )}
          {workspaces.map((w) => (
            <li key={w.cwd}>
              <button
                type="button"
                className={
                  "workspace-picker__item" +
                  (w.cwd === cwd ? " workspace-picker__item--active" : "")
                }
                onClick={() => {
                  onSelectWorkspace(w.cwd);
                  setOpen(false);
                }}
                role="option"
                aria-selected={w.cwd === cwd}
                title={w.cwd}
              >
                <span className="workspace-picker__item-name">{shortName(w.cwd)}</span>
                <span className="workspace-picker__item-meta">
                  {w.sessionCount} 个会话
                </span>
                {w.cwd === cwd && <Check size={14} className="workspace-picker__check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
