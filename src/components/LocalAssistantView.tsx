import { Composer } from "./Composer";
import { SettingsIcon } from "@/foundation/components/Icon/icons";
import type { ModelOption } from "./ModelSelector";
import { useSessionsStore, ASSISTANT_DRAFT_KEY } from "@/stores/sessions-store";

/**
 * 本地助理页 — 1:1 对齐 WorkBuddy「本地助理」tab（claw-local-tab = 聊天壳）。
 *
 * 视觉结构（对照目标截图）:
 *  - 顶部 header: 标题「本地助理」+「已连接：」+ 微信小程序 chip + 齿轮按钮
 *  - 中部: 空白消息区（无空状态文案）
 *  - 底部: Composer 卡片（卡片内 + 默认权限 … Auto 麦克风 发送）+ 免责声明
 *
 * 该页即一个可直接对话的入口：在 Composer 发送会新建会话并切到 ChatView。
 */
export function LocalAssistantView({
  onSend,
  streaming,
  apiReady,
  onOpenSettings,
  onPlaceholder,
  modelId,
  models,
  onModelChange,
}: {
  onSend: (text: string) => void;
  streaming: boolean;
  apiReady: boolean;
  onOpenSettings?: () => void;
  onPlaceholder?: (label: string) => void;
  /** 模型选择器（与聊天页 Composer 一致；缺省时退化为静态 Auto 按钮）。 */
  modelId?: string;
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
}) {
  // 本地助理页草稿(哨兵 key):离开再回来未发送的字还在。
  const draft = useSessionsStore((s) => s.drafts[ASSISTANT_DRAFT_KEY] ?? "");
  const setDraft = useSessionsStore((s) => s.setDraft);
  return (
    <div className="local-assistant">
      <header className="local-assistant__header">
        <h1 className="local-assistant__title">本地助理</h1>
        <span className="local-assistant__conn-label">已连接：</span>
        <span className="local-assistant__conn-chip">
          <WechatGlyph />
          <span>微信小程序</span>
        </span>
        <button
          type="button"
          className="local-assistant__settings"
          onClick={() => onPlaceholder?.("本地助理设置")}
          aria-label="本地助理设置"
          title="本地助理设置"
        >
          <SettingsIcon size="sm" />
        </button>
      </header>

      <div className="local-assistant__body" />

      <div className="local-assistant__footer">
        <Composer
          streaming={streaming}
          onSend={onSend}
          onCancel={() => {}}
          apiReady={apiReady}
          onOpenSettings={onOpenSettings}
          onPlaceholder={onPlaceholder}
          modelId={modelId}
          models={models}
          onModelChange={onModelChange}
          permissionInline
          showDisclaimer
          placeholder="今天帮你做些什么？ @ 引用对话文件，/ 调用技能与指令"
          draft={draft}
          draftKey={ASSISTANT_DRAFT_KEY}
          onDraftChange={(t) => setDraft(ASSISTANT_DRAFT_KEY, t)}
        />
      </div>
    </div>
  );
}

/** 微信小程序图标（图标库无内置微信图标，内联 SVG 还原目标截图绿底白色气泡）。 */
function WechatGlyph() {
  return (
    <svg
      className="local-assistant__wechat"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="6" fill="#07C160" />
      <ellipse cx="9.4" cy="9.6" rx="4.6" ry="3.8" fill="#fff" />
      <ellipse cx="15.2" cy="14.4" rx="4" ry="3.3" fill="#fff" />
      <circle cx="7.7" cy="9.2" r="0.85" fill="#07C160" />
      <circle cx="11.1" cy="9.2" r="0.85" fill="#07C160" />
      <circle cx="13.8" cy="14" r="0.7" fill="#07C160" />
      <circle cx="16.6" cy="14" r="0.7" fill="#07C160" />
    </svg>
  );
}
