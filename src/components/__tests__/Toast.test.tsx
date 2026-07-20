import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
