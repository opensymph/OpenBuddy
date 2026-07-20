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

  // ---------- 按会话持久化草稿 ----------
  it("draft + draftKey 初始回填草稿内容", () => {
    render(
      <Composer
        {...base}
        draft="北京天气怎么样"
        draftKey="s1"
      />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "北京天气怎么样",
    );
  });

  it("draftKey 变化时回填新草稿(切会话场景)", () => {
    const { rerender } = render(
      <Composer {...base} draft="会话A草稿" draftKey="s1" />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "会话A草稿",
    );
    rerender(<Composer {...base} draft="会话B草稿" draftKey="s2" />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "会话B草稿",
    );
  });

  it("用户输入触发 onDraftChange 并带上最新文本", () => {
    const onDraftChange = vi.fn();
    render(
      <Composer {...base} draft="" draftKey="s1" onDraftChange={onDraftChange} />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "你好" },
    });
    expect(onDraftChange).toHaveBeenCalledWith("你好");
  });

  it("草稿回填(draftKey 变化)不触发 onDraftChange(避免把恢复内容当用户输入回写)", () => {
    const onDraftChange = vi.fn();
    const { rerender } = render(
      <Composer {...base} draft="" draftKey="s1" onDraftChange={onDraftChange} />,
    );
    onDraftChange.mockClear();
    rerender(
      <Composer {...base} draft="恢复出来的字" draftKey="s2" onDraftChange={onDraftChange} />,
    );
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("发送后清空草稿(onDraftChange 收到空串)", () => {
    const onDraftChange = vi.fn();
    render(
      <Composer {...base} draft="待发送" draftKey="s1" onDraftChange={onDraftChange} />,
    );
    onDraftChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onDraftChange).toHaveBeenLastCalledWith("");
  });
});
