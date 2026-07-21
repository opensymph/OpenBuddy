/**
 * AutomationPermissionPicker — 执行权限选择（完全访问权限 / 默认权限）。
 *
 * 复刻 WorkBuddy automation-permission-picker.tsx：
 * 提示词工具条上的 chip 触发器（警告/盾牌图标 + 文案 + ⇕），
 * 下拉项带勾选列 + 图标 + 标题/描述。
 */
import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ShieldCheckIcon,
  WarningOutlineIcon,
} from "@/foundation/components/Icon/icons";
import type { AutomationPermissionMode } from "@/lib/types";

export function AutomationPermissionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AutomationPermissionMode;
  onChange: (mode: AutomationPermissionMode) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const isFullAccess = value === "fullAccess";
  const select = (mode: AutomationPermissionMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  return (
    <div className="automation-permission-picker" ref={containerRef}>
      <button
        type="button"
        className={`automation-permission-picker__trigger ${isFullAccess ? "automation-permission-picker__trigger--warning" : "automation-permission-picker__trigger--safe"}`}
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
      >
        {isFullAccess ? <WarningOutlineIcon size="sm" /> : <ShieldCheckIcon size="sm" />}
        <span className="automation-permission-picker__label">
          {isFullAccess ? "完全访问权限" : "默认权限"}
        </span>
        <span className="automation-permission-picker__caret">
          <ChevronsUpDownIcon size="sm" />
        </span>
      </button>
      {isOpen && (
        <div className="automation-permission-picker__dropdown">
          <div
            className={`automation-permission-picker__item${isFullAccess ? " automation-permission-picker__item--selected" : ""}`}
            onClick={() => select("fullAccess")}
          >
            <span className="automation-permission-picker__check-col">
              {isFullAccess && <CheckIcon size="md" />}
            </span>
            <span className="automation-permission-picker__icon-col">
              <WarningOutlineIcon size="md" />
            </span>
            <div className="automation-permission-picker__option">
              <span className="automation-permission-picker__option-title">
                完全访问权限
                <span className="automation-permission-picker__option-recommend">（推荐）</span>
              </span>
              <span className="automation-permission-picker__option-desc">
                允许 AI 在无人值守任务中自动执行操作，可能涉及敏感数据或文件修改，仅在信任任务时使用，用户可随时恢复默认权限。
              </span>
            </div>
          </div>
          <div
            className={`automation-permission-picker__item automation-permission-picker__item--divider${!isFullAccess ? " automation-permission-picker__item--selected" : ""}`}
            onClick={() => select("default")}
          >
            <span className="automation-permission-picker__check-col">
              {!isFullAccess && <CheckIcon size="md" />}
            </span>
            <span className="automation-permission-picker__icon-col">
              <ShieldCheckIcon size="md" />
            </span>
            <div className="automation-permission-picker__option">
              <span className="automation-permission-picker__option-title">默认权限</span>
              <span className="automation-permission-picker__option-desc">
                敏感操作需用户确认。如果你离开屏幕，任务会停在等待状态。仅推荐在本地调试/手动监管时使用。
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
