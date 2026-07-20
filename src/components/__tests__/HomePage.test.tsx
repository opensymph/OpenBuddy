import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomePage } from "../HomePage";

const base = {
  onSend: vi.fn(),
  streaming: false,
  apiReady: true,
  onOpenSettings: vi.fn(),
  onPlaceholder: vi.fn(),
};

describe("HomePage", () => {
  it("渲染双行大标题", () => {
    render(<HomePage {...base} />);
    expect(screen.getByText("OpenBuddy")).toBeInTheDocument();
    expect(screen.getByText("你的职场超能力")).toBeInTheDocument();
  });

  it("场景标签可切换激活态并更换能力 chip 列表", () => {
    render(<HomePage {...base} />);
    // 默认"日常办公":应能看到能力 chip"文档处理"。
    expect(screen.getByRole("button", { name: "文档处理" })).toBeInTheDocument();
    const dev = screen.getByRole("tab", { name: /代码开发/ });
    fireEvent.click(dev);
    expect(dev.className).toContain("--active");
    expect(screen.getByRole("tab", { name: /日常办公/ }).className).not.toContain("--active");
    // 切到"代码开发"后,chip 列表换成 coding 的能力。
    expect(screen.getByRole("button", { name: "日常开发" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "文档处理" })).toBeNull();
  });

  it("点击能力 chip 插入操作类型标签并把该行替换为模板行", () => {
    render(<HomePage {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "文档处理" }));
    // 输入框出现黑色"操作类型"标签。
    expect(screen.getByRole("group", { name: /操作类型 文档处理/ })).toBeInTheDocument();
    // 能力行被模板行替换:出现模板 chip。
    expect(screen.getByRole("button", { name: "财报分析全流程" })).toBeInTheDocument();
    // 其他能力 chip 被隐藏。
    expect(screen.queryByRole("button", { name: "金融服务" })).toBeNull();
  });

  it("点击模板把 prompt 填入输入框并保留操作类型标签", () => {
    render(<HomePage {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "文档处理" }));
    fireEvent.click(screen.getByRole("button", { name: "财报分析全流程" }));
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("财报分析");
    // 标签仍然保留。
    expect(screen.getByRole("group", { name: /操作类型 文档处理/ })).toBeInTheDocument();
  });

  it("切换场景 tab 会清空操作类型标签与选中态", () => {
    render(<HomePage {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "文档处理" }));
    expect(screen.getByRole("group", { name: /操作类型 文档处理/ })).toBeInTheDocument();
    // 选中分类后能力行被隐藏,无法再点同一 chip;切换 tab 来取消。
    fireEvent.click(screen.getByRole("tab", { name: /代码开发/ }));
    expect(screen.queryByRole("group", { name: /操作类型 文档处理/ })).toBeNull();
    expect(screen.getByRole("button", { name: "日常开发" })).toBeInTheDocument();
  });

  it("未展开时折叠为前 3 个 + 更多,点击更多展开全部", () => {
    render(<HomePage {...base} />);
    // 折叠态:第 4 个分类"深度研究"不可见,但"更多"可见。
    expect(screen.queryByRole("button", { name: "深度研究" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    // 展开后可见全部分类,且不再有"更多"按钮。
    expect(screen.getByRole("button", { name: "深度研究" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多" })).toBeNull();
  });

  it("输入框标签的 × 移除标签并回到能力行", () => {
    render(<HomePage {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "文档处理" }));
    fireEvent.click(screen.getByRole("button", { name: /移除 文档处理/ }));
    expect(screen.queryByRole("group", { name: /操作类型 文档处理/ })).toBeNull();
    expect(screen.getByRole("button", { name: "金融服务" })).toBeInTheDocument();
  });
});
