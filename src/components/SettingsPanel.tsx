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
  RefreshCw,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import {
  providersList,
  providersSaveProvider,
  providersSaveModel,
  providersDeleteProvider,
  providersDeleteModel,
  providersFetchModels,
  internalReload,
  type ApiBackend,
  type AuthScheme,
  type ModelProviderEntry,
  type ModelEntry,
  type ProviderListModel,
  type ProviderKind,
  type FetchedModel,
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
  custom_anthropic: {
    label: "自定义 (Anthropic 兼容)",
    // No baseUrl preset → user must supply it. But protocol/auth are locked to
    // the Anthropic wire shape (messages backend + x-api-key header).
    apiBackend: "messages",
    authScheme: "x_api_key",
    models: [],
    placeholderKey: "sk-ant-...",
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
// 模型 section: provider-grouped view (one provider → many models).
//
// grok's native config shape is [model_providers.<id>] (one key/url/context_window)
// + [model.<id>] with a `model_provider = "<id>"` reference. The UI mirrors
// that: a left list of providers, a right detail showing that provider's
// models + a connection editor. Legacy per-model entries (old shape) are
// grouped for display but only rewritten to the new shape on save.
// ---------------------------------------------------------------------------

/** Inline "拉取模型" panel target (null = closed). */
type ImportingState = { providerId: string; apiKey: string } | null;

function ModelsSettingsPanel({ onModelsChanged }: { onModelsChanged?: () => void }) {
  const [data, setData] = useState<ProviderListModel>({ providers: [], models: [] });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  /** Editing target: a provider connection, or the "add provider" form. */
  const [editingProvider, setEditingProvider] = useState<{
    original?: ModelProviderEntry;
    draft: ProviderDraft;
  } | null>(null);
  /** Editing target: a single model (add or edit). */
  const [editingModel, setEditingModel] = useState<{
    providerId: string;
    original?: ModelEntry;
    name: string;
    contextWindow: string;
  } | null>(null);
  /** Inline "拉取模型" panel target (null = closed). */
  const [importing, setImporting] = useState<ImportingState>(null);

  const reload = async () => {
    try {
      const list = await providersList();
      setData(list);
      // Keep a valid selection, or auto-pick the first provider.
      setSelectedProviderId((prev) => {
        if (prev && list.providers.some((p) => p.id === prev)) return prev;
        return list.providers[0]?.id ?? null;
      });
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

  const modelsOf = (providerId: string) =>
    data.models.filter((m) => m.providerId === providerId);

  const refreshCatalog = () => internalReload("models").catch(() => {});

  const handleSaveProvider = async (draft: ProviderDraft, original?: ModelProviderEntry) => {
    setMsg(null);
    try {
      // id: stable, derived from providerKind. Keep an existing provider's id
      // unless the user changed the kind (then it's effectively a new entry).
      const id = original?.id ?? draft.providerKind;
      await providersSaveProvider({
        id,
        providerKind: draft.providerKind,
        apiKey: draft.apiKey.trim() || undefined,
        baseUrl: draft.baseUrl.trim() || undefined,
        apiBackend: draft.apiBackend,
        authScheme: draft.authScheme,
        contextWindow: draft.contextWindow ? Number(draft.contextWindow) : undefined,
      });
      await refreshCatalog();
      onModelsChanged?.();
      setEditingProvider(null);
      setSelectedProviderId(id);
      await reload();
      setMsg({ kind: "ok", text: "厂商配置已保存。" });
    } catch (e) {
      setMsg({ kind: "err", text: `保存失败：${String(e)}` });
    }
  };

  const handleDeleteProvider = async (p: ModelProviderEntry) => {
    const count = modelsOf(p.id).length;
    const confirmText =
      count > 0
        ? `删除厂商「${p.label || p.providerKind}」及其 ${count} 个模型？`
        : `删除厂商「${p.label || p.providerKind}」？`;
    if (!confirm(confirmText)) return;
    setMsg(null);
    try {
      await providersDeleteProvider(p.id);
      await refreshCatalog();
      onModelsChanged?.();
      if (selectedProviderId === p.id) setSelectedProviderId(null);
      await reload();
      setMsg({ kind: "ok", text: "已删除，模型列表已刷新。" });
    } catch (e) {
      setMsg({ kind: "err", text: `删除失败：${String(e)}` });
    }
  };

  const handleSaveModel = async (
    providerId: string,
    name: string,
    contextWindow: string,
    original?: ModelEntry,
  ) => {
    setMsg(null);
    try {
      await providersSaveModel({
        modelId: original!.modelId,
        providerId,
        name: name.trim() || undefined,
        contextWindow: contextWindow ? Number(contextWindow) : undefined,
      });
      await refreshCatalog();
      onModelsChanged?.();
      setEditingModel(null);
      await reload();
      setMsg({ kind: "ok", text: "模型已保存。" });
    } catch (e) {
      setMsg({ kind: "err", text: `保存失败：${String(e)}` });
    }
  };

  const handleDeleteModel = async (m: ModelEntry) => {
    if (!confirm(`删除模型「${m.name || m.modelId}」？`)) return;
    setMsg(null);
    try {
      await providersDeleteModel(m.modelId);
      await refreshCatalog();
      onModelsChanged?.();
      await reload();
      setMsg({ kind: "ok", text: "已删除。" });
    } catch (e) {
      setMsg({ kind: "err", text: `删除失败：${String(e)}` });
    }
  };

  // Batch import: save many fetched model ids under one provider at once.
  // Each becomes its own [model.<id>] referencing the provider, so per-model
  // display names default to the distinct model id (no more shared-name bug).
  const handleBatchImport = async (providerId: string, ids: string[]) => {
    setMsg(null);
    try {
      for (const id of ids) {
        await providersSaveModel({ modelId: id, providerId });
      }
      await refreshCatalog();
      onModelsChanged?.();
      await reload();
      setMsg({ kind: "ok", text: `已导入 ${ids.length} 个模型。` });
    } catch (e) {
      setMsg({ kind: "err", text: `导入失败：${String(e)}` });
    }
  };

  const selectedProvider = data.providers.find((p) => p.id === selectedProviderId) ?? null;
  const newProviderDraft: ProviderDraft = useMemo(
    () => ({
      providerKind: "custom",
      apiKey: "",
      baseUrl: "",
      apiBackend: "chat_completions",
      authScheme: "bearer",
      contextWindow: "",
    }),
    [],
  );

  return (
    <div className="models-settings-panel">
      <h2 className="models-settings-panel__title">模型</h2>

      <section className="models-settings-panel__section">
        <div className="models-settings-panel__section-head">
          <h3 className="models-settings-panel__section-title">厂商与模型</h3>
          <button
            className="cb-button cb-button--secondary cb-button--small"
            onClick={() => setEditingProvider({ draft: { ...newProviderDraft } })}
          >
            <span className="cb-button__content">
              <Plus size={13} strokeWidth={2} style={{ marginRight: 4 }} />
              添加厂商
            </span>
          </button>
        </div>
        <div className="models-settings-panel__card-desc models-settings-panel__grouped-note">
          一个厂商保存一份 API Key / Base URL / 上下文窗口，可挂载多个模型。配置写入{" "}
          <code className="models-settings-panel__card-link">~/.grok/config.toml</code>。
        </div>

        {loading ? (
          <div className="models-settings-panel__empty">
            <div className="models-settings-panel__empty-title">加载中…</div>
          </div>
        ) : data.providers.length === 0 ? (
          <div className="models-settings-panel__empty">
            <div className="models-settings-panel__empty-title">还没有配置厂商</div>
            <div className="models-settings-panel__empty-desc">
              点击「添加厂商」开始配置，一个厂商下可添加多个模型。
            </div>
          </div>
        ) : (
          <div className="models-settings-panel__grouped">
            {/* Left: provider list */}
            <ul className="models-settings-panel__provider-list">
              {data.providers.map((p) => {
                const count = modelsOf(p.id).length;
                const active = p.id === selectedProviderId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={
                        "models-settings-panel__provider-item" +
                        (active ? " models-settings-panel__provider-item--active" : "")
                      }
                      onClick={() => setSelectedProviderId(p.id)}
                    >
                      <span className="models-settings-panel__provider-name">
                        {PRESETS[p.providerKind]?.label || p.providerKind}
                      </span>
                      <span className="models-settings-panel__provider-meta">
                        {count > 0 ? `${count} 个模型` : "无模型"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Right: selected provider detail */}
            {selectedProvider && (
              <div className="models-settings-panel__provider-detail">
                <div className="models-settings-panel__provider-detail-head">
                  <div className="models-settings-panel__provider-detail-title">
                    {PRESETS[selectedProvider.providerKind]?.label || selectedProvider.providerKind}
                  </div>
                  <div className="models-settings-panel__provider-detail-actions">
                    <button
                      className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                      onClick={() =>
                        setEditingProvider({
                          original: selectedProvider,
                          draft: {
                            providerKind: selectedProvider.providerKind,
                            apiKey: "",
                            baseUrl: selectedProvider.baseUrl ?? "",
                            apiBackend: selectedProvider.apiBackend ?? "chat_completions",
                            authScheme: selectedProvider.authScheme ?? "bearer",
                            contextWindow: selectedProvider.contextWindow
                              ? String(selectedProvider.contextWindow)
                              : "",
                          },
                        })
                      }
                      aria-label="编辑厂商"
                      title="编辑厂商"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                      onClick={() => handleDeleteProvider(selectedProvider)}
                      aria-label="删除厂商"
                      title="删除厂商"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>

                <dl className="models-settings-panel__provider-fields">
                  <div className="models-settings-panel__provider-field">
                    <dt>Base URL</dt>
                    <dd>{selectedProvider.baseUrl || "—"}</dd>
                  </div>
                  <div className="models-settings-panel__provider-field">
                    <dt>协议</dt>
                    <dd>{selectedProvider.apiBackend || "—"}</dd>
                  </div>
                  <div className="models-settings-panel__provider-field">
                    <dt>认证</dt>
                    <dd>{selectedProvider.authScheme || "—"}</dd>
                  </div>
                  <div className="models-settings-panel__provider-field">
                    <dt>上下文窗口</dt>
                    <dd>
                      {selectedProvider.contextWindow
                        ? `${selectedProvider.contextWindow.toLocaleString()} tokens`
                        : "默认"}
                    </dd>
                  </div>
                </dl>

                <div className="models-settings-panel__models-head">
                  <span className="models-settings-panel__models-head-title">模型</span>
                  <div className="models-settings-panel__models-head-actions">
                    <button
                      className="cb-button cb-button--ghost cb-button--small"
                      onClick={() =>
                        setEditingModel({
                          providerId: selectedProvider.id,
                          name: "",
                          contextWindow: "",
                        })
                      }
                    >
                      <span className="cb-button__content">
                        <Plus size={13} strokeWidth={2} style={{ marginRight: 4 }} />
                        手动添加
                      </span>
                    </button>
                    <button
                      className="cb-button cb-button--secondary cb-button--small"
                      onClick={() =>
                        setImporting((prev) =>
                          prev && prev.providerId === selectedProvider.id
                            ? null
                            : { providerId: selectedProvider.id, apiKey: "" },
                        )
                      }
                    >
                      <span className="cb-button__content">
                        <RefreshCw size={13} strokeWidth={2} style={{ marginRight: 4 }} />
                        拉取模型
                      </span>
                    </button>
                  </div>
                </div>

                {modelsOf(selectedProvider.id).length === 0 ? (
                  <div className="models-settings-panel__models-empty">
                    该厂商还没有模型。手动添加，或用厂商的 API Key 拉取。
                  </div>
                ) : (
                  <ul className="models-settings-panel__model-list">
                    {modelsOf(selectedProvider.id).map((m) => (
                      <li key={m.modelId} className="models-settings-panel__model-item">
                        <div className="models-settings-panel__model-main">
                          <div className="models-settings-panel__model-name">
                            {m.name || m.modelId}
                          </div>
                          <div className="models-settings-panel__model-meta">
                            <span className="models-settings-panel__model-id">{m.modelId}</span>
                            {m.contextWindow && (
                              <span className="models-settings-panel__model-cw">
                                {m.contextWindow.toLocaleString()} ctx
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="models-settings-panel__model-actions">
                          <button
                            className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                            onClick={() =>
                              setEditingModel({
                                providerId: selectedProvider.id,
                                original: m,
                                name: m.name ?? "",
                                contextWindow: m.contextWindow ? String(m.contextWindow) : "",
                              })
                            }
                            aria-label="编辑模型"
                            title="编辑模型"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                          </button>
                          <button
                            className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
                            onClick={() => handleDeleteModel(m)}
                            aria-label="删除模型"
                            title="删除模型"
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {importing?.providerId === selectedProvider.id && (
                  <ImportModelsInline
                    provider={selectedProvider}
                    existingModelIds={new Set(modelsOf(selectedProvider.id).map((m) => m.modelId))}
                    onClose={() => setImporting(null)}
                    onImport={(ids) => {
                      void handleBatchImport(selectedProvider.id, ids).then(() =>
                        setImporting(null),
                      );
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {msg && <div className={`settings__msg settings__msg--${msg.kind}`}>{msg.text}</div>}

      {editingProvider && (
        <ProviderEditor
          draft={editingProvider.draft}
          original={editingProvider.original}
          onCancel={() => setEditingProvider(null)}
          onSave={handleSaveProvider}
        />
      )}

      {editingModel && (
        <ModelEditor
          providerId={editingModel.providerId}
          original={editingModel.original}
          initialName={editingModel.name}
          initialContextWindow={editingModel.contextWindow}
          onCancel={() => setEditingModel(null)}
          onSave={(name, cw, original) =>
            handleSaveModel(editingModel.providerId, name, cw, original)
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider connection editor dialog (add/edit a [model_providers.<id>] entry).
// ---------------------------------------------------------------------------

interface ProviderDraft {
  providerKind: ProviderKind;
  apiKey: string;
  baseUrl: string;
  apiBackend: ApiBackend;
  authScheme: AuthScheme;
  contextWindow: string;
}

function ProviderEditor({
  draft,
  original,
  onCancel,
  onSave,
}: {
  draft: ProviderDraft;
  original?: ModelProviderEntry;
  onCancel: () => void;
  onSave: (draft: ProviderDraft, original?: ModelProviderEntry) => void;
}) {
  const [form, setForm] = useState<ProviderDraft>({ ...draft });
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(draft.providerKind === "custom");
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS[form.providerKind];
  // "Custom-like" kinds have no preset baseUrl → the user must supply one, so
  // the Base URL / protocol / auth fields are unlocked. Covers both `custom`
  // (OpenAI-compatible) and `custom_anthropic` (Anthropic-compatible).
  const needsBaseUrl = !preset.baseUrl;

  const handleProviderChange = (kind: ProviderKind) => {
    const p = PRESETS[kind];
    setForm((f) => ({
      ...f,
      providerKind: kind,
      baseUrl: p.baseUrl ?? "",
      apiBackend: p.apiBackend ?? f.apiBackend,
      authScheme: p.authScheme ?? f.authScheme,
    }));
    setShowAdvanced(!p.baseUrl);
  };

  const canSave = (() => {
    if (needsBaseUrl && !form.baseUrl.trim()) return false;
    // New provider requires a key; editing allows blank (unchanged).
    if (!original && !form.apiKey.trim()) return false;
    if (form.apiKey.startsWith("•")) return false;
    return true;
  })();

  const handleSaveClick = () => {
    setError(null);
    if (!canSave) {
      setError(needsBaseUrl && !form.baseUrl.trim() ? "请填写 Base URL。" : "请填写 API Key。");
      return;
    }
    onSave(form, original);
  };

  return (
    <div className="models-settings-panel__editor-overlay" role="dialog" aria-modal="true">
      <div className="models-settings-panel__editor">
        <header className="models-settings-panel__editor-header">
          <div className="models-settings-panel__editor-title-group">
            <div className="models-settings-panel__editor-title">
              {original ? "编辑厂商" : "添加厂商"}
            </div>
            <div className="models-settings-panel__editor-note">
              {form.providerKind === "custom"
                ? "自定义 OpenAI 兼容协议 API"
                : form.providerKind === "custom_anthropic"
                  ? "自定义 Anthropic 兼容协议 API"
                  : "支持 OpenAI / Anthropic / xAI 等协议"}
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
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">提供商</label>
            <div className="models-settings-panel__select-shell">
              <select
                className="models-settings-panel__select"
                value={form.providerKind}
                onChange={(e) => handleProviderChange(e.target.value as ProviderKind)}
              >
                {(
                  [
                    "anthropic",
                    "openai",
                    "grok",
                    "deepseek",
                    "qwen",
                    "custom",
                    "custom_anthropic",
                  ] as ProviderKind[]
                ).map((k) => (
                  <option key={k} value={k}>
                    {PRESETS[k].label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} strokeWidth={1.75} className="models-settings-panel__select-arrow" />
            </div>
          </div>

          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">API Key</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input models-settings-panel__input--with-trailing-icon"
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={original ? "已保存（重新输入以替换，留空保持不变）" : preset.placeholderKey}
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

          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">上下文窗口（tokens，可选）</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input"
                type="number"
                min={1}
                value={form.contextWindow}
                onChange={(e) => setForm((f) => ({ ...f, contextWindow: e.target.value }))}
                placeholder="如 128000（留空用厂商默认）"
              />
            </div>
          </div>

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
                    disabled={!!preset.baseUrl}
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
                      disabled={!!preset.apiBackend}
                    >
                      <option value="chat_completions">chat_completions</option>
                      <option value="responses">responses</option>
                      <option value="messages">messages</option>
                    </select>
                    <ChevronDown size={14} strokeWidth={1.75} className="models-settings-panel__select-arrow" />
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
                      disabled={!!preset.authScheme}
                    >
                      <option value="bearer">bearer</option>
                      <option value="x_api_key">x_api_key</option>
                    </select>
                    <ChevronDown size={14} strokeWidth={1.75} className="models-settings-panel__select-arrow" />
                  </div>
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

// ---------------------------------------------------------------------------
// Single-model editor dialog (display name + optional per-model context window).
// ---------------------------------------------------------------------------

function ModelEditor({
  providerId,
  original,
  initialName,
  initialContextWindow,
  onCancel,
  onSave,
}: {
  providerId: string;
  original?: ModelEntry;
  initialName: string;
  initialContextWindow: string;
  onCancel: () => void;
  onSave: (name: string, contextWindow: string, original?: ModelEntry) => void;
}) {
  const [modelId, setModelId] = useState(original?.modelId ?? "");
  const [name, setName] = useState(initialName);
  const [contextWindow, setContextWindow] = useState(initialContextWindow);
  const [error, setError] = useState<string | null>(null);

  const canSave = modelId.trim().length > 0;

  const handleSaveClick = () => {
    setError(null);
    if (!canSave) {
      setError("请填写模型 ID。");
      return;
    }
    // modelId is the [model.<id>] key — if changed from the original, that's a
    // new entry; the caller saves under the new id. We pass the (possibly new)
    // id through onSave via the original's slot so the parent can delete+create.
    onSave(name, contextWindow, original ? { ...original, modelId: modelId.trim() } : undefined);
  };

  return (
    <div className="models-settings-panel__editor-overlay" role="dialog" aria-modal="true">
      <div className="models-settings-panel__editor models-settings-panel__editor--narrow">
        <header className="models-settings-panel__editor-header">
          <div className="models-settings-panel__editor-title-group">
            <div className="models-settings-panel__editor-title">
              {original ? "编辑模型" : "添加模型"}
            </div>
            <div className="models-settings-panel__editor-note">所属厂商：{providerId}</div>
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
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">模型 ID</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="如 gpt-4o、claude-sonnet-4-5、deepseek-chat"
                disabled={!!original}
              />
            </div>
          </div>
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">显示名称（可选）</label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如 我的 GPT-4o"
              />
            </div>
          </div>
          <div className="models-settings-panel__field">
            <label className="models-settings-panel__label">
              上下文窗口（tokens，可选，覆盖厂商设置）
            </label>
            <div className="models-settings-panel__input-shell">
              <input
                className="models-settings-panel__input"
                type="number"
                min={1}
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="如 128000（留空用厂商默认）"
              />
            </div>
          </div>
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

// ---------------------------------------------------------------------------
// Inline "拉取模型" panel: enter API key → GET /models → pick many → import.
// ---------------------------------------------------------------------------

function ImportModelsInline({
  provider,
  existingModelIds,
  onClose,
  onImport,
}: {
  provider: ModelProviderEntry;
  existingModelIds: Set<string>;
  onClose: () => void;
  onImport: (ids: string[]) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState<FetchedModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const handleFetch = async () => {
    setErr(null);
    const key = apiKey.trim();
    if (!key) {
      setErr("请填写该厂商的 API Key 以拉取模型列表。");
      return;
    }
    setFetching(true);
    try {
      const models = await providersFetchModels(
        provider.providerKind,
        key,
        provider.baseUrl ?? undefined,
      );
      if (models.length === 0) setErr("该端点没有返回任何模型。");
      setFetched(models);
      setSelected(new Set());
    } catch (e) {
      setFetched([]);
      setErr(String(e));
    } finally {
      setFetching(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === fetched.length ? new Set() : new Set(fetched.map((m) => m.id)),
    );

  return (
    <div className="models-settings-panel__import">
      <div className="models-settings-panel__import-row">
        <input
          className="models-settings-panel__input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API Key（仅用于本次拉取，不会保存）"
        />
        <button
          className="cb-button cb-button--secondary cb-button--small"
          onClick={handleFetch}
          disabled={fetching}
          type="button"
        >
          <span className="cb-button__content">
            {fetching ? (
              <Loader2 size={13} strokeWidth={2} className="models-settings-panel__spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={2} style={{ marginRight: 4 }} />
            )}
            {fetching ? "获取中…" : "获取"}
          </span>
        </button>
        <button
          className="cb-button cb-button--ghost cb-button--small cb-button--icon-only"
          onClick={onClose}
          aria-label="关闭"
          type="button"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      {err && <div className="models-settings-panel__fetch-error">{err}</div>}

      {fetched.length > 0 && (
        <div className="models-settings-panel__fetch-list">
          <div className="models-settings-panel__fetch-list-header">
            <span>
              找到 {fetched.length} 个模型
              {selected.size > 0 && ` · 已选 ${selected.size}`}
            </span>
            <button
              className="cb-button cb-button--ghost cb-button--small models-settings-panel__fetch-select-all"
              onClick={toggleAll}
              type="button"
            >
              {selected.size === fetched.length ? "全不选" : "全选"}
            </button>
          </div>
          <ul className="models-settings-panel__fetch-items">
            {fetched.map((m) => {
              const checked = selected.has(m.id);
              const configured = existingModelIds.has(m.id);
              return (
                <li key={m.id}>
                  <label className="models-settings-panel__fetch-item">
                    <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} />
                    <span className="models-settings-panel__fetch-item-id">{m.id}</span>
                    {m.ownedBy && (
                      <span className="models-settings-panel__fetch-item-owner">{m.ownedBy}</span>
                    )}
                    {configured && (
                      <span className="models-settings-panel__fetch-item-badge">已配置</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="models-settings-panel__import-footer">
            <button
              className="cb-button cb-button--primary cb-button--small"
              disabled={selected.size === 0}
              onClick={() => onImport([...selected])}
              type="button"
            >
              <span className="cb-button__content">导入 {selected.size > 0 ? selected.size : ""} 个模型</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
