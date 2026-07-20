/**
 * 市场面板 - 对接 grok 的 x.ai/marketplace/list + x.ai/marketplace/action
 *
 * 显示 grok 配置的所有插件市场源（marketplace sources）及其插件，
 * 支持安装/卸载/更新/刷新源 + 添加/移除源。
 * 对应 WorkBuddy 的 UnifiedMarketPage。
 *
 * 市场源配置在 ~/.grok/config.toml 的 [[marketplace.sources]] 段。
 */
import { useCallback, useEffect, useState } from "react";
import {
  Store,
  RefreshCw,
  PlusCircle,
  Trash2,
  Download,
  Check,
  X,
  Search as SearchIcon,
} from "lucide-react";
import {
  marketplaceAction,
  marketplaceList,
} from "@/lib/grok-client";
import type { MarketplacePluginEntry, MarketplaceScanResult } from "@/lib/types";

interface MarketplacePanelProps {
  sessionId?: string;
  onToast?: (msg: string) => void;
}

export function MarketplacePanel({ sessionId, onToast }: MarketplacePanelProps) {
  const [sources, setSources] = useState<MarketplaceScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [newSourceUrl, setNewSourceUrl] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await marketplaceList(sessionId);
      setSources(resp.sources ?? []);
    } catch (e) {
      onToast?.(`加载市场失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId, onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const requireSession = (): string | null => {
    if (!sessionId) {
      onToast?.("需要先开启一个会话才能操作市场");
      return null;
    }
    return sessionId;
  };

  const handleInstall = useCallback(
    async (source: MarketplaceScanResult, plugin: MarketplacePluginEntry) => {
      const sid = requireSession();
      if (!sid) return;
      const key = `${source.sourceName}/${plugin.name}`;
      setBusy(key);
      try {
        await marketplaceAction(sid, {
          type: "install",
          sourceUrlOrPath: source.sourceUrlOrPath,
          pluginRelativePath: plugin.relativePath,
        });
        onToast?.(`已安装「${plugin.name}」`);
        reload();
      } catch (e) {
        onToast?.(`安装失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const handleUninstall = useCallback(
    async (source: MarketplaceScanResult, plugin: MarketplacePluginEntry) => {
      const sid = requireSession();
      if (!sid) return;
      if (!confirm(`确定卸载「${plugin.name}」？`)) return;
      const key = `${source.sourceName}/${plugin.name}`;
      setBusy(key);
      try {
        await marketplaceAction(sid, {
          type: "uninstall",
          sourceUrlOrPath: source.sourceUrlOrPath,
          pluginRelativePath: plugin.relativePath,
        });
        onToast?.(`已卸载「${plugin.name}」`);
        reload();
      } catch (e) {
        onToast?.(`卸载失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const handleUpdate = useCallback(
    async (source: MarketplaceScanResult, plugin: MarketplacePluginEntry) => {
      const sid = requireSession();
      if (!sid) return;
      const key = `${source.sourceName}/${plugin.name}`;
      setBusy(key);
      try {
        await marketplaceAction(sid, {
          type: "update",
          sourceUrlOrPath: source.sourceUrlOrPath,
          pluginRelativePath: plugin.relativePath,
        });
        onToast?.(`已更新「${plugin.name}」`);
        reload();
      } catch (e) {
        onToast?.(`更新失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const handleRefreshSource = useCallback(
    async (source?: MarketplaceScanResult) => {
      const sid = requireSession();
      if (!sid) return;
      setBusy(`refresh:${source?.sourceName ?? "all"}`);
      try {
        await marketplaceAction(sid, {
          type: "refresh",
          sourceUrlOrPath: source?.sourceUrlOrPath ?? null,
        });
        onToast?.(source ? `已刷新「${source.sourceName}」` : "已刷新所有源");
        reload();
      } catch (e) {
        onToast?.(`刷新失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const handleRemoveSource = useCallback(
    async (source: MarketplaceScanResult) => {
      const sid = requireSession();
      if (!sid) return;
      if (!confirm(`确定移除市场源「${source.sourceName}」？已安装的插件不会被删除。`)) return;
      setBusy(`remove:${source.sourceName}`);
      try {
        await marketplaceAction(sid, {
          type: "remove_source",
          sourceUrlOrPath: source.sourceUrlOrPath,
        });
        onToast?.(`已移除源「${source.sourceName}」`);
        reload();
      } catch (e) {
        onToast?.(`移除失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, onToast, reload],
  );

  const handleAddSource = useCallback(async () => {
    const sid = requireSession();
    if (!sid) return;
    const url = newSourceUrl.trim();
    if (!url) return;
    setBusy("add-source");
    try {
      await marketplaceAction(sid, { type: "add_source", url });
      onToast?.(`已添加源 ${url}`);
      setNewSourceUrl("");
      setAddingSource(false);
      reload();
    } catch (e) {
      onToast?.(`添加失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(null);
    }
  }, [sessionId, newSourceUrl, onToast, reload]);

  // Flatten all plugins across sources for the search box.
  const allPlugins = sources.flatMap((s) =>
    s.plugins.map((p) => ({ source: s, plugin: p })),
  );
  const filtered = allPlugins.filter(({ plugin }) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      plugin.name.toLowerCase().includes(q) ||
      (plugin.description ?? "").toLowerCase().includes(q) ||
      (plugin.category ?? "").toLowerCase().includes(q) ||
      (plugin.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const totalPlugins = allPlugins.length;
  const installedCount = allPlugins.filter(
    ({ plugin }) => plugin.installStatus === "installed",
  ).length;

  return (
    <div className="marketplace-panel">
      <div className="marketplace-panel__header">
        <h2 className="marketplace-panel__title">市场</h2>
        <div className="marketplace-panel__actions">
          <button
            className="marketplace-panel__action-btn"
            onClick={() => handleRefreshSource()}
            disabled={loading || busy === "refresh:all"}
            title="刷新所有源"
          >
            <RefreshCw size={14} /> 刷新全部
          </button>
          <button
            className="marketplace-panel__action-btn marketplace-panel__action-btn--primary"
            onClick={() => setAddingSource((v) => !v)}
            title="添加市场源（git URL）"
          >
            <PlusCircle size={14} /> 添加源
          </button>
        </div>
      </div>

      {addingSource && (
        <div className="marketplace-panel__add-source">
          <input
            type="text"
            className="marketplace-panel__add-input"
            placeholder="https://github.com/owner/marketplace-repo.git"
            value={newSourceUrl}
            onChange={(e) => setNewSourceUrl(e.target.value)}
            autoFocus
          />
          <button
            className="marketplace-panel__action-btn marketplace-panel__action-btn--primary"
            onClick={handleAddSource}
            disabled={busy === "add-source" || !newSourceUrl.trim()}
          >
            {busy === "add-source" ? "添加中…" : "添加"}
          </button>
          <button
            className="marketplace-panel__action-btn"
            onClick={() => {
              setAddingSource(false);
              setNewSourceUrl("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="marketplace-panel__search">
        <SearchIcon size={16} className="marketplace-panel__search-icon" />
        <input
          type="text"
          className="marketplace-panel__search-input"
          placeholder="搜索插件…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="marketplace-panel__stats">
        {sources.length} 个源 · {totalPlugins} 个插件 · {installedCount} 已安装
      </div>

      {!sessionId && (
        <p className="marketplace-panel__hint">
          ⚠ 安装/卸载需要一个活动会话。请先在主页开启对话。
        </p>
      )}

      {sources.length === 0 && !loading && (
        <div className="marketplace-panel__empty">
          <Store size={48} color="var(--wb-text-tertiary)" />
          <p>暂无市场源。</p>
          <p className="marketplace-panel__hint">
            点「添加源」输入 git URL，或在 config.toml 配置 <code>[[marketplace.sources]]</code>。
          </p>
        </div>
      )}

      {/* 按源分组展示 */}
      {!query &&
        sources.map((source) => (
          <div key={source.sourceUrlOrPath} className="marketplace-source">
            <div className="marketplace-source__header">
              <div className="marketplace-source__name">{source.sourceName}</div>
              <div className="marketplace-source__meta">
                {source.sourceKind} · {source.plugins.length} 个插件
              </div>
              <div className="marketplace-source__actions">
                <button
                  className="marketplace-source__btn"
                  onClick={() => handleRefreshSource(source)}
                  disabled={busy === `refresh:${source.sourceName}`}
                  title="刷新此源"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  className="marketplace-source__btn marketplace-source__btn--danger"
                  onClick={() => handleRemoveSource(source)}
                  disabled={busy === `remove:${source.sourceName}`}
                  title="移除源"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {source.error && (
              <div className="marketplace-source__error">{source.error}</div>
            )}
            <div className="marketplace-source__plugins">
              {source.plugins.map((plugin) => (
                <MarketplacePluginCard
                  key={plugin.relativePath}
                  plugin={plugin}
                  busy={busy === `${source.sourceName}/${plugin.name}`}
                  onInstall={() => handleInstall(source, plugin)}
                  onUninstall={() => handleUninstall(source, plugin)}
                  onUpdate={() => handleUpdate(source, plugin)}
                />
              ))}
            </div>
          </div>
        ))}

      {/* 搜索结果（扁平） */}
      {query &&
        filtered.map(({ source, plugin }) => (
          <MarketplacePluginCard
            key={`${source.sourceUrlOrPath}/${plugin.relativePath}`}
            plugin={plugin}
            sourceName={source.sourceName}
            busy={busy === `${source.sourceName}/${plugin.name}`}
            onInstall={() => handleInstall(source, plugin)}
            onUninstall={() => handleUninstall(source, plugin)}
            onUpdate={() => handleUpdate(source, plugin)}
          />
        ))}

      {query && filtered.length === 0 && !loading && (
        <div className="marketplace-panel__empty">无匹配的插件</div>
      )}
      {loading && <div className="marketplace-panel__empty">加载中…</div>}
    </div>
  );
}

function MarketplacePluginCard({
  plugin,
  sourceName,
  busy,
  onInstall,
  onUninstall,
  onUpdate,
}: {
  plugin: MarketplacePluginEntry;
  sourceName?: string;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onUpdate: () => void;
}) {
  const installed = plugin.installStatus === "installed";
  return (
    <div className={`mp-plugin ${installed ? "mp-plugin--installed" : ""}`}>
      <div className="mp-plugin__body">
        <div className="mp-plugin__name">
          {plugin.name}
          {plugin.version && (
            <span className="mp-plugin__version">v{plugin.version}</span>
          )}
          {installed && (
            <span className="mp-plugin__badge mp-plugin__badge--installed">
              <Check size={10} /> 已安装
              {plugin.installedVersion && plugin.installedVersion !== plugin.version
                ? ` (v${plugin.installedVersion})`
                : ""}
            </span>
          )}
          {plugin.category && (
            <span className="mp-plugin__badge">{plugin.category}</span>
          )}
        </div>
        {plugin.description && (
          <div className="mp-plugin__desc">{plugin.description}</div>
        )}
        <div className="mp-plugin__meta">
          {sourceName && <span>来源：{sourceName}</span>}
          {plugin.author && <span>作者：{plugin.author}</span>}
          {plugin.skillCount > 0 && <span>{plugin.skillCount} 技能</span>}
          {plugin.hasAgents && <span>含助理</span>}
          {plugin.hasHooks && <span>含 Hooks</span>}
          {plugin.hasMcp && <span>含 MCP</span>}
          {plugin.homepage && (
            <a
              href={plugin.homepage}
              target="_blank"
              rel="noreferrer"
              className="mp-plugin__link"
            >
              主页
            </a>
          )}
        </div>
      </div>
      <div className="mp-plugin__actions">
        {busy ? (
          <span className="mp-plugin__busy">处理中…</span>
        ) : installed ? (
          <>
            {plugin.installedVersion &&
              plugin.installedVersion !== plugin.version && (
                <button
                  className="mp-plugin__btn mp-plugin__btn--update"
                  onClick={onUpdate}
                  title={`更新到 v${plugin.version}`}
                >
                  更新
                </button>
              )}
            <button
              className="mp-plugin__btn mp-plugin__btn--danger"
              onClick={onUninstall}
            >
              卸载
            </button>
          </>
        ) : (
          <button
            className="mp-plugin__btn mp-plugin__btn--install"
            onClick={onInstall}
          >
            <Download size={12} /> 安装
          </button>
        )}
      </div>
    </div>
  );
}
