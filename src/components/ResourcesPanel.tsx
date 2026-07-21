/**
 * 资料库面板 - 对接 grok memory (~/.grok/memory/)
 *
 * 这是 WorkBuddy "更多/资料库·灵感" 的资料库部分。
 * grok 把跨会话记忆写到 ~/.grok/memory/MEMORY.md（global）和
 * <cwd>/.grok/memory/（workspace），每条 markdown 文件一条记忆。
 *
 * 用户可以：
 *  - 浏览/搜索所有 memory 文件
 *  - 新建/编辑/删除 memory（直接改文件，grok 会热重载）
 *  - 触发 "重写"（让 grok 用 LLM 把原始笔记结构化）
 *  - 触发 "落盘"（强制 flush 未写 memory）
 */
import { useCallback, useEffect, useState } from "react";
import {
  BookIcon,
  SearchIcon,
  AddIcon,
  EditToolIcon,
  DeleteIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "@/foundation/components/Icon/icons";
import {
  memoryDelete,
  memoryFlush,
  memoryList,
  memoryRewrite,
  memorySave,
} from "@/lib/grok-client";
import type { MemoryEntry } from "@/lib/types";

interface ResourcesPanelProps {
  cwd?: string;
  onToast?: (msg: string) => void;
  initialTab?: "library" | "inspiration";
}

export function ResourcesPanel({ cwd, onToast }: ResourcesPanelProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ scope: string; path: string; content: string; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await memoryList(cwd));
    } catch (e) {
      onToast?.(`加载资料库失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [cwd, onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = useCallback(
    async (scope: string, path: string, content: string, isNew: boolean) => {
      if (!path.trim()) {
        onToast?.("文件名不能为空");
        return;
      }
      if (!path.endsWith(".md")) {
        onToast?.("文件名需以 .md 结尾");
        return;
      }
      setBusy(true);
      try {
        await memorySave(scope, path, content, cwd);
        onToast?.(isNew ? "已创建记忆" : "已保存");
        setEditing(null);
        reload();
      } catch (e) {
        onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(false);
      }
    },
    [cwd, onToast, reload],
  );

  const handleDelete = useCallback(
    async (entry: MemoryEntry) => {
      if (!confirm(`确定删除「${entry.path}」？`)) return;
      try {
        await memoryDelete(entry.scope, entry.path, cwd);
        onToast?.("已删除");
        reload();
      } catch (e) {
        onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [cwd, onToast, reload],
  );

  const handleRewrite = useCallback(async () => {
    if (!confirm("让 grok 用 LLM 重写所有记忆？这会重新组织资料库内容。")) return;
    setBusy(true);
    try {
      await memoryRewrite();
      onToast?.("已触发重写，稍后刷新查看");
      setTimeout(reload, 2000);
    } catch (e) {
      onToast?.(`重写失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(false);
    }
  }, [onToast, reload]);

  const handleFlush = useCallback(async () => {
    setBusy(true);
    try {
      await memoryFlush();
      onToast?.("已落盘");
      reload();
    } catch (e) {
      onToast?.(`落盘失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(false);
    }
  }, [onToast, reload]);

  const filtered = entries.filter(
    (e) =>
      e.path.toLowerCase().includes(query.toLowerCase()) ||
      e.content.toLowerCase().includes(query.toLowerCase()),
  );

  const globalCount = entries.filter((e) => e.scope === "global").length;
  const workspaceCount = entries.filter((e) => e.scope === "workspace").length;

  return (
    <div className="resources-panel">
      <div className="resources-panel__header">
        <h2 className="resources-panel__title">资料库</h2>
          <div className="resources-panel__header-actions">
            <button
              className="resources-panel__action-btn"
              onClick={handleFlush}
              disabled={busy}
              title="强制把 grok 未写的记忆落盘"
            >
              落盘
            </button>
            <button
              className="resources-panel__action-btn"
              onClick={handleRewrite}
              disabled={busy}
              title="用 LLM 重写记忆"
            >
              <SparklesIcon size="sm" /> 重写
            </button>
            <button
              className="resources-panel__action-btn"
              onClick={reload}
              disabled={loading}
              title="刷新"
            >
              <RefreshCwIcon size="sm" /> 刷新
            </button>
          </div>
      </div>

      <div className="resources-panel__search">
        <SearchIcon size="md" className="resources-panel__search-icon" />
        <input
          type="text"
          className="resources-panel__search-input"
          placeholder="搜索记忆…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="resources-panel__stats">
        <span>全局记忆 {globalCount} 条</span>
        {cwd && <span>· 工作区记忆 {workspaceCount} 条</span>}
      </div>

      <button
        className="resources-panel__create-btn"
        onClick={() =>
          setEditing({
            scope: "global",
            path: "",
            content: "# 新记忆\n\n",
            isNew: true,
          })
        }
      >
        <AddIcon size="sm" /> 新建记忆
      </button>

      <div className="resources-panel__list">
        {filtered.length === 0 && !loading && (
          <div className="resources-panel__empty">
            <BookIcon size="xl" color="var(--wb-text-tertiary)" />
            <p>
              暂无记忆。grok 会在对话中自动学习并写入
              <code>~/.grok/memory/MEMORY.md</code>。
            </p>
          </div>
        )}
        {filtered.map((entry) => (
          <div
            key={`${entry.scope}/${entry.path}`}
            className="resources-panel__item"
          >
            <div className="resources-panel__item-icon">
              <BookIcon size="md" />
            </div>
            <div className="resources-panel__item-content">
              <div className="resources-panel__item-name">
                {entry.path}
                <span className="resources-panel__item-scope">
                  {entry.scope === "global" ? "全局" : "工作区"}
                </span>
              </div>
              <pre className="resources-panel__item-preview">
                {entry.content.slice(0, 200)}
                {entry.content.length > 200 ? "…" : ""}
              </pre>
            </div>
            <div className="resources-panel__item-actions">
              <button
                className="resources-panel__icon-btn"
                onClick={() =>
                  setEditing({
                    scope: entry.scope,
                    path: entry.path,
                    content: entry.content,
                    isNew: false,
                  })
                }
                title="编辑"
              >
                <EditToolIcon size="sm" />
              </button>
              <button
                className="resources-panel__icon-btn resources-panel__icon-btn--danger"
                onClick={() => handleDelete(entry)}
                title="删除"
              >
                <DeleteIcon size="sm" />
              </button>
            </div>
          </div>
        ))}
        {loading && <div className="resources-panel__empty">加载中…</div>}
      </div>

      {editing && (
        <MemoryEditor
          initial={editing}
          cwd={cwd}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(scope, path, content, isNew) =>
            handleSave(scope, path, content, isNew)
          }
        />
      )}
    </div>
  );
}

function MemoryEditor({
  initial,
  cwd,
  busy,
  onCancel,
  onSave,
}: {
  initial: { scope: string; path: string; content: string; isNew: boolean };
  cwd?: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (scope: string, path: string, content: string, isNew: boolean) => void;
}) {
  const [scope, setScope] = useState(initial.scope);
  const [path, setPath] = useState(initial.path);
  const [content, setContent] = useState(initial.content);

  return (
    <div className="modal-overlay memory-editor__overlay" onClick={onCancel}>
      <div
        className="memory-editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="memory-editor__header">
          <h3>{initial.isNew ? "新建记忆" : `编辑 ${initial.path}`}</h3>
          <button className="memory-editor__close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="memory-editor__meta">
          <label>
            范围
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="global">全局（~/.grok/memory/）</option>
              {cwd && <option value="workspace">工作区（&lt;cwd&gt;/.grok/memory/）</option>}
            </select>
          </label>
          <label>
            文件名
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="MEMORY.md 或 notes/foo.md"
              disabled={!initial.isNew}
            />
          </label>
        </div>
        <textarea
          className="memory-editor__content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />
        <div className="memory-editor__footer">
          <button className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => onSave(scope, path, content, initial.isNew)}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

