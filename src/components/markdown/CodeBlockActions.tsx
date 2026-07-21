import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { CodeBlockAction } from "./types";

type Props = {
  code: string;
  language: string;
  actions?: CodeBlockAction[];
  applyButton?: ReactNode;
  requestId?: string;
  onAction?: (
    action: string,
    code: string,
    language: string,
    requestId?: string,
  ) => void;
  copyIconOnly?: boolean;
};

export const CodeBlockActions = memo(function CodeBlockActions({
  code,
  language,
  actions = [],
  applyButton,
  requestId,
  onAction,
  copyIconOnly = true,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    const done = () => {
      setCopied(true);
      onAction?.("copy", code, language, requestId);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => {
        // Fallback for restricted contexts
        try {
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done();
        } catch {
          /* ignore */
        }
      });
    }
  }, [code, language, onAction, requestId]);

  const visibleActions = actions.filter((action) => {
    if (!action.condition) return true;
    return action.condition(code, language);
  });

  return (
    <div className="md-code-actions">
      <button
        type="button"
        className="md-code-action"
        onClick={handleCopy}
        aria-label={copied ? "已复制" : "复制"}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? (
          <Check size={14} className="md-code-action-icon md-code-action-icon--ok" />
        ) : (
          <Copy size={14} className="md-code-action-icon" />
        )}
        {!copyIconOnly && (
          <span className="md-code-action-label">{copied ? "已复制" : "复制"}</span>
        )}
      </button>
      {visibleActions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="md-code-action"
          title={action.description || action.label}
          aria-label={action.label}
          onClick={() => {
            action.onClick(code, language);
            onAction?.(action.id, code, language, requestId);
          }}
        >
          {action.icon}
          <span className="md-code-action-label">{action.label}</span>
        </button>
      ))}
      {applyButton ? (
        <>
          <div className="md-code-divider" />
          {applyButton}
        </>
      ) : null}
    </div>
  );
});
