import { AgentToolIcon } from "@/foundation/components/Icon/icons";
import { LocalAssistantView } from "./LocalAssistantView";
import { ProjectsPanel } from "./ProjectsPanel";
import { ExpertsPanel } from "./experts-panel";
import { AutomationPanel } from "./AutomationPanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { PluginsPanel } from "./PluginsPanel";
import { MarketplacePanel } from "./MarketplacePanel";
import { DiscoverPanel } from "./DiscoverPanel";
import type { AgentEntry } from "@/lib/types";
import type { ModelOption } from "./ModelSelector";
import type { ProjectMeta } from "@/stores/projects-store";

interface PlaceholderPageProps {
  label: string;
  onPlaceholder?: (label: string) => void;
  /** Navigate to another sidebar view (e.g. 自动化 → 管理连接器 → 专家·技能·连接器). */
  onNavigate?: (label: string) => void;
  /** Start a new chat guided by an expert/assistant definition. */
  onStartWithExpert?: (agent: AgentEntry) => void;
  /** Surface transient feedback (errors, success toasts). */
  onToast?: (message: string) => void;
  /** Current cwd (for memory workspace scope, projects panel). */
  cwd?: string;
  /** Switch the active workspace (projects panel). */
  onSelectWorkspace?: (cwd: string) => void;
  /** Current session id (for plugins/marketplace actions that need a session). */
  sessionId?: string;
  /** Discover launcher: open a new session + send prompt (optionally with agent). */
  onLaunch?: (prompt: string, agent?: AgentEntry) => void;
  /** 本地助理页：发送消息（新建会话）。 */
  onSend?: (text: string) => void;
  /** 本地助理页：是否流式中。 */
  streaming?: boolean;
  /** 本地助理页：API 是否就绪。 */
  apiReady?: boolean;
  /** 本地助理页：打开设置。 */
  onOpenSettings?: () => void;
  /** 本地助理页：模型选择器（与聊天页一致）。 */
  modelId?: string;
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
  /** 项目页：进入项目（新建会话并注入说明）。 */
  onStartProject?: (project: ProjectMeta) => void;
}

/** WorkBuddy 独有功能面板（助理/专家·技能·连接器/项目/自动化/资料库/插件·市场/发现）。 */
export function PlaceholderPage({
  label,
  onPlaceholder,
  onNavigate,
  onStartWithExpert,
  onToast,
  cwd,
  onSelectWorkspace,
  sessionId,
  onLaunch,
  onSend,
  streaming,
  apiReady,
  onOpenSettings,
  modelId,
  models,
  onModelChange,
  onStartProject,
}: PlaceholderPageProps) {
  if (label === "助理") {
    return (
      <LocalAssistantView
        onSend={onSend ?? (() => {})}
        streaming={streaming ?? false}
        apiReady={apiReady ?? true}
        onOpenSettings={onOpenSettings}
        onPlaceholder={onPlaceholder}
        modelId={modelId}
        models={models}
        onModelChange={onModelChange}
      />
    );
  }

  if (label === "项目") {
    return (
      <ProjectsPanel
        cwd={cwd}
        onSelectWorkspace={onSelectWorkspace}
        onToast={onToast}
        onStartProject={onStartProject}
      />
    );
  }

  if (label === "专家·技能·连接器") {
    return <ExpertsPanel onUseExpert={onStartWithExpert} onToast={onToast} />;
  }

  if (label === "自动化") {
    return <AutomationPanel onToast={onToast} onNavigate={onNavigate} />;
  }

  if (label === "发现") {
    return (
      <DiscoverPanel
        sessionId={sessionId}
        onLaunch={onLaunch}
        onToast={onToast}
      />
    );
  }

  if (label === "插件·市场") {
    return (
      <PluginsMarketTabs
        sessionId={sessionId}
        onToast={onToast}
      />
    );
  }

  if (label === "更多") {
    return <ResourcesPanel cwd={cwd} onToast={onToast} />;
  }

  // 其他功能显示占位页面
  return (
    <div className="placeholder-page">
      <AgentToolIcon size="xl" color="var(--wb-text-tertiary)" />
      <h2 className="placeholder-page__title">{label}</h2>
      <p className="placeholder-page__desc">该功能即将上线,敬请期待</p>
    </div>
  );
}

/** 双 tab 容器：插件（已安装）/ 市场（可浏览安装）。 */
import { useState } from "react";
import { PuzzlePieceIcon, RepoIcon } from "@/foundation/components/Icon/icons";
function PluginsMarketTabs({
  sessionId,
  onToast,
}: {
  sessionId?: string;
  onToast?: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"plugins" | "marketplace">("plugins");
  return (
    <div className="plugins-market-wrap">
      <div className="plugins-market-tabs">
        <button
          className={`plugins-market-tab ${tab === "plugins" ? "plugins-market-tab--active" : ""}`}
          onClick={() => setTab("plugins")}
        >
          <PuzzlePieceIcon size="sm" /> 插件
        </button>
        <button
          className={`plugins-market-tab ${tab === "marketplace" ? "plugins-market-tab--active" : ""}`}
          onClick={() => setTab("marketplace")}
        >
          <RepoIcon size="sm" /> 市场
        </button>
      </div>
      {tab === "plugins" ? (
        <PluginsPanel sessionId={sessionId} onToast={onToast} />
      ) : (
        <MarketplacePanel sessionId={sessionId} onToast={onToast} />
      )}
    </div>
  );
}
