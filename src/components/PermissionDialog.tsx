import { usePermissionStore, selectPermissionForSession } from "@/stores/permission-store";
import { grokResolvePermission } from "@/lib/grok-client";

/**
 * Inline permission card rendered inside the ChatView message stream.
 * Only shows requests for the given session — never blocks sidebar or
 * conversation switching.
 */
export function PermissionInlineCard({ sessionId }: { sessionId: string | null }) {
  const head = usePermissionStore(selectPermissionForSession(sessionId));
  const dismiss = usePermissionStore((s) => s.dismiss);

  if (!head) return null;

  const resolve = async (optionId?: string, cancelled = false) => {
    const id = head.requestId;
    dismiss(id, head.sessionId);
    try {
      await grokResolvePermission(id, { optionId, cancelled });
    } catch (e) {
      console.error("resolve permission failed", e);
    }
  };

  return (
    <div className="perm-inline">
      <div className="perm-inline__head">
        <span className="perm-inline__kind">{head.toolKind}</span>
        <span className="perm-inline__title">{head.title}</span>
      </div>
      <div className="perm-inline__body">
        <p>grok 想要执行以下操作，是否允许？</p>
        {head.rawInput != null && (
          <pre className="perm-inline__raw">
            {JSON.stringify(head.rawInput, null, 2)}
          </pre>
        )}
      </div>
      <div className="perm-inline__footer">
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
  );
}
