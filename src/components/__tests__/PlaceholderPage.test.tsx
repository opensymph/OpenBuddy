import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderPage } from "../PlaceholderPage";

describe("PlaceholderPage", () => {
  it("未实现的功能显示占位文案", () => {
    // 助理/项目/专家·技能·连接器/自动化/更多 都已接入真实面板，不再走占位。
    // 用一个未映射的 label 触发兜底分支。
    render(<PlaceholderPage label="某个未实现功能" />);
    expect(screen.getByText("某个未实现功能")).toBeInTheDocument();
    expect(screen.getByText(/即将上线/)).toBeInTheDocument();
  });
});
