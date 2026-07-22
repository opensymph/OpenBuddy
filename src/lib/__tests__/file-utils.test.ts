import { describe, it, expect, vi, afterEach } from "vitest";
import { formatFileSize, inferFileTypeFromExt, relativeTime } from "../file-utils";

describe("formatFileSize", () => {
  it("字节 (< 1024)", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("KB (1024 ~ 1MB)", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("MB (1MB ~ 1GB)", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(formatFileSize(1024 * 1024 * 1024 - 1)).toBe("1024.0 MB");
  });

  it("GB (>= 1GB)", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });

  it("非法输入返回 -", () => {
    expect(formatFileSize(-1)).toBe("-");
    expect(formatFileSize(Infinity)).toBe("-");
    expect(formatFileSize(NaN)).toBe("-");
  });
});

describe("inferFileTypeFromExt", () => {
  it("isFolder 优先返回 folder", () => {
    expect(inferFileTypeFromExt("anything.ts", true)).toBe("folder");
    expect(inferFileTypeFromExt("", true)).toBe("folder");
  });

  it("文档类型", () => {
    expect(inferFileTypeFromExt("doc")).toBe("document");
    expect(inferFileTypeFromExt("docx")).toBe("document");
    expect(inferFileTypeFromExt("txt")).toBe("document");
    expect(inferFileTypeFromExt("rtf")).toBe("document");
  });

  it("表格类型", () => {
    expect(inferFileTypeFromExt("xls")).toBe("spreadsheet");
    expect(inferFileTypeFromExt("xlsx")).toBe("spreadsheet");
    expect(inferFileTypeFromExt("csv")).toBe("spreadsheet");
  });

  it("演示类型", () => {
    expect(inferFileTypeFromExt("ppt")).toBe("presentation");
    expect(inferFileTypeFromExt("pptx")).toBe("presentation");
    expect(inferFileTypeFromExt("key")).toBe("presentation");
  });

  it("PDF", () => {
    expect(inferFileTypeFromExt("pdf")).toBe("pdf");
  });

  it("图片类型", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]) {
      expect(inferFileTypeFromExt(ext)).toBe("image");
    }
  });

  it("视频类型", () => {
    for (const ext of ["mp4", "mov", "avi", "mkv", "webm"]) {
      expect(inferFileTypeFromExt(ext)).toBe("video");
    }
  });

  it("音频类型", () => {
    for (const ext of ["mp3", "wav", "flac", "aac", "m4a"]) {
      expect(inferFileTypeFromExt(ext)).toBe("audio");
    }
  });

  it("Markdown", () => {
    expect(inferFileTypeFromExt("md")).toBe("markdown");
    expect(inferFileTypeFromExt("markdown")).toBe("markdown");
  });

  it("网页", () => {
    expect(inferFileTypeFromExt("html")).toBe("website");
    expect(inferFileTypeFromExt("htm")).toBe("website");
  });

  it("代码类型", () => {
    for (const ext of ["ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "rs", "rb", "swift", "kt", "json", "yaml", "yml", "toml", "sh", "bat"]) {
      expect(inferFileTypeFromExt(ext)).toBe("code");
    }
  });

  it("未知扩展名返回 other", () => {
    expect(inferFileTypeFromExt("xyz")).toBe("other");
    expect(inferFileTypeFromExt("")).toBe("other");
  });

  it("从完整文件名提取扩展名", () => {
    expect(inferFileTypeFromExt("report.pdf")).toBe("pdf");
    expect(inferFileTypeFromExt("photo.JPG")).toBe("image");
    expect(inferFileTypeFromExt("archive.tar.gz")).toBe("other");
    expect(inferFileTypeFromExt("index.tsx")).toBe("code");
  });

  it("大小写不敏感", () => {
    expect(inferFileTypeFromExt("PDF")).toBe("pdf");
    expect(inferFileTypeFromExt("DOC")).toBe("document");
    expect(inferFileTypeFromExt("MP4")).toBe("video");
  });
});

describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("falsy 值返回 —", () => {
    expect(relativeTime(0)).toBe("—");
  });

  it("小于 60 秒 → 刚刚", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime(Date.now() - 30_000)).toBe("刚刚");
    expect(relativeTime(Date.now() - 59_000)).toBe("刚刚");
  });

  it("分钟级", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe("5分钟前");
    expect(relativeTime(Date.now() - 59 * 60_000)).toBe("59分钟前");
  });

  it("小时级", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(relativeTime(Date.now() - 2 * 3600_000)).toBe("2小时前");
    expect(relativeTime(Date.now() - 23 * 3600_000)).toBe("23小时前");
  });

  it("昨天", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T12:00:00Z"));
    expect(relativeTime(Date.now() - 24 * 3600_000)).toBe("昨天");
  });

  it("天级 (2~6天)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    expect(relativeTime(Date.now() - 3 * 86400_000)).toBe("3天前");
    expect(relativeTime(Date.now() - 6 * 86400_000)).toBe("6天前");
  });

  it("超过 7 天显示完整日期", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    const ts = Date.now() - 10 * 86400_000;
    const d = new Date(ts);
    expect(relativeTime(ts)).toBe(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
  });
});
