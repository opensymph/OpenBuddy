import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "../Sidebar";
import { useSessionsStore } from "@/stores/sessions-store";

const base = {
  onNewSession: vi.fn(),
  onSelect: vi.fn(),
  onNavigate: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenSearch: vi.fn(),
  onPlaceholder: vi.fn(),
  activeNav: "新建任务",
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

  it("搜索按钮触发 onOpenSearch,设置按钮触发 onOpenSettings", () => {
    const onOpenSearch = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <Sidebar {...base} onOpenSearch={onOpenSearch} onOpenSettings={onOpenSettings} />
    );
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(onOpenSearch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
