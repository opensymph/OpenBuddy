/**
 * AutomationPermissionConfirmDialog — 完全访问权限的风险确认弹窗。
 *
 * 复刻 WorkBuddy automation-permission-confirm-dialog.tsx：
 * 以完全访问权限创建（或从默认权限升级为完全访问）前必须勾选
 * 「我已了解风险…」才能确认创建；也可一键「改为「默认权限」运行 →」。
 */
import { useCallback, useState } from "react";
import { Checkbox } from "./controls";

function WarningIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function AutomationPermissionConfirmDialog({
  open,
  onConfirm,
  onCancel,
  onFallbackToDefault,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onFallbackToDefault?: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const handleConfirm = useCallback(() => {
    if (!acknowledged) return;
    onConfirm();
    setAcknowledged(false);
  }, [acknowledged, onConfirm]);
  const handleCancel = useCallback(() => {
    onCancel();
    setAcknowledged(false);
  }, [onCancel]);
  const handleFallback = useCallback(() => {
    onFallbackToDefault?.();
    setAcknowledged(false);
  }, [onFallbackToDefault]);

  if (!open) return null;
  return (
    <div className="modal-overlay automation-permission-confirm__overlay" onClick={handleCancel}>
      <div
        className="automation-permission-confirm__dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="automation-permission-confirm__header">
          <span className="automation-permission-confirm__icon">
            <WarningIcon />
          </span>
          <h3 className="automation-permission-confirm__title">这条自动化任务将以完全访问权限运行</h3>
        </div>
        <p className="automation-permission-confirm__desc">
          为了能在你离开电脑时无人值守地完成，自动化任务默认拥有完全访问权限，这意味着 AI 可以直接：
        </p>
        <ul className="automation-permission-confirm__list">
          <li>写入 / 修改 / 删除工作空间内文件</li>
          <li>调用已勾选连接器（不再二次提示）</li>
          <li>执行 Bash 命令、网络请求等敏感操作</li>
        </ul>
        <Checkbox
          className="automation-permission-confirm__checkbox"
          checked={acknowledged}
          onChange={setAcknowledged}
          label="我已了解风险，并愿意为该任务的执行结果负责。"
        />
        <div className="automation-permission-confirm__actions">
          {onFallbackToDefault && (
            <button
              type="button"
              className="automation-permission-confirm__fallback-link"
              onClick={handleFallback}
            >
              改为「默认权限」运行 →
            </button>
          )}
          <div className="automation-permission-confirm__actions-right">
            <button type="button" className="atm-btn atm-btn--secondary" onClick={handleCancel}>
              取消
            </button>
            <button
              type="button"
              className="atm-btn atm-btn--danger"
              disabled={!acknowledged}
              onClick={handleConfirm}
            >
              确认创建
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
