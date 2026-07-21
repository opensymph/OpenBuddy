import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/foundation/components/Icon/icons";
import { mcpConfigPath, mcpConfigRead, mcpConfigSave } from "@/lib/grok-client";

const EMPTY = "{\n  \"mcpServers\": {}\n}";

/** Raw mcp.json editor (截图 7): back / 取消 / 保存 header, the config-file
 *  path line, and a line-numbered monospace textarea. Validates JSON before
 *  saving; the backend also re-validates and mirrors entries into grok. */
export function McpConfigEditor({
  onBack, onSaved, onToast,
}: {
  onBack: () => void;
  onSaved?: () => void;
  onToast?: (m: string) => void;
}) {
  const [filePath, setFilePath] = useState("");
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gutterRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, file] = await Promise.all([mcpConfigPath(), mcpConfigRead()]);
        setFilePath(p || file.filePath);
        setContent(file.content || EMPTY);
        setOriginal(file.content || EMPTY);
      } catch (e) {
        onToast?.(`读取配置失败：${String(e).replace(/^Error:\s*/, "")}`);
        setContent(EMPTY);
        setOriginal(EMPTY);
      } finally {
        setLoading(false);
      }
    })();
  }, [onToast]);

  const hasChanges = content !== original;
  const lineCount = content.split("\n").length;

  const syncGutter = () => {
    if (gutterRef.current && taRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  const doBack = () => {
    if (hasChanges && !confirm("有未保存的修改，确定放弃？")) return;
    onBack();
  };

  const doSave = async () => {
    const trimmed = content.trim();
    if (trimmed) {
      try { JSON.parse(trimmed); }
      catch (e) { setError(`无效的 JSON：${(e as Error).message}`); return; }
    }
    setError("");
    setSaving(true);
    try {
      await mcpConfigSave(content);
      setOriginal(content);
      onToast?.("已保存，正在同步到 MCP 服务…");
      onSaved?.();
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mcp-editor">
      <div className="mcp-editor-head">
        <button type="button" className="mcp-editor-back" onClick={doBack}>
          <ChevronLeftIcon size="sm" /><span>返回 MCP 列表</span>
        </button>
        <div className="mcp-editor-actions">
          <button type="button" className="um-btn um-btn--grey" onClick={doBack}>取消</button>
          <button type="button" className="um-btn um-btn--primary"
            disabled={!hasChanges || saving} onClick={doSave}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
      <div className="mcp-editor-path">
        <span className="mcp-editor-path-label">配置文件路径</span>
        <span className="mcp-editor-path-value">{filePath}</span>
        {hasChanges && <span className="mcp-editor-unsaved">未保存</span>}
      </div>
      <div className="mcp-editor-body">
        {loading ? (
          <div className="ec-loading">加载中…</div>
        ) : (
          <div className="mcp-code">
            <div ref={gutterRef} className="mcp-code-gutter" aria-hidden>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="mcp-code-ln">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={taRef}
              className="mcp-code-input"
              spellCheck={false}
              value={content}
              onScroll={syncGutter}
              onChange={(e) => { setContent(e.target.value); setError(""); }}
            />
          </div>
        )}
        {error && <div className="mcp-editor-error">{error}</div>}
      </div>
    </div>
  );
}
