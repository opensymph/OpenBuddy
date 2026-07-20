import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("showMeta 时渲染权限模式选择器（PermissionPicker）", () => {
    // PermissionPicker 对应 grok 的 [ui] permission_mode,
    // 默认 ask → 触发器显示"审批模式"。
    render(<Composer {...base} showMeta onPlaceholder={vi.fn()} />);
    expect(screen.getByText(/审批模式/)).toBeInTheDocument();
  });

  it("未传 workspaces 时选择工作空间 fallback 触发 onPlaceholder", () => {
    // When workspaces/onSelectWorkspace are absent, the workspace button falls
    // back to onPlaceholder("选择工作空间").
    const onPlaceholder = vi.fn();
    render(<Composer {...base} showMeta onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByText("选择工作空间"));
    expect(onPlaceholder).toHaveBeenCalledWith("选择工作空间");
  });

  it("streaming 时显示停止按钮", () => {
    const onCancel = vi.fn();
    render(<Composer {...base} streaming onCancel={onCancel} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
