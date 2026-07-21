import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RewindBar } from "../RewindBar";

// The toolbar talks to grok over Tauri `invoke`, which doesn't exist under
// vitest — stub the three client calls it uses.
vi.mock("@/lib/grok-client", () => ({
  rewindPoints: vi.fn().mockResolvedValue([
    { promptIndex: 0, promptPreview: "first prompt", timestamp: "2026-01-01T00:00:00Z" },
  ]),
  rewindExecute: vi.fn().mockResolvedValue(undefined),
  sessionFork: vi.fn().mockResolvedValue("forked-session-id-1234"),
}));

describe("RewindBar wiring", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("分叉成功后调用 onForked(新id) 与 onToast", async () => {
    const onForked = vi.fn();
    const onToast = vi.fn();
    render(
      <RewindBar sessionId="s1" onForked={onForked} onToast={onToast} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /分叉/ }));
    await waitFor(() =>
      expect(onForked).toHaveBeenCalledWith("forked-session-id-1234"),
    );
    expect(onToast).toHaveBeenCalled();
  });

  it("回溯成功后调用 onRewound 与 onToast", async () => {
    const onRewound = vi.fn();
    const onToast = vi.fn();
    render(
      <RewindBar sessionId="s1" onRewound={onRewound} onToast={onToast} />,
    );
    // 打开下拉触发加载回溯点。
    fireEvent.click(screen.getByRole("button", { name: /回溯/ }));
    // 等列表渲染出来,点"仅对话"。
    const onlyConv = await screen.findByRole("button", { name: "仅对话" });
    fireEvent.click(onlyConv);
    await waitFor(() => expect(onRewound).toHaveBeenCalled());
    expect(onToast).toHaveBeenCalled();
  });
});
