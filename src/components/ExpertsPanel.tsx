/**
 * 专家·技能·连接器面板 — 1:1 复刻 WorkBuddy expert center
 *
 * 三个 tab 对齐 WB 的 ExpertTab / SkillTab / ConnectorTab:
 *  - 专家: 卡片网格 + 状态指示 + 分类标签 + 快速创建
 *  - 技能: 列表 + 开关切换 + scope 标签
 *  - 连接器: 列表 + 连接状态 + 认证提示 + 模板快速添加
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
  XCloseIcon,
  DeleteIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsList,
  agentsSave,
  agentsTemplate,
  agentsDelete,
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

const EXPERT_TEMPLATES = [
  {
    id: "code-expert", name: "代码审查专家", description: "深度代码分析和优化建议",
    icon: Code2Icon, category: "开发",
    systemPrompt: "你是一名资深代码审查专家。请对用户提供的代码进行深度分析，关注：\n1. 潜在 bug 和边界情况\n2. 性能瓶颈\n3. 可读性和命名\n4. 安全风险\n\n给出具体的改进建议和重构示例。",
  },
  {
    id: "doc-writer", name: "技术文档撰写", description: "生成清晰的技术文档",
    icon: FileTextIcon, category: "文档",
    systemPrompt: "你是一名技术文档工程师。请根据用户提供的代码或需求，生成清晰、结构化的技术文档，包括：\n- API 说明\n- 使用示例\n- 参数说明\n- 注意事项",
  },
  {
    id: "api-designer", name: "API 设计师", description: "RESTful API 设计和文档",
    icon: GlobeIcon, category: "架构",
    systemPrompt: "你是一名 API 架构师。请根据用户需求设计 RESTful API，遵循最佳实践：\n- 资源命名规范\n- HTTP 方法语义\n- 状态码使用\n- 版本管理\n- 错误处理\n\n输出 OpenAPI 规范的端点定义。",
  },
  {
    id: "db-optimizer", name: "数据库优化师", description: "SQL 优化和数据库设计",
    icon: DatabaseToolIcon, category: "数据库",
    systemPrompt: "你是一名数据库性能优化专家。请分析用户的 SQL 查询和 schema 设计，关注：\n- 索引策略\n- 查询计划\n- 规范化/反规范化权衡\n- 分库分表方案\n\n给出可测量的优化建议。",
  },
];

const CONNECTOR_TEMPLATES = [
  {
    id: "filesystem", name: "filesystem", displayName: "文件系统",
    description: "访问指定目录的文件读写能力",
    transport: "stdio" as const, target: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    icon: FileTextIcon,
  },
  {
    id: "postgres", name: "postgres", displayName: "PostgreSQL",
    description: "查询 PostgreSQL 数据库",
    transport: "stdio" as const, target: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user@localhost/db"],
    icon: DatabaseToolIcon,
  },
  {
    id: "github", name: "github", displayName: "GitHub",
    description: "GitHub 仓库、Issue、PR 操作",
    transport: "stdio" as const, target: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<your-token>" },
    icon: GlobeIcon,
  },
];

interface ExpertsPanelProps {
  onUseExpert?: (agent: AgentEntry) => void;
  onToast?: (message: string) => void;
}

export function ExpertsPanel({ onUseExpert, onToast }: ExpertsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("experts");
  const [searchQuery, setSearchQuery] = useState("");

  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [serversLoading, setServersLoading] = useState(false);

  // Connector upsert dialog
  const [connectorDialog, setConnectorDialog] = useState<{
    name: string; transport: string; target: string; args: string; env: string;
  } | null>(null);

  const reloadExperts = useCallback(async () => {
    setAgentsLoading(true);
    try { setAgents(await agentsList()); }
    catch (e) { onToast?.(`加载专家失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setAgentsLoading(false); }
  }, [onToast]);

  const reloadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try { setSkills(await skillsList()); }
    catch (e) { onToast?.(`加载技能失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setSkillsLoading(false); }
  }, [onToast]);

  const reloadServers = useCallback(async () => {
    setServersLoading(true);
    try { setServers(await mcpList()); }
    catch (e) { onToast?.(`加载连接器失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setServersLoading(false); }
  }, [onToast]);

  useEffect(() => {
    if (activeTab === "experts" && agents.length === 0) reloadExperts();
    if (activeTab === "skills" && skills.length === 0) reloadSkills();
    if (activeTab === "connectors" && servers.length === 0) reloadServers();
  }, [activeTab]);

  const handleCreateFromTemplate = useCallback(async (template: (typeof EXPERT_TEMPLATES)[number]) => {
    try {
      const raw = await agentsTemplate(template.name, template.description, template.systemPrompt);
      const saved = await agentsSave(template.id, raw);
      onToast?.(`已创建专家「${saved.name}」`);
      reloadExperts();
    } catch (e) {
      onToast?.(`创建失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [onToast, reloadExperts]);

  const handleDeleteExpert = useCallback(async (agent: AgentEntry) => {
    if (!confirm(`确定删除专家「${agent.name}」？`)) return;
    try {
      await agentsDelete(agent.path);
      onToast?.("已删除");
      reloadExperts();
    } catch (e) {
      onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [onToast, reloadExperts]);

  const handleSkillToggle = useCallback(async (skill: SkillInfo, enabled: boolean) => {
    try { await skillsToggle(skill.name, enabled); reloadSkills(); }
    catch (e) { onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadSkills]);

  const handleSkillRemove = useCallback(async (skill: SkillInfo) => {
    if (!skill.path) { onToast?.("内置技能无法移除"); return; }
    try { await skillsRemove(skill.path); onToast?.(`已移除技能「${skill.name}」`); reloadSkills(); }
    catch (e) { onToast?.(`移除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadSkills]);

  const handleConnectorToggle = useCallback(async (server: McpServerEntry, enabled: boolean) => {
    try { await mcpToggle(server.name, enabled); reloadServers(); }
    catch (e) { onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadServers]);

  const handleConnectorDelete = useCallback(async (server: McpServerEntry) => {
    if (!confirm(`确定删除连接器「${server.name}」？`)) return;
    try { await mcpDelete(server.name); onToast?.(`已删除连接器「${server.name}」`); reloadServers(); }
    catch (e) { onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadServers]);

  const handleConnectorAdd = useCallback(async (template: (typeof CONNECTOR_TEMPLATES)[number]) => {
    try {
      await mcpUpsert({
        name: template.name, transport: template.transport,
        target: template.target, args: template.args,
        env: ("env" in template && template.env) || undefined,
      });
      onToast?.(`已添加连接器「${template.displayName}」`);
      reloadServers();
    } catch (e) {
      onToast?.(`添加失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [onToast, reloadServers]);

  const handleCustomConnectorSave = useCallback(async () => {
    if (!connectorDialog) return;
    try {
      const args = connectorDialog.args.trim() ? connectorDialog.args.split(/\s+/) : undefined;
      let env: Record<string, string> | undefined;
      if (connectorDialog.env.trim()) {
        env = {};
        for (const line of connectorDialog.env.split("\n")) {
          const eq = line.indexOf("=");
          if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
      await mcpUpsert({
        name: connectorDialog.name, transport: connectorDialog.transport,
        target: connectorDialog.target, args, env,
      });
      onToast?.(`已添加连接器「${connectorDialog.name}」`);
      setConnectorDialog(null);
      reloadServers();
    } catch (e) {
      onToast?.(`添加失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [connectorDialog, onToast, reloadServers]);

  const reloadCurrent = () => {
    if (activeTab === "experts") reloadExperts();
    else if (activeTab === "skills") reloadSkills();
    else reloadServers();
  };

  const tabs: { key: TabType; label: string; icon: typeof SparklesIcon; count: number }[] = [
    { key: "experts", label: "专家", icon: SparklesIcon, count: agents.length },
    { key: "skills", label: "技能", icon: PuzzlePieceIcon, count: skills.length },
    { key: "connectors", label: "连接器", icon: PlugIcon, count: servers.length },
  ];

  return (
    <div className="expert-center">
      {/* Header */}
      <div className="expert-center-header">
        <h2 className="expert-center-title">专家·技能·连接器</h2>
        <div className="expert-center-header-actions">
          <button className="expert-center-refresh" onClick={reloadCurrent}
            disabled={agentsLoading || skillsLoading || serversLoading} title="刷新">
            <RefreshCwIcon size="sm" />
          </button>
          {activeTab === "connectors" && (
            <button className="expert-center-add-btn" onClick={() => setConnectorDialog({
              name: "", transport: "stdio", target: "", args: "", env: "",
            })}>
              <AddIcon size="sm" /><span>自定义</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="expert-center-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.key}
              className={`expert-center-tab${activeTab === tab.key ? " expert-center-tab--active" : ""}`}
              onClick={() => { setActiveTab(tab.key); setSearchQuery(""); }}>
              <Icon size="sm" />
              <span>{tab.label}</span>
              <span className="expert-center-tab-count">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="expert-center-search">
        <SearchIcon size="sm" className="expert-center-search-icon" />
        <input type="text" className="expert-center-search-input"
          placeholder={`搜索${activeTab === "experts" ? "专家" : activeTab === "skills" ? "技能" : "连接器"}...`}
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {/* Content */}
      <div className="expert-center-content">
        {activeTab === "experts" && (
          <ExpertsTabContent
            agents={agents} loading={agentsLoading} searchQuery={searchQuery}
            onUseExpert={onUseExpert} onCreateFromTemplate={handleCreateFromTemplate}
            onDelete={handleDeleteExpert}
          />
        )}
        {activeTab === "skills" && (
          <SkillsTabContent
            skills={skills} loading={skillsLoading} searchQuery={searchQuery}
            onToggle={handleSkillToggle} onRemove={handleSkillRemove}
          />
        )}
        {activeTab === "connectors" && (
          <ConnectorsTabContent
            servers={servers} loading={serversLoading} searchQuery={searchQuery}
            onToggle={handleConnectorToggle} onDelete={handleConnectorDelete}
            onAddTemplate={handleConnectorAdd}
          />
        )}
      </div>

      {/* Custom Connector Dialog */}
      {connectorDialog && (
        <div className="modal-overlay" onClick={() => setConnectorDialog(null)}>
          <div className="connector-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="connector-dialog-header">
              <h3>添加自定义连接器</h3>
              <button onClick={() => setConnectorDialog(null)}><XCloseIcon size="md" /></button>
            </div>
            <div className="connector-dialog-body">
              <label className="connector-dialog-field">
                <span>名称 *</span>
                <input value={connectorDialog.name}
                  onChange={(e) => setConnectorDialog({ ...connectorDialog, name: e.target.value })}
                  placeholder="例如：my-mcp-server" />
              </label>
              <label className="connector-dialog-field">
                <span>传输方式</span>
                <select value={connectorDialog.transport}
                  onChange={(e) => setConnectorDialog({ ...connectorDialog, transport: e.target.value })}>
                  <option value="stdio">本地进程 (stdio)</option>
                  <option value="streamable_http">HTTP (streamable_http)</option>
                  <option value="sse">SSE</option>
                </select>
              </label>
              <label className="connector-dialog-field">
                <span>目标（命令或 URL）*</span>
                <input value={connectorDialog.target}
                  onChange={(e) => setConnectorDialog({ ...connectorDialog, target: e.target.value })}
                  placeholder={connectorDialog.transport === "stdio" ? "npx" : "https://..."} />
              </label>
              <label className="connector-dialog-field">
                <span>参数（空格分隔）</span>
                <input value={connectorDialog.args}
                  onChange={(e) => setConnectorDialog({ ...connectorDialog, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-xxx" />
              </label>
              <label className="connector-dialog-field">
                <span>环境变量（每行 KEY=VALUE）</span>
                <textarea value={connectorDialog.env} rows={3}
                  onChange={(e) => setConnectorDialog({ ...connectorDialog, env: e.target.value })}
                  placeholder="API_KEY=xxx" />
              </label>
            </div>
            <div className="connector-dialog-footer">
              <button className="btn btn--ghost" onClick={() => setConnectorDialog(null)}>取消</button>
              <button className="btn btn--primary" onClick={handleCustomConnectorSave}
                disabled={!connectorDialog.name.trim() || !connectorDialog.target.trim()}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Experts Tab ----

function ExpertsTabContent({
  agents, loading, searchQuery, onUseExpert, onCreateFromTemplate, onDelete,
}: {
  agents: AgentEntry[];
  loading: boolean;
  searchQuery: string;
  onUseExpert?: (agent: AgentEntry) => void;
  onCreateFromTemplate: (template: (typeof EXPERT_TEMPLATES)[number]) => void;
  onDelete: (agent: AgentEntry) => void;
}) {
  const filteredTemplates = EXPERT_TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      {filteredAgents.length > 0 && (
        <div className="expert-center-section">
          <h3 className="expert-center-section-title">
            <SparklesIcon size="sm" />
            <span>我的专家（{filteredAgents.length}）</span>
          </h3>
          <div className="expert-card-grid">
            {filteredAgents.map((agent) => (
              <div key={agent.path} className="expert-card">
                <div className="expert-card-top" onClick={() => onUseExpert?.(agent)}>
                  <div className="expert-card-icon-wrap">
                    <SparklesIcon size="lg" />
                  </div>
                  <div className="expert-card-info">
                    <span className="expert-card-name">{agent.name}</span>
                    <span className="expert-card-desc">{agent.description ?? "（无描述）"}</span>
                    <span className="expert-card-scope">{agent.scope === "user" ? "用户级" : "项目级"}</span>
                  </div>
                  <ChevronRightIcon size="sm" className="expert-card-arrow" />
                </div>
                <div className="expert-card-bottom">
                  <button className="expert-card-action" onClick={() => onDelete(agent)} title="删除">
                    <DeleteIcon size="sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="expert-center-section">
        <h3 className="expert-center-section-title">
          <SparklesIcon size="sm" />
          <span>推荐专家模板</span>
        </h3>
        <div className="expert-card-grid">
          {filteredTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <div key={template.id} className="expert-card expert-card--template"
                onClick={() => onCreateFromTemplate(template)}>
                <div className="expert-card-top">
                  <div className="expert-card-icon-wrap expert-card-icon-wrap--template">
                    <Icon size="lg" />
                  </div>
                  <div className="expert-card-info">
                    <span className="expert-card-name">{template.name}</span>
                    <span className="expert-card-desc">{template.description}</span>
                    <span className="expert-card-scope">{template.category}</span>
                  </div>
                  <AddIcon size="sm" className="expert-card-arrow" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && filteredAgents.length === 0 && (
        <div className="expert-center-empty">加载中…</div>
      )}
    </>
  );
}

// ---- Skills Tab ----

function SkillsTabContent({
  skills, loading, searchQuery, onToggle, onRemove,
}: {
  skills: SkillInfo[];
  loading: boolean;
  searchQuery: string;
  onToggle: (skill: SkillInfo, enabled: boolean) => void;
  onRemove: (skill: SkillInfo) => void;
}) {
  const filtered = skills.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()));

  if (!loading && filtered.length === 0) {
    return (
      <div className="expert-center-empty">
        <PuzzlePieceIcon size="xl" className="expert-center-empty-icon" />
        <p>暂无技能</p>
        <p className="expert-center-empty-hint">可在 <code>~/.grok/skills/</code> 创建，或用「刷新」重扫。</p>
      </div>
    );
  }

  return (
    <div className="skill-list">
      {filtered.map((skill) => (
        <div key={skill.name + (skill.path ?? "")} className="skill-item">
          <div className="skill-item-icon">
            <PuzzlePieceIcon size="md" />
          </div>
          <div className="skill-item-info">
            <div className="skill-item-name">
              {skill.displayName ?? skill.name}
              <span className="skill-item-scope">{scopeLabel(skill.scope)}</span>
            </div>
            <div className="skill-item-desc">{skill.description ?? "（无描述）"}</div>
          </div>
          <label className="skill-item-toggle">
            <input type="checkbox" checked={skill.enabled}
              onChange={() => onToggle(skill, !skill.enabled)} />
            <span className="skill-item-toggle-track">
              <span className="skill-item-toggle-thumb" />
            </span>
          </label>
          {skill.path && (
            <button className="skill-item-remove" onClick={() => onRemove(skill)} title="移除">
              <DeleteIcon size="sm" />
            </button>
          )}
        </div>
      ))}
      {loading && <div className="expert-center-empty">加载中…</div>}
    </div>
  );
}

// ---- Connectors Tab ----

function ConnectorsTabContent({
  servers, loading, searchQuery, onToggle, onDelete, onAddTemplate,
}: {
  servers: McpServerEntry[];
  loading: boolean;
  searchQuery: string;
  onToggle: (server: McpServerEntry, enabled: boolean) => void;
  onDelete: (server: McpServerEntry) => void;
  onAddTemplate: (template: (typeof CONNECTOR_TEMPLATES)[number]) => void;
}) {
  const filtered = servers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.target ?? "").toLowerCase().includes(searchQuery.toLowerCase()));
  const availableTemplates = CONNECTOR_TEMPLATES.filter(
    (t) => !servers.some((s) => s.name === t.name));

  return (
    <>
      {filtered.length > 0 && (
        <div className="connector-list">
          {filtered.map((server) => (
            <div key={server.name} className="connector-item">
              <div className="connector-item-icon">
                <PlugIcon size="md" />
              </div>
              <div className="connector-item-info">
                <div className="connector-item-name">
                  {server.name}
                  <span className="connector-item-transport">{transportLabel(server.transport)}</span>
                </div>
                <div className="connector-item-target">
                  {server.target ?? "（无目标）"}
                  {server.disabledReason ? ` · ${server.disabledReason}` : ""}
                </div>
              </div>
              <div className="connector-item-status">
                <span className={`connector-status-dot${server.enabled ? " connector-status-dot--on" : ""}`} />
                <span>{server.enabled ? "已连接" : "未连接"}</span>
              </div>
              <label className="skill-item-toggle">
                <input type="checkbox" checked={server.enabled}
                  onChange={() => onToggle(server, !server.enabled)} />
                <span className="skill-item-toggle-track">
                  <span className="skill-item-toggle-thumb" />
                </span>
              </label>
              <button className="connector-item-delete" onClick={() => onDelete(server)} title="删除">
                <DeleteIcon size="sm" />
              </button>
            </div>
          ))}
        </div>
      )}

      {availableTemplates.length > 0 && (
        <div className="expert-center-section">
          <h3 className="expert-center-section-title">
            <PlugIcon size="sm" /><span>常用连接器</span>
          </h3>
          <div className="connector-template-grid">
            {availableTemplates
              .filter((t) => !searchQuery || t.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((template) => {
                const Icon = template.icon;
                return (
                  <button key={template.id} className="connector-template-card"
                    onClick={() => onAddTemplate(template)}>
                    <div className="connector-template-icon"><Icon size="lg" /></div>
                    <div className="connector-template-info">
                      <span className="connector-template-name">{template.displayName}</span>
                      <span className="connector-template-desc">{template.description}</span>
                    </div>
                    <AddIcon size="sm" className="connector-template-add" />
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && availableTemplates.length === 0 && (
        <div className="expert-center-empty">
          <PlugIcon size="xl" className="expert-center-empty-icon" />
          <p>暂无连接器</p>
          <p className="expert-center-empty-hint">编辑 <code>~/.grok/config.toml</code> 的 <code>[mcp_servers.*]</code> 段后点「刷新」。</p>
        </div>
      )}
      {loading && <div className="expert-center-empty">加载中…</div>}
    </>
  );
}

function scopeLabel(scope: string | undefined): string {
  switch (scope) {
    case "user": return "用户";
    case "local": return "本地";
    case "repo": return "仓库";
    case "server": return "服务器";
    case "bundled": return "内置";
    case "plugin": return "插件";
    default: return scope ?? "";
  }
}

function transportLabel(transport: string | undefined): string {
  switch (transport) {
    case "stdio": return "本地进程";
    case "streamable_http": case "http": return "HTTP";
    case "sse": return "SSE";
    default: return transport ?? "";
  }
}
