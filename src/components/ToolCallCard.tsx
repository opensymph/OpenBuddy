import { useState, useEffect, useCallback, type MouseEvent } from "react";
import type { ToolCallView } from "@/stores/session-store";
import type { DiffContent, CommandOutputContent } from "@/lib/types";
import { openLocalPath } from "@/lib/markdown-host";

type ToolCallCardProps = {
  tc: ToolCallView;
  cwd?: string;
  onToast?: (msg: string) => void;
};

/**
 * Inline tool-call card. Renders differently by kind:
 *  - read_file / list_dir: collapsible code/output block
 *  - edit (diff content): +/- diff view with clickable path
 *  - run_terminal_command: command + output
 *  - everything else: generic title + status
 */
export function ToolCallCard({ tc, cwd, onToast }: ToolCallCardProps) {
  const [open, setOpen] = useState(tc.status === "in_progress");

  // Auto-expand while running, auto-collapse when done.
  useEffect(() => {
    if (tc.status === "in_progress") {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [tc.status]);
  const diff = tc.content.find((c) => c.type === "diff") as DiffContent | undefined;
  const cmd = tc.content.find((c) => c.type === "command_output") as
    | CommandOutputContent
    | undefined;
  const texts = tc.content.filter((c) => c.type === "text") as Array<{
    type: "text";
    text: string;
  }>;

  const statusCls =
    tc.status === "completed"
      ? "toolcall--ok"
      : tc.status === "failed"
        ? "toolcall--err"
        : "toolcall--run";

  return (
    <div className={"toolcall " + statusCls}>
      <button
        className="toolcall__head"
        onClick={() => setOpen((o) => !o)}
        title={tc.title}
      >
        <span className="toolcall__kind">{tc.kind}</span>
        <span className="toolcall__title">{tc.title}</span>
        <span className="toolcall__chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="toolcall__body">
          {diff && (
            <DiffView diff={diff.diff} cwd={cwd} onToast={onToast} />
          )}
          {cmd && (
            <div className="toolcall__cmd">
              {cmd.command && (
                <pre className="toolcall__cmd-line">
                  <span className="toolcall__prompt">$</span>
                  {cmd.command}
                </pre>
              )}
              {cmd.output && <pre className="toolcall__output">{cmd.output}</pre>}
            </div>
          )}
          {texts.map((t, i) => (
            <pre key={i} className="toolcall__text">
              {t.text}
            </pre>
          ))}
          {/* Fallback: show rawInput when no content blocks rendered. */}
          {!diff && !cmd && texts.length === 0 && tc.rawInput != null && (
            <pre className="toolcall__text toolcall__raw-input">
              {typeof tc.rawInput === "string"
                ? tc.rawInput
                : JSON.stringify(tc.rawInput, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function DiffView({
  diff,
  cwd,
  onToast,
}: {
  diff: DiffContent["diff"];
  cwd?: string;
  onToast?: (msg: string) => void;
}) {
  const path = diff.path || "";
  const handleOpenPath = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (!path) return;
      void openLocalPath(path, { cwd, type: "file", onToast });
    },
    [path, cwd, onToast],
  );

  // Prefer unified hunks if present; otherwise compute a naive line diff.
  const oldLines = (diff.old ?? "").split("\n");
  const newLines = (diff.new ?? "").split("\n");

  const pathEl = path ? (
    <button
      type="button"
      className="diff__path diff__path--clickable"
      onClick={handleOpenPath}
      title={`在资源管理器中打开：${path}`}
    >
      {path}
    </button>
  ) : (
    <div className="diff__path">(unknown path)</div>
  );

  if (diff.hunks && diff.hunks.length) {
    return (
      <div className="diff">
        {pathEl}
        <pre className="diff__body">
          {diff.hunks.map((h, i) => {
            const lines: string[] = [];
            h.old.lines.forEach((l) => lines.push("- " + l));
            h.new.lines.forEach((l) => lines.push("+ " + l));
            return <div key={i}>{lines.join("\n")}</div>;
          })}
        </pre>
      </div>
    );
  }
  return (
    <div className="diff">
      {pathEl}
      <pre className="diff__body">
        {oldLines.map((l, i) => (
          <div key={"o" + i} className="diff__del">
            - {l}
          </div>
        ))}
        {newLines.map((l, i) => (
          <div key={"n" + i} className="diff__add">
            + {l}
          </div>
        ))}
      </pre>
    </div>
  );
}
