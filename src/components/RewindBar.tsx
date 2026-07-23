/**
 * 回溯/分叉工具栏 — 显示在 ChatView 底部（composer 正上方）。
 *
 * 两个能力：
 *  - Rewind（回溯）：调 `x.ai/rewind/{points,execute}`，回到指定 prompt 索引。
 *    支持 mode: conversation（仅回退对话）/ files（仅文件）/ all（全量，含对话+文件+记忆）。
 *  - Fork（分叉）：调 `x.ai/session/fork`，复制会话到新 id 探索不同方向。
 *
 * 增强点（对齐 WorkBuddy）：
 *  - 时间线视图：每个回溯点显示时间、prompt 预览、assistant 回复预览、工具调用徽章。
 *  - 文件/记忆变更徽章：标记哪些步骤产生了文件改动或记忆写入。
 *  - 三种模式按钮：仅对话 / 仅文件 / 全量。
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

/** Rewind mode options matching grok's x.ai/rewind/execute mode param.
 *  NOTE: grok's RewindMode enum only has All/ConversationOnly/FilesOnly —
 *  there is no "memory"-only mode (all already includes memory). Don't add
 *  "memory" here or grok's serde will reject it at runtime. */
type RewindMode = "conversation" | "files" | "all";

const MODE_LABELS: Record<RewindMode, string> = {
  conversation: "仅对话",
  files: "仅文件",
  all: "全量",
};

const MODE_TITLES: Record<RewindMode, string> = {
  conversation: "回退对话历史，不影响文件",
  files: "回退文件改动，不影响对话",
  all: "回退所有（对话 + 文件 + 记忆）",
};

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
  /** Currently selected mode for the next rewind action. */
  const [selectedMode, setSelectedMode] = useState<RewindMode>("all");

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

  const handleRewind = async (idx: number) => {
    setBusy(true);
    try {
      await rewindExecute(sessionId, idx, selectedMode, true);
      const label = MODE_LABELS[selectedMode];
      onToast?.(`已回溯（${label}）`);
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
        <div className="rewind-bar__dropdown rewind-bar__dropdown--timeline">
          {/* Header with refresh */}
          <div className="rewind-bar__header">
            <span>回溯时间线</span>
            <button
              className="rewind-bar__refresh"
              onClick={loadPoints}
              disabled={loading}
            >
              {loading ? "加载中…" : "刷新"}
            </button>
          </div>

          {/* Mode selector */}
          <div className="rewind-bar__modes">
            {(Object.keys(MODE_LABELS) as RewindMode[]).map((mode) => (
              <button
                key={mode}
                className={
                  "rewind-bar__mode-btn" +
                  (selectedMode === mode ? " rewind-bar__mode-btn--active" : "")
                }
                onClick={() => setSelectedMode(mode)}
                title={MODE_TITLES[mode]}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          {/* Timeline list */}
          {loading && <div className="rewind-bar__empty">加载中…</div>}
          {!loading && points.length === 0 && (
            <div className="rewind-bar__empty">无回溯点（会话刚创建）</div>
          )}
          <ul className="rewind-bar__timeline">
            {points.map((p) => (
              <li key={p.promptIndex} className="rewind-bar__timeline-item">
                {/* Timeline dot + connector line */}
                <div className="rewind-bar__timeline-rail">
                  <span className="rewind-bar__timeline-dot" />
                </div>

                {/* Content card */}
                <div className="rewind-bar__timeline-card">
                  <div className="rewind-bar__timeline-time">
                    {p.timestamp
                      ? new Date(p.timestamp).toLocaleString()
                      : `#${p.promptIndex}`}
                  </div>
                  {p.promptPreview && (
                    <div className="rewind-bar__timeline-prompt">
                      {p.promptPreview.length > 80
                        ? p.promptPreview.slice(0, 80) + "…"
                        : p.promptPreview}
                    </div>
                  )}
                  {p.messagePreview && (
                    <div className="rewind-bar__timeline-response">
                      💬{" "}
                      {p.messagePreview.length > 60
                        ? p.messagePreview.slice(0, 60) + "…"
                        : p.messagePreview}
                    </div>
                  )}

                  {/* Badges: file changes / memory changes / tool names */}
                  <div className="rewind-bar__timeline-badges">
                    {p.hasFileChanges && (
                      <span className="rewind-bar__badge rewind-bar__badge--file">
                        📄 文件
                      </span>
                    )}
                    {p.hasMemoryChanges && (
                      <span className="rewind-bar__badge rewind-bar__badge--memory">
                        🧠 记忆
                      </span>
                    )}
                    {p.toolNames && p.toolNames.length > 0 && (
                      <span className="rewind-bar__badge rewind-bar__badge--tool">
                        🔧 {p.toolNames.slice(0, 3).join(", ")}
                        {p.toolNames.length > 3 && ` +${p.toolNames.length - 3}`}
                      </span>
                    )}
                  </div>

                  {/* Rewind action button */}
                  <button
                    className="rewind-bar__timeline-action"
                    onClick={() => handleRewind(p.promptIndex)}
                    disabled={busy}
                  >
                    回溯到此处（{MODE_LABELS[selectedMode]}）
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
