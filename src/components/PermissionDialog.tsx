import { usePermissionStore, selectPermissionHead } from "@/stores/permission-store";
import { grokResolvePermission } from "@/lib/grok-client";

/**
 * Modal shown when the agent requests permission for an action (file edit,
 * command execution, ...). Renders the offered Allow / Always allow / Deny
 * options and resolves the backend oneshot via grok_resolve_permission.
 */
export function PermissionDialog() {
  const head = usePermissionStore(selectPermissionHead);
  const dismiss = usePermissionStore((s) => s.dismiss);

  if (!head) return null;

  const resolve = async (optionId?: string, cancelled = false) => {
    const id = head.requestId;
    dismiss(id);
    try {
      await grokResolvePermission(id, { optionId, cancelled });
    } catch (e) {
      console.error("resolve permission failed", e);
    }
  };

  return (
    <div className="perm-overlay">
      <div className="perm-modal">
        <div className="perm-modal__head">
          <span className="perm-modal__kind">{head.toolKind}</span>
          <span className="perm-modal__title">{head.title}</span>
        </div>
        <div className="perm-modal__body">
          <p>grok 想要执行以下操作，是否允许？</p>
          {head.rawInput != null && (
            <pre className="perm-modal__raw">
              {JSON.stringify(head.rawInput, null, 2)}
            </pre>
          )}
        </div>
        <div className="perm-modal__footer">
          <button className="btn btn--ghost" onClick={() => resolve(undefined, true)}>
            取消
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              const deny = head.options.find((o) => o.kind === "deny");
              resolve(deny?.optionId);
            }}
          >
            拒绝
          </button>
          {head.options
            .filter((o) => o.kind === "allow" || o.kind === "allow_always")
            .map((o) => (
              <button
                key={o.optionId}
                className={
                  "btn " + (o.kind === "allow_always" ? "btn--ghost" : "btn--primary")
                }
                onClick={() => resolve(o.optionId)}
              >
                {o.title}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
