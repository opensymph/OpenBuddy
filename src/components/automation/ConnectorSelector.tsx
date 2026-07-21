/**
 * ConnectorSelector — 连接器多选（勾选即授权该连接器在任务中免确认使用）。
 *
 * 复刻 WorkBuddy connector-selector.tsx：触发框 + 复选下拉 +
 * 「管理连接器」底部入口。数据源为 OpenBuddy 的 MCP 连接器（mcp_list）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "./controls";

export interface ConnectorOption {
  id: string;
  name: string;
  connected: boolean;
}

export function ConnectorSelector({
  options,
  selectedIds,
  onChange,
  onManageConnectors,
  disabled = false,
}: {
  options: ConnectorOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onManageConnectors?: () => void;
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

  const validSelectedIds = selectedIds.filter((id) => options.some((o) => o.id === id));
  const handleToggle = useCallback(
    (id: string) => {
      onChange(
        validSelectedIds.includes(id)
          ? validSelectedIds.filter((cid) => cid !== id)
          : [...validSelectedIds, id],
      );
    },
    [validSelectedIds, onChange],
  );

  if (options.length === 0) return null;

  const triggerText =
    validSelectedIds.length > 0
      ? options
          .filter((o) => validSelectedIds.includes(o.id))
          .map((o) => o.name)
          .join(", ")
      : "选择连接器";

  const connected = options.filter((c) => c.connected);

  return (
    <div className="connector-selector-field" ref={containerRef}>
      <label className="atm-modal-label">
        连接器
        <span className="atm-modal-hint atm-modal-hint-inline">(勾选即授权该连接器在任务中免确认使用)</span>
      </label>
      <button
        type="button"
        className={`connector-selector-field__trigger${isOpen ? " connector-selector-field__trigger--open" : ""}${disabled ? " connector-selector-field__trigger--disabled" : ""}`}
        onClick={() => !disabled && setIsOpen((v) => !v)}
        disabled={disabled}
      >
        <span
          className={`connector-selector-field__trigger-text${validSelectedIds.length === 0 ? " connector-selector-field__trigger-text--placeholder" : ""}`}
        >
          {triggerText}
        </span>
        <span className={`connector-selector-field__arrow${isOpen ? " connector-selector-field__arrow--open" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="connector-selector-field__dropdown">
          <div className="connector-selector-field__list">
            {connected.length > 0 ? (
              connected.map((connector) => (
                <div className="connector-selector-field__item" key={connector.id} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    className="connector-selector-field__checkbox"
                    checked={validSelectedIds.includes(connector.id)}
                    onChange={() => handleToggle(connector.id)}
                    label={<span className="connector-selector-field__item-name">{connector.name}</span>}
                  />
                </div>
              ))
            ) : (
              <div className="connector-selector-field__empty">暂无已连接的连接器</div>
            )}
          </div>
          {onManageConnectors && (
            <div
              className="connector-selector-field__manage"
              onClick={() => {
                setIsOpen(false);
                onManageConnectors();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11 8.5V11.5C11 12.052 10.552 12.5 10 12.5H2.5C1.948 12.5 1.5 12.052 1.5 11.5V4C1.5 3.448 1.948 3 2.5 3H5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8.5 1.5H12.5V5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 8L12.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>管理连接器</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
