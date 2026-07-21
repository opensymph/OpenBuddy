import { useEffect, useMemo, useState } from "react";
import {
  User,
  Mail,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Keyboard,
  Brain,
  Cpu,
  Bot,
  Palette,
  Database,
  Shield,
  HelpCircle,
  Plus,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  providersList,
  providersSave,
  providersDelete,
  internalReload,
  type ApiBackend,
  type AuthScheme,
  type ProviderConfig,
  type ProviderKind,
} from "@/lib/grok-client";
import {
  AccountSettingsPanel,
  AgentMailSettingsPanel,
  AgentSettingsPanel,
  AssistantSettingsPanel,
  DataSettingsPanel,
  GeneralSettingsPanel,
  HelpSettingsPanel,
  MemorySettingsPanel,
  PersonalizeSettingsPanel,
  SecuritySettingsPanel,
  ShortcutsSettingsPanel,
} from "./SettingsSections";

/**
 * WorkBuddy-style Settings dialog.
 *
 * Full-screen overlay → centered `.settings-modal` (1040×720) with a fixed
 * 12-item left navigation (mirrors WorkBuddy) and a right panel that swaps
 * per section. Only "模型" has a real implementation; the other 11 render a
 * "即将上线" placeholder so the visual matches WorkBuddy today and can be
 * filled in later.
 *
 * The 模型 section lists configured providers from ~/.grok/config.toml and
 * opens a nested "添加模型" editor dialog (560×318) when adding/editing.
 * That editor writes back through providers_save → grok's [model.*] tables.
 */

type SectionId =
  | "account"
  | "agent-mail"
  | "general"
  | "agent-settings"
  | "shortcuts"
  | "memory"
  | "model"
  | "assistant"
  | "personalize"
  | "data"
  | "security"
  | "help";

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { id: "account", label: "账户管理", icon: User },
  { id: "agent-mail", label: "智能体邮箱", icon: Mail },
  { id: "general", label: "系统设置", icon: SettingsIcon },
  { id: "agent-settings", label: "智能体设置", icon: SlidersHorizontal },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "memory", label: "记忆", icon: Brain },
  { id: "model", label: "模型", icon: Cpu },
  { id: "assistant", label: "助理设置", icon: Bot },
  { id: "personalize", label: "个性化", icon: Palette },
  { id: "data", label: "数据管理", icon: Database },
  { id: "security", label: "安全中心", icon: Shield },
  { id: "help", label: "帮助与反馈", icon: HelpCircle },
];

// Provider presets: choosing one pre-fills baseUrl/apiBackend/authScheme and
// suggested model ids. The "custom" preset is intentionally empty.
interface Preset {
  label: string;
  baseUrl?: string;
  apiBackend?: ApiBackend;
  authScheme?: AuthScheme;
  models: string[];
  placeholderKey: string;
  helpUrl: string;
}

const PRESETS: Record<ProviderKind, Preset> = {
  anthropic: {
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    apiBackend: "messages",
    authScheme: "x_api_key",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    placeholderKey: "sk-ant-...",
    helpUrl: "console.anthropic.com",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiBackend: "chat_completions",
    authScheme: "bearer",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    placeholderKey: "sk-...",
    helpUrl: "platform.openai.com",
  },
  grok: {
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    apiBackend: "chat_completions",
    authScheme: "bearer",
    models: ["grok-4", "grok-4-fast", "grok-3"],
    placeholderKey: "xai-...",
    helpUrl: "console.x.ai",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    apiBackend: "chat_completions",
    authScheme: "bearer",
    models: ["deepseek-chat", "deepseek-reasoner"],
    placeholderKey: "sk-...",
    helpUrl: "platform.deepseek.com",
  },
  qwen: {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiBackend: "chat_completions",
    authScheme: "bearer",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    placeholderKey: "sk-...",
    helpUrl: "dashscope.console.aliyun.com",
  },
  custom: {
    label: "自定义 (OpenAI 兼容)",
    models: [],
    placeholderKey: "your-api-key",
    helpUrl: "（请填写您的提供商文档地址）",
  },
};

export function SettingsPanel({
  open,
  onClose,
  onModelsChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a provider is saved/deleted so the app can refresh its
   *  model picker without a restart. */
  onModelsChanged?: () => void;
}) {
  const [active, setActive] = useState<SectionId>("model");

  // Default to the 模型 section every time the dialog opens.
  useEffect(() => {
    if (open) setActive("model");
  }, [open]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="settings-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onClick={(e) => {
        // 仅当点击遮罩本身(而非弹窗内容)时关闭,与 WorkBuddy 一致。
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-modal">
        <nav className="settings-modal__nav">
          <ul className="settings-navigation">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    className={
                      "settings-navigation__item" +
                      (active === item.id ? " settings-navigation__item--active" : "")
                    }
                    onClick={() => setActive(item.id)}
                  >
                    <span className="settings-navigation__icon">
                      <Icon size={16} strokeWidth={1.75} />
                    </span>
                    <span className="settings-navigation__label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="settings-modal__content">
          <button
            className="settings-modal__close"
            onClick={onClose}
            aria-label="关闭设置"
            title="关闭 (Esc)"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
          <div className="settings-modal__panel">
            {active === "model" ? (
              <ModelsSettingsPanel onModelsChanged={onModelsChanged} />
            ) : active === "personalize" ? (
              <PersonalizeSettingsPanel />
            ) : active === "shortcuts" ? (
              <ShortcutsSettingsPanel />
            ) : active === "memory" ? (
              <MemorySettingsPanel />
            ) : active === "help" ? (
              <HelpSettingsPanel />
            ) : active === "security" ? (
              <SecuritySettingsPanel />
            ) : active === "data" ? (
              <DataSettingsPanel />
            ) : active === "general" ? (
              <GeneralSettingsPanel />
            ) : active === "account" ? (
              <AccountSettingsPanel />
            ) : active === "agent-settings" ? (
              <AgentSettingsPanel />
            ) : active === "assistant" ? (
              <AssistantSettingsPanel />
            ) : active === "agent-mail" ? (
              <AgentMailSettingsPanel />
            ) : (
              <PlaceholderSection label={NAV.find((n) => n.id === active)?.label ?? ""} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder for the 11 not-yet-implemented sections.
// ---------------------------------------------------------------------------

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div className="settings-placeholder">
      <h2 className="settings-placeholder__title">{label}</h2>
      <p className="settings-placeholder__desc">该分区即将上线，敬请期待。</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 模型 section: list configured providers + open the add/edit editor.
// ---------------------------------------------------------------------------

function ModelsSettingsPanel({ onModelsChanged }: { onModelsChanged?: () => void }) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ original?: ProviderConfig; draft: EditorDraft } | null>(
    null
  );

  const reload = async () => {
    try {
      const list = await providersList();
      setProviders(list);
    } catch (e) {
      setMsg({ kind: "err", text: `读取配置失败：${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (draft: ProviderConfig, original?: ProviderConfig) => {
    setMsg(null);
    try {
      // If the model_id changed, delete the old entry first.
      if (original && original.modelId !== draft.modelId) {
        await providersDelete(original.modelId);
      }
      await providersSave([draft]);
      // Hot-reload grok's model catalog so the new provider is usable
      // immediately (no restart needed). The grok://models-update event
      // also triggers a refresh in App.tsx as a safety net.
      await internalReload("models").catch(() => {});
      onModelsChanged?.();
      setEditing(null);
      await reload();
      setMsg({ kind: "ok", text: "已保存，模型列表已刷新。" });
    } catch (e) {
      setMsg({ kind: "err", text: `保存失败：${String(e)}` });
    }
  };

  const handleDelete = async (p: ProviderConfig) => {
    if (!confirm(`删除模型「${p.name || p.modelId}」的配置？`)) return;
    setMsg(null);
    try {
      await providersDelete(p.modelId);
      await internalReload("models").catch(() => {});
      onModelsChanged?.();
      await reload();
      setMsg({ kind: "ok", text: "已删除，模型列表已刷新。" });
    } catch (e) {
      setMsg({ kind: "err", text: `删除失败：${String(e)}` });
    }
  };

  const newDraft: EditorDraft = useMemo(
    () => ({
      providerKind: "custom",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      apiBackend: "chat_completions",
      authScheme: "bearer",
      name: "",
    }),
    []
  );

  return (
    <div className="models-settings-panel">
      <h2 className="models-settings-panel__title">模型</h2>

      <section className="models-settings-panel__section">
        <h3 className="models-settings-panel__section-title">自定义模型</h3>
        <div className="models-settings-panel__card">
          <div className="models-settings-panel__card-row">
            <div className="models-settings-panel__card-left">
              <div className="models-settings-panel__card-label">本地配置文件</div>
              <div className="models-settings-panel__card-desc">
                管理写入到{" "}
                <code className="models-settings-panel__card-link">~/.grok/config.toml</code>{" "}
                的本地自定义模型配置。
              </div>
            </div>
            <div className="models-settings-panel__card-right">
              <button
                className="cb-button cb-button--secondary cb-button--small models-settings-panel__add-button"
                onClick={() => setEditing({ draft: { ...newDraft } })}
              >
                <span className="cb-button__content">
                  <Plus size={13} strokeWidth={2} style={{ marginRight: 4 }} />
                  添加模型
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="models-settings-panel__section">
        <h3 className="models-settings-panel__section-title">已保存模型</h3>
        {loading ? (
          <div className="models-settings-panel__empty">
            <div className="models-settings-panel__empty-title">加载中…</div>
          </div>
        ) : providers.length === 0 ? (
          <div className="models-settings-panel__empty">
            <div className="models-settings-panel__empty-title">还没有配置自定义模型</div>
            <div className="models-settings-panel__empty-desc">
              添加后会自动写入本地 config.toml，并出现在 grok 的可用模型列表中。
            </div>
          </div>
        ) : (
          <ul className="models-settings-panel__list">
            {providers.map((p) => (
              <li key={p.modelId} className="models-settings-panel__item">
                <div className="models-settings-panel__item-main">
                  <div className="models-settings-panel__item-name">
                    {p.name || p.modelId}
                  </div>
                  <div className="models-settings-panel__item-meta">
                    <span className="models-settings-panel__item-tag">{p.providerKind}</span>
                    <span className="models-settings-panel__item-modelid">{p.modelId}</span>
                    {p.baseUrl && (
                      <span className="models-settings-panel__item-url" title={p.baseUrl}>
                        {p.baseUrl}
                      </span>
                    )}
                  </div>
                </div>
                <div className="models-settings-panel__item-actions">
                  <button
                    className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                    onClick={() =>
                      setEditing({
                        original: p,
                        // Convert ProviderConfig (optional fields) into an
                        // EditorDraft (required strings). Strip the masked
                        // "••••" apiKey so the editor shows empty — user
                        // retypes to change, blank keeps the existing key.
                        draft: {
                          providerKind: p.providerKind,
                          modelId: p.modelId,
                          apiKey: "",
                          baseUrl: p.baseUrl ?? "",
                          apiBackend: p.apiBackend ?? "chat_completions",
                          authScheme: p.authScheme ?? "bearer",
                          name: p.name ?? "",
                        },
                      })
                    }
                    aria-label="编辑"
                    title="编辑"
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                    onClick={() => handleDelete(p)}
                    aria-label="删除"
                    title="删除"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && (
        <div className={`settings__msg settings__msg--${msg.kind}`}>{msg.text}</div>
      )}

      {editing && (
        <AddModelEditor
          draft={editing.draft}
          original={editing.original}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nested "添加模型" editor dialog (560×318).
// ---------------------------------------------------------------------------

interface EditorDraft {
  providerKind: ProviderKind;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  apiBackend: ApiBackend;
  authScheme: AuthScheme;
  name: string;
}

function AddModelEditor({
  draft,
  original,
  onCancel,
  onSave,
}: {
  draft: EditorDraft;
  original?: ProviderConfig;
  onCancel: () => void;
  onSave: (draft: ProviderConfig, original?: ProviderConfig) => void;
}) {
  const [form, setForm] = useState<EditorDraft>({ ...draft });
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(draft.providerKind === "custom");
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS[form.providerKind];
  const isCustom = form.providerKind === "custom";

  // When the provider preset changes, pre-fill the advanced fields from the
  // preset (unless the user had overridden them — for a fresh add we always
  // adopt the preset).
  const handleProviderChange = (kind: ProviderKind) => {
    const p = PRESETS[kind];
    setForm((f) => ({
      ...f,
      providerKind: kind,
      baseUrl: p.baseUrl ?? "",
      apiBackend: p.apiBackend ?? f.apiBackend,
      authScheme: p.authScheme ?? f.authScheme,
    }));
    setShowAdvanced(kind === "custom");
  };

  const canSave = (() => {
    if (!form.modelId.trim()) return false;
    if (isCustom && !form.baseUrl.trim()) return false;
    // For a new entry (no original), require an api key OR an existing entry
    // already on disk (original present means key is optional on re-edit).
    if (!original && !form.apiKey.trim()) return false;
    if (form.apiKey.startsWith("•")) return false; // mask, no-op
    return true;
  })();

  const handleSaveClick = () => {
    setError(null);
    if (!canSave) {
      setError("请填写必填字段（模型名称、API Key）。");
      return;
    }
    const out: ProviderConfig = {
      providerKind: form.providerKind,
      modelId: form.modelId.trim(),
      apiKey: form.apiKey.trim() || undefined,
      // For preset kinds, send the resolved advanced fields so the backend
      // writes them. For custom, they're user-provided.
      baseUrl: form.baseUrl.trim() || undefined,
      apiBackend: form.apiBackend,
      authScheme: form.authScheme,
      name: form.name.trim() || undefined,
    };
    onSave(out, original);
  };

  return (
    <div className="models-settings-panel__editor-overlay" role="dialog" aria-modal="true">
      <div className="models-settings-panel__editor">
        <header className="models-settings-panel__editor-header">
          <div className="models-settings-panel__editor-title-group">
            <div className="models-settings-panel__editor-title">
              {original ? "编辑模型" : "添加模型"}
            </div>
            <div className="models-settings-panel__editor-note">
              {isCustom ? "自定义 OpenAI 兼容协议 API" : "支持 OpenAI / Anthropic / xAI 等协议"}
            </div>
          </div>
          <button
            className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
            onClick={onCancel}
            aria-label="关闭"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="models-settings-panel__editor-body">
          {/* 提供商 */}
          <div className="models-settings-panel__field">
            <div className="models-settings-panel__field-header">
              <label className="models-settings-panel__label">提供商</label>
            </div>
            <div className="models-settings-panel__select-shell">
              <select
                className="models-settings-panel__select"
                value={form.providerKind}
                onChange={(e) => handleProviderChange(e.target.value as ProviderKind)}
              >
                {(["anthropic", "openai", "grok", "deepseek", "qwen", "custom"] as ProviderKind[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {PRESETS[k].label}
                    </option>
                  )
                )}
              </select>
              <ChevronDown
                size={14}
                strokeWidth={1.75}
                className="models-settings-panel__select-arrow"
              />
            </div>
          </div>

          {/* API Key */}
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">API Key</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input models-settings-panel__input--with-trailing-icon"
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={
                  original ? "已保存（重新输入以替换，留空保持不变）" : preset.placeholderKey
                }
              />
              <button
                className="cb-button cb-button--ghost cb-button--small cb-button--icon-only models-settings-panel__input-toggle"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "隐藏" : "显示"}
                type="button"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* 模型名称 */}
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">模型名称</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input"
                value={form.modelId}
                onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
                placeholder="如 gpt-4o、claude-sonnet-4-5、deepseek-chat"
                list="model-suggestions"
              />
              <datalist id="model-suggestions">
                {preset.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          {/* 高级折叠区 */}
          <button
            className="models-settings-panel__advanced-toggle"
            onClick={() => setShowAdvanced((s) => !s)}
            type="button"
          >
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              style={{
                transition: "transform 0.15s",
                transform: showAdvanced ? "rotate(180deg)" : "none",
              }}
            />
            高级
          </button>

          {showAdvanced && (
            <div className="models-settings-panel__advanced">
              <div className="models-settings-panel__field">
                <label className="models-settings-panel__label">Base URL</label>
                <div className="models-settings-panel__input-shell">
                  <input
                    className="models-settings-panel__input"
                    value={form.baseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://api.example.com/v1"
                    disabled={!isCustom}
                  />
                </div>
              </div>
              <div className="models-settings-panel__field-row">
                <div className="models-settings-panel__field">
                  <label className="models-settings-panel__label">协议</label>
                  <div className="models-settings-panel__select-shell">
                    <select
                      className="models-settings-panel__select"
                      value={form.apiBackend}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, apiBackend: e.target.value as ApiBackend }))
                      }
                      disabled={!isCustom}
                    >
                      <option value="chat_completions">chat_completions</option>
                      <option value="responses">responses</option>
                      <option value="messages">messages</option>
                    </select>
                    <ChevronDown
                      size={14}
                      strokeWidth={1.75}
                      className="models-settings-panel__select-arrow"
                    />
                  </div>
                </div>
                <div className="models-settings-panel__field">
                  <label className="models-settings-panel__label">认证方式</label>
                  <div className="models-settings-panel__select-shell">
                    <select
                      className="models-settings-panel__select"
                      value={form.authScheme}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, authScheme: e.target.value as AuthScheme }))
                      }
                      disabled={!isCustom}
                    >
                      <option value="bearer">bearer</option>
                      <option value="x_api_key">x_api_key</option>
                    </select>
                    <ChevronDown
                      size={14}
                      strokeWidth={1.75}
                      className="models-settings-panel__select-arrow"
                    />
                  </div>
                </div>
              </div>
              <div className="models-settings-panel__field">
                <label className="models-settings-panel__label">显示名称（可选）</label>
                <div className="models-settings-panel__input-shell">
                  <input
                    className="models-settings-panel__input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="如 我的 GPT-4o"
                  />
                </div>
              </div>
            </div>
          )}

          {error && <div className="models-settings-panel__editor-error">{error}</div>}
        </div>

        <footer className="models-settings-panel__editor-footer">
          <button
            className="cb-button cb-button--secondary cb-button--medium models-settings-panel__editor-cancel"
            onClick={onCancel}
          >
            <span className="cb-button__content">取消</span>
          </button>
          <button
            className="cb-button cb-button--primary cb-button--medium models-settings-panel__editor-save"
            onClick={handleSaveClick}
            disabled={!canSave}
          >
            <span className="cb-button__content">保存</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
