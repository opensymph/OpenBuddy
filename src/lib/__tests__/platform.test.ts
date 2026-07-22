import { describe, it, expect, vi, afterEach } from "vitest";

// platform.ts 在模块顶层计算 IS_MACOS，因此需要动态 import + mock navigator。
describe("isMacOS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("macOS UA 返回 true", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    const { isMacOS } = await import("../platform");
    expect(isMacOS()).toBe(true);
  });

  it("Mac OS X 变体返回 true", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Mac OS X 14_0) Safari/605.1.15",
    });
    const { isMacOS } = await import("../platform");
    expect(isMacOS()).toBe(true);
  });

  it("Windows UA 返回 false", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    const { isMacOS } = await import("../platform");
    expect(isMacOS()).toBe(false);
  });

  it("Linux UA 返回 false", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    });
    const { isMacOS } = await import("../platform");
    expect(isMacOS()).toBe(false);
  });

  it("navigator 不存在时返回 false", async () => {
    vi.stubGlobal("navigator", undefined);
    const { isMacOS } = await import("../platform");
    expect(isMacOS()).toBe(false);
  });
});
