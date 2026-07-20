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

  it("场景标签可切换激活态", () => {
    render(<HomePage {...base} />);
    const dev = screen.getByRole("tab", { name: /代码开发/ });
    fireEvent.click(dev);
    expect(dev.className).toContain("--active");
    expect(screen.getByRole("tab", { name: /日常办公/ }).className).not.toContain("--active");
  });

  it("点击快捷 chip 填入预设提示词到 Composer", () => {
    // Chips now seed the Composer with a starter prompt instead of a toast.
    render(<HomePage {...base} />);
    fireEvent.click(screen.getByRole("button", { name: /文档处理/ }));
    // The seeded text appears in the textarea.
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("文档");
  });

  it("点击'更多' chip 触发 onPlaceholder（提示 / 命令）", () => {
    const onPlaceholder = vi.fn();
    render(<HomePage {...base} onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByRole("button", { name: /更多/ }));
    expect(onPlaceholder).toHaveBeenCalled();
  });
});
