import { useCallback, useEffect, useRef, useState } from "react";
import { EditToolIcon } from "@/foundation/components/Icon/icons";

/**
 * Editable conversation title for the main topbar — mirrors WorkBuddy's
 * `workbuddy-topbar` title interaction:
 *   - default: plain title text; a pencil button fades in on hover;
 *   - click pencil → the title swaps to an <input> with the text selected;
 *   - Enter / blur commits (empty or unchanged = no-op), Esc cancels.
 *
 * `onRename` should persist the title (grok's x.ai/session/rename) and update
 * the sessions store; on rejection the draft reverts to the current title.
 */
export function TopbarTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (newTitle: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track external title updates (e.g. grok's LLM-generated summary arriving
  // via grok://summary) while we're not editing.
  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  // Focus + select-all on entering edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!title) return;
      setValue(title);
      setEditing(true);
    },
    [title],
  );

  const commit = useCallback(async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      try {
        await onRename(trimmed);
      } catch {
        setValue(title); // revert the draft; the store keeps the old title
      }
    }
  }, [value, title, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        setEditing(false);
        setValue(title);
      }
    },
    [commit, title],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="main-topbar__title-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span className="main-topbar__title-area">
      <span className="main-topbar__title" title={title || "未命名会话"}>
        {title || "未命名会话"}
      </span>
      {title && (
        <button
          className="main-topbar__title-edit"
          type="button"
          aria-label="编辑标题"
          data-tip="编辑标题"
          onClick={startEdit}
        >
          <EditToolIcon size="sm" />
        </button>
      )}
    </span>
  );
}
