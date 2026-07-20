/**
 * 默认权限选择器 - Composer meta 行的下拉
 *
 * 读写 ~/.grok/config.toml 的 [permission] 段（allow/deny/ask 规则）。
 * 显示当前规则数 + 快速添加常用规则的入口。
 *
 * 注意：grok 在启动时读取一次 config.toml，所以修改后需要重启 grok agent
 * 才生效（与 SettingsPanel 的 BYOK provider 一致）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, CheckIcon, AddIcon, DeleteIcon } from "@/foundation/components/Icon/icons";
import { permissionList, permissionSave } from "@/lib/grok-client";
import type { PermissionRule } from "@/lib/types";

const ACTIONS = ["allow", "deny", "ask"] as const;
const TOOLS = ["any", "bash", "read", "edit", "grep", "mcp", "webfetch"] as const;

export function PermissionPicker({ onToast }: { onToast?: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await permissionList());
      setDirty(false);
    } catch (e) {
      onToast?.(`加载权限规则失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  // Load on first open only.
  useEffect(() => {
    if (open && rules.length === 0 && !loading) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        // Only auto-close if there are no unsaved edits; otherwise make the
        // user click Save/Discard explicitly.
        if (!dirty) setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, dirty]);

  const addRule = () => {
    setRules((prev) => [...prev, { action: "allow", tool: "bash", pattern: "" }]);
    setDirty(true);
  };

  const updateRule = (idx: number, patch: Partial<PermissionRule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = async () => {
    try {
      await permissionSave(rules);
      setDirty(false);
      onToast?.("权限规则已保存（重启 grok 后生效）");
      setOpen(false);
    } catch (e) {
      onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  const summary = rules.length === 0 ? "无规则（默认）" : `${rules.length} 条规则`;

  return (
    <div className="permission-picker" ref={popRef}>
      <button
        type="button"
        className="wb-composer-meta__btn"
        onClick={() => setOpen((v) => !v)}
      >
        默认权限 · {summary}
        <ChevronDownIcon size="sm" />
      </button>
      {open && (
        <div className="permission-picker__popover" role="menu">
          <div className="permission-picker__header">
            <span>权限规则</span>
            <button
              type="button"
              className="permission-picker__add"
              onClick={addRule}
              title="添加规则"
            >
              <AddIcon size="sm" /> 添加
            </button>
          </div>
          <div className="permission-picker__list">
            {rules.length === 0 && !loading && (
              <div className="permission-picker__empty">
                暂无规则。grok 将对每个工具调用弹出确认。
              </div>
            )}
            {rules.map((rule, idx) => (
              <div key={idx} className="permission-picker__row">
                <select
                  className="permission-picker__select"
                  value={rule.action}
                  onChange={(e) => updateRule(idx, { action: e.target.value })}
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a === "allow" ? "允许" : a === "deny" ? "拒绝" : "询问"}
                    </option>
                  ))}
                </select>
                <select
                  className="permission-picker__select"
                  value={rule.tool}
                  onChange={(e) => updateRule(idx, { tool: e.target.value })}
                >
                  {TOOLS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="permission-picker__pattern"
                  placeholder="pattern，如 git *"
                  value={rule.pattern ?? ""}
                  onChange={(e) => updateRule(idx, { pattern: e.target.value })}
                />
                <button
                  type="button"
                  className="permission-picker__del"
                  onClick={() => removeRule(idx)}
                  title="删除"
                >
                  <DeleteIcon size="sm" />
                </button>
              </div>
            ))}
            {loading && <div className="permission-picker__empty">加载中…</div>}
          </div>
          {dirty && (
            <div className="permission-picker__footer">
              <span className="permission-picker__hint">重启 grok 后生效</span>
              <div className="permission-picker__actions">
                <button
                  type="button"
                  className="permission-picker__btn permission-picker__btn--ghost"
                  onClick={() => reload()}
                >
                  放弃
                </button>
                <button
                  type="button"
                  className="permission-picker__btn permission-picker__btn--primary"
                  onClick={save}
                >
                  <CheckIcon size="sm" /> 保存
                </button>
              </div>
            </div>
          )}
          {!dirty && rules.length > 0 && (
            <div className="permission-picker__footer">
              <span className="permission-picker__hint">重启 grok 后生效</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
