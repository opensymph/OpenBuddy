import { useEffect, useRef, useState } from "react";
import { Mic, X, type LucideIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ChevronDownIcon, SendPlaneIcon } from "@/foundation/components/Icon/icons";
import { ModelSelector, type ModelOption } from "./ModelSelector";
import { WorkspacePicker } from "./WorkspacePicker";
import { PermissionPicker } from "./PermissionPicker";
import { SlashCommands } from "./SlashCommands";
import { InputAddMenu } from "./InputAddMenu";
import type { HomeModeId } from "./home-scenes";
import type { AgentEntry } from "@/lib/types";
import type { WorkspaceInfo } from "@/lib/grok-client";

/**
 * WorkBuddy 风格输入卡片(圆角16):左下 +,右下 Auto 下拉/麦克风/发送;
 * showMeta 时卡片内部底部显示"选择工作空间/默认权限"。
 * showDisclaimer 时卡片下方渲染免责声明行。
 * apiReady=false 时输入禁用,点击卡片引导打开设置。
 */
export function Composer({
  streaming,
  disabled,
  onSend,
  onCancel,
  placeholder,
  apiReady = true,
  onOpenSettings,
  onPlaceholder,
  onToast,
  showMeta = false,
  showDisclaimer = false,
  permissionInline = false,
  // Model picker
  modelId,
  models,
  onModelChange,
  // Workspace picker
  cwd,
  workspaces,
  onSelectWorkspace,
  // Seed text (from HomePage chips). Consumed once, then cleared via callback.
  initialText,
  onInitialTextConsumed,
  // 不可编辑的"操作类型"标签(首页选中能力分类时插入),显示在输入框内首行。
  sceneTag,
  onClearSceneTag,
  // 受控填充:externalTextNonce 变化时把 externalText 写入输入框(用于点击模板)。
  externalText,
  externalTextNonce,
  // 按会话持久化的草稿:切换 sessionId 时按 draft 回填,每次输入回写 store。
  // 不传这三者时退化为纯组件内 state(向后兼容旧调用方/测试)。
  draft,
  draftKey,
  onDraftChange,
  onSelectMode,
  onSelectExpert,
  onSelectSkill,
  onNavigateConnectors,
}: {
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  apiReady?: boolean;
  onOpenSettings?: () => void;
  onPlaceholder?: (label: string) => void;
  /** Surface transient feedback (permission rule save errors, etc.). */
  onToast?: (msg: string) => void;
  showMeta?: boolean;
  /** Show "内容由 AI 生成" disclaimer below card (chat page). */
  showDisclaimer?: boolean;
  /** 把权限选择器放进卡片内 footer（+ 之后），匹配 WorkBuddy 本地助理页；为 true 时不再渲染卡片外 meta 行。 */
  permissionInline?: boolean;
  /** Currently selected model id (shown on the model trigger). */
  modelId?: string;
  /** Available models for the picker. */
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
  /** Currently active working directory. */
  cwd?: string;
  workspaces?: WorkspaceInfo[];
  onSelectWorkspace?: (cwd: string) => void;
  /** Optional initial text to seed the input (one-shot, then cleared). */
  initialText?: string;
  onInitialTextConsumed?: () => void;
  /**
   * 首页"操作类型"标签(复刻 WorkBuddy 的 scene tag):选中能力分类后插入
   * 到输入框内首行的黑色标签,带图标与 × 删除按钮。发送时作为上下文前缀。
   */
  sceneTag?: { label: string; icon: LucideIcon } | null;
  /** 点击标签 × 时清空该标签(并清空相关输入)。 */
  onClearSceneTag?: () => void;
  /** 受控填充的内容(通常是某个模板对应的完整 prompt)。 */
  externalText?: string;
  /** 递增的 nonce;变化时把 externalText 写入输入框并聚焦。 */
  externalTextNonce?: number;
  /**
   * 持久化草稿:切到某会话时(draftKey 变化)把 draft 回填到输入框。
   * 与 externalText 不同,这是"用户已经敲下的字",回填时不触发 onDraftChange。
   */
  draft?: string;
  /** 草稿作用域标识(通常是 sessionId 或哨兵)。变化时触发回填。 */
  draftKey?: string | number;
  /** 用户输入时回调,父组件据此把草稿写回 store。 */
  onDraftChange?: (text: string) => void;
  /** 加号菜单:选择模式(日常办公/代码开发/设计创意)。 */
  onSelectMode?: (modeId: HomeModeId) => void;
  /** 加号菜单:选择专家。 */
  onSelectExpert?: (agent: AgentEntry) => void;
  /** 加号菜单:选择技能(插入 /skillName)。 */
  onSelectSkill?: (skillName: string) => void;
  /** 加号菜单:跳转到连接器管理面板。 */
  onNavigateConnectors?: () => void;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // 统一更新入口:每次写入输入框内容时同步把草稿推给父组件(若启用持久化)。
  // 回填(draftKey 变化)时不走这里,避免把"恢复出来的字"再当成用户输入回写。
  const updateText = (next: string | ((prev: string) => string)) => {
    setText((prev) => {
      const value = typeof next === "function" ? (next as (p: string) => string)(prev) : next;
      onDraftChange?.(value);
      return value;
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  // One-shot seed: when the parent supplies initialText, fill the textarea and
  // focus it so the user can immediately edit/send.
  useEffect(() => {
    if (initialText !== undefined && initialText !== null) {
      updateText(initialText);
      setCursorPos(initialText.length);
      onInitialTextConsumed?.();
      requestAnimationFrame(() => ref.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  // 受控填充:点击模板/切换标签时由父组件驱动,把内容写入输入框并聚焦。
  // 用 nonce 而不是 externalText 本身做依赖,这样连续点同一个模板也能重新触发。
  useEffect(() => {
    if (externalTextNonce === undefined) return;
    const next = externalText ?? "";
    updateText(next); // 同步草稿:模板写入也算当前草稿内容。
    setCursorPos(next.length);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = next.length;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTextNonce]);

  // 持久化草稿回填:切到另一个会话(draftKey 变化)时,把该会话保存的草稿
  // 写回输入框。注意:这里直接用 setText 而非 updateText,因为这是"恢复"
  // 而不是"用户输入",不该触发 onDraftChange 把同样的内容再写一遍 store。
  // 依赖只看 draftKey(通常是 sessionId),draft 值变化不重新触发——否则用户
  // 每敲一个字都会被这个 effect 重置光标。
  useEffect(() => {
    if (draftKey === undefined) return;
    const next = draft ?? "";
    setText(next);
    setCursorPos(next.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Voice input: use the browser's SpeechRecognition API (Tauri's WebView2/
  // WKWebView support it on most systems). On languages where the API isn't
  // exposed (older webviews, no microphone permission), we surface a toast.
  // grok has a voice crate but doesn't expose it over ACP, so this is the
  // lightest path that works today.
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onToast?.("当前环境不支持语音输入（需要 WebView2/WKWebView）");
      onPlaceholder?.("语音输入");
      return;
    }
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      updateText((prev) => {
        // Replace the trailing interim segment each time so the user sees
        // live transcription without duplicating finalized text.
        const base = finalText || prev;
        return interim ? base + interim : base;
      });
    };
    rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
      setListening(false);
      const msg = e.error === "not-allowed"
        ? "未授予麦克风权限"
        : `语音识别错误：${e.error}`;
      onToast?.(msg);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      onToast?.("无法启动语音识别");
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  const send = () => {
    const t = text.trim();
    // 允许空消息发送，或者需要有附件
    if (streaming || disabled || !apiReady) {
      console.log('Send blocked:', { streaming, disabled, apiReady });
      return;
    }
    // Append attachment paths to the prompt text so grok's read_file tool can
    // pick them up (ACP image/audio needs agent-declared capabilities we
    // don't model yet; ResourceLink behavior is unverified — text is safest).
    let body = t;
    if (attachments.length > 0) {
      const fileList = attachments.map((p) => `- ${p}`).join("\n");
      body = body
        ? `${body}\n\n相关文件:\n${fileList}`
        : `请查看以下文件:\n${fileList}`;
    }
    // 把"操作类型"标签作为上下文前缀一并发出(后端正文仍是可运行的 prompt)。
    if (sceneTag) {
      body = body ? `【${sceneTag.label}】${body}` : `【${sceneTag.label}】`;
    }
    console.log('Sending:', body || '(empty message)');
    onSend(body || "你好");
    updateText(""); // 发送后清空输入框,同时把草稿也清掉(否则切回还会带回来)。
    setAttachments([]);
    onClearSceneTag?.();
  };

  const pickFiles = async () => {
    try {
      const selected = await openDialog({ multiple: true });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      setAttachments((prev) => {
        const set = new Set(prev);
        paths.forEach((p) => set.add(p));
        return [...set];
      });
    } catch {
      // dialog plugin not available in non-Tauri env (vitest) — no-op.
    }
  };

  const ph = (label: string) => onPlaceholder?.(label);

  // Cursor tracking for slash-command autocomplete.
  const [cursorPos, setCursorPos] = useState(0);
  // Is the user currently typing a "/xxx" command? Drives SlashCommands menu.
  const wordBeforeCursor = (() => {
    const before = text.slice(0, cursorPos);
    const m = before.match(/\/[\w-]*$/);
    return m ? m[0] : "";
  })();
  const slashVisible = wordBeforeCursor.length > 0 && apiReady && !streaming;

  const handleSlashPick = (command: string) => {
    // Replace the "/xxx" fragment (up to cursor) with the picked command + " ".
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const newBefore = before.replace(/\/[\w-]*$/, command + " ");
    const next = newBefore + after;
    updateText(next);
    const newPos = newBefore.length;
    setCursorPos(newPos);
    // Refocus + put caret at the insertion point.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = newPos;
    });
  };

  const showModelPicker = !!onModelChange && !!models;
  const showWorkspacePicker = !!onSelectWorkspace && !!workspaces;

  const composerCls = [
    "wb-composer",
    !apiReady && "wb-composer--disabled",
    showMeta && "wb-composer--home",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={
        "wb-composer-wrap" + (showMeta ? " wb-composer-wrap--home" : "")
      }
    >
      <section
        className={composerCls}
        onClick={() => {
          if (!apiReady) onOpenSettings?.();
        }}
      >
        {!apiReady && (
          <div className="wb-composer__setup-hint" role="button" tabIndex={0}>
            请先配置 API Key 开始使用
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((path) => (
              <span key={path} className="composer-attachments__chip" title={path}>
                <span className="composer-attachments__chip-name">
                  {path.replace(/\\/g, "/").split("/").pop()}
                </span>
                <button
                  type="button"
                  className="composer-attachments__chip-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAttachments((prev) => prev.filter((p) => p !== path));
                  }}
                  aria-label="移除附件"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* "操作类型"黑色标签(首页选中能力分类后插入,× 可删除) */}
        {sceneTag && (
          <div className="wb-composer__scene-tag" role="group" aria-label={`操作类型 ${sceneTag.label}`}>
            <span className="wb-composer__scene-tag-icon" aria-hidden="true">
              <sceneTag.icon size={14} />
            </span>
            <span className="wb-composer__scene-tag-text">{sceneTag.label}</span>
            <button
              type="button"
              className="wb-composer__scene-tag-remove"
              aria-label={`移除 ${sceneTag.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onClearSceneTag?.();
              }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        )}

        <textarea
          ref={ref}
          className="wb-composer__input"
          rows={1}
          value={text}
          disabled={!apiReady}
          placeholder={
            apiReady
              ? sceneTag
                ? "" // 有操作类型标签时不显示占位文案(匹配 WorkBuddy)
                : placeholder ?? "今天帮你做些什么? @ 引用对话文件,/ 调用技能与指令"
              : "请先配置 API Key 开始使用"
          }
          onChange={(e) => {
            updateText(e.target.value);
            setCursorPos(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) =>
            setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? cursorPos)
          }
          onClick={(e) =>
            setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? cursorPos)
          }
          onKeyUp={(e) =>
            setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? cursorPos)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              if (slashVisible) {
                return;
              }
              e.preventDefault();
              send();
            }
          }}
        />
        {/* Slash-command autocomplete */}
        <SlashCommands
          text={text}
          cursor={cursorPos}
          onPick={handleSlashPick}
        />
        <div className="wb-composer__footer">
          <InputAddMenu
            onPickFiles={pickFiles}
            onSelectMode={onSelectMode}
            onSelectExpert={onSelectExpert}
            onSelectSkill={(name) => {
              onSelectSkill?.(name);
              if (!onSelectSkill) {
                updateText((prev) => {
                  const prefix = prev.endsWith(" ") || prev === "" ? "" : " ";
                  return prev + prefix + `/${name} `;
                });
                requestAnimationFrame(() => ref.current?.focus());
              }
            }}
            onNavigateConnectors={onNavigateConnectors}
          />
          {permissionInline && (
            <PermissionPicker onToast={onToast} />
          )}
          <div className="wb-composer__spacer" />
          {showModelPicker ? (
            <ModelSelector
              modelId={modelId}
              models={models!}
              onModelChange={onModelChange!}
            />
          ) : (
            <button
              className="wb-composer__model"
              onClick={(e) => {
                e.stopPropagation();
                ph("模型选择");
              }}
            >
              Auto <ChevronDownIcon size="sm" />
            </button>
          )}
          <button
            className={
              "wb-composer__tool" + (listening ? " wb-composer__tool--active" : "")
            }
            onClick={(e) => {
              e.stopPropagation();
              toggleVoice();
            }}
            aria-label="语音输入"
            title={listening ? "正在聆听…点击停止" : "语音输入"}
          >
            <Mic size={16} />
          </button>
          {streaming ? (
            <button
              className="wb-composer__send wb-composer__send--stop"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              aria-label="停止生成"
            >
              ■
            </button>
          ) : (
            <button
              className={
                "wb-composer__send" +
                (text.trim() === "" && attachments.length === 0
                  ? " wb-composer__send--empty"
                  : "")
              }
              onClick={(e) => {
                e.stopPropagation();
                send();
              }}
              disabled={disabled || !apiReady}
              aria-label="发送"
              title={!apiReady ? "请先配置 API Key" : "发送消息"}
            >
              <SendPlaneIcon size="md" />
            </button>
          )}
        </div>
      </section>
      {/* WB: meta 行在白卡外下方,透明背景,与卡片间距4px(仅首页) */}
      {showMeta && !permissionInline && (
        <div className="wb-composer-meta">
          {showWorkspacePicker ? (
            <WorkspacePicker
              cwd={cwd}
              workspaces={workspaces!}
              onSelectWorkspace={onSelectWorkspace!}
            />
          ) : (
            <button className="wb-composer-meta__btn" onClick={() => ph("选择工作空间")}>
              选择工作空间 <ChevronDownIcon size="sm" />
            </button>
          )}
          <PermissionPicker onToast={onToast} />
        </div>
      )}
      {showDisclaimer && (
        <div className="wb-composer__disclaimer">
          内容由 AI 生成，请核实重要信息
        </div>
      )}
    </div>
  );
}

// ---------- SpeechRecognition minimal typing ----------
// The browser SpeechRecognition API isn't in the TS DOM lib by default, and
// vendor prefixes vary. We type only the surface we use and resolve the ctor
// defensively at runtime.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface VoiceRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: (e: SpeechRecognitionEventLike) => void;
  onerror: (e: SpeechRecognitionErrorEventLike) => void;
  onend: () => void;
}
type VoiceRecognitionCtor = new () => VoiceRecognition;

function getSpeechRecognitionCtor(): VoiceRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: VoiceRecognitionCtor;
    webkitSpeechRecognition?: VoiceRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
