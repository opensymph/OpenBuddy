import type { HomeModeId } from "../home-scenes";

interface SceneTabsProps {
  activeMode: HomeModeId;
  onChange: (mode: HomeModeId) => void;
}

export function SceneTabs({ activeMode, onChange }: SceneTabsProps) {
  const modes: HomeModeId[] = ["working", "coding", "design"];

  return (
    <div className="scene-tabs">
      {modes.map((mode) => {
        const isActive = mode === activeMode;
        return (
          <button
            key={mode}
            className={`scene-tab ${isActive ? "active" : ""}`}
            onClick={() => onChange(mode)}
          >
            <span className="scene-tab__label">{getModeLabel(mode)}</span>
            {isActive && <div className="scene-tab__underline" />}
          </button>
        );
      })}
    </div>
  );
}

function getModeLabel(mode: HomeModeId): string {
  switch (mode) {
    case "working": return "日常办公";
    case "coding": return "代码开发";
    case "design": return "设计创意";
    default: return "日常办公";
  }
}