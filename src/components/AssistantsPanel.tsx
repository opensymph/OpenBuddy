/**
 * 助理面板 — 1:1 复刻 WorkBuddy colleagues-panel
 *
 * UI 结构对齐 WorkBuddy:
 *  - dashboard 模式: 顶部 section-header + 卡片网格
 *  - colleague-card: 头像(带状态指示灯) + 名称 + 角色标签 + 描述 + 对话按钮
 *  - 右键/三点菜单: 编辑 / 删除
 *  - CreateColleagueDialog: modal 弹窗，含 "从模板创建" / "从专家雇佣" 两个 tab
 *  - 点击卡片 → 助理个人资料页(profile)
 */
import { useCallback, useEffect, useState } from "react";
import {
  AssistantIcon,
  AddCircleIcon,
  SearchIcon,
  SparklesIcon,
  Code2Icon,
  FileTextIcon,
  GlobeIcon,
  BriefcaseIcon,
  ChevronRightIcon,
  DeleteIcon,
  EditToolIcon,
  XCloseIcon,
  ChatBubbleIcon,
  ChevronLeftIcon,
  MoreDotsIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsDelete,
  agentsList,
  agentsSave,
  agentsTemplate,
} from "@/lib/grok-client";
import type { AgentEntry } from "@/lib/types";

const AVATAR_PRESETS: { bg: string; emoji: string }[] = [
  { bg: "#FF6B9D", emoji: "🌸" },
  { bg: "#4FC3F7", emoji: "☀️" },
  { bg: "#81C784", emoji: "🌿" },
  { bg: "#BA68C8", emoji: "⚡" },
  { bg: "#FFB74D", emoji: "🔆" },
  { bg: "#4DB6AC", emoji: "🌊" },
  { bg: "#FF8A80", emoji: "🔴" },
  { bg: "#5C6BC0", emoji: "💎" },
  { bg: "#D4E157", emoji: "🍋" },
  { bg: "#AED581", emoji: "🍀" },
  { bg: "#F06292", emoji: "🌹" },
  { bg: "#7986CB", emoji: "💠" },
  { bg: "#A1887F", emoji: "🪵" },
  { bg: "#90A4AE", emoji: "⚙️" },
  { bg: "#AED581", emoji: "🍃" },
  { bg: "#FFD54F", emoji: "🌟" },
  { bg: "#4DD0E1", emoji: "💧" },
  { bg: "#BA68C8", emoji: "🦄" },
  { bg: "#FF8A65", emoji: "🦊" },
  { bg: "#81D4FA", emoji: "🐬" },
];

const MODEL_TAGS: { key: string; label: string; desc: string }[] = [
  { key: "default", label: "默认", desc: "通用对话模型，平衡速度与质量" },
  { key: "multimodal", label: "多模态", desc: "支持图片/文档等输入" },
  { key: "reasoning", label: "推理", desc: "深度推理，适合复杂任务" },
];

const ASSISTANT_TEMPLATES = [
  {
    id: "code-expert",
    name: "代码专家",
    description: "专注于代码编写、调试和优化",
    icon: Code2Icon,
    color: "#00C29A",
    systemPrompt: "你是一名代码专家，专注于代码编写、调试和优化。请给出简洁、正确、可运行的代码，并解释关键设计决策。",
    defaultAvatar: 3,
    defaultTags: ["default", "reasoning"],
    category: "开发",
  },
  {
    id: "doc-writer",
    name: "文档助手",
    description: "帮助撰写和优化各类文档",
    icon: FileTextIcon,
    color: "#1470B4",
    systemPrompt: "你是一名技术文档工程师，擅长撰写清晰、结构化的文档。请根据用户需求生成易于理解的说明、教程或 API 文档。",
    defaultAvatar: 2,
    defaultTags: ["default"],
    category: "文档",
  },
  {
    id: "web-researcher",
    name: "网络研究员",
    description: "搜索和分析网络信息",
    icon: GlobeIcon,
    color: "#FF7800",
    systemPrompt: "你是一名网络研究员，擅长从多个来源收集、交叉验证信息，并给出带引用的结构化总结。",
    defaultAvatar: 17,
    defaultTags: ["default", "multimodal"],
    category: "研究",
  },
  {
    id: "business-analyst",
    name: "业务分析师",
    description: "数据分析和业务洞察",
    icon: BriefcaseIcon,
    color: "#9B59B6",
    systemPrompt: "你是一名业务分析师，擅长把数据转化为可执行的洞察。请关注关键指标、趋势和风险，给出明确的行动建议。",
    defaultAvatar: 8,
    defaultTags: ["reasoning"],
    category: "分析",
  },
];

type StatusVariant = "working" | "idle" | "abnormal";

interface AssistantsPanelProps {
  onUseAssistant?: (agent: AgentEntry) => void;
  onToast?: (message: string) => void;
  onPlaceholder?: (label: string) => void;
}

export function AssistantsPanel({ onUseAssistant, onToast }: AssistantsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [userAssistants, setUserAssistants] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EditorDraft | null>(null);
  const [profileAgent, setProfileAgent] = useState<AgentEntry | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUserAssistants(await agentsList());
    } catch (e) {
      onToast?.(`加载助理失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { reload(); }, [reload]);

  const openFromTemplate = useCallback((tpl: (typeof ASSISTANT_TEMPLATES)[number]) => {
    setEditing({
      id: "", path: "", name: tpl.name, description: tpl.description,
      systemPrompt: tpl.systemPrompt, avatar: tpl.defaultAvatar,
      modelTags: [...tpl.defaultTags], isNew: true,
    });
  }, []);

  const openFromHireExpert = useCallback((expert: AgentEntry) => {
    setEditing({
      id: "", path: "", name: `${expert.name}（副本）`,
      description: expert.description ?? "",
      systemPrompt: extractBody(expert.raw),
      avatar: expert.avatar ?? Math.floor((hashStr(expert.name) % 20) + 1),
      modelTags: expert.modelTags ? [...expert.modelTags] : ["default"],
      isNew: true,
    });
  }, []);

  const openEdit = useCallback((a: AgentEntry) => {
    setEditing({
      id: a.name, path: a.path, name: a.name,
      description: a.description ?? "",
      systemPrompt: extractBody(a.raw),
      avatar: a.avatar, modelTags: a.modelTags ? [...a.modelTags] : [],
      isNew: false,
    });
  }, []);

  const handleSave = useCallback(async (draft: EditorDraft) => {
    if (!draft.name.trim()) { onToast?.("名称不能为空"); return; }
    try {
      const raw = await agentsTemplate(draft.name, draft.description, draft.systemPrompt, draft.avatar, draft.modelTags.length > 0 ? draft.modelTags : undefined);
      const saved = await agentsSave(draft.name, raw);
      onToast?.(draft.isNew ? `已创建助理「${saved.name}」` : "已保存");
      setEditing(null);
      reload();
    } catch (e) {
      onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [onToast, reload]);

  const handleDelete = useCallback(async (agent: AgentEntry) => {
    if (!confirm(`确定删除助理「${agent.name}」？`)) return;
    try {
      await agentsDelete(agent.path);
      onToast?.("已删除");
      reload();
    } catch (e) {
      onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [onToast, reload]);

  const filteredTemplates = ASSISTANT_TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAssistants = userAssistants.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()));

  const getStatusVariant = useCallback((_agent: AgentEntry): StatusVariant => "idle", []);

  if (profileAgent) {
    return (
      <ColleagueProfile
        agent={profileAgent}
        onBack={() => setProfileAgent(null)}
        onChat={() => { onUseAssistant?.(profileAgent); setProfileAgent(null); }}
        onEdit={() => { openEdit(profileAgent); setProfileAgent(null); }}
        onDelete={() => { handleDelete(profileAgent); setProfileAgent(null); }}
      />
    );
  }

  return (
    <div className="colleagues-panel-shell">
      <div className="colleagues-panel colleagues-panel--dashboard">
        {/* Section Header */}
        <div className="colleagues-panel-section">
          <div className="colleagues-panel-section-header colleagues-panel-section-header--dashboard">
            <h2 className="colleagues-panel-section-title">助理</h2>
            <div className="colleagues-panel-section-actions">
              <div className="colleagues-panel-search-wrap">
                <SearchIcon size="sm" className="colleagues-panel-search-icon" />
                <input
                  type="text"
                  className="colleagues-panel-search-input"
                  placeholder="搜索助理..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                className="colleagues-panel-create-btn"
                onClick={() => setEditing({
                  id: "", path: "", name: "", description: "",
                  systemPrompt: "", avatar: 1, modelTags: ["default"], isNew: true,
                })}
              >
                <AddCircleIcon size="sm" />
                <span>创建助理</span>
              </button>
            </div>
          </div>

          {/* My Assistants Cards */}
          {loading && filteredAssistants.length === 0 && (
            <div className="colleagues-panel-state">加载中…</div>
          )}
          {!loading && filteredAssistants.length === 0 && userAssistants.length === 0 && (
            <div className="colleagues-panel-state colleagues-panel-state--empty">
              <AssistantIcon size="xl" className="colleagues-panel-empty-icon" />
              <p>还没有助理，从下方模板创建一个吧</p>
            </div>
          )}

          {filteredAssistants.length > 0 && (
            <div className="colleague-card-grid">
              {filteredAssistants.map((agent) => {
                const statusVariant = getStatusVariant(agent);
                const isOpen = menuOpen === agent.path;
                return (
                  <div key={agent.path} className="colleague-card-wrapper">
                    <div
                      className={`colleague-card${isOpen ? " is-menu-open" : ""}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest(".colleague-card-more, .colleague-card-menu")) return;
                        setProfileAgent(agent);
                      }}
                    >
                      {/* More Menu Trigger */}
                      <button
                        className="colleague-card-more"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(isOpen ? null : agent.path); }}
                      >
                        <MoreDotsIcon size="sm" />
                      </button>
                      {isOpen && (
                        <div className="colleague-card-menu" onClick={(e) => e.stopPropagation()}>
                          <button className="colleague-card-menu-item" onClick={() => { openEdit(agent); setMenuOpen(null); }}>
                            <EditToolIcon size="sm" /><span>编辑</span>
                          </button>
                          <div className="colleague-card-menu-separator" />
                          <button className="colleague-card-menu-item colleague-card-menu-item--danger" onClick={() => { handleDelete(agent); setMenuOpen(null); }}>
                            <DeleteIcon size="sm" /><span>删除</span>
                          </button>
                        </div>
                      )}

                      {/* Identity */}
                      <div className="colleague-card-identity">
                        <ColleagueAvatar index={agent.avatar} name={agent.name} size={48} status={statusVariant} />
                        <div className="colleague-card-identity-text">
                          <div className="colleague-card-name-row">
                            <span className="colleague-card-name">{agent.name}</span>
                            <span className={`colleague-card-status-pill colleague-card-status-pill--${statusVariant}`}>
                              {statusVariant === "working" ? "工作中" : statusVariant === "idle" ? "空闲" : "异常"}
                            </span>
                          </div>
                          <div className="colleague-card-role">
                            {agent.modelTags?.map((t) => MODEL_TAGS.find(m => m.key === t)?.label ?? t).join(" · ") || "通用助理"}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="colleague-card-description">
                        {agent.description ?? "（无描述）"}
                      </div>

                      {/* Chat Button */}
                      <button
                        className="colleague-card-chat-button"
                        onClick={(e) => { e.stopPropagation(); onUseAssistant?.(agent); }}
                      >
                        <ChatBubbleIcon size="sm" />
                        <span>对话</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recommended Templates */}
        <div className="colleagues-panel-section">
          <div className="colleagues-panel-section-header">
            <h3 className="colleagues-panel-section-subtitle">
              <SparklesIcon size="sm" />
              <span>推荐模板</span>
            </h3>
          </div>
          <div className="colleague-card-grid">
            {filteredTemplates.map((tpl) => {
              return (
                <div key={tpl.id} className="colleague-card-wrapper">
                  <div className="colleague-card colleague-card--template" onClick={() => openFromTemplate(tpl)}>
                    <div className="colleague-card-identity">
                      <ColleagueAvatar index={tpl.defaultAvatar} name={tpl.name} size={48} overrideColor={tpl.color} />
                      <div className="colleague-card-identity-text">
                        <div className="colleague-card-name-row">
                          <span className="colleague-card-name">{tpl.name}</span>
                        </div>
                        <div className="colleague-card-role">{tpl.category}</div>
                      </div>
                    </div>
                    <div className="colleague-card-description">{tpl.description}</div>
                    <div className="colleague-card-template-tags">
                      {tpl.defaultTags.map(t => (
                        <span key={t} className={`colleague-tag colleague-tag--${t}`}>
                          {MODEL_TAGS.find(m => m.key === t)?.label ?? t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hire from Expert */}
        {userAssistants.length > 0 && (
          <div className="colleagues-panel-section">
            <div className="colleagues-panel-section-header">
              <h3 className="colleagues-panel-section-subtitle">
                <AssistantIcon size="sm" />
                <span>从已有专家创建</span>
              </h3>
            </div>
            <p className="colleagues-panel-hire-hint">
              选一个现有专家作为模板，可改名/换头像后另存为新助理。
            </p>
            <div className="colleagues-panel-hire-list">
              {userAssistants.slice(0, 8).map((expert) => (
                <button
                  key={expert.path}
                  className="colleagues-panel-hire-item"
                  onClick={() => openFromHireExpert(expert)}
                  title={`基于「${expert.name}」创建新助理`}
                >
                  <ColleagueAvatar index={expert.avatar} name={expert.name} size={32} />
                  <span>{expert.name}</span>
                  <ChevronRightIcon size="sm" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <CreateColleagueDialog
          draft={editing}
          existingAgents={userAssistants}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          onHireExpert={openFromHireExpert}
        />
      )}
    </div>
  );
}

// ============================================================
// Colleague Profile Page (点击卡片后的详情页)
// ============================================================

function ColleagueProfile({
  agent, onBack, onChat, onEdit, onDelete,
}: {
  agent: AgentEntry;
  onBack: () => void;
  onChat: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="colleague-profile">
      <div className="colleague-profile-header">
        <button className="colleague-profile-back" onClick={onBack}>
          <ChevronLeftIcon size="md" />
          <span>返回</span>
        </button>
      </div>
      <div className="colleague-profile-hero">
        <ColleagueAvatar index={agent.avatar} name={agent.name} size={72} />
        <div className="colleague-profile-info">
          <h2 className="colleague-profile-name">{agent.name}</h2>
          <p className="colleague-profile-role">
            {agent.modelTags?.map((t) => MODEL_TAGS.find(m => m.key === t)?.label ?? t).join(" · ") || "通用助理"}
          </p>
          <p className="colleague-profile-desc">{agent.description ?? "（无描述）"}</p>
          <div className="colleague-profile-meta">
            <span className="colleague-profile-scope">
              {agent.scope === "user" ? "用户级" : "项目级"}
            </span>
          </div>
        </div>
      </div>
      <div className="colleague-profile-prompt-section">
        <h3>System Prompt</h3>
        <pre className="colleague-profile-prompt">{extractBody(agent.raw) || "（无 system prompt）"}</pre>
      </div>
      <div className="colleague-profile-actions">
        <button className="btn btn--primary colleague-profile-btn" onClick={onChat}>
          <ChatBubbleIcon size="sm" />
          <span>开始对话</span>
        </button>
        <button className="btn btn--ghost colleague-profile-btn" onClick={onEdit}>
          <EditToolIcon size="sm" />
          <span>编辑</span>
        </button>
        <button className="btn btn--ghost colleague-profile-btn colleague-profile-btn--danger" onClick={onDelete}>
          <DeleteIcon size="sm" />
          <span>删除</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Create Colleague Dialog (对齐 WB CreateColleagueDialog)
// ============================================================

interface EditorDraft {
  id: string;
  path: string;
  name: string;
  description: string;
  systemPrompt: string;
  avatar?: number;
  modelTags: string[];
  isNew: boolean;
}

function CreateColleagueDialog({
  draft, existingAgents, onCancel, onSave, onHireExpert,
}: {
  draft: EditorDraft;
  existingAgents: AgentEntry[];
  onCancel: () => void;
  onSave: (draft: EditorDraft) => void;
  onHireExpert: (agent: AgentEntry) => void;
}) {
  const [d, setD] = useState<EditorDraft>(draft);
  const [tab, setTab] = useState<"create" | "hire">(draft.isNew && !draft.name ? "create" : "create");
  const set = <K extends keyof EditorDraft>(k: K, v: EditorDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const toggleTag = (key: string) => {
    setD((prev) => ({
      ...prev,
      modelTags: prev.modelTags.includes(key)
        ? prev.modelTags.filter((t) => t !== key)
        : [...prev.modelTags, key],
    }));
  };

  return (
    <div className="modal-overlay create-colleague-overlay" onClick={onCancel}>
      <div className="create-colleague-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="create-colleague-header">
          <h3>{d.isNew ? "创建助理" : `编辑 ${d.name}`}</h3>
          <button className="create-colleague-close" onClick={onCancel}>
            <XCloseIcon size="md" />
          </button>
        </div>

        {/* Tab bar (only for new) */}
        {d.isNew && existingAgents.length > 0 && (
          <div className="create-colleague-tabs">
            <button
              className={`create-colleague-tab${tab === "create" ? " create-colleague-tab--active" : ""}`}
              onClick={() => setTab("create")}
            >
              自定义创建
            </button>
            <button
              className={`create-colleague-tab${tab === "hire" ? " create-colleague-tab--active" : ""}`}
              onClick={() => setTab("hire")}
            >
              从专家雇佣
            </button>
          </div>
        )}

        {tab === "hire" ? (
          <div className="create-colleague-hire-body">
            <p className="create-colleague-hire-desc">选择一个已有专家作为模板</p>
            <div className="create-colleague-hire-grid">
              {existingAgents.map((agent) => (
                <button
                  key={agent.path}
                  className="create-colleague-hire-card"
                  onClick={() => { onHireExpert(agent); }}
                >
                  <ColleagueAvatar index={agent.avatar} name={agent.name} size={40} />
                  <div className="create-colleague-hire-card-info">
                    <span className="create-colleague-hire-card-name">{agent.name}</span>
                    <span className="create-colleague-hire-card-desc">{agent.description ?? "（无描述）"}</span>
                  </div>
                  <ChevronRightIcon size="sm" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="create-colleague-body">
            {/* Avatar picker */}
            <div className="create-colleague-field">
              <label className="create-colleague-label">头像</label>
              <div className="create-colleague-avatar-picker">
                <ColleagueAvatar index={d.avatar} name={d.name || "?"} size={56} />
                <div className="create-colleague-avatar-grid">
                  {AVATAR_PRESETS.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`create-colleague-avatar-item${d.avatar === i + 1 ? " create-colleague-avatar-item--selected" : ""}`}
                      style={{ background: preset.bg }}
                      onClick={() => set("avatar", i + 1)}
                    >
                      {(d.name || "?").charAt(0).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="create-colleague-field">
              <label className="create-colleague-label">名称 *</label>
              <input
                type="text"
                className="create-colleague-input"
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="例如：代码审查专家"
              />
            </div>

            {/* Description */}
            <div className="create-colleague-field">
              <label className="create-colleague-label">描述</label>
              <input
                type="text"
                className="create-colleague-input"
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="一句话描述助理的职责"
              />
            </div>

            {/* Model tags */}
            <div className="create-colleague-field">
              <label className="create-colleague-label">模型能力标签</label>
              <div className="create-colleague-tags">
                {MODEL_TAGS.map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    className={`create-colleague-tag${d.modelTags.includes(tag.key) ? " create-colleague-tag--on" : ""}`}
                    onClick={() => toggleTag(tag.key)}
                    title={tag.desc}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div className="create-colleague-field">
              <label className="create-colleague-label">System Prompt</label>
              <textarea
                className="create-colleague-textarea"
                value={d.systemPrompt}
                onChange={(e) => set("systemPrompt", e.target.value)}
                rows={6}
                placeholder="定义助理的角色、语气、行为约束…"
              />
            </div>
          </div>
        )}

        <div className="create-colleague-footer">
          <button className="btn btn--ghost" onClick={onCancel}>取消</button>
          {tab === "create" && (
            <button
              className="btn btn--primary"
              onClick={() => onSave(d)}
              disabled={!d.name.trim() || !d.systemPrompt.trim()}
            >
              {d.isNew ? "创建" : "保存"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ColleagueAvatar (with status indicator)
// ============================================================

function ColleagueAvatar({
  index, name, size = 40, overrideColor, status,
}: {
  index?: number;
  name: string;
  size?: number;
  overrideColor?: string;
  status?: StatusVariant;
}) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const presetIndex = (index ?? 0) - 1;
  const preset = presetIndex >= 0 && presetIndex < AVATAR_PRESETS.length ? AVATAR_PRESETS[presetIndex] : null;
  const bg = overrideColor ?? preset?.bg ?? "#888";
  return (
    <div className="colleague-avatar" style={{ width: size, height: size }}>
      <div
        className="colleague-avatar-face"
        style={{ background: bg, fontSize: size * 0.42, width: size, height: size }}
        title={name}
      >
        {initial}
      </div>
      {status && (
        <span className={`colleague-avatar-dot colleague-avatar-dot--${status}`} />
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function extractBody(raw: string): string {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) return raw;
  const afterOpen = trimmed.indexOf("\n");
  if (afterOpen === -1) return raw;
  const end = trimmed.indexOf("\n---", afterOpen);
  if (end === -1) return raw;
  return trimmed.slice(end + 4).trim();
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
