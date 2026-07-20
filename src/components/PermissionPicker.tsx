/**
 * 权限模式选择器 - Composer meta 行的下拉
 *
 * 对应 grok 的 `[ui] permission_mode`,三档:
 *  - ask            审批模式:每次工具调用都弹确认
 *  - auto           自动模式:grok 的分类器自动批准安全操作
 *  - always-approve 始终允许:所有工具调用自动批准
 *
 * 切换会写入 config.toml(影响之后的启动),并通过
 * `x.ai/yolo_mode_changed` 通知运行中的 agent 立即生效。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CheckIcon,
  ShieldCheckIcon,
} from "@/foundation/components/Icon/icons";
import { permissionModeGet, permissionModeSet } from "@/lib/grok-client";
import type { PermissionMode } from "@/lib/grok-client";

const MODES: { id: PermissionMode; label: string; desc: string }[] = [
  { id: "ask", label: "审批模式", desc: "每次工具调用都需要确认" },
  { id: "auto", label: "自动模式", desc: "安全操作自动执行,风险操作询问" },
  { id: "always-approve", label: "始终允许", desc: "所有工具调用自动批准" },
];

export function PermissionPicker({
  onToast,
  triggerLabel,
}: {
  onToast?: (msg: string) => void;
  /** 覆盖触发按钮文字（如本地助理页固定显示「默认权限」）；缺省显示当前模式名。 */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PermissionMode>("ask");
  const [busy, setBusy] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    permissionModeGet()
      .then(setMode)
      .catch(() => {
        /* 读不到就用默认 ask */
      });
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = useCallback(
    async (next: PermissionMode) => {
      if (next === mode) {
        setOpen(false);
        return;
      }
      setBusy(true);
      try {
        await permissionModeSet(next);
        setMode(next);
        setOpen(false);
      } catch (e) {
        onToast?.(`权限模式切换失败:${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(false);
      }
    },
    [mode, onToast],
  );

  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className="permission-picker" ref={popRef}>
      <button
        type="button"
        className="wb-composer-meta__btn"
        onClick={() => setOpen((v) => !v)}
        title={`权限模式 · ${current.desc}`}
      >
        <ShieldCheckIcon size="sm" />
        {triggerLabel ?? current.label}
        <ChevronDownIcon size="sm" />
      </button>
      {open && (
        <div className="permission-picker__popover permission-picker__popover--modes" role="menu">
          <div className="permission-picker__header">权限模式</div>
          <div className="permission-picker__modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={
                  "permission-picker__mode" +
                  (m.id === mode ? " permission-picker__mode--active" : "")
                }
                onClick={() => select(m.id)}
                disabled={busy}
                role="menuitemradio"
                aria-checked={m.id === mode}
              >
                <span className="permission-picker__mode-label">{m.label}</span>
                <span className="permission-picker__mode-desc">{m.desc}</span>
                {m.id === mode && <CheckIcon size="sm" className="permission-picker__mode-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
