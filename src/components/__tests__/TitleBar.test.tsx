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

  it("渲染品牌与三个菜单", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    expect(screen.getByText("OpenBuddy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "窗口" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "帮助" })).toBeInTheDocument();
  });

  it("编辑菜单展开后点击复制调用 execCommand 并收起", () => {
    // 编辑菜单项现在接 document.execCommand（不再是 onPlaceholder）。
    // jsdom 没有 execCommand 实现，用 stub 替换。
    const onPlaceholder = vi.fn();
    const execMock = vi.fn().mockReturnValue(true);
    document.execCommand = execMock as unknown as typeof document.execCommand;
    render(<TitleBar onPlaceholder={onPlaceholder} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByText("复制"));
    expect(execMock).toHaveBeenCalledWith("copy");
    expect(onPlaceholder).not.toHaveBeenCalled();
    expect(screen.queryByText("粘贴")).not.toBeInTheDocument();
  });

  it("帮助菜单的'关于 OpenBuddy'调用 onShowAbout", () => {
    const onShowAbout = vi.fn();
    render(<TitleBar onPlaceholder={() => {}} onShowAbout={onShowAbout} />);
    fireEvent.click(screen.getByRole("button", { name: "帮助" }));
    fireEvent.click(screen.getByText("关于 OpenBuddy"));
    expect(onShowAbout).toHaveBeenCalled();
  });

  it("窗口菜单的最小化调用窗口 API", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "窗口" }));
    fireEvent.click(screen.getByText("最小化"));
    expect(minimize).toHaveBeenCalled();
  });

  it("窗口菜单的关闭调用窗口 close", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "窗口" }));
    fireEvent.click(screen.getByText("关闭"));
    expect(close).toHaveBeenCalled();
  });

  it("点击 backdrop 收起菜单", () => {
    render(<TitleBar onPlaceholder={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(document.querySelector(".titlebar__backdrop") as Element);
    expect(screen.queryByText("复制")).not.toBeInTheDocument();
  });
});
