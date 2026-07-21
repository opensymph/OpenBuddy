import { useEffect, useState } from "react";
import type { ToolCallView } from "@/stores/session-store";
import type { SessionArtifact } from "@/lib/session-artifacts";
import { ToolCallDetailBody } from "./ToolCallCard";
import { openLocalPath } from "@/lib/markdown-host";
import { invoke } from "@tauri-apps/api/core";

export type ToolSidePanelMode = "tool" | "artifacts" | "preview";

type ToolSidePanelProps = {
  open: boolean;
  mode: ToolSidePanelMode;
  toolCall?: ToolCallView | null;
  artifacts: SessionArtifact[];
  previewPath?: string | null;
  cwd?: string;
  onToast?: (msg: string) => void;
  onClose: () => void;
  onSelectTool: (tc: ToolCallView) => void;
  onSelectArtifact: (a: SessionArtifact) => void;
  onOpenArtifacts: () => void;
  findToolCall?: (id: string) => ToolCallView | undefined;
};

/**
 * Right-side panel for chat (Phases 2–3):
 * - tool: full tool-call detail (command / diff / output)
 * - artifacts: session file list from tool calls
 * - preview: lightweight text preview of a local file
 */
export function ToolSidePanel({
  open,
  mode,
  toolCall,
  artifacts,
  previewPath,
  cwd,
  onToast,
  onClose,
  onSelectTool,
  onSelectArtifact,
  onOpenArtifacts,
  findToolCall,
}: ToolSidePanelProps) {
  if (!open) return null;

  const title =
    mode === "artifacts"
      ? `产物 (${artifacts.length})`
      : mode === "preview"
        ? "文件预览"
        : "工具详情";

  return (
    <aside className="tool-side-panel" aria-label={title}>
      <header className="tool-side-panel__header">
        <div className="tool-side-panel__tabs">
          <button
            type="button"
            className={
              "tool-side-panel__tab" +
              (mode === "tool" || mode === "preview" ? " tool-side-panel__tab--active" : "")
            }
            onClick={() => {
              if (toolCall) onSelectTool(toolCall);
            }}
            disabled={!toolCall}
          >
            详情
          </button>
          <button
            type="button"
            className={
              "tool-side-panel__tab" +
              (mode === "artifacts" ? " tool-side-panel__tab--active" : "")
            }
            onClick={onOpenArtifacts}
          >
            产物{artifacts.length > 0 ? ` ${artifacts.length}` : ""}
          </button>
        </div>
        <button
          type="button"
          className="tool-side-panel__close"
          onClick={onClose}
          aria-label="关闭面板"
        >
          ×
        </button>
      </header>

      <div className="tool-side-panel__body">
        {mode === "tool" && toolCall && (
          <ToolCallDetailBody
            tc={toolCall}
            onOpenPath={(path) => {
              // Prefer in-panel preview.
              onSelectArtifact({
                id: path,
                path,
                kind: toolCall.kind,
                title: toolCall.title,
                toolCallId: toolCall.toolCallId,
                status: toolCall.status,
              });
            }}
          />
        )}

        {mode === "tool" && !toolCall && (
          <p className="tool-side-panel__empty">在对话中点击工具行查看详情</p>
        )}

        {mode === "artifacts" && (
          <ArtifactsList
            artifacts={artifacts}
            onSelect={(a) => {
              const tc = findToolCall?.(a.toolCallId);
              if (tc) onSelectTool(tc);
              onSelectArtifact(a);
            }}
            onOpenOs={(path) => {
              void openLocalPath(path, { cwd, type: "file", onToast });
            }}
          />
        )}

        {mode === "preview" && previewPath && (
          <FilePreview
            path={previewPath}
            cwd={cwd}
            onToast={onToast}
            onOpenOs={() => {
              void openLocalPath(previewPath, { cwd, type: "file", onToast });
            }}
          />
        )}
      </div>
    </aside>
  );
}

function ArtifactsList({
  artifacts,
  onSelect,
  onOpenOs,
}: {
  artifacts: SessionArtifact[];
  onSelect: (a: SessionArtifact) => void;
  onOpenOs: (path: string) => void;
}) {
  if (artifacts.length === 0) {
    return (
      <p className="tool-side-panel__empty">
        本会话还没有可展示的文件产物。工具写入/修改文件后会出现在这里。
      </p>
    );
  }

  return (
    <ul className="artifacts-list">
      {artifacts.map((a) => (
        <li key={a.id} className="artifacts-list__item">
          <button
            type="button"
            className="artifacts-list__main"
            onClick={() => onSelect(a)}
            title={a.path}
          >
            <span className="artifacts-list__name">{basename(a.path)}</span>
            <span className="artifacts-list__path">{a.path}</span>
            <span className="artifacts-list__meta">
              {a.kind}
              {a.status === "failed" ? " · 失败" : ""}
            </span>
          </button>
          <button
            type="button"
            className="artifacts-list__open"
            onClick={() => onOpenOs(a.path)}
            title="用系统应用打开"
          >
            打开
          </button>
        </li>
      ))}
    </ul>
  );
}

function FilePreview({
  path,
  cwd,
  onToast,
  onOpenOs,
}: {
  path: string;
  cwd?: string;
  onToast?: (msg: string) => void;
  onOpenOs: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setText(null);

    (async () => {
      try {
        const content = await invoke<string>("read_text_file", {
          path,
          cwd: cwd ?? null,
          maxBytes: 256 * 1024,
        });
        if (!cancelled) {
          setText(content);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(String(e).replace(/^Error:\s*/, ""));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, cwd]);

  return (
    <div className="file-preview">
      <div className="file-preview__bar">
        <span className="file-preview__path" title={path}>
          {path}
        </span>
        <button type="button" className="file-preview__open" onClick={onOpenOs}>
          系统打开
        </button>
      </div>
      {loading && <p className="tool-side-panel__empty">加载中…</p>}
      {err && (
        <div className="file-preview__err">
          <p>无法在面板内预览：{err}</p>
          <button
            type="button"
            className="file-preview__open"
            onClick={() => {
              onOpenOs();
              onToast?.("已尝试用系统打开文件");
            }}
          >
            用系统应用打开
          </button>
        </div>
      )}
      {text != null && <pre className="file-preview__body">{text}</pre>}
    </div>
  );
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}
