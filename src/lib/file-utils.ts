export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type FileType =
  | "folder"
  | "document"
  | "markdown"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "website"
  | "code"
  | "other";

export function inferFileTypeFromExt(
  extOrName: string,
  isFolder?: boolean,
): FileType {
  if (isFolder) return "folder";
  let ext = extOrName.toLowerCase();
  if (ext.includes(".")) {
    const dot = ext.lastIndexOf(".");
    ext = dot > 0 ? ext.slice(dot + 1) : "";
  }
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return "document";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  if (["ppt", "pptx", "key"].includes(ext)) return "presentation";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "aac", "m4a"].includes(ext)) return "audio";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "website";
  if (
    [
      "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "rs",
      "rb", "swift", "kt", "json", "yaml", "yml", "toml", "sh", "bat",
    ].includes(ext)
  )
    return "code";
  return "other";
}

export function relativeTime(ts: number): string {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day}天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export interface LocalFileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  type: FileType;
}
