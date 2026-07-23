import { useState } from "react";
import { ChevronDownIcon } from "@/foundation/components/Icon/icons";

export function WorkspaceGroup({ workspaces, onSelect }: { workspaces: any[]; onSelect: (cwd: string) => void }) {
  const [expanded, setExpanded] = useState(true);

  const handleSelect = (cwd: string) => {
    onSelect(cwd);
  };

  return (
    <div className="workspace-group">
      <button className="workspace-group__header" onClick={() => setExpanded(!expanded)}>
        <span className="workspace-group__title">工作空间</span>
        <ChevronDownIcon size={16} className={`workspace-group__arrow ${expanded ? "" : "collapsed"}`} />
      </button>

      {expanded && (
        <div className="workspace-group__list">
          {workspaces.map((workspace: any) => (
            <button
              key={workspace.cwd}
              className="workspace-item"
              onClick={() => handleSelect(workspace.cwd)}
            >
              <span className="workspace-item__name">{workspace.name || workspace.cwd}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}