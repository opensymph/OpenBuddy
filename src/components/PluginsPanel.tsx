/**
 * 插件面板 - 对接 grok 的 x.ai/plugins/list + x.ai/plugins/action
 *
 * 显示已安装的 grok 插件（含 skills/agents/hooks/mcp 计数），支持启用/禁用。
 * 对应 WorkBuddy 的 plugins-panel。
 *
 * 插件来源：~/.grok/plugins/、项目 .grok/plugins/、marketplace 安装。
 */
import { useCallback, useEffect, useState } from "react";
import {
  PuzzlePieceIcon,
  RefreshCwIcon,
  SparklesIcon,
  SkillIcon,
  AgentToolIcon,
  McpIcon,
} from "@/foundation/components/Icon/icons";
import { pluginsAction, pluginsList } from "@/lib/grok-client";
import type { PluginEntry } from "@/lib/types";

interface PluginsPanelProps {
  /** Current session id (for the plugins/list call). */
  sessionId?: string;
  onToast?: (msg: string) => void;
}

export function PluginsPanel({ sessionId, onToast }: PluginsPanelProps) {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await pluginsList(sessionId);
      setPlugins(resp.plugins ?? []);
    } catch (e) {
      onToast?.(`加载插件失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId, onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = useCallback(
    async (plugin: PluginEntry) => {
      if (!sessionId) {
        onToast?.("需要先开启一个会话才能操作插件");
        return;
      }
      setBusy(plugin.name);
      try {
        await pluginsAction(sessionId, {
          type: plugin.enabled ? "disable" : "enable",
          pluginName: plugin.name,
        });
        onToast?.(plugin.enabled ? `已禁用「${plugin.name}」` : `已启用「${plugin.name}」`);
        reload();
      } catch (e) {
        onToast?.(`操作失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const enabledCount = plugins.filter((p) => p.enabled).length;
  const trustedCount = plugins.filter((p) => p.trusted).length;

  return (
    <div className="plugins-panel">
      <div className="plugins-panel__header">
        <h2 className="plugins-panel__title">插件</h2>
        <button
          className="plugins-panel__action-btn"
          onClick={reload}
          disabled={loading}
          title="刷新"
        >
          <RefreshCwIcon size="sm" /> 刷新
        </button>
      </div>

      <div className="plugins-panel__stats">
        {plugins.length} 个插件 · {enabledCount} 启用 · {trustedCount} 受信任
      </div>

      {!sessionId && (
        <p className="plugins-panel__hint">
          ⚠ 启用/禁用插件需要一个活动会话。请先在主页开启对话。
        </p>
      )}

      <div className="plugins-panel__list">
        {plugins.length === 0 && !loading && (
          <div className="plugins-panel__empty">
            <PuzzlePieceIcon size="xl" color="var(--wb-text-tertiary)" />
            <p>暂无插件。</p>
            <p className="plugins-panel__hint">
              在「市场」tab 安装插件，或把插件放到 <code>~/.grok/plugins/</code>。
            </p>
          </div>
        )}
        {plugins.map((p) => (
          <div
            key={p.id ?? p.name}
            className={`plugins-panel__item ${p.enabled ? "" : "plugins-panel__item--muted"}`}
          >
            <div className="plugins-panel__item-icon">
              <PuzzlePieceIcon size="md" />
            </div>
            <div className="plugins-panel__item-content">
              <div className="plugins-panel__item-name">
                {p.name}
                {p.version && (
                  <span className="plugins-panel__version">v{p.version}</span>
                )}
                <span className={`plugins-panel__scope plugins-panel__scope--${p.scope}`}>
                  {scopeLabel(p.scope)}
                </span>
                {!p.trusted && (
                  <span className="plugins-panel__warn">未受信任</span>
                )}
              </div>
              {p.description && (
                <div className="plugins-panel__item-desc">{p.description}</div>
              )}
              <div className="plugins-panel__item-meta">
                {p.skillCount !== undefined && p.skillCount > 0 && (
                  <span title="技能"><SkillIcon size="sm" /> {p.skillCount}</span>
                )}
                {p.agentCount !== undefined && p.agentCount > 0 && (
                  <span title="助理"><AgentToolIcon size="sm" /> {p.agentCount}</span>
                )}
                {p.mcpServerCount !== undefined && p.mcpServerCount > 0 && (
                  <span title="MCP"><McpIcon size="sm" /> {p.mcpServerCount}</span>
                )}
                {p.hookCount !== undefined && p.hookCount > 0 && (
                  <span title="Hooks"><SparklesIcon size="sm" /> {p.hookCount}</span>
                )}
                {p.marketplaceSource && (
                  <span className="plugins-panel__source">{p.marketplaceSource}</span>
                )}
              </div>
            </div>
            <div className="plugins-panel__item-actions">
              <button
                className={`plugins-panel__toggle ${p.enabled ? "plugins-panel__toggle--on" : ""}`}
                onClick={() => handleToggle(p)}
                disabled={busy === p.name}
                title={p.enabled ? "禁用" : "启用"}
              >
                {busy === p.name ? "…" : p.enabled ? "已启用" : "已禁用"}
              </button>
            </div>
          </div>
        ))}
        {loading && <div className="plugins-panel__empty">加载中…</div>}
      </div>
    </div>
  );
}

function scopeLabel(scope?: string): string {
  switch (scope) {
    case "user":
      return "用户";
    case "project":
      return "项目";
    case "config":
      return "配置";
    case "cli":
      return "命令行";
    default:
      return scope ?? "";
  }
}
