import { PinnedSection } from "./PinnedSection";
import { WorkspaceGroup } from "./WorkspaceGroup";

export function ConversationList({ workspaces, onSelectWorkspace }: { workspaces: any[]; onSelectWorkspace: (cwd: string) => void }) {
  return (
    <div className="conversation-list">
      <PinnedSection />
      
      <WorkspaceGroup 
        workspaces={workspaces}
        onSelect={onSelectWorkspace}
      />
    </div>
  );
}