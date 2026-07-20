import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { XCloseIcon } from "@/foundation/components/Icon/icons";
import headerIconUrl from "@/assets/header-icon.svg";

interface MenuItem {
  label: string;
  action?: "minimize" | "maximize" | "close";
  /** Maps the item to a `document.execCommand` action (editing menu). */
  edit?: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
  /** Opens the About dialog. */
  about?: boolean;
}
const MENUS: Record<string, MenuItem[]> = {
  编辑: [
    { label: "撤销", edit: "undo" },
    { label: "重做", edit: "redo" },
    { label: "剪切", edit: "cut" },
    { label: "复制", edit: "copy" },
    { label: "粘贴", edit: "paste" },
    { label: "全选", edit: "selectAll" },
  ],
  窗口: [
    { label: "最小化", action: "minimize" },
    { label: "最大化", action: "maximize" },
    { label: "关闭", action: "close" },
  ],
  帮助: [{ label: "关于 OpenBuddy", about: true }],
};

// 最小化图标
const MinimizeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
  </svg>
);

// 最大化/还原图标
const MaximizeIcon = ({ isMaximized }: { isMaximized: boolean }) => {
  if (isMaximized) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="3" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
        <rect x="1" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="var(--wb-bg-primary)" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
};

async function win(action: "minimize" | "maximize" | "close") {
  try {
    const w = getCurrentWindow();
    if (action === "minimize") void w.minimize();
    else if (action === "maximize") void w.toggleMaximize();
    else void w.close();
  } catch {
    // 浏览器预览环境下无 Tauri 窗口,静默忽略
  }
}

/** Insert text at the cursor position of the currently focused editable
 *  element (textarea/input). Used by the Edit → Paste menu item. Falls back
 *  to execCommand('insertText') when available so undo history is preserved. */
function insertTextAtFocus(text: string) {
  const el = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
  if (!el || (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT")) {
    // No text target focused — try execCommand as a generic fallback.
    try {
      document.execCommand("insertText", false, text);
    } catch {
      /* ignore */
    }
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  el.value = next;
  const caret = start + text.length;
  el.selectionStart = el.selectionEnd = caret;
  // React-controlled inputs need a native input event to update state.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 自定义标题栏 - Tauri 2 无边框窗口
 *
 * 功能:
 * - 拖拽移动窗口 (data-tauri-drag-region)
 * - 品牌标识 + 菜单
 * - 窗口控制按钮 (最小化/最大化/关闭)
 */
export function TitleBar({
  onPlaceholder,
  onShowAbout,
}: {
  onPlaceholder: (label: string) => void;
  onShowAbout?: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const w = getCurrentWindow();
        setIsMaximized(await w.isMaximized());

        // 监听窗口状态变化
        const unlisten = await w.onResized(async () => {
          setIsMaximized(await w.isMaximized());
        });
        return unlisten;
      } catch {
        // 预览模式
      }
    };
    checkMaximized();
  }, []);

  const runItem = (item: MenuItem) => {
    setOpenMenu(null);
    if (item.action) {
      win(item.action);
      return;
    }
    if (item.edit) {
      // Editing commands operate on the focused editable element (textarea,
      // input). execCommand is deprecated but still the only API that works
      // without a heavy editor framework, and it's well-supported in Tauri's
      // webview. For paste, prefer the async Clipboard API (execCommand paste
      // is blocked in non-secure contexts).
      if (item.edit === "paste") {
        navigator.clipboard
          ?.readText()
          .then((text) => insertTextAtFocus(text))
          .catch(() => {
            /* clipboard permission denied — silent */
          });
      } else {
        try {
          document.execCommand(item.edit);
        } catch {
          /* no editable focus — silent */
        }
      }
      return;
    }
    if (item.about) {
      onShowAbout?.();
      return;
    }
    onPlaceholder(item.label);
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar__menus" data-tauri-drag-region>
        <button
          className="titlebar__brand"
          onClick={() => onShowAbout?.()}
          aria-label="OpenBuddy"
          title="关于 OpenBuddy"
        >
          <img src={headerIconUrl} alt="" width={14} height={14} />
          <span>OpenBuddy</span>
        </button>
        {Object.keys(MENUS).map((name) => (
          <div key={name} className="titlebar__menu-wrap">
            <button
              className={"titlebar__menu" + (openMenu === name ? " titlebar__menu--open" : "")}
              onClick={() => setOpenMenu(openMenu === name ? null : name)}
              aria-label={name}
            >
              {name}
            </button>
            {openMenu === name && (
              <>
                <div className="titlebar__backdrop" onClick={() => setOpenMenu(null)} />
                <div className="titlebar__dropdown" role="menu">
                  {MENUS[name].map((item) => (
                    <button
                      key={item.label}
                      className="titlebar__dropdown-item"
                      onClick={() => runItem(item)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 弹性空间 - 用于拖拽 */}
      <div className="titlebar__spacer" data-tauri-drag-region />

      {/* 窗口控制按钮 */}
      <div className="titlebar__controls">
        <button
          className="titlebar__control titlebar__control--minimize"
          onClick={() => win("minimize")}
          title="最小化"
        >
          <MinimizeIcon />
        </button>
        <button
          className="titlebar__control titlebar__control--maximize"
          onClick={() => win("maximize")}
          title={isMaximized ? "还原" : "最大化"}
        >
          <MaximizeIcon isMaximized={isMaximized} />
        </button>
        <button
          className="titlebar__control titlebar__control--close"
          onClick={() => win("close")}
          title="关闭"
        >
          <XCloseIcon size="sm" />
        </button>
      </div>
    </div>
  );
}
