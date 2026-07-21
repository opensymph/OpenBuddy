import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolCallCard } from "../ToolCallCard";
import type { ToolCallView } from "@/stores/session-store";

const base: ToolCallView = {
  toolCallId: "tc1",
  title: "Write C:\\Users\\chenr\\hello.txt",
  kind: "edit",
  status: "completed",
  content: [],
};

describe("ToolCallCard", () => {
  it("renders compact row and opens detail on click", () => {
    const onOpen = vi.fn();
    render(<ToolCallCard tc={base} onOpen={onOpen} />);
    expect(screen.getByText("edit")).toBeInTheDocument();
    expect(screen.getByText(/hello\.txt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("shows running status mark while in progress", () => {
    render(
      <ToolCallCard
        tc={{ ...base, status: "in_progress", title: "Execute notepad" }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("…")).toBeInTheDocument();
  });
});
