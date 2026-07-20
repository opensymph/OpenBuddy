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
import { listen } from "@tauri-apps/api/event";
import {
  BookIcon,
  SearchIcon,
  AddIcon,
  EditToolIcon,
  DeleteIcon,
  RefreshCwIcon,
  SparklesIcon,
  LightbulbIcon,
} from "@/foundation/components/Icon/icons";
import {
  inspirationGenerate,
  memoryDelete,
  memoryFlush,
  memoryList,
  memoryRewrite,
  memorySave,
} from "@/lib/grok-client";
import { registerForeignUpdateListener } from "@/stores/session-store";
import type { InspirationCard, MemoryEntry, PromptComplete } from "@/lib/types";

interface ResourcesPanelProps {
  cwd?: string;
  onToast?: (msg: string) => void;
}

export function ResourcesPanel({ cwd, onToast }: ResourcesPanelProps) {
  // Tab state kept as a string so TS doesn't narrow it after early returns —
  // we render both tabs' headers in one branch and conditionally show bodies.
  const [tab, setTab] = useState<"library" | "inspiration">("library");
  const isInspiration = (tab as string) === "inspiration";
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
    if (tab === "library") reload();
  }, [tab, reload]);

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
        <h2 className="resources-panel__title">资料库·灵感</h2>
        {!isInspiration && (
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
        )}
      </div>

      <div className="resources-panel__tabs">
        <button
          className={`resources-panel__tab ${!isInspiration ? "resources-panel__tab--active" : ""}`}
          onClick={() => setTab("library")}
        >
          <BookIcon size="sm" /> 资料库
        </button>
        <button
          className={`resources-panel__tab ${isInspiration ? "resources-panel__tab--active" : ""}`}
          onClick={() => setTab("inspiration")}
        >
          <LightbulbIcon size="sm" /> 灵感
        </button>
      </div>

      {isInspiration && <InspirationTab cwd={cwd} />}

      {!isInspiration && (
        <>
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
        </>
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

// 灵感 tab：grok 没有对应能力，显示说明 + 引导到资料库
/**
 * 灵感 tab - 用 grok 真实生成兴趣领域的灵感卡片
 *
 * 实现：用户选一个兴趣分类（AI/产品/办公/学习/健康/数据 等，对应 WorkBuddy
 * 的 i18n 分类），点"生成"，后端开一个 side-channel grok session，prompt 让
 * grok 输出结构化 JSON 卡片。前端通过 foreignUpdateListener 收集流式响应，
 * complete 后解析 JSON 渲染卡片。
 *
 * 为个性化，后端会把用户最近的 memory 笔记拼进 prompt（来自资料库）。
 * 这样内容不是 mock，是 grok 基于用户画像真实生成的。
 *
 * 对应 WorkBuddy 的 inspiration-panel（WorkBuddy 自己 hard-disabled 此功能，
 * 依赖外部内容源；OpenBuddy 用 grok LLM 能力替代内容源）。
 */
function InspirationTab({ cwd }: { cwd?: string }) {
  const [category, setCategory] = useState<string>("ai_models");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamingPreview, setStreamingPreview] = useState("");

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCards([]);
    setStreamingPreview("");
    try {
      const started = await inspirationGenerate(category, cwd, count);
      // Register a foreign-update listener to accumulate grok's streamed JSON
      // for this session without polluting the main transcript.
      let acc = "";
      const unsubscribe = registerForeignUpdateListener(started.sessionId, (u) => {
        if (((u as { sessionUpdate?: string }).sessionUpdate ?? (u as { type?: string }).type) === "agent_message_chunk") {
          const chunk = u as unknown as { content?: { text?: string }[] };
          const delta = Array.isArray(chunk.content)
            ? chunk.content.map((c: { text?: string }) => c.text ?? "").join("")
            : ((chunk.content as unknown as { text?: string })?.text ?? "");
          if (delta) {
            acc += delta;
            setStreamingPreview(acc);
          }
        }
      });
      // Listen for completion of this specific session.
      const completeUnlisten = await listen<PromptComplete>("grok://complete", (e) => {
        if (e.payload.sessionId === started.sessionId) {
          // Parse the accumulated JSON (grok may wrap in ```json fences despite
          // our instruction — strip them defensively).
          const cleaned = acc
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          try {
            const parsed = JSON.parse(cleaned) as InspirationCard[];
            if (Array.isArray(parsed)) {
              setCards(parsed);
            } else {
              setError("grok 返回格式异常，请重试");
            }
          } catch {
            setError("无法解析 grok 的输出，请重试或换个分类");
          }
          setLoading(false);
          setStreamingPreview("");
          unsubscribe();
          completeUnlisten();
        }
      });
      // Safety timeout: if no complete in 90s, give up.
      setTimeout(() => {
        if (loading) {
          setLoading(false);
          setError("生成超时，请重试");
          unsubscribe();
          completeUnlisten();
        }
      }, 90_000);
    } catch (e) {
      setError(`生成失败：${String(e).replace(/^Error:\s*/, "")}`);
      setLoading(false);
    }
  }, [category, count, cwd]);

  return (
    <div className="inspiration-tab">
      <div className="inspiration-tab__controls">
        <label className="inspiration-tab__field">
          <span>兴趣分类</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inspiration-tab__field">
          <span>数量（1-10）</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(10, Number(e.target.value) || 5)))
            }
          />
        </label>
        <button
          className="inspiration-tab__generate"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "生成中…" : "生成灵感"}
        </button>
      </div>

      <p className="inspiration-tab__hint">
        内容由 grok 基于你的资料库（memory）真实生成，每条卡片含标题、摘要和行动建议。
      </p>

      {error && <div className="inspiration-tab__error">{error}</div>}

      {loading && streamingPreview && (
        <div className="inspiration-tab__streaming">
          <div className="inspiration-tab__streaming-label">grok 正在生成…</div>
          <pre className="inspiration-tab__streaming-text">{streamingPreview.slice(-400)}</pre>
        </div>
      )}

      {cards.length > 0 && (
        <div className="inspiration-tab__cards">
          {cards.map((card, i) => (
            <article key={i} className="inspiration-card">
              <div className="inspiration-card__index">#{i + 1}</div>
              <div className="inspiration-card__body">
                <h4 className="inspiration-card__title">{card.title}</h4>
                <p className="inspiration-card__summary">{card.summary}</p>
                {card.takeaway && (
                  <p className="inspiration-card__takeaway">
                    <SparklesIcon size="sm" /> {card.takeaway}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && cards.length === 0 && !error && (
        <div className="inspiration-tab__empty">
          <LightbulbIcon size="xl" color="var(--wb-text-tertiary)" />
          <p>选择兴趣分类，点「生成灵感」让 grok 为你策划内容。</p>
        </div>
      )}
    </div>
  );
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "ai_models", label: "AI 大模型" },
  { key: "product_design", label: "产品设计" },
  { key: "office", label: "办公协作" },
  { key: "learning", label: "学习提升" },
  { key: "health", label: "健康养生" },
  { key: "data_analysis", label: "数据分析" },
  { key: "travel", label: "旅行出行" },
  { key: "career", label: "职业发展" },
  { key: "industry", label: "行业趋势" },
  { key: "efficiency", label: "效率工具" },
  { key: "pm", label: "项目管理" },
];
