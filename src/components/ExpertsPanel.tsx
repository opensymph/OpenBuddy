/**
 * 专家·技能·连接器面板 - 对接 grok 真实能力
 *
 * 三个 tab：
 *  - 专家: 读写 ~/.grok/agents/*.md（grok 的 AgentDefinition）
 *  - 技能: 调 x.ai/skills/* 扩展方法（grok 进程内状态）
 *  - 连接器: 调 x.ai/mcp/* 扩展方法（MCP servers）
 *
 * 数据通过 useEffect 从后端 command 加载，本地 useState 缓存 + loading/error 态。
 * 操作（安装/启用/连接/删除）调用对应 command 后刷新列表。
 */
import { useCallback, useEffect, useState } from "react";
import {
  SparklesIcon,
  PuzzlePieceIcon,
  PlugIcon,
  SearchIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  AddIcon,
  Code2Icon,
  FileTextIcon,
  GlobeIcon,
  DatabaseToolIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsList,
  agentsSave,
  agentsTemplate,
  mcpDelete,
  mcpList,
  mcpToggle,
  mcpUpsert,
  skillsList,
  skillsRemove,
  skillsToggle,
} from "@/lib/grok-client";
import type { AgentEntry, McpServerEntry, SkillInfo } from "@/lib/types";

type TabType = "experts" | "skills" | "connectors";

// 推荐专家模板（点击=用此模板创建新 agent）。这些是 OpenBuddy 内置的
// 起步模板，不是 grok 已有的 agent —— 用户保存后会写到 ~/.grok/agents/。
const EXPERT_TEMPLATES = [
  {
    id: "code-expert",
    name: "代码审查专家",
    description: "深度代码分析和优化建议",
    icon: Code2Icon,
    category: "开发",
    systemPrompt:
      "你是一名资深代码审查专家。请对用户提供的代码进行深度分析，关注：\n1. 潜在 bug 和边界情况\n2. 性能瓶颈\n3. 可读性和命名\n4. 安全风险\n\n给出具体的改进建议和重构示例。",
  },
  {
    id: "doc-writer",
    name: "技术文档撰写",
    description: "生成清晰的技术文档",
    icon: FileTextIcon,
    category: "文档",
    systemPrompt:
      "你是一名技术文档工程师。请根据用户提供的代码或需求，生成清晰、结构化的技术文档，包括：\n- API 说明\n- 使用示例\n- 参数说明\n- 注意事项",
  },
  {
    id: "api-designer",
    name: "API 设计师",
    description: "RESTful API 设计和文档",
    icon: GlobeIcon,
    category: "架构",
    systemPrompt:
      "你是一名 API 架构师。请根据用户需求设计 RESTful API，遵循最佳实践：\n- 资源命名规范\n- HTTP 方法语义\n- 状态码使用\n- 版本管理\n- 错误处理\n\n输出 OpenAPI 规范的端点定义。",
  },
  {
    id: "db-optimizer",
    name: "数据库优化师",
    description: "SQL 优化和数据库设计",
    icon: DatabaseToolIcon,
    category: "数据库",
    systemPrompt:
      "你是一名数据库性能优化专家。请分析用户的 SQL 查询和 schema 设计，关注：\n- 索引策略\n- 查询计划\n- 规范化/反规范化权衡\n- 分库分表方案\n\n给出可测量的优化建议。",
  },
];

// 内置连接器模板（常见 MCP server 预设，用户一键添加）
const CONNECTOR_TEMPLATES = [
  {
    id: "filesystem",
    name: "filesystem",
    displayName: "文件系统",
    description: "访问指定目录的文件读写能力",
    transport: "stdio" as const,
    target: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    icon: FileTextIcon,
  },
  {
    id: "postgres",
    name: "postgres",
    displayName: "PostgreSQL",
    description: "查询 PostgreSQL 数据库",
    transport: "stdio" as const,
    target: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user@localhost/db"],
    icon: DatabaseToolIcon,
  },
  {
    id: "github",
    name: "github",
    displayName: "GitHub",
    description: "GitHub 仓库、Issue、PR 操作",
    transport: "stdio" as const,
    target: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<your-token>" },
    icon: GlobeIcon,
  },
];

interface ExpertsPanelProps {
  /** Optional callback when the user starts a chat guided by an expert.
   *  OpenBuddy can't switch the active session's agent (ACP has no such call),
   *  so the typical action is to seed a new session with the agent's prompt. */
  onUseExpert?: (agent: AgentEntry) => void;
  onToast?: (message: string) => void;
}

export function ExpertsPanel({ onUseExpert, onToast }: ExpertsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("experts");
  const [searchQuery, setSearchQuery] = useState("");

  // ---- experts (agents) state ----
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // ---- skills state ----
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  // ---- connectors (MCP) state ----
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [serversLoading, setServersLoading] = useState(false);

  const reloadExperts = useCallback(async () => {
    setAgentsLoading(true);
    try {
      setAgents(await agentsList());
    } catch (e) {
      onToast?.(`加载专家失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setAgentsLoading(false);
    }
  }, [onToast]);

  const reloadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      setSkills(await skillsList());
    } catch (e) {
      onToast?.(`加载技能失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setSkillsLoading(false);
    }
  }, [onToast]);

  const reloadServers = useCallback(async () => {
    setServersLoading(true);
    try {
      setServers(await mcpList());
    } catch (e) {
      onToast?.(`加载连接器失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setServersLoading(false);
    }
  }, [onToast]);

  // Load the active tab's data on mount and whenever the tab switches.
  useEffect(() => {
    if (activeTab === "experts" && agents.length === 0) reloadExperts();
    if (activeTab === "skills" && skills.length === 0) reloadSkills();
    if (activeTab === "connectors" && servers.length === 0) reloadServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleCreateFromTemplate = useCallback(
    async (template: (typeof EXPERT_TEMPLATES)[number]) => {
      try {
        const raw = await agentsTemplate(
          template.name,
          template.description,
          template.systemPrompt,
        );
        const saved = await agentsSave(template.id, raw);
        onToast?.(`已创建专家「${saved.name}」`);
        reloadExperts();
      } catch (e) {
        onToast?.(`创建失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadExperts],
  );

  const handleSkillToggle = useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      try {
        await skillsToggle(skill.name, enabled);
        reloadSkills();
      } catch (e) {
        onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadSkills],
  );

  const handleSkillRemove = useCallback(
    async (skill: SkillInfo) => {
      if (!skill.path) {
        onToast?.("内置技能无法移除");
        return;
      }
      try {
        await skillsRemove(skill.path);
        onToast?.(`已移除技能「${skill.name}」`);
        reloadSkills();
      } catch (e) {
        onToast?.(`移除失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadSkills],
  );

  const handleConnectorToggle = useCallback(
    async (server: McpServerEntry, enabled: boolean) => {
      try {
        await mcpToggle(server.name, enabled);
        reloadServers();
      } catch (e) {
        onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadServers],
  );

  const handleConnectorDelete = useCallback(
    async (server: McpServerEntry) => {
      try {
        await mcpDelete(server.name);
        onToast?.(`已删除连接器「${server.name}」`);
        reloadServers();
      } catch (e) {
        onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadServers],
  );

  const handleConnectorAdd = useCallback(
    async (template: (typeof CONNECTOR_TEMPLATES)[number]) => {
      try {
        await mcpUpsert({
          name: template.name,
          transport: template.transport,
          target: template.target,
          args: template.args,
          env: ("env" in template && template.env) || undefined,
        });
        onToast?.(`已添加连接器「${template.displayName}」`);
        reloadServers();
      } catch (e) {
        onToast?.(`添加失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reloadServers],
  );

  const tabs: { key: TabType; label: string; icon: typeof SparklesIcon }[] = [
    { key: "experts", label: "专家", icon: SparklesIcon },
    { key: "skills", label: "技能", icon: PuzzlePieceIcon },
    { key: "connectors", label: "连接器", icon: PlugIcon },
  ];

  const reloadCurrent = () => {
    if (activeTab === "experts") reloadExperts();
    else if (activeTab === "skills") reloadSkills();
    else reloadServers();
  };

  return (
    <div className="experts-panel">
      <div className="experts-panel__header">
        <h2 className="experts-panel__title">专家·技能·连接器</h2>
        <button
          className="experts-panel__create-btn"
          onClick={reloadCurrent}
          title="刷新"
          disabled={
            agentsLoading || skillsLoading || serversLoading
          }
        >
          <RefreshCwIcon size="sm" />
          <span>刷新</span>
        </button>
      </div>

      {/* 标签页 */}
      <div className="experts-panel__tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`experts-panel__tab ${activeTab === tab.key ? "experts-panel__tab--active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size="sm" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 搜索 */}
      <div className="experts-panel__search">
        <SearchIcon size="md" className="experts-panel__search-icon" />
        <input
          type="text"
          className="experts-panel__search-input"
          placeholder={`搜索${activeTab === "experts" ? "专家" : activeTab === "skills" ? "技能" : "连接器"}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 内容区域 */}
      <div className="experts-panel__content">
        {activeTab === "experts" && (
          <ExpertsTab
            agents={agents}
            loading={agentsLoading}
            searchQuery={searchQuery}
            onUseExpert={onUseExpert}
            onCreateFromTemplate={handleCreateFromTemplate}
          />
        )}

        {activeTab === "skills" && (
          <SkillsTab
            skills={skills}
            loading={skillsLoading}
            searchQuery={searchQuery}
            onToggle={handleSkillToggle}
            onRemove={handleSkillRemove}
          />
        )}

        {activeTab === "connectors" && (
          <ConnectorsTab
            servers={servers}
            loading={serversLoading}
            searchQuery={searchQuery}
            onToggle={handleConnectorToggle}
            onDelete={handleConnectorDelete}
            onAddTemplate={handleConnectorAdd}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Experts tab ----------

function ExpertsTab({
  agents,
  loading,
  searchQuery,
  onUseExpert,
  onCreateFromTemplate,
}: {
  agents: AgentEntry[];
  loading: boolean;
  searchQuery: string;
  onUseExpert?: (agent: AgentEntry) => void;
  onCreateFromTemplate: (template: (typeof EXPERT_TEMPLATES)[number]) => void;
}) {
  const filteredTemplates = EXPERT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      {/* 我的专家（用户保存的 agent 定义） */}
      {filteredAgents.length > 0 && (
        <div className="experts-panel__section">
          <h3 className="experts-panel__section-title">
            <SparklesIcon size="sm" />
            <span>我的专家（{filteredAgents.length}）</span>
          </h3>
          <div className="experts-panel__grid">
            {filteredAgents.map((agent) => (
              <button
                key={agent.path}
                className="experts-panel__card"
                onClick={() => onUseExpert?.(agent)}
                title={agent.description ?? agent.name}
              >
                <div className="experts-panel__card-icon">
                  <SparklesIcon size="lg" />
                </div>
                <div className="experts-panel__card-content">
                  <span className="experts-panel__card-name">{agent.name}</span>
                  <span className="experts-panel__card-desc">
                    {agent.description ?? "（无描述）"}
                  </span>
                  <span className="experts-panel__card-category">
                    {agent.scope === "user" ? "用户级" : "项目级"}
                  </span>
                </div>
                <ChevronRightIcon size="sm" className="experts-panel__card-arrow" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 推荐专家模板 */}
      <div className="experts-panel__section">
        <h3 className="experts-panel__section-title">
          <SparklesIcon size="sm" />
          <span>推荐专家模板</span>
        </h3>
        <div className="experts-panel__grid">
          {filteredTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                className="experts-panel__card"
                onClick={() => onCreateFromTemplate(template)}
                title={`创建「${template.name}」专家`}
              >
                <div className="experts-panel__card-icon">
                  <Icon size="lg" />
                </div>
                <div className="experts-panel__card-content">
                  <span className="experts-panel__card-name">{template.name}</span>
                  <span className="experts-panel__card-desc">{template.description}</span>
                  <span className="experts-panel__card-category">{template.category}</span>
                </div>
                <AddIcon size="sm" className="experts-panel__card-arrow" />
              </button>
            );
          })}
        </div>
      </div>

      {loading && filteredAgents.length === 0 && (
        <div className="experts-panel__empty">加载中…</div>
      )}
    </>
  );
}

// ---------- Skills tab ----------

function SkillsTab({
  skills,
  loading,
  searchQuery,
  onToggle,
  onRemove,
}: {
  skills: SkillInfo[];
  loading: boolean;
  searchQuery: string;
  onToggle: (skill: SkillInfo, enabled: boolean) => void;
  onRemove: (skill: SkillInfo) => void;
}) {
  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!loading && filtered.length === 0) {
    return (
      <div className="experts-panel__empty">
        <PuzzlePieceIcon size="xl" color="var(--wb-text-tertiary)" />
        <p>暂无技能。可在 <code>~/.grok/skills/</code> 创建，或用「刷新」重扫。</p>
      </div>
    );
  }

  return (
    <div className="experts-panel__list">
      {filtered.map((skill) => (
        <div key={skill.name + (skill.path ?? "")} className="experts-panel__item">
          <div className="experts-panel__item-icon">
            <PuzzlePieceIcon size="md" />
          </div>
          <div className="experts-panel__item-content">
            <span className="experts-panel__item-name">
              {skill.displayName ?? skill.name}
              <span className="experts-panel__item-scope">
                {scopeLabel(skill.scope)}
              </span>
            </span>
            <span className="experts-panel__item-desc">
              {skill.description ?? "（无描述）"}
            </span>
          </div>
          <button
            className={`experts-panel__item-btn ${skill.enabled ? "experts-panel__item-btn--installed" : ""}`}
            onClick={() => onToggle(skill, !skill.enabled)}
            title={skill.enabled ? "点击禁用" : "点击启用"}
          >
            {skill.enabled ? "已启用" : "已禁用"}
          </button>
          {skill.path && (
            <button
              className="experts-panel__item-btn experts-panel__item-btn--danger"
              onClick={() => onRemove(skill)}
              title="从扫描路径移除"
            >
              移除
            </button>
          )}
        </div>
      ))}
      {loading && <div className="experts-panel__empty">加载中…</div>}
    </div>
  );
}

// ---------- Connectors tab ----------

function ConnectorsTab({
  servers,
  loading,
  searchQuery,
  onToggle,
  onDelete,
  onAddTemplate,
}: {
  servers: McpServerEntry[];
  loading: boolean;
  searchQuery: string;
  onToggle: (server: McpServerEntry, enabled: boolean) => void;
  onDelete: (server: McpServerEntry) => void;
  onAddTemplate: (template: (typeof CONNECTOR_TEMPLATES)[number]) => void;
}) {
  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.target ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const availableTemplates = CONNECTOR_TEMPLATES.filter(
    (t) => !servers.some((s) => s.name === t.name),
  );

  return (
    <>
      {/* 已配置的连接器 */}
      {filtered.length > 0 && (
        <div className="experts-panel__list">
          {filtered.map((server) => (
            <div key={server.name} className="experts-panel__item">
              <div className="experts-panel__item-icon">
                <PlugIcon size="md" />
              </div>
              <div className="experts-panel__item-content">
                <span className="experts-panel__item-name">
                  {server.name}
                  <span className="experts-panel__item-scope">
                    {transportLabel(server.transport)}
                  </span>
                </span>
                <span className="experts-panel__item-desc">
                  {server.target ?? "（无目标）"}
                  {server.disabledReason ? ` · ${server.disabledReason}` : ""}
                </span>
              </div>
              <button
                className={`experts-panel__item-btn ${server.enabled ? "experts-panel__item-btn--connected" : ""}`}
                onClick={() => onToggle(server, !server.enabled)}
              >
                {server.enabled ? "已启用" : "已禁用"}
              </button>
              <button
                className="experts-panel__item-btn experts-panel__item-btn--danger"
                onClick={() => onDelete(server)}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 可添加的连接器模板 */}
      {availableTemplates.length > 0 && (
        <div className="experts-panel__section">
          <h3 className="experts-panel__section-title">
            <PlugIcon size="sm" />
            <span>常用连接器</span>
          </h3>
          <div className="experts-panel__grid">
            {availableTemplates
              .filter((t) =>
                searchQuery === "" ||
                t.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    className="experts-panel__card"
                    onClick={() => onAddTemplate(template)}
                  >
                    <div className="experts-panel__card-icon">
                      <Icon size="lg" />
                    </div>
                    <div className="experts-panel__card-content">
                      <span className="experts-panel__card-name">
                        {template.displayName}
                      </span>
                      <span className="experts-panel__card-desc">
                        {template.description}
                      </span>
                    </div>
                    <AddIcon size="sm" className="experts-panel__card-arrow" />
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && availableTemplates.length === 0 && (
        <div className="experts-panel__empty">
          <PlugIcon size="xl" color="var(--wb-text-tertiary)" />
          <p>暂无连接器。编辑 <code>~/.grok/config.toml</code> 的 <code>[mcp_servers.*]</code> 段后点「刷新」。</p>
        </div>
      )}
      {loading && <div className="experts-panel__empty">加载中…</div>}
    </>
  );
}

function scopeLabel(scope: string | undefined): string {
  switch (scope) {
    case "user":
      return "用户";
    case "local":
      return "本地";
    case "repo":
      return "仓库";
    case "server":
      return "服务器";
    case "bundled":
      return "内置";
    case "plugin":
      return "插件";
    default:
      return scope ?? "";
  }
}

function transportLabel(transport: string | undefined): string {
  switch (transport) {
    case "stdio":
      return "本地进程";
    case "streamable_http":
    case "http":
      return "HTTP";
    case "sse":
      return "SSE";
    default:
      return transport ?? "";
  }
}
