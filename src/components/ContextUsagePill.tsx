import { useEffect, useRef, useState } from "react";
import { useContextUsageStore } from "@/stores/context-usage-store";
import type { ContextInfo } from "@/lib/types";

/**
 * Context-usage pill for the Composer footer (WorkBuddy 图1样式) with a rich
 * breakdown popover (图2样式: 上下文容量 + 分类占比 + 平均缓存命中率).
 *
 * Data comes from grok's `x.ai/session/info` / `x.ai/session/usage` via the
 * context-usage store — OpenBuddy never counts tokens itself. The pill hides
 * itself when there's no live session data (e.g. fresh home page, or an old
 * session the agent hasn't loaded).
 */

/** Adaptive token formatting: ≥100万 context → 万 (13.9万/100万), else K (51.3K/192.0K). */
export function formatTokenCount(t: number, useWan: boolean): string {
  if (useWan) {
    const wan = t / 10000;
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`;
  }
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K`;
  return String(t);
}

interface CategoryRow {
  key: string;
  label: string;
  tokens: number;
  detail?: string;
}

/** Build the popover's category rows from a ContextInfo snapshot. */
function buildCategoryRows(ctx: ContextInfo): CategoryRow[] {
  const categories = ctx.usageCategories ?? [];
  const skills = categories.find((c) => c.label === "Skills");
  const mcp = categories.find((c) => c.label === "MCP servers");

  const rows: CategoryRow[] = [
    { key: "messages", label: "消息", tokens: ctx.messageTokens },
    { key: "tools", label: "系统工具", tokens: ctx.toolDefinitionsTokens },
    { key: "skills", label: "技能", tokens: skills?.tokens ?? 0, detail: skills?.detail },
    { key: "system", label: "系统提示词", tokens: ctx.systemPromptTokens },
  ];
  if (mcp && mcp.tokens > 0) {
    rows.push({ key: "mcp", label: "MCP", tokens: mcp.tokens, detail: mcp.detail });
  }
  // 其他 = 兜底余项。注意 grok 的 skills/MCP 估算与 messageTokens 有重叠
  // (vendor 文档注明),所以各项占比为近似值,余项 clamp 到 0。
  const known = rows.reduce((sum, r) => sum + r.tokens, 0);
  rows.push({ key: "other", label: "其他", tokens: Math.max(0, ctx.used - known) });
  return rows;
}

export function ContextUsagePill({ sessionId }: { sessionId?: string }) {
  const entry = useContextUsageStore((s) => (sessionId ? s.bySession[sessionId] : undefined));
  const refresh = useContextUsageStore((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click; also refresh the snapshot each time it opens.
  useEffect(() => {
    if (!open) return;
    if (sessionId) void refresh(sessionId);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, sessionId, refresh]);

  // Close the popover when switching sessions.
  useEffect(() => setOpen(false), [sessionId]);

  const ctx = entry?.info?.context;
  if (!sessionId || !ctx || !ctx.total) return null;

  const pct = ctx.usagePct;
  const useWan = ctx.total >= 1_000_000;
  const pillText = `${pct}% · ${formatTokenCount(ctx.used, useWan)} / ${formatTokenCount(ctx.total, useWan)} 上下文已使用`;

  const rows = buildCategoryRows(ctx);
  const usage = entry?.usage;
  const cacheHitRate =
    usage && usage.inputTokens > 0
      ? `${((usage.cachedReadTokens / usage.inputTokens) * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="context-usage" ref={ref}>
      <button
        type="button"
        className={"context-usage__pill" + (open ? " context-usage__pill--open" : "")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="上下文用量详情"
      >
        {pillText}
      </button>
      {open && (
        <div className="context-usage__popover" onClick={(e) => e.stopPropagation()}>
          <div className="context-usage__popover-header">
            <span className="context-usage__popover-title">上下文容量</span>
            <span className="context-usage__popover-summary">
              {formatTokenCount(ctx.used, useWan)}/{formatTokenCount(ctx.total, useWan)}（{pct}%）
            </span>
          </div>
          <div className="context-usage__bar">
            <div
              className="context-usage__bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, (ctx.used / ctx.total) * 100))}%` }}
            />
          </div>
          <ul className="context-usage__rows">
            {rows.map((r) => (
              <li key={r.key} className="context-usage__row">
                <span className={`context-usage__swatch context-usage__swatch--${r.key}`} />
                <span className="context-usage__row-label">
                  {r.label}
                  {r.detail ? <span className="context-usage__row-detail">{r.detail}</span> : null}
                </span>
                <span className="context-usage__row-value">
                  {ctx.used > 0 ? `${((r.tokens / ctx.used) * 100).toFixed(1)}%` : "0%"}
                </span>
              </li>
            ))}
          </ul>
          <div className="context-usage__footer">
            <span>平均缓存命中率</span>
            <span className="context-usage__footer-value">{cacheHitRate}</span>
          </div>
        </div>
      )}
    </div>
  );
}
