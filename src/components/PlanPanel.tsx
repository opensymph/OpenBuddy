/**
 * 计划面板 — 显示 grok 的 ACP Plan（任务列表）+ 审批/编辑/执行控制。
 *
 * 增强点（对齐 WorkBuddy）：
 *  - Plan 审批流程：planMode 开启时显示 Approve / Reject / Edit 按钮
 *  - Plan 编辑：修改 entry 文本、优先级、删除
 *  - 任务执行控制：跳过 / 重试单个任务
 *  - 进度追踪：每个 in_progress 任务显示耗时
 *  - Plan mode 开关按钮
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { togglePlanMode } from "@/lib/grok-client";
import type { PlanEntry, PlanEntryPriority, PlanEntryStatus } from "@/lib/types";
import {
  CheckIcon,
  ClockIcon,
  LoaderIcon,
  TaskListIcon,
  DeleteIcon,
} from "@/foundation/components/Icon/icons";

const STATUS_LABEL: Record<PlanEntryStatus, string> = {
  pending: "待处理",
  in_progress: "进行中",
  completed: "已完成",
};

const PRIORITY_LABEL: Record<PlanEntryPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_CYCLE: PlanEntryPriority[] = ["high", "medium", "low"];

interface PlanPanelProps {
  sessionId?: string;
  onSend?: (text: string) => void;
  onToast?: (msg: string) => void;
}

export function PlanPanel({ sessionId, onSend, onToast }: PlanPanelProps) {
  const plan = useSessionStore((s) => s.plan);
  const planMode = useSessionStore((s) => s.planMode);
  const setPlanMode = useSessionStore((s) => s.setPlanMode);
  const setPlan = useSessionStore((s) => s.setPlan);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [elapsed, setElapsed] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track when each task started (for elapsed time display).
  const startTimesRef = useRef<Record<number, number>>({});

  // Elapsed timer: tick every second while there are in_progress tasks.
  useEffect(() => {
    if (!plan) return;
    const hasActive = plan.entries.some((e) => e.status === "in_progress");
    if (hasActive && !timerRef.current) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const next: Record<number, number> = {};
        plan.entries.forEach((e, i) => {
          if (e.status === "in_progress") {
            if (!startTimesRef.current[i]) startTimesRef.current[i] = now;
            next[i] = Math.round((now - startTimesRef.current[i]) / 1000);
          }
        });
        setElapsed(next);
      }, 1000);
    } else if (!hasActive && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setElapsed({});
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [plan]);

  // Reset start times when plan changes structurally.
  useEffect(() => {
    startTimesRef.current = {};
    setElapsed({});
  }, [plan?.entries.length]);

  const handleTogglePlanMode = useCallback(async () => {
    if (!sessionId) return;
    try {
      await togglePlanMode(sessionId, !planMode);
      setPlanMode(!planMode);
      onToast?.(planMode ? "已退出计划模式" : "已进入计划模式");
    } catch (e) {
      onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`);
    }
  }, [sessionId, planMode, setPlanMode, onToast]);

  const handleApprove = useCallback(() => {
    if (!onSend) return;
    onSend("请执行以上计划。");
    onToast?.("已批准计划，开始执行");
  }, [onSend, onToast]);

  const handleReject = useCallback(() => {
    if (!onSend) return;
    onSend("我不满意这个计划，请重新规划。");
    onToast?.("已拒绝计划");
  }, [onSend, onToast]);

  const handleSkip = useCallback(
    (idx: number) => {
      if (!plan) return;
      const entries = plan.entries.map((e, i) =>
        i === idx ? { ...e, status: "completed" as PlanEntryStatus } : e
      );
      setPlan({ ...plan, entries });
      onToast?.(`已跳过 #${idx + 1}`);
    },
    [plan, setPlan, onToast],
  );

  const handleDeleteEntry = useCallback(
    (idx: number) => {
      if (!plan) return;
      const entries = plan.entries.filter((_, i) => i !== idx);
      setPlan({ ...plan, entries });
      onToast?.(`已删除 #${idx + 1}`);
    },
    [plan, setPlan, onToast],
  );

  const handleCyclePriority = useCallback(
    (idx: number) => {
      if (!plan) return;
      const entries = plan.entries.map((e, i) => {
        if (i !== idx) return e;
        const cur = PRIORITY_CYCLE.indexOf(e.priority);
        const next = PRIORITY_CYCLE[(cur + 1) % PRIORITY_CYCLE.length];
        return { ...e, priority: next };
      });
      setPlan({ ...plan, entries });
    },
    [plan, setPlan],
  );

  const handleSaveEdit = useCallback(
    (idx: number) => {
      if (!plan || !editText.trim()) {
        setEditingIdx(null);
        return;
      }
      const entries = plan.entries.map((e, i) =>
        i === idx ? { ...e, content: editText.trim() } : e
      );
      setPlan({ ...plan, entries });
      setEditingIdx(null);
    },
    [plan, editText, setPlan],
  );

  // Empty states
  if (planMode && (!plan || plan.entries.length === 0)) {
    return (
      <div className="plan-panel plan-panel--empty">
        <TaskListIcon size="xl" color="var(--wb-text-tertiary)" />
        <p>计划模式已开启</p>
        <p className="plan-panel__hint">
          发送一个任务，grok 会先制定计划再执行。
        </p>
        <button className="plan-panel__mode-btn" onClick={handleTogglePlanMode}>
          退出计划模式
        </button>
      </div>
    );
  }

  if (!plan || plan.entries.length === 0) {
    return (
      <div className="plan-panel plan-panel--empty">
        <TaskListIcon size="xl" color="var(--wb-text-tertiary)" />
        <p>暂无任务计划</p>
        <p className="plan-panel__hint">
          grok 在处理复杂任务时会自动制定计划。
        </p>
      </div>
    );
  }

  const completed = plan.entries.filter((e) => e.status === "completed").length;
  const inProgress = plan.entries.filter((e) => e.status === "in_progress").length;
  const total = plan.entries.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;
  // Plan is awaiting approval when planMode is on and no task has started yet.
  const awaitingApproval = planMode && inProgress === 0 && completed === 0;

  return (
    <div className="plan-panel">
      <div className="plan-panel__header">
        <h3 className="plan-panel__title">
          <TaskListIcon size="sm" /> 执行计划
        </h3>
        <div className="plan-panel__header-actions">
          <span className="plan-panel__progress-text">
            {completed}/{total}
          </span>
          <button
            className={`plan-panel__mode-toggle ${planMode ? "plan-panel__mode-toggle--active" : ""}`}
            onClick={handleTogglePlanMode}
            title={planMode ? "退出计划模式" : "进入计划模式"}
          >
            计划模式
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="plan-panel__progress-bar">
        <div
          className="plan-panel__progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Status hints */}
      {inProgress > 0 && (
        <div className="plan-panel__active-hint">
          <LoaderIcon size="sm" /> {inProgress} 项进行中
        </div>
      )}

      {/* Approval buttons (shown when plan is awaiting user confirmation) */}
      {awaitingApproval && (
        <div className="plan-panel__approval">
          <button className="plan-panel__approve-btn" onClick={handleApprove}>
            ✓ 批准执行
          </button>
          <button className="plan-panel__reject-btn" onClick={handleReject}>
            ✗ 重新规划
          </button>
        </div>
      )}

      {/* Completion banner */}
      {allDone && (
        <div className="plan-panel__done-banner">
          <CheckIcon size="sm" /> 所有任务已完成
        </div>
      )}

      {/* Task list */}
      <ul className="plan-panel__list">
        {plan.entries.map((entry, idx) => (
          <PlanRow
            key={idx}
            entry={entry}
            index={idx}
            elapsed={elapsed[idx]}
            editing={editingIdx === idx}
            editText={editText}
            onEditTextChange={setEditText}
            onStartEdit={() => {
              setEditingIdx(idx);
              setEditText(entry.content);
            }}
            onSaveEdit={() => handleSaveEdit(idx)}
            onCancelEdit={() => setEditingIdx(null)}
            onSkip={() => handleSkip(idx)}
            onDelete={() => handleDeleteEntry(idx)}
            onCyclePriority={() => handleCyclePriority(idx)}
          />
        ))}
      </ul>
    </div>
  );
}

interface PlanRowProps {
  entry: PlanEntry;
  index: number;
  elapsed?: number;
  editing: boolean;
  editText: string;
  onEditTextChange: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onCyclePriority: () => void;
}

function PlanRow({
  entry,
  index,
  elapsed,
  editing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onSkip,
  onDelete,
  onCyclePriority,
}: PlanRowProps) {
  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  return (
    <li
      className={`plan-panel__row plan-panel__row--${entry.status} plan-panel__row--prio-${entry.priority}`}
    >
      <div className="plan-panel__row-icon">
        {entry.status === "completed" ? (
          <CheckIcon size="sm" />
        ) : entry.status === "in_progress" ? (
          <LoaderIcon size="sm" />
        ) : (
          <ClockIcon size="sm" />
        )}
      </div>
      <div className="plan-panel__row-body">
        {editing ? (
          <div className="plan-panel__row-edit">
            <input
              className="plan-panel__row-edit-input"
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
            />
            <button className="plan-panel__row-edit-save" onClick={onSaveEdit}>
              保存
            </button>
          </div>
        ) : (
          <div
            className="plan-panel__row-content"
            onDoubleClick={onStartEdit}
            title="双击编辑"
          >
            {entry.content}
          </div>
        )}
        <div className="plan-panel__row-meta">
          <button
            className="plan-panel__row-priority plan-panel__row-priority--clickable"
            onClick={onCyclePriority}
            title="点击切换优先级"
          >
            {PRIORITY_LABEL[entry.priority]}
          </button>
          <span className="plan-panel__row-status">
            {STATUS_LABEL[entry.status]}
          </span>
          {elapsed !== undefined && (
            <span className="plan-panel__row-elapsed">
              ⏱ {formatElapsed(elapsed)}
            </span>
          )}
          <span className="plan-panel__row-index">#{index + 1}</span>
        </div>
      </div>
      {/* Row actions */}
      <div className="plan-panel__row-actions">
        {entry.status === "pending" && (
          <button
            className="plan-panel__row-action"
            onClick={onSkip}
            title="跳过此任务"
          >
            跳过
          </button>
        )}
        <button
          className="plan-panel__row-action plan-panel__row-action--danger"
          onClick={onDelete}
          title="删除此任务"
        >
          <DeleteIcon size="sm" />
        </button>
      </div>
    </li>
  );
}
