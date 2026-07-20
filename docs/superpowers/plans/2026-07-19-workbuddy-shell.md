# OpenBuddy 外壳复刻 WorkBuddy 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 OpenBuddy 的外壳(标题栏/侧栏/首页/Composer)复刻为 WorkBuddy 布局与视觉,内核与 ChatView 不动。

**Architecture:** 方案 A——保留 `src-tauri/` 桥接、`src/lib/grok-client.ts`、zustand stores、SettingsPanel、ChatView;重写 TitleBar(新增)/Sidebar/HomePage/Composer,新增 PlaceholderPage 与 Toast;样式以 `.cdp-inspect/captures/` 实测值为准,取值优先用 `src/styles/tokens.css` 已有 `--wb-*` token。

**Tech Stack:** Tauri 2 + React 18 + Vite 5 + TS + zustand + 纯手写 CSS(BEM);测试新增 vitest + @testing-library/react + jsdom。

**仓库注意:** `E:\Grok\openbuddy` 不是 git 仓库,无法提交。每个任务末尾的"检查点"= `pnpm test` + `pnpm build`(含 tsc 类型检查)通过。若要版本控制,执行前先自行 `git init`。

**样式事实来源:** `E:\Grok\openbuddy\.cdp-inspect\captures\`(索引见其 README.md)。关键值:侧栏 264px `#F2F2F2`;主区 `#FAFAFA`;菜单栏高 30px;窗口控制按钮 46×30;大标题 36px/600/行高48;场景 pill 激活 `rgba(0,0,0,0.75)` 白字;chips 白底 1px `rgba(0,0,0,0.08)` 圆角 8 高 32;Composer 圆角 16;导航项高 30 激活 `#E6E6E6`;分组标签 12px/600 `rgba(0,0,0,0.3)`;基准字号 13px。tokens.css 已有:`--wb-home-bg-primary: #f2f2f2`、`--wb-home-bg-secondary: #fafafa`、`--wb-bg-pill-active: rgba(0,0,0,0.75)`、`--wb-palette-black-{20,30,70,75,90}`。

---

### Task 1: 搭建 vitest 测试环境

**Files:**
- Modify: `E:\Grok\openbuddy\package.json`
- Create: `E:\Grok\openbuddy\src\components\__tests__\smoke.test.tsx`

- [ ] **Step 1: 安装依赖**

```bash
cd E:\Grok\openbuddy
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: package.json 加 test 脚本**

在 `"scripts"` 中加:

```json
"test": "vitest run"
```

- [ ] **Step 3: 写冒烟测试**

```tsx
// src/components/__tests__/smoke.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

describe("smoke", () => {
  it("renders", () => {
    render(<div>hello</div>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 跑通**

Run: `pnpm test`
Expected: PASS(1 个测试)

- [ ] **Step 5: 检查点** — `pnpm build` 通过(tsc 无错)

---

### Task 2: TitleBar(无边框窗口标题栏)

**Files:**
- Modify: `E:\Grok\openbuddy\src-tauri\tauri.conf.json`(`"decorations": true` → `false`)
- Create: `E:\Grok\openbuddy\src\components\TitleBar.tsx`
- Create: `E:\Grok\openbuddy\src\components\__tests__\TitleBar.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(追加 `.titlebar` 区块)

行为规格:
- 高 30px,整栏为 `data-tauri-drag-region`;左侧品牌 logo(复用 `@/assets/header-icon.svg`)+ 三个菜单按钮:编辑 / 窗口 / 帮助
- 菜单点击展开下拉,再点或点遮罩关闭;菜单项除标注"可用"外均调用 `onPlaceholder(label)`
- 编辑:撤销 / 重做 / 剪切 / 复制 / 粘贴 / 全选(全占位)
- 窗口:最小化(可用)、最大化(可用)、关闭(可用)
- 帮助:关于 OpenBuddy(占位)
- 右侧三个窗口控制按钮 46×30:最小化 / 最大化切换 / 关闭;关闭键 hover 红底白字(参考 `10-menu-*.json` 与截图)
- 窗口 API 用 `getCurrentWindow()`(来自 `@tauri-apps/api/window`),调用包 try/catch(浏览器预览环境静默降级)

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/TitleBar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const minimize = vi.fn();
const toggleMaximize = vi.fn();
const close = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ minimize, toggleMaximize, close }),
}));

import { TitleBar } from "../TitleBar";

describe("TitleBar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("点击关闭按钮调用窗口 close", async () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(close).toHaveBeenCalled();
  });

  it("点击最小化/最大化", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    expect(minimize).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "最大化" }));
    expect(toggleMaximize).toHaveBeenCalled();
  });

  it("编辑菜单展开后点击占位项触发 onPlaceholder 并收起", () => {
    const onPlaceholder = vi.fn();
    render(<TitleBar onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByText("复制"));
    expect(onPlaceholder).toHaveBeenCalledWith("复制");
    expect(screen.queryByText("粘贴")).not.toBeInTheDocument();
  });

  it("窗口菜单的最小化为可用项", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "窗口" }));
    fireEvent.click(screen.getByText("最小化"));
    expect(minimize).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test`
Expected: FAIL(`Cannot find module '../TitleBar'`)

- [ ] **Step 3: 改 tauri.conf.json**

`app.windows[0]` 中:`"decorations": false`。

- [ ] **Step 4: 实现 TitleBar**

```tsx
// src/components/TitleBar.tsx
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import headerIconUrl from "@/assets/header-icon.svg";

interface MenuItem { label: string; action?: "minimize" | "maximize" | "close" }
const MENUS: Record<string, MenuItem[]> = {
  编辑: [{ label: "撤销" }, { label: "重做" }, { label: "剪切" }, { label: "复制" }, { label: "粘贴" }, { label: "全选" }],
  窗口: [{ label: "最小化", action: "minimize" }, { label: "最大化", action: "maximize" }, { label: "关闭", action: "close" }],
  帮助: [{ label: "关于 OpenBuddy" }],
};

function win(action: "minimize" | "maximize" | "close") {
  try {
    const w = getCurrentWindow();
    if (action === "minimize") void w.minimize();
    else if (action === "maximize") void w.toggleMaximize();
    else void w.close();
  } catch {
    // 浏览器预览环境下无 Tauri 窗口,静默忽略
  }
}

/** 30px 无边框标题栏:品牌 + 编辑/窗口/帮助菜单 + 窗口控制。对照 WorkBuddy codebuddy-menubar。 */
export function TitleBar({ onPlaceholder }: { onPlaceholder: (label: string) => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const runItem = (item: MenuItem) => {
    setOpenMenu(null);
    if (item.action) win(item.action);
    else onPlaceholder(item.label);
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar__menus">
        <button className="titlebar__brand" onClick={() => onPlaceholder("关于 OpenBuddy")} aria-label="OpenBuddy">
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
                    <button key={item.label} className="titlebar__dropdown-item" onClick={() => runItem(item)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="titlebar__controls">
        <button className="titlebar__control" onClick={() => win("minimize")} aria-label="最小化">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="titlebar__control" onClick={() => win("maximize")} aria-label="最大化">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="titlebar__control titlebar__control--close" onClick={() => win("close")} aria-label="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: app.css 追加样式**

```css
/* ===== TitleBar(WorkBuddy codebuddy-menubar,实测:高30,控制按钮46×30)===== */
.titlebar {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--wb-home-bg-primary);
  color: rgba(0, 0, 0, 0.9);
  font-size: 13px;
  user-select: none;
  flex: none;
}
.titlebar__menus { display: flex; align-items: center; height: 100%; }
.titlebar__brand {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 10px;
  background: none; border: none; font: inherit; font-weight: 600;
  cursor: pointer; color: inherit;
}
.titlebar__menu-wrap { position: relative; }
.titlebar__menu {
  height: 30px; padding: 0 10px;
  background: none; border: none; font: inherit; cursor: pointer; color: inherit;
}
.titlebar__brand:hover, .titlebar__menu:hover, .titlebar__menu--open { background: rgba(0, 0, 0, 0.06); }
.titlebar__backdrop { position: fixed; inset: 0; z-index: 90; }
.titlebar__dropdown {
  position: absolute; top: 30px; left: 0; z-index: 91;
  min-width: 200px; padding: 4px;
  background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
}
.titlebar__dropdown-item {
  height: 28px; padding: 0 12px; text-align: left;
  background: none; border: none; border-radius: 4px;
  font: inherit; cursor: pointer; color: inherit;
}
.titlebar__dropdown-item:hover { background: rgba(0, 0, 0, 0.06); }
.titlebar__controls { display: flex; height: 100%; }
.titlebar__control {
  width: 46px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: rgb(139, 148, 158);
}
.titlebar__control:hover { background: rgba(0, 0, 0, 0.06); color: rgba(0, 0, 0, 0.9); }
.titlebar__control--close:hover { background: #e81123; color: #fff; }
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: 检查点** — `pnpm build` 通过

---

### Task 3: Toast(轻量占位提示)

**Files:**
- Create: `E:\Grok\openbuddy\src\components\Toast.tsx`
- Create: `E:\Grok\openbuddy\src\components\__tests__\Toast.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(追加)

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/Toast.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Toast } from "../Toast";

describe("Toast", () => {
  it("message 为 null 时不渲染", () => {
    const { container } = render(<Toast message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("渲染消息文本", () => {
    render(<Toast message="搜索 即将上线" />);
    expect(screen.getByText("搜索 即将上线")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test`,Expected: FAIL

- [ ] **Step 3: 实现**

```tsx
// src/components/Toast.tsx
/** 底部居中的轻量提示。显隐与自动消失由父组件(setTimeout)控制。 */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}
```

- [ ] **Step 4: app.css 追加**

```css
/* ===== Toast ===== */
.toast {
  position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
  z-index: 200; padding: 8px 16px;
  background: rgba(0, 0, 0, 0.75); color: #fff;
  font-size: 13px; border-radius: 8px;
}
```

- [ ] **Step 5: 跑测试确认通过** — Run: `pnpm test`,Expected: PASS

---

### Task 4: PlaceholderPage(占位功能页)

**Files:**
- Create: `E:\Grok\openbuddy\src\components\PlaceholderPage.tsx`
- Create: `E:\Grok\openbuddy\src\components\__tests__\PlaceholderPage.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(追加)

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/PlaceholderPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlaceholderPage } from "../PlaceholderPage";

describe("PlaceholderPage", () => {
  it("显示功能名与即将上线", () => {
    render(<PlaceholderPage label="助理" />);
    expect(screen.getByText("助理")).toBeInTheDocument();
    expect(screen.getByText(/即将上线/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test`,Expected: FAIL

- [ ] **Step 3: 实现**

```tsx
// src/components/PlaceholderPage.tsx
import { AgentToolIcon } from "@/foundation/components/Icon/icons";

/** WorkBuddy 独有功能(助理/项目/自动化等)的占位页。 */
export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="placeholder-page">
      <AgentToolIcon size="xl" color="rgba(0,0,0,0.3)" />
      <h2 className="placeholder-page__title">{label}</h2>
      <p className="placeholder-page__desc">该功能即将上线,敬请期待</p>
    </div>
  );
}
```

- [ ] **Step 4: app.css 追加**

```css
/* ===== PlaceholderPage ===== */
.placeholder-page {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  background: var(--wb-home-bg-secondary);
}
.placeholder-page__title { margin: 8px 0 0; font-size: 20px; font-weight: 600; color: rgba(0, 0, 0, 0.9); }
.placeholder-page__desc { margin: 0; font-size: 13px; color: rgba(0, 0, 0, 0.3); }
```

- [ ] **Step 5: 跑测试确认通过** — Run: `pnpm test`,Expected: PASS

---

### Task 5: Composer 重写(WorkBuddy 输入卡片)

**Files:**
- Modify: `E:\Grok\openbuddy\src\components\Composer.tsx`(整体重写)
- Create: `E:\Grok\openbuddy\src\components\__tests__\Composer.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(删除旧 `.composer` 区块,追加 `.wb-composer` 区块)

Props(向后兼容 ChatView 现有用法,新增均有默认值):

```ts
{
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  apiReady?: boolean;            // 默认 true;false 时输入禁用并引导配置
  onOpenSettings?: () => void;   // 未配置时点击卡片触发
  onPlaceholder?: (label: string) => void; // +/Auto/麦克风/工作空间/权限点击
  showMeta?: boolean;            // 默认 false;首页传 true 显示"选择工作空间/默认权限"
}
```

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/Composer.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Composer } from "../Composer";

const base = { streaming: false, onSend: vi.fn(), onCancel: vi.fn() };

describe("Composer", () => {
  it("输入后 Enter 发送", () => {
    const onSend = vi.fn();
    render(<Composer {...base} onSend={onSend} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "你好 grok" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("你好 grok");
  });

  it("apiReady=false 时输入禁用并显示配置提示,点击触发 onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(<Composer {...base} apiReady={false} onOpenSettings={onOpenSettings} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    fireEvent.click(screen.getByText(/请先配置 API Key/));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("showMeta 时渲染工作空间/权限占位,点击触发 onPlaceholder", () => {
    const onPlaceholder = vi.fn();
    render(<Composer {...base} showMeta onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByText("选择工作空间"));
    expect(onPlaceholder).toHaveBeenCalledWith("选择工作空间");
    fireEvent.click(screen.getByText("默认权限"));
    expect(onPlaceholder).toHaveBeenCalledWith("默认权限");
  });

  it("streaming 时显示停止按钮", () => {
    const onCancel = vi.fn();
    render(<Composer {...base} streaming onCancel={onCancel} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test`,Expected: FAIL(apiReady 相关断言失败)

- [ ] **Step 3: 重写 Composer.tsx**

```tsx
// src/components/Composer.tsx
import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { AddIcon, ChevronDownIcon, SendPlaneIcon } from "@/foundation/components/Icon/icons";

/**
 * WorkBuddy 风格输入卡片(圆角16):左下 +,右下 Auto 下拉/麦克风/发送;
 * showMeta 时卡片下方显示"选择工作空间/默认权限"。
 * apiReady=false 时输入禁用,点击卡片引导打开设置。
 */
export function Composer({
  streaming,
  disabled,
  onSend,
  onCancel,
  placeholder,
  apiReady = true,
  onOpenSettings,
  onPlaceholder,
  showMeta = false,
}: {
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  apiReady?: boolean;
  onOpenSettings?: () => void;
  onPlaceholder?: (label: string) => void;
  showMeta?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || streaming || disabled || !apiReady) return;
    onSend(t);
    setText("");
  };

  const ph = (label: string) => onPlaceholder?.(label);

  return (
    <div className="wb-composer-wrap">
      <section
        className={"wb-composer" + (apiReady ? "" : " wb-composer--disabled")}
        onClick={() => { if (!apiReady) onOpenSettings?.(); }}
      >
        <textarea
          ref={ref}
          className="wb-composer__input"
          rows={1}
          value={text}
          disabled={!apiReady}
          placeholder={
            apiReady
              ? placeholder ?? "今天帮你做些什么? @ 引用对话文件,/ 调用技能与指令"
              : "请先配置 API Key 开始使用"
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="wb-composer__footer">
          <button className="wb-composer__tool" onClick={(e) => { e.stopPropagation(); ph("附件"); }} aria-label="添加附件">
            <AddIcon size="lg" />
          </button>
          <div className="wb-composer__spacer" />
          <button className="wb-composer__model" onClick={(e) => { e.stopPropagation(); ph("模型选择"); }}>
            Auto <ChevronDownIcon size="sm" />
          </button>
          <button className="wb-composer__tool" onClick={(e) => { e.stopPropagation(); ph("语音输入"); }} aria-label="语音输入">
            <Mic size={16} />
          </button>
          {streaming ? (
            <button className="wb-composer__send wb-composer__send--stop" onClick={(e) => { e.stopPropagation(); onCancel(); }} aria-label="停止生成">
              ■
            </button>
          ) : (
            <button
              className="wb-composer__send"
              onClick={(e) => { e.stopPropagation(); send(); }}
              disabled={disabled || !apiReady || !text.trim()}
              aria-label="发送"
            >
              <SendPlaneIcon size="md" />
            </button>
          )}
        </div>
      </section>
      {showMeta && (
        <div className="wb-composer-meta">
          <button className="wb-composer-meta__btn" onClick={() => ph("选择工作空间")}>选择工作空间 <ChevronDownIcon size="sm" /></button>
          <button className="wb-composer-meta__btn" onClick={() => ph("默认权限")}>默认权限 <ChevronDownIcon size="sm" /></button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: app.css 删除旧 `.composer` 区块(`.composer`/`.composer__input`/`.composer__input::placeholder`/`.composer__btn`/`.composer__btn:disabled`/`.composer__btn--stop`),追加:**

```css
/* ===== WorkBuddy Composer(实测:圆角16,工具行高32)===== */
.wb-composer-wrap { width: 100%; }
.wb-composer {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  padding: 12px 12px 8px;
  display: flex; flex-direction: column; gap: 8px;
}
.wb-composer:focus-within { border-color: rgba(0, 0, 0, 0.2); }
.wb-composer--disabled { cursor: pointer; background: rgba(0, 0, 0, 0.02); }
.wb-composer__input {
  width: 100%; border: none; outline: none; resize: none;
  font: inherit; font-size: 14px; line-height: 22px;
  background: transparent; color: rgba(0, 0, 0, 0.9);
  min-height: 44px; box-sizing: border-box;
}
.wb-composer__input::placeholder { color: rgba(0, 0, 0, 0.3); }
.wb-composer__input:disabled { cursor: pointer; }
.wb-composer__footer { display: flex; align-items: center; gap: 4px; height: 32px; }
.wb-composer__spacer { flex: 1; }
.wb-composer__tool {
  width: 32px; height: 32px; border: none; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; color: rgba(0, 0, 0, 0.7);
}
.wb-composer__tool:hover { background: rgba(0, 0, 0, 0.06); }
.wb-composer__model {
  height: 32px; padding: 0 8px; border: none; background: none; cursor: pointer;
  display: flex; align-items: center; gap: 2px;
  border-radius: 8px; font-size: 13px; color: rgba(0, 0, 0, 0.7);
}
.wb-composer__model:hover { background: rgba(0, 0, 0, 0.06); }
.wb-composer__send {
  width: 32px; height: 32px; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: rgba(0, 0, 0, 0.75); color: #fff;
}
.wb-composer__send:disabled { background: rgba(0, 0, 0, 0.12); color: rgba(0, 0, 0, 0.3); cursor: default; }
.wb-composer__send--stop { background: rgba(0, 0, 0, 0.75); font-size: 10px; }
.wb-composer-meta { display: flex; gap: 16px; padding: 8px 4px 0; }
.wb-composer-meta__btn {
  display: flex; align-items: center; gap: 4px;
  border: none; background: none; cursor: pointer;
  font-size: 12px; color: rgba(0, 0, 0, 0.3);
}
.wb-composer-meta__btn:hover { color: rgba(0, 0, 0, 0.7); }
```

- [ ] **Step 5: 跑测试确认通过** — Run: `pnpm test`,Expected: PASS

- [ ] **Step 6: 检查点** — `pnpm build` 通过(ChatView 仍用同一 Composer,props 向后兼容)

---

### Task 6: HomePage 重写(大标题 + 场景标签 + 快捷 chips)

**Files:**
- Modify: `E:\Grok\openbuddy\src\components\HomePage.tsx`(整体重写)
- Create: `E:\Grok\openbuddy\src\components\__tests__\HomePage.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(删除旧 `.home` 区块,追加新区块)

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/HomePage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HomePage } from "../HomePage";

const base = { onSend: vi.fn(), streaming: false, apiReady: true, onOpenSettings: vi.fn(), onPlaceholder: vi.fn() };

describe("HomePage", () => {
  it("渲染双行大标题", () => {
    render(<HomePage {...base} />);
    expect(screen.getByText("OpenBuddy")).toBeInTheDocument();
    expect(screen.getByText("你的职场超能力")).toBeInTheDocument();
  });

  it("场景标签可切换激活态", () => {
    render(<HomePage {...base} />);
    const dev = screen.getByRole("button", { name: /代码开发/ });
    fireEvent.click(dev);
    expect(dev.className).toContain("--active");
    expect(screen.getByRole("button", { name: /日常办公/ }).className).not.toContain("--active");
  });

  it("点击快捷 chip 触发 onPlaceholder", () => {
    const onPlaceholder = vi.fn();
    render(<HomePage {...base} onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByRole("button", { name: /文档处理/ }));
    expect(onPlaceholder).toHaveBeenCalledWith("文档处理");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test`,Expected: FAIL

- [ ] **Step 3: 重写 HomePage.tsx**

```tsx
// src/components/HomePage.tsx
import { useState } from "react";
import { Briefcase, Code2, Palette, Landmark, BarChart3 } from "lucide-react";
import { Composer } from "./Composer";
import { FileTextIcon, MoreIcon } from "@/foundation/components/Icon/icons";

const SCENES = [
  { label: "日常办公", icon: <Briefcase size={14} /> },
  { label: "代码开发", icon: <Code2 size={14} /> },
  { label: "设计创意", icon: <Palette size={14} /> },
];
const CHIPS = [
  { label: "文档处理", icon: <FileTextIcon size="sm" /> },
  { label: "金融服务", icon: <Landmark size={14} /> },
  { label: "数据分析及可视化", icon: <BarChart3 size={14} /> },
  { label: "更多", icon: <MoreIcon size="sm" /> },
];

/** WorkBuddy 风格首页:双行大标题 + 场景标签 + 快捷 chips + Composer 卡片。 */
export function HomePage({
  onSend,
  streaming,
  apiReady,
  onOpenSettings,
  onPlaceholder,
}: {
  onSend: (text: string) => void;
  streaming: boolean;
  apiReady: boolean;
  onOpenSettings: () => void;
  onPlaceholder: (label: string) => void;
}) {
  const [scene, setScene] = useState("日常办公");

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__header">
          <h1 className="home__title">OpenBuddy</h1>
          <p className="home__subtitle">你的职场超能力</p>
        </header>

        <div className="home__scenes" role="tablist">
          {SCENES.map((s) => (
            <button
              key={s.label}
              role="tab"
              aria-selected={scene === s.label}
              className={"home__scene" + (scene === s.label ? " home__scene--active" : "")}
              onClick={() => setScene(s.label)}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <section className="home__composer-area">
          <div className="home__chips">
            {CHIPS.map((c) => (
              <button key={c.label} className="home__chip" onClick={() => onPlaceholder(c.label)}>
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <Composer
            streaming={streaming}
            onSend={onSend}
            onCancel={() => {}}
            apiReady={apiReady}
            onOpenSettings={onOpenSettings}
            onPlaceholder={onPlaceholder}
            showMeta
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: app.css 删除旧 `.home` 区块(`.home`/`.home__inner`/`.home__mascot`/`.home__title`/`.home__subtitle`/`.home__composer`),追加:**

```css
/* ===== HomePage(WorkBuddy wb-home-page,实测:标题36/600/lh48)===== */
.home {
  height: 100%; overflow-y: auto;
  background: var(--wb-home-bg-secondary);
  display: flex; justify-content: center;
}
.home__inner {
  width: 100%; max-width: 760px;
  padding: 120px 32px 48px;
  display: flex; flex-direction: column; gap: 20px;
}
.home__header { display: flex; flex-direction: column; }
.home__title, .home__subtitle {
  margin: 0; font-size: 36px; font-weight: 600; line-height: 48px;
  color: rgba(0, 0, 0, 0.9);
}
.home__scenes {
  display: flex; gap: 2px; padding: 2px;
  background: #ebebeb; border-radius: 10px; height: 36px;
  align-self: flex-start; box-sizing: border-box;
}
.home__scene {
  display: flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 12px;
  border: none; border-radius: 8px; background: none; cursor: pointer;
  font-size: 13px; font-weight: 500; color: rgba(0, 0, 0, 0.7);
}
.home__scene--active {
  background: var(--wb-bg-pill-active); color: #fff; font-weight: 600;
}
.home__composer-area { display: flex; flex-direction: column; gap: 12px; }
.home__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.home__chip {
  display: flex; align-items: center; gap: 4px;
  height: 32px; padding: 0 12px;
  background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 8px;
  font-size: 13px; font-weight: 500; color: rgba(0, 0, 0, 0.9); cursor: pointer;
}
.home__chip:hover { background: rgba(0, 0, 0, 0.03); }
```

- [ ] **Step 5: 跑测试确认通过** — Run: `pnpm test`,Expected: PASS

- [ ] **Step 6: 检查点** — `pnpm build` 通过

---

### Task 7: Sidebar 重写(导航 + 空间会话 + 底部)

**Files:**
- Modify: `E:\Grok\openbuddy\src\components\Sidebar.tsx`(整体重写)
- Create: `E:\Grok\openbuddy\src\components\__tests__\Sidebar.test.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(删除旧 `.sidebar` 区块,追加新区块)

Props:

```ts
{
  onNewSession: () => void;
  onSelect: (sessionId: string) => void;
  onNavigate: (label: string) => void;   // 占位导航(助理/项目/...)
  onOpenSettings: () => void;
  onPlaceholder: (label: string) => void; // 搜索/筛选/铃铛等小按钮 → toast
  activeNav: string;                      // "新建任务" 或占位导航名,由 App 传入
}
```

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/__tests__/Sidebar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Sidebar } from "../Sidebar";
import { useSessionsStore } from "@/stores/sessions-store";

const base = {
  onNewSession: vi.fn(), onSelect: vi.fn(), onNavigate: vi.fn(),
  onOpenSettings: vi.fn(), onPlaceholder: vi.fn(), activeNav: "新建任务",
};

describe("Sidebar", () => {
  it("渲染导航项", () => {
    render(<Sidebar {...base} />);
    for (const label of ["新建任务", "助理", "项目", "专家·技能·连接器", "自动化", "更多"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("点击占位导航触发 onNavigate", () => {
    const onNavigate = vi.fn();
    render(<Sidebar {...base} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("助理"));
    expect(onNavigate).toHaveBeenCalledWith("助理");
  });

  it("渲染会话列表并可选中", () => {
    const onSelect = vi.fn();
    useSessionsStore.getState().set([{ sessionId: "s1", title: "测试会话", cwd: "/tmp" } as any]);
    render(<Sidebar {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("测试会话"));
    expect(onSelect).toHaveBeenCalledWith("s1");
    useSessionsStore.getState().set([]);
  });

  it("搜索按钮触发 onPlaceholder,设置按钮触发 onOpenSettings", () => {
    const onPlaceholder = vi.fn();
    const onOpenSettings = vi.fn();
    render(<Sidebar {...base} onPlaceholder={onPlaceholder} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(onPlaceholder).toHaveBeenCalledWith("搜索");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test`,Expected: FAIL

- [ ] **Step 3: 重写 Sidebar.tsx**

```tsx
// src/components/Sidebar.tsx
import { useState } from "react";
import { useSessionsStore } from "@/stores/sessions-store";
import {
  AddCircleIcon, AssistantIcon, ProjectIcon, ConnectorTabIcon, AgentToolIcon,
  MoreIcon, SearchIcon, FilterIcon, BellIcon, UserIcon, SettingsIcon,
  ChatBubbleIcon, ChevronDownIcon,
} from "@/foundation/components/Icon/icons";

const NAV = [
  { label: "助理", icon: AssistantIcon },
  { label: "项目", icon: ProjectIcon },
  { label: "专家·技能·连接器", icon: ConnectorTabIcon },
  { label: "自动化", icon: AgentToolIcon },
];

/** WorkBuddy 风格侧栏(264px):品牌行 / 导航 / 空间会话列表 / 底部用户区。 */
export function Sidebar({
  onNewSession,
  onSelect,
  onNavigate,
  onOpenSettings,
  onPlaceholder,
  activeNav,
}: {
  onNewSession: () => void;
  onSelect: (sessionId: string) => void;
  onNavigate: (label: string) => void;
  onOpenSettings: () => void;
  onPlaceholder: (label: string) => void;
  activeNav: string;
}) {
  const sessions = useSessionsStore((s) => s.sessions);
  const currentSessionId = useSessionsStore((s) => s.currentSessionId);
  const [spaceOpen, setSpaceOpen] = useState(true);

  return (
    <aside className="sidebar">
      <div className="sidebar__logo-row">
        <span className="sidebar__logo">OpenBuddy</span>
        <span className="sidebar__version">v 0.1.0</span>
        <div className="sidebar__logo-spacer" />
        <button className="sidebar__icon-btn" aria-label="搜索" onClick={() => onPlaceholder("搜索")}>
          <SearchIcon size="md" />
        </button>
        <button className="sidebar__icon-btn" aria-label="筛选" onClick={() => onPlaceholder("筛选")}>
          <FilterIcon size="md" />
        </button>
      </div>

      <nav className="sidebar__nav">
        <button
          className={"sidebar__nav-item" + (activeNav === "新建任务" ? " sidebar__nav-item--active" : "")}
          onClick={onNewSession}
        >
          <AddCircleIcon size="md" />
          <span>新建任务</span>
        </button>
        {NAV.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={"sidebar__nav-item" + (activeNav === label ? " sidebar__nav-item--active" : "")}
            onClick={() => onNavigate(label)}
          >
            <Icon size="md" />
            <span>{label}</span>
          </button>
        ))}
        <button className="sidebar__nav-item" onClick={() => onNavigate("更多")}>
          <MoreIcon size="md" />
          <span>更多</span>
          <span className="sidebar__nav-sub">资料库·灵感</span>
        </button>
      </nav>

      <div className="sidebar__content">
        <button className="sidebar__section-label" onClick={() => setSpaceOpen(!spaceOpen)}>
          <span>空间</span>
          <ChevronDownIcon size="sm" className={spaceOpen ? "" : "sidebar__chevron--collapsed"} />
        </button>
        {spaceOpen && (
          <div className="sidebar__space">
            <div className="sidebar__space-title">默认空间</div>
            {sessions.length === 0 && <div className="sidebar__empty">暂无会话</div>}
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                className={"sidebar__conv" + (s.sessionId === currentSessionId ? " sidebar__conv--active" : "")}
                onClick={() => onSelect(s.sessionId)}
                title={s.title}
              >
                <ChatBubbleIcon size="sm" />
                <span className="sidebar__conv-title">{s.title || "未命名会话"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__user" onClick={() => onPlaceholder("用户中心")}>
          <UserIcon size="md" />
          <span>本地用户</span>
        </button>
        <div className="sidebar__logo-spacer" />
        <button className="sidebar__icon-btn" aria-label="通知" onClick={() => onPlaceholder("通知")}>
          <BellIcon size="md" />
        </button>
        <button className="sidebar__icon-btn" aria-label="设置" onClick={onOpenSettings}>
          <SettingsIcon size="md" />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: app.css 删除旧 `.sidebar` 区块(`.sidebar` 至 `.sidebar__item-title`),追加:**

```css
/* ===== Sidebar(WorkBuddy conversation-list,实测:264px,#F2F2F2)===== */
.sidebar {
  width: 264px; flex: none;
  background: var(--wb-home-bg-primary);
  display: flex; flex-direction: column;
  color: rgba(0, 0, 0, 0.9);
}
.sidebar__logo-row {
  display: flex; align-items: center; gap: 6px;
  height: 56px; padding: 0 12px 0 24px; flex: none;
}
.sidebar__logo { font-size: 12px; font-weight: 700; color: rgba(0, 0, 0, 0.3); }
.sidebar__version { font-size: 10px; letter-spacing: 0.2px; color: rgba(0, 0, 0, 0.2); }
.sidebar__logo-spacer { flex: 1; }
.sidebar__icon-btn {
  width: 32px; height: 32px; border: none; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; color: rgba(0, 0, 0, 0.7);
}
.sidebar__icon-btn:hover { background: rgba(0, 0, 0, 0.06); }
.sidebar__nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px; flex: none; }
.sidebar__nav-item {
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 4px 12px; box-sizing: border-box;
  border: none; border-radius: 8px; background: none; cursor: pointer;
  font-size: 13px; color: rgba(0, 0, 0, 0.9); text-align: left;
}
.sidebar__nav-item:hover { background: rgba(0, 0, 0, 0.05); }
.sidebar__nav-item--active { background: #e6e6e6; font-weight: 600; }
.sidebar__nav-sub { margin-left: auto; font-size: 11px; color: rgba(0, 0, 0, 0.3); }
.sidebar__content { flex: 1; overflow-y: auto; padding: 8px 12px; }
.sidebar__section-label {
  display: flex; align-items: center; gap: 4px; width: 100%;
  height: 20px; border: none; background: none; cursor: pointer;
  font-size: 12px; font-weight: 600; color: rgba(0, 0, 0, 0.3);
}
.sidebar__chevron--collapsed { transform: rotate(-90deg); }
.sidebar__space { margin-top: 4px; }
.sidebar__space-title {
  height: 28px; display: flex; align-items: center; padding: 0 12px;
  font-size: 13px; font-weight: 600; color: rgba(0, 0, 0, 0.9);
}
.sidebar__empty { padding: 4px 12px; font-size: 12px; color: rgba(0, 0, 0, 0.3); }
.sidebar__conv {
  display: flex; align-items: center; gap: 8px; width: 100%;
  height: 30px; padding: 4px 12px 4px 24px; box-sizing: border-box;
  border: none; border-radius: 8px; background: none; cursor: pointer;
  font-size: 13px; color: rgba(0, 0, 0, 0.9); text-align: left;
}
.sidebar__conv:hover { background: rgba(0, 0, 0, 0.05); }
.sidebar__conv--active { background: #e6e6e6; }
.sidebar__conv-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar__footer {
  display: flex; align-items: center; gap: 4px;
  height: 68px; padding: 12px 16px 12px 12px; box-sizing: border-box; flex: none;
}
.sidebar__user {
  display: flex; align-items: center; gap: 8px;
  height: 44px; padding: 4px 8px;
  border: none; border-radius: 8px; background: none; cursor: pointer;
  font-size: 13px; color: rgba(0, 0, 0, 0.9);
}
.sidebar__user:hover { background: rgba(0, 0, 0, 0.06); }
```

- [ ] **Step 5: 跑测试确认通过** — Run: `pnpm test`,Expected: PASS

- [ ] **Step 6: 检查点** — `pnpm build` 通过

---

### Task 8: App.tsx 组装(视图状态 + 删除旧组件)

**Files:**
- Modify: `E:\Grok\openbuddy\src\App.tsx`
- Delete: `E:\Grok\openbuddy\src\components\Topbar.tsx`、`E:\Grok\openbuddy\src\components\ApiSetupGuide.tsx`
- Modify: `E:\Grok\openbuddy\src\styles\app.css`(删除 `.topbar` 区块与 `.setup`/`ApiSetupGuide` 相关区块;`.app` 改为纵向 flex)

视图逻辑:

```
main 内容 = initError / 启动中 / grok未就绪 通知(沿用现有 .app__notice)
  否则 placeholder 导航激活 → PlaceholderPage
  否则 currentSessionId → ChatView
  否则 → HomePage(apiReady = init.auth.ready)
```

- [ ] **Step 1: 重写 App.tsx 的 Shell 返回部分与状态**

完整替换 `src/App.tsx` 为:

```tsx
// src/App.tsx
import { useEffect, useRef, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./components/HomePage";
import { ChatView } from "./components/ChatView";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { Toast } from "./components/Toast";
import { PermissionDialog } from "./components/PermissionDialog";
import { ThemeProvider } from "./components/ThemeProvider";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSessionStore } from "./stores/session-store";
import { useSessionsStore } from "./stores/sessions-store";
import { usePermissionStore } from "./stores/permission-store";
import {
  grokInit,
  grokNewSession,
  grokSend,
  grokCancel,
  grokListSessions,
  subscribeGrokEvents,
  type InitResult,
} from "./lib/grok-client";

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const [init, setInit] = useState<InitResult | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [placeholderView, setPlaceholderView] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cwdRef = useRef<string>("");

  const sessionStore = useSessionStore;
  const sessionsStore = useSessionsStore;
  const permissionStore = usePermissionStore;

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const result = await grokInit();
        cwdRef.current = result.cwd;
        sessionsStore.getState().setCwd(result.cwd);
        setInit(result);

        unlisten = await subscribeGrokEvents({
          onUpdate: (u) => sessionStore.getState().applyUpdate(u),
          onPermission: (p) => permissionStore.getState().request(p),
          onComplete: (p) => sessionStore.getState().markComplete(p),
        });

        const list = await grokListSessions(result.cwd);
        sessionsStore.getState().set(list);
      } catch (e) {
        setInitError(String(e));
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [sessionStore, sessionsStore, permissionStore]);

  const currentSessionId = sessionsStore((s) => s.currentSessionId);
  const streaming = sessionStore((s) => s.streaming);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  const handlePlaceholder = (label: string) => showToast(`${label} 即将上线`);
  const handleNavigate = (label: string) => {
    setPlaceholderView(label);
    sessionsStore.getState().setCurrent(null);
    sessionStore.getState().reset();
  };

  const handleSendNew = async (text: string) => {
    try {
      const cwd = cwdRef.current;
      const { sessionId } = await grokNewSession(cwd);
      sessionsStore.getState().setCurrent(sessionId);
      sessionsStore.getState().upsert({ sessionId, title: text.slice(0, 40), cwd });
      sessionStore.getState().setSession(sessionId);
      sessionStore.getState().pushUser(text);
      sessionStore.getState().startStreaming();
      await grokSend(sessionId, text);
    } catch (e) {
      sessionStore.getState().setError(String(e));
    }
  };

  const handleSendCurrent = async (text: string) => {
    if (!currentSessionId) return handleSendNew(text);
    try {
      sessionStore.getState().pushUser(text);
      sessionStore.getState().startStreaming();
      await grokSend(currentSessionId, text);
    } catch (e) {
      sessionStore.getState().setError(String(e));
    }
  };

  const handleCancel = async () => {
    if (currentSessionId) {
      try {
        await grokCancel(currentSessionId);
      } catch (e) {
        sessionStore.getState().setError(String(e));
      }
    }
  };

  const handleNewSession = () => {
    setPlaceholderView(null);
    sessionsStore.getState().setCurrent(null);
    sessionStore.getState().reset();
  };

  const handleSelectSession = (sessionId: string) => {
    setPlaceholderView(null);
    sessionsStore.getState().setCurrent(sessionId);
    sessionStore.getState().setSession(sessionId);
  };

  const activeNav = placeholderView ?? (currentSessionId ? "" : "新建任务");

  return (
    <div className="app">
      <TitleBar onPlaceholder={handlePlaceholder} />
      <div className="app__body">
        <Sidebar
          onNewSession={handleNewSession}
          onSelect={handleSelectSession}
          onNavigate={handleNavigate}
          onOpenSettings={() => setSettingsOpen(true)}
          onPlaceholder={handlePlaceholder}
          activeNav={activeNav}
        />
        <main className="app__main">
          {initError ? (
            <div className="app__notice app__notice--err">
              初始化失败:{initError}
              <br />
              请确认已在终端运行 <code>grok login</code> 完成 grok 登录后重试。
            </div>
          ) : !init ? (
            <div className="app__notice">正在启动 grok agent…</div>
          ) : !init.ok ? (
            <div className="app__notice app__notice--err">
              grok 未就绪:{init.auth.reason ?? "未知原因"}
              <br />
              请在终端运行 <code>grok login</code> 后重启 OpenBuddy。
            </div>
          ) : placeholderView ? (
            <PlaceholderPage label={placeholderView} />
          ) : currentSessionId ? (
            <ChatView onSend={handleSendCurrent} onCancel={handleCancel} />
          ) : (
            <HomePage
              onSend={handleSendNew}
              streaming={streaming}
              apiReady={init.auth.ready}
              onOpenSettings={() => setSettingsOpen(true)}
              onPlaceholder={handlePlaceholder}
            />
          )}
        </main>
      </div>
      <Toast message={toast} />
      <PermissionDialog />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: 删除 Topbar.tsx 与 ApiSetupGuide.tsx**

```bash
rm E:\Grok\openbuddy\src\components\Topbar.tsx E:\Grok\openbuddy\src\components\ApiSetupGuide.tsx
```

- [ ] **Step 3: app.css 清理**

- 删除 `.topbar` 全部区块(`.topbar` 至 `.topbar__btn:hover`)
- 删除 ApiSetupGuide 使用的 `.setup` 相关区块(若存在,grep `setup` 确认无残留引用)
- `.app` 改为纵向布局:

```css
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--wb-bg-primary);
  color: var(--wb-text-strong);
}
.app__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app__main {
  flex: 1;
  min-width: 0;
  background: var(--wb-home-bg-secondary);
}
```

- [ ] **Step 4: 全量验证**

Run: `pnpm test`
Expected: PASS(可能有旧测试引用 Topbar/ApiSetupGuide——若存在一并删除)

Run: `pnpm build`
Expected: tsc + vite build 通过

---

### Task 9: 手动验收(Tauri 实机对照)

- [ ] **Step 1: 启动应用**

```bash
cd E:\Grok\openbuddy
pnpm tauri dev
```

- [ ] **Step 2: 对照验收清单逐项核对**(对照 WorkBuddy 截图与 `.cdp-inspect/captures/README.md` 速查值)

1. 无边框窗口:标题栏 30px,品牌 + 编辑/窗口/帮助菜单可展开,最小化/最大化/关闭可用,关闭键 hover 红色,标题栏可拖动窗口
2. 侧栏:264px、`#F2F2F2`;logo + 版本号灰色;导航六项;"更多"带副标题"资料库·灵感";空间分组可折叠;会话条目选中态 `#E6E6E6`;底部用户/通知/设置
3. 首页:背景 `#FAFAFA`;双行大标题 36px;场景标签切换(激活深灰 pill);快捷 chips 白底圆角;Composer 圆角 16 卡片、占位文案"今天帮你做些什么? @ 引用对话文件,/ 调用技能与指令";下方"选择工作空间/默认权限"
4. 功能:新建任务 → 输入发送 → 进入 ChatView 且 grok 真实回复;侧栏点会话可切换;设置面板可从齿轮打开
5. 占位:助理/项目/专家·技能·连接器/自动化/更多 → PlaceholderPage;搜索/筛选/通知/+/Auto/麦克风/工作空间/权限/chips/菜单占位项 → toast"即将上线"
6. 未配置 API Key 状态(可临时改名 `~/.grok` 配置模拟):Composer 禁用、显示"请先配置 API Key 开始使用"、点击打开设置

- [ ] **Step 3: 发现问题回到对应任务修复,全部通过后完成**

---

## Self-Review 记录

- **Spec 覆盖**:标题栏(设计④)→Task 2/8;侧栏(①)→Task 7;首页+Composer(①②③)→Task 5/6;占位策略(③)→Task 3/4/8;API Key 流程(③)→Task 5/8;亮色 only → 全部样式为亮色实测值;ChatView 不动 → 仅 Composer 共享组件重样式(与 WorkBuddy 一致)。✅
- **Placeholder 扫描**:无 TBD;所有代码步骤含完整代码。✅
- **类型一致**:`onPlaceholder(label: string)`、`onNavigate(label)`、`apiReady`、`showMeta`、`activeNav` 在 Task 5/6/7/8 间签名一致;Sidebar 版本号硬编码 `v 0.1.0` 与 package.json 一致。✅
