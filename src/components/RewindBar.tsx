/**
 * 回溯/分叉工具栏 - 显示在 ChatView 顶部，让用户回到任意历史 prompt
 *
 * 两个能力：
 *  - Rewind（回溯）：调 `x.ai/rewind/{points,execute}`，回到指定 prompt 索引。
 *    支持 mode=conversation（仅回退对话）/ all（含文件改动）/ files。
 *  - Fork（分叉）：调 `x.ai/session/fork`，复制会话到新 id 探索不同方向。
 *
 * 这两个能力在 WorkBuddy 对应"历史回溯"和"分支探索"。
 */
import { useEffect, useState } from "react";
import {
  rewindExecute,
  rewindPoints,
  sessionFork,
} from "@/lib/grok-client";
import type { RewindPoint } from "@/lib/types";
import {
  ClockIcon,
  ChevronDownIcon,
  GitBranchIcon,
} from "@/foundation/components/Icon/icons";

interface RewindBarProps {
  sessionId: string;
  cwd?: string;
  onForked?: (newSessionId: string) => void;
  onRewound?: () => void;
  onToast?: (msg: string) => void;
}

export function RewindBar({
  sessionId,
  cwd,
  onForked,
  onRewound,
  onToast,
}: RewindBarProps) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<RewindPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadPoints = async () => {
    setLoading(true);
    try {
      setPoints(await rewindPoints(sessionId));
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && points.length === 0) loadPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const handleRewind = async (idx: number, mode: "all" | "conversation") => {
    setBusy(true);
    try {
      await rewindExecute(sessionId, idx, mode, true);
      onToast?.(mode === "all" ? "已回溯（含文件改动）" : "已回退对话");
      onRewound?.();
      setOpen(false);
    } catch (e) {
      onToast?.(`回溯失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFork = async () => {
    if (!confirm("分叉此会话？会复制到新会话，原会话保留。")) return;
    setBusy(true);
    try {
      const newId = await sessionFork(sessionId, cwd);
      onToast?.(`已分叉到新会话 ${newId.slice(0, 8)}`);
      onForked?.(newId);
    } catch (e) {
      onToast?.(`分叉失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setBusy(false);
    }
  };

  // Only show the toggle if there's likely history (heuristic: always show,
  // the dropdown will say "无回溯点" if empty).
  return (
    <div className="rewind-bar">
      <button
        className="rewind-bar__btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="回溯到历史某一步"
      >
        <ClockIcon size="sm" /> 回溯
        <ChevronDownIcon size="sm" />
      </button>
      <button
        className="rewind-bar__btn"
        onClick={handleFork}
        disabled={busy}
        title="分叉此会话"
      >
        <GitBranchIcon size="sm" /> 分叉
      </button>
      {open && (
        <div className="rewind-bar__dropdown">
          <div className="rewind-bar__header">
            可回溯点
            <button
              className="rewind-bar__refresh"
              onClick={loadPoints}
              disabled={loading}
            >
              刷新
            </button>
          </div>
          {loading && <div className="rewind-bar__empty">加载中…</div>}
          {!loading && points.length === 0 && (
            <div className="rewind-bar__empty">无回溯点（会话刚创建）</div>
          )}
          <ul className="rewind-bar__list">
            {points.map((p, i) => (
              <li key={i} className="rewind-bar__point">
                <div className="rewind-bar__point-info">
                  <div className="rewind-bar__point-title">
                    #{p.promptIndex}
                    {p.promptPreview
                      ? `: ${p.promptPreview.slice(0, 50)}${
                          p.promptPreview.length > 50 ? "…" : ""
                        }`
                      : ""}
                  </div>
                  {p.timestamp && (
                    <div className="rewind-bar__point-time">
                      {new Date(p.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="rewind-bar__point-actions">
                  <button
                    onClick={() => handleRewind(p.promptIndex, "conversation")}
                    disabled={busy}
                  >
                    仅对话
                  </button>
                  <button
                    onClick={() => handleRewind(p.promptIndex, "all")}
                    disabled={busy}
                  >
                    含文件
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
