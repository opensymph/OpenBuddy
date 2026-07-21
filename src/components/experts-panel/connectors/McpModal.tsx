import { useCallback, useEffect, useState } from "react";
import {
  XCloseIcon, SearchIcon, ConfigureIcon, McpIcon, OpenExternalIcon, DeleteIcon,
} from "@/foundation/components/Icon/icons";
import { mcpDelete, mcpList, mcpToggle } from "@/lib/grok-client";
import type { McpServerEntry } from "@/lib/types";
import { McpConfigEditor } from "./McpConfigEditor";

/** "MCP 服务管理" modal (截图 6) — list / search / empty state, and hosts the
 *  raw JSON config editor (截图 7) when 配置 MCP is pressed. */
export function McpModal({
  onClose, onToast, initialEditing = false,
}: {
  onClose: () => void;
  onToast?: (m: string) => void;
  /** Open straight into the JSON config editor (自定义连接器 entry point). */
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try { setServers(await mcpList()); }
    catch (e) { onToast?.(`加载 MCP 服务失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = servers.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()));

  const handleToggle = async (s: McpServerEntry, enabled: boolean) => {
    try { await mcpToggle(s.name, enabled); reload(); }
    catch (e) { onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`); }
  };
  const handleDelete = async (s: McpServerEntry) => {
    if (!confirm(`确定删除 MCP 服务「${s.name}」？`)) return;
    try { await mcpDelete(s.name); onToast?.("已删除"); reload(); }
    catch (e) { onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  };

  return (
    <div className="modal-overlay mcp-overlay" onClick={onClose}>
      <div className="mcp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-modal-head">
          <div className="mcp-modal-titlewrap">
            <span className="mcp-modal-glyph"><McpIcon size="md" /></span>
            <div>
              <div className="mcp-modal-title">MCP 服务管理</div>
              <div className="mcp-modal-sub">安装 MCP 服务，为 AI 扩展更多工具能力</div>
            </div>
          </div>
          <div className="mcp-modal-headright">
            {!editing && (
              <button type="button" className="um-btn um-btn--grey" onClick={() => setEditing(true)}>
                <ConfigureIcon size="sm" /><span>配置 MCP</span>
              </button>
            )}
            <button type="button" className="mcp-modal-close" onClick={onClose}>
              <XCloseIcon size="md" />
            </button>
          </div>
        </div>

        <div className="mcp-modal-body">
          {editing ? (
            <McpConfigEditor onBack={() => setEditing(false)} onSaved={reload} onToast={onToast} />
          ) : (
            <div className="mcp-panel">
              <div className="mcp-panel-searchrow">
                <div className="um-search um-search--flex">
                  <SearchIcon size="sm" className="um-search-icon" />
                  <input className="um-search-input" value={search} placeholder="搜索服务器..."
                    onChange={(e) => setSearch(e.target.value)} />
                </div>
                <button type="button" className="um-btn um-btn--grey"
                  onClick={() => onToast?.("MCP Hub 暂未接入，请点击「配置 MCP」手动添加服务器")}>
                  <OpenExternalIcon size="sm" /><span>MCP Hub</span>
                </button>
              </div>

              {loading ? (
                <div className="ec-loading">加载中…</div>
              ) : servers.length === 0 ? (
                <div className="mcp-empty">
                  <McpIcon size="xl" className="mcp-empty-icon" />
                  <div className="mcp-empty-title">暂无 MCP 服务器</div>
                  <div className="mcp-empty-hint">点击配置按钮添加 MCP 服务器</div>
                  <button type="button" className="um-btn um-btn--grey" onClick={() => setEditing(true)}>
                    配置
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="mcp-empty">
                  <div className="mcp-empty-hint">没有匹配「{search}」的服务器</div>
                </div>
              ) : (
                <div className="mcp-list">
                  {filtered.map((s) => (
                    <div key={s.name} className="mcp-item">
                      <div className="mcp-item-main">
                        <span className={`mcp-dot${s.enabled ? " mcp-dot--on" : ""}`} />
                        <div className="mcp-item-info">
                          <div className="mcp-item-name">{s.name}</div>
                          <div className="mcp-item-meta">
                            {s.transport ?? "—"} · {s.enabled ? "已启用" : "已禁用"}
                            {s.disabledReason ? ` · ${s.disabledReason}` : ""}
                          </div>
                        </div>
                      </div>
                      <label className="sk-toggle" title={s.enabled ? "已启用" : "已禁用"}>
                        <input type="checkbox" checked={s.enabled}
                          onChange={() => handleToggle(s, !s.enabled)} />
                        <span className="sk-toggle-track"><span className="sk-toggle-thumb" /></span>
                      </label>
                      <button type="button" className="sk-inst-del" title="删除"
                        onClick={() => handleDelete(s)}><DeleteIcon size="sm" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
