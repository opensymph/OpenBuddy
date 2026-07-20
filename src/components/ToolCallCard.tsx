import { useState } from "react";
import type { ToolCallView } from "@/stores/session-store";
import type { DiffContent, CommandOutputContent } from "@/lib/types";

/**
 * Inline tool-call card. Renders differently by kind:
 *  - read_file / list_dir: collapsible code/output block
 *  - edit (diff content): +/- diff view
 *  - run_terminal_command: command + output
 *  - everything else: generic title + status
 */
export function ToolCallCard({ tc }: { tc: ToolCallView }) {
  const [open, setOpen] = useState(tc.status === "in_progress");
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
      <button className="toolcall__head" onClick={() => setOpen((o) => !o)}>
        <span className="toolcall__kind">{tc.kind}</span>
        <span className="toolcall__title">{tc.title}</span>
        <span className="toolcall__status">{tc.status}</span>
        <span className="toolcall__chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="toolcall__body">
          {diff && <DiffView diff={diff.diff} />}
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
        </div>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: DiffContent["diff"] }) {
  // Prefer unified hunks if present; otherwise compute a naive line diff.
  const oldLines = (diff.old ?? "").split("\n");
  const newLines = (diff.new ?? "").split("\n");
  // Naive: show all old as removed, all new as added — good enough until we
  // wire a real diff lib. If hunks are provided, use them.
  if (diff.hunks && diff.hunks.length) {
    return (
      <div className="diff">
        <div className="diff__path">{diff.path}</div>
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
      <div className="diff__path">{diff.path}</div>
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
