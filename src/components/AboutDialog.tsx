/**
 * 关于 OpenBuddy 对话框 - 显示版本/内核/认证信息。
 *
 * 从 grokInit() 的 InitResult 取 agentVersion，从 grokAuthStatus() 取认证状态，
 * 内核路径指向项目内 vendor/grok-build submodule。
 */
import { useEffect, useState } from "react";
import { XCloseIcon, CheckIcon } from "@/foundation/components/Icon/icons";
import { grokAuthStatus } from "@/lib/grok-client";
import type { InitResult } from "@/lib/grok-client";

const OPENBUDDY_VERSION = "0.1.0";
// grok-build 是 OpenBuddy 的进程内内核，作为 git submodule 内置于 vendor/grok-build，
// 通过 Cargo 相对路径依赖引入。
const GROK_BUILD_PATH = "vendor/grok-build (submodule)";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  init?: InitResult | null;
}

export function AboutDialog({ open, onClose, init }: AboutDialogProps) {
  const [authReady, setAuthReady] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    grokAuthStatus()
      .then((s) => {
        setAuthReady(s.ready);
        setProviders(s.providers);
      })
      .catch(() => setAuthReady(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="about-dialog__overlay" onClick={onClose}>
      <div
        className="about-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="关于 OpenBuddy"
      >
        <button className="about-dialog__close" onClick={onClose} aria-label="关闭">
          <XCloseIcon size="md" />
        </button>
        <div className="about-dialog__header">
          <div className="about-dialog__logo">OB</div>
          <div>
            <h2 className="about-dialog__title">OpenBuddy</h2>
            <p className="about-dialog__subtitle">
              WorkBuddy 风格的 grok 桌面外壳
            </p>
          </div>
        </div>
        <dl className="about-dialog__list">
          <div className="about-dialog__row">
            <dt>版本</dt>
            <dd>v{OPENBUDDY_VERSION}</dd>
          </div>
          <div className="about-dialog__row">
            <dt>grok agent</dt>
            <dd>{init?.agentVersion ?? "未知"}</dd>
          </div>
          <div className="about-dialog__row">
            <dt>默认模型</dt>
            <dd>{init?.defaultModelId ?? "未指定"}</dd>
          </div>
          <div className="about-dialog__row">
            <dt>工作目录</dt>
            <dd title={init?.cwd}>{init?.cwd ?? "—"}</dd>
          </div>
          <div className="about-dialog__row">
            <dt>内核路径</dt>
            <dd title={GROK_BUILD_PATH}>
              <code>{GROK_BUILD_PATH}</code>
            </dd>
          </div>
          <div className="about-dialog__row">
            <dt>认证状态</dt>
            <dd>
              {authReady === null ? (
                "检查中…"
              ) : authReady ? (
                <span className="about-dialog__ok">
                  <CheckIcon size="sm" /> 就绪
                </span>
              ) : (
                <span className="about-dialog__warn">未就绪</span>
              )}
            </dd>
          </div>
          {providers.length > 0 && (
            <div className="about-dialog__row">
              <dt>已配置模型</dt>
              <dd>{providers.join(", ")}</dd>
            </div>
          )}
        </dl>
        <p className="about-dialog__footer">
          基于 <code>Tauri 2</code> + <code>React</code> +{" "}
          <code>xai-grok-shell</code> 内置。
        </p>
      </div>
    </div>
  );
}
