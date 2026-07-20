/**
 * 文件夹信任对话框 - 当 grok 要求信任一个目录时弹出
 *
 * grok 在首次对某 cwd 执行工具前会发 `x.ai/folder_trust/request`。
 * 用户选择"信任"或"拒绝"，结果通过 `folderTrustRespond` 回传给 grok。
 *
 * 信任的目录会写入 grok 的 trust 配置，之后该目录的工具调用不再询问。
 */
import { useEffect, useState } from "react";
import { ShieldCheckIcon, ShieldAlertIcon } from "@/foundation/components/Icon/icons";
import { folderTrustRespond } from "@/lib/grok-client";

interface TrustRequest {
  cwd?: string;
  reason?: string;
  [key: string]: unknown;
}

interface FolderTrustDialogProps {
  /** The pending trust request (null = no dialog). */
  request: TrustRequest | null;
  onResolve: () => void;
  onToast?: (msg: string) => void;
}

export function FolderTrustDialog({ request, onResolve, onToast }: FolderTrustDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
  }, [request]);

  if (!request) return null;

  const cwd = request.cwd ?? "(unknown)";

  const respond = async (trusted: boolean) => {
    setBusy(true);
    try {
      await folderTrustRespond(cwd, trusted);
    } catch (e) {
      onToast?.(`信任响应失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(false);
      onResolve();
    }
  };

  return (
    <div className="modal-overlay trust-dialog__overlay">
      <div className="trust-dialog" role="dialog" aria-label="文件夹信任">
        <div className="trust-dialog__icon">
          <ShieldAlertIcon size="lg" />
        </div>
        <h2 className="trust-dialog__title">信任此工作目录？</h2>
        <p className="trust-dialog__desc">
          grok 即将在此目录中执行操作（读写文件、运行命令等）。
          请确认你信任此目录的内容。
        </p>
        <div className="trust-dialog__path" title={cwd}>
          <code>{cwd}</code>
        </div>
        {request.reason && (
          <p className="trust-dialog__reason">{String(request.reason)}</p>
        )}
        <div className="trust-dialog__actions">
          <button
            className="btn btn--ghost"
            onClick={() => respond(false)}
            disabled={busy}
          >
            不信任
          </button>
          <button
            className="btn btn--primary"
            onClick={() => respond(true)}
            disabled={busy}
          >
            <ShieldCheckIcon size="sm" /> 信任
          </button>
        </div>
        <p className="trust-dialog__hint">
          信任后该目录的工具调用将不再询问。可在设置中重置。
        </p>
      </div>
    </div>
  );
}
