/**
 * usePermissionConfirm — 复刻 WorkBuddy use-permission-confirm.ts。
 *
 * 当即将以 fullAccess 创建（或从 default 升级为 fullAccess）时，
 * 拦截提交动作并弹出风险确认弹窗；支持 requestAction 包裹任意异步操作
 * （保存 / 测试运行共用同一确认链路）。
 */
import { useCallback, useRef, useState } from "react";
import type { AutomationPermissionMode } from "@/lib/types";

export function usePermissionConfirm({
  currentMode,
  initialMode,
  onConfirmedSubmit,
  onFallbackToDefault,
}: {
  currentMode: AutomationPermissionMode;
  initialMode?: AutomationPermissionMode;
  onConfirmedSubmit: () => void;
  onFallbackToDefault?: () => void;
}) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const needsConfirmation = currentMode === "fullAccess" && (!initialMode || initialMode === "default");

  const requestAction = useCallback(
    (action: () => void) => {
      if (needsConfirmation) {
        pendingActionRef.current = action;
        setShowConfirmDialog(true);
      } else {
        action();
      }
    },
    [needsConfirmation],
  );

  return {
    showConfirmDialog,
    requestSubmit: useCallback(() => {
      requestAction(onConfirmedSubmit);
    }, [requestAction, onConfirmedSubmit]),
    requestAction,
    handleConfirm: useCallback(() => {
      setShowConfirmDialog(false);
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    }, []),
    handleCancel: useCallback(() => {
      setShowConfirmDialog(false);
      pendingActionRef.current = null;
    }, []),
    handleFallbackToDefault: useCallback(() => {
      setShowConfirmDialog(false);
      pendingActionRef.current = null;
      onFallbackToDefault?.();
    }, [onFallbackToDefault]),
  };
}
