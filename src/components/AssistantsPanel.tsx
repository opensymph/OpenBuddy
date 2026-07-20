/**
 * 助理系统面板 - 对接 grok agents 真实数据（增强版）
 *
 * 增强（对齐 WorkBuddy CreateColleagueDialog）：
 *  - 20 个头像预设（颜色背景 + 首字母），存到 agent.md frontmatter 的 avatar 字段
 *  - 模型能力标签（默认/多模态/推理），存到 model_tags 字段
 *  - 创建/编辑助理的完整 modal（名称/描述/system prompt + 头像 + 标签）
 *  - hire-expert tab：从已有专家（agents）选一个作为模板新建助理
 *
 * 助理 = grok 的 agent 定义（~/.grok/agents/*.md）。
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
} from "@/foundation/components/Icon/icons";
import {
  agentsDelete,
  agentsList,
  agentsSave,
  agentsTemplate,
} from "@/lib/grok-client";
import type { AgentEntry } from "@/lib/types";

// 20 个头像预设（颜色 + emoji 占位）。对应 WorkBuddy 的 avatar.preset01..20。
// 颜色取自 WorkBuddy 调色板（樱粉/晴蓝/草绿/电紫/阳橙/湖青/珊红/靛蓝/柠黄/青柠）。
const AVATAR_PRESETS: { bg: string; emoji: string }[] = [
  { bg: "#FF6B9D", emoji: "🌸" }, // 樱粉
  { bg: "#4FC3F7", emoji: "☀️" }, // 晴蓝
  { bg: "#81C784", emoji: "🌿" }, // 草绿
  { bg: "#BA68C8", emoji: "⚡" }, // 电紫
  { bg: "#FFB74D", emoji: "🔆" }, // 阳橙
  { bg: "#4DB6AC", emoji: "湖泊" }, // 湖青
  { bg: "#FF8A80", emoji: "珊红" },
  { bg: "#5C6BC0", emoji: "靛蓝" },
  { bg: "#D4E157", emoji: "柠黄" },
  { bg: "#AED581", emoji: "青柠" },
  { bg: "#F06292", emoji: "🌹" },
  { bg: "#7986CB", emoji: "💠" },
  { bg: "#A1887F", emoji: "🪵" },
  { bg: "#90A4AE", emoji: "⚙️" },
  { bg: "#AED581", emoji: "🍀" },
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

// 内置推荐助理模板（点击=用此模板 + 默认头像打开编辑器）
const ASSISTANT_TEMPLATES = [
  {
    id: "code-expert",
    name: "代码专家",
    description: "专注于代码编写、调试和优化",
    icon: Code2Icon,
    color: "#00C29A",
    systemPrompt:
      "你是一名代码专家，专注于代码编写、调试和优化。请给出简洁、正确、可运行的代码，并解释关键设计决策。",
    defaultAvatar: 3,
    defaultTags: ["default", "reasoning"],
  },
  {
    id: "doc-writer",
    name: "文档助手",
    description: "帮助撰写和优化各类文档",
    icon: FileTextIcon,
    color: "#1470B4",
    systemPrompt:
      "你是一名技术文档工程师，擅长撰写清晰、结构化的文档。请根据用户需求生成易于理解的说明、教程或 API 文档。",
    defaultAvatar: 2,
    defaultTags: ["default"],
  },
  {
    id: "web-researcher",
    name: "网络研究员",
    description: "搜索和分析网络信息",
    icon: GlobeIcon,
    color: "#FF7800",
    systemPrompt:
      "你是一名网络研究员，擅长从多个来源收集、交叉验证信息，并给出带引用的结构化总结。",
    defaultAvatar: 17,
    defaultTags: ["default", "multimodal"],
  },
  {
    id: "business-analyst",
    name: "业务分析师",
    description: "数据分析和业务洞察",
    icon: BriefcaseIcon,
    color: "#9B59B6",
    systemPrompt:
      "你是一名业务分析师，擅长把数据转化为可执行的洞察。请关注关键指标、趋势和风险，给出明确的行动建议。",
    defaultAvatar: 8,
    defaultTags: ["reasoning"],
  },
];

interface AssistantsPanelProps {
  /** Start a new chat guided by this assistant's prompt. */
  onUseAssistant?: (agent: AgentEntry) => void;
  onToast?: (message: string) => void;
  onPlaceholder?: (label: string) => void;
}

export function AssistantsPanel({ onUseAssistant, onToast }: AssistantsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [userAssistants, setUserAssistants] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Editor modal state. `null` = closed; otherwise the draft being edited.
  const [editing, setEditing] = useState<EditorDraft | null>(null);

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

  useEffect(() => {
    reload();
  }, [reload]);

  const openFromTemplate = useCallback((tpl: (typeof ASSISTANT_TEMPLATES)[number]) => {
    setEditing({
      id: "",
      path: "",
      name: tpl.name,
      description: tpl.description,
      systemPrompt: tpl.systemPrompt,
      avatar: tpl.defaultAvatar,
      modelTags: [...tpl.defaultTags],
      isNew: true,
    });
  }, []);

  const openFromHireExpert = useCallback((expert: AgentEntry) => {
    // "Hire expert": clone an existing agent into a new editable draft so the
    // user can customize (rename, change avatar/tags) before saving as a new
    // assistant. WorkBuddy's CreateColleagueDialog has a dedicated tab for
    // this; we mirror it with a simpler "pick → edit" flow.
    setEditing({
      id: "",
      path: "",
      name: `${expert.name}（副本）`,
      description: expert.description ?? "",
      systemPrompt: extractBody(expert.raw),
      avatar: expert.avatar ?? Math.floor((hashStr(expert.name) % 20) + 1),
      modelTags: expert.modelTags ? [...expert.modelTags] : ["default"],
      isNew: true,
    });
  }, []);

  const openEdit = useCallback((a: AgentEntry) => {
    setEditing({
      id: a.name,
      path: a.path,
      name: a.name,
      description: a.description ?? "",
      systemPrompt: extractBody(a.raw),
      avatar: a.avatar,
      modelTags: a.modelTags ? [...a.modelTags] : [],
      isNew: false,
    });
  }, []);

  const handleSave = useCallback(
    async (draft: EditorDraft) => {
      if (!draft.name.trim()) {
        onToast?.("名称不能为空");
        return;
      }
      try {
        const raw = await agentsTemplate(
          draft.name,
          draft.description,
          draft.systemPrompt,
          draft.avatar,
          draft.modelTags.length > 0 ? draft.modelTags : undefined,
        );
        // For edits, we save to the same file path; for new, agentsSave uses
        // the safe-name to derive the path. When renaming on edit, the old
        // file is left behind — user can delete it from disk. (Mirroring how
        // WorkBuddy treats rename as "create new".)
        const saved = await agentsSave(draft.name, raw);
        onToast?.(draft.isNew ? `已创建助理「${saved.name}」` : "已保存");
        setEditing(null);
        reload();
      } catch (e) {
        onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reload],
  );

  const handleDelete = useCallback(
    async (agent: AgentEntry) => {
      if (!confirm(`确定删除助理「${agent.name}」？`)) return;
      try {
        await agentsDelete(agent.path);
        onToast?.("已删除");
        reload();
      } catch (e) {
        onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reload],
  );

  const filteredTemplates = ASSISTANT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredAssistants = userAssistants.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="assistants-panel">
      <div className="assistants-panel__header">
        <h2 className="assistants-panel__title">助理</h2>
      </div>

      <div className="assistants-panel__search">
        <SearchIcon size="md" className="assistants-panel__search-icon" />
        <input
          type="text"
          className="assistants-panel__search-input"
          placeholder="搜索助理..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 我的助理（真实数据） */}
      {filteredAssistants.length > 0 && (
        <div className="assistants-panel__section">
          <h3 className="assistants-panel__section-title">
            <AssistantIcon size="sm" />
            <span>我的助理（{filteredAssistants.length}）</span>
          </h3>
          <div className="assistants-panel__list">
            {filteredAssistants.map((assistant) => (
              <div
                key={assistant.path}
                className="assistants-panel__item assistants-panel__item--row"
              >
                <button
                  className="assistants-panel__item-main"
                  onClick={() => onUseAssistant?.(assistant)}
                >
                  <Avatar index={assistant.avatar} name={assistant.name} size={40} />
                  <div className="assistants-panel__item-content">
                    <span className="assistants-panel__item-name">
                      {assistant.name}
                      {assistant.modelTags && assistant.modelTags.length > 0 && (
                        <ModelTagBadges tags={assistant.modelTags} />
                      )}
                    </span>
                    <span className="assistants-panel__item-desc">
                      {assistant.description ?? "（无描述）"}
                    </span>
                  </div>
                  <ChevronRightIcon size="sm" />
                </button>
                <div className="assistants-panel__item-actions">
                  <button
                    className="assistants-panel__item-del"
                    onClick={() => openEdit(assistant)}
                    title="编辑"
                  >
                    <EditToolIcon size="sm" />
                  </button>
                  <button
                    className="assistants-panel__item-del"
                    onClick={() => handleDelete(assistant)}
                    title="删除"
                  >
                    <DeleteIcon size="sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 推荐助理模板 */}
      <div className="assistants-panel__section">
        <h3 className="assistants-panel__section-title">
          <SparklesIcon size="sm" />
          <span>推荐助理</span>
        </h3>
        <div className="assistants-panel__grid">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              className="assistants-panel__card"
              onClick={() => openFromTemplate(template)}
            >
              <Avatar
                index={template.defaultAvatar}
                name={template.name}
                size={44}
                overrideColor={template.color}
              />
              <div className="assistants-panel__card-content">
                <span className="assistants-panel__card-name">{template.name}</span>
                <span className="assistants-panel__card-desc">{template.description}</span>
                <ModelTagBadges tags={template.defaultTags} />
              </div>
              <AddCircleIcon size="sm" className="assistants-panel__card-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Hire-expert section（从已有专家克隆） */}
      {userAssistants.length > 0 && (
        <div className="assistants-panel__section">
          <h3 className="assistants-panel__section-title">
            <AssistantIcon size="sm" />
            <span>从已有专家创建（hire expert）</span>
          </h3>
          <p className="assistants-panel__hire-hint">
            选一个现有专家作为模板，可改名/换头像后另存为新助理。
          </p>
          <div className="assistants-panel__hire-list">
            {userAssistants.slice(0, 6).map((expert) => (
              <button
                key={expert.path}
                className="assistants-panel__hire-item"
                onClick={() => openFromHireExpert(expert)}
                title={`基于「${expert.name}」创建新助理`}
              >
                <Avatar index={expert.avatar} name={expert.name} size={32} />
                <span>{expert.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {loading && userAssistants.length === 0 && (
        <div className="assistants-panel__empty">加载中…</div>
      )}
      {!loading && userAssistants.length === 0 && (
        <div className="assistants-panel__empty">
          <AssistantIcon size="xl" className="assistants-panel__empty-icon" />
          <p className="assistants-panel__empty-text">
            选择上方模板创建助理，或把配置写到 <code>~/.grok/agents/</code>
          </p>
        </div>
      )}

      {editing && (
        <AssistantEditorModal
          draft={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ---------- Editor draft type ----------

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

// ---------- Editor modal ----------

function AssistantEditorModal({
  draft,
  onCancel,
  onSave,
}: {
  draft: EditorDraft;
  onCancel: () => void;
  onSave: (draft: EditorDraft) => void;
}) {
  const [d, setD] = useState<EditorDraft>(draft);
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
    <div className="modal-overlay assistant-editor__overlay" onClick={onCancel}>
      <div
        className="assistant-editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="assistant-editor__header">
          <h3>{d.isNew ? "创建助理" : `编辑 ${d.name}`}</h3>
          <button className="assistant-editor__close" onClick={onCancel}>
            <XCloseIcon size="md" />
          </button>
        </div>

        <div className="assistant-editor__body">
          {/* 头像选择器 */}
          <div className="assistant-editor__field">
            <label className="assistant-editor__label">头像</label>
            <div className="avatar-picker">
              <Avatar index={d.avatar} name={d.name || "?"} size={56} />
              <div className="avatar-picker__grid">
                {AVATAR_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`avatar-picker__item ${
                      d.avatar === i + 1 ? "avatar-picker__item--selected" : ""
                    }`}
                    style={{ background: preset.bg }}
                    onClick={() => set("avatar", i + 1)}
                    title={`预设 ${i + 1}`}
                  >
                    {(d.name || "?").charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 名称 */}
          <div className="assistant-editor__field">
            <label className="assistant-editor__label">名称 *</label>
            <input
              type="text"
              className="assistant-editor__input"
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例如：代码审查专家"
            />
          </div>

          {/* 描述 */}
          <div className="assistant-editor__field">
            <label className="assistant-editor__label">描述</label>
            <input
              type="text"
              className="assistant-editor__input"
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="一句话描述助理的职责"
            />
          </div>

          {/* 模型能力标签 */}
          <div className="assistant-editor__field">
            <label className="assistant-editor__label">模型能力标签</label>
            <div className="model-tags">
              {MODEL_TAGS.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  className={`model-tags__chip ${
                    d.modelTags.includes(tag.key) ? "model-tags__chip--on" : ""
                  }`}
                  onClick={() => toggleTag(tag.key)}
                  title={tag.desc}
                >
                  {tag.label}
                </button>
              ))}
            </div>
            <p className="assistant-editor__hint">
              标签存到 frontmatter 的 <code>model_tags</code>，仅作展示用。
            </p>
          </div>

          {/* System prompt */}
          <div className="assistant-editor__field">
            <label className="assistant-editor__label">System Prompt</label>
            <textarea
              className="assistant-editor__textarea"
              value={d.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              rows={6}
              placeholder="定义助理的角色、语气、行为约束…"
            />
          </div>
        </div>

        <div className="assistant-editor__footer">
          <button className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={() => onSave(d)}
            disabled={!d.name.trim() || !d.systemPrompt.trim()}
          >
            {d.isNew ? "创建" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Avatar component ----------

function Avatar({
  index,
  name,
  size = 40,
  overrideColor,
}: {
  index?: number;
  name: string;
  size?: number;
  overrideColor?: string;
}) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const presetIndex = (index ?? 0) - 1;
  const preset = presetIndex >= 0 && presetIndex < AVATAR_PRESETS.length
    ? AVATAR_PRESETS[presetIndex]
    : null;
  const bg = overrideColor ?? preset?.bg ?? "#888";
  return (
    <div
      className="assistant-avatar"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.42,
      }}
      title={name}
    >
      {initial}
    </div>
  );
}

// ---------- Model tag badges ----------

function ModelTagBadges({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="model-tag-badges">
      {tags.map((t) => {
        const meta = MODEL_TAGS.find((m) => m.key === t);
        return (
          <span key={t} className={`model-tag-badges__chip model-tag-badges__chip--${t}`}>
            {meta?.label ?? t}
          </span>
        );
      })}
    </span>
  );
}

// ---------- Helpers ----------

/** Extract the body (system prompt) from a full .md file (skip frontmatter). */
function extractBody(raw: string): string {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) return raw;
  const afterOpen = trimmed.indexOf("\n");
  if (afterOpen === -1) return raw;
  const end = trimmed.indexOf("\n---", afterOpen);
  if (end === -1) return raw;
  return trimmed.slice(end + 4).trim();
}

/** Stable string hash → u32 (used to pick a deterministic avatar preset). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
