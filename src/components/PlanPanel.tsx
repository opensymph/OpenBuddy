/**
 * 计划面板 - 显示 grok 的 ACP Plan（任务列表）
 *
 * grok 在执行复杂任务时会推送 `plan` session update（type=plan），
 * 包含一组带优先级/状态的 entries。这是 WorkBuddy "任务管理" 的对应。
 *
 * 这个面板既可以嵌入 ChatView 的右侧，也可以作为独立面板。
 * 数据来自 session-store 的 `plan` 字段（由 applyUpdate 累积）。
 */
import { useSessionStore } from "@/stores/session-store";
import type { PlanEntry, PlanEntryPriority, PlanEntryStatus } from "@/lib/types";
import { CheckIcon, ClockIcon, LoaderIcon, TaskListIcon } from "@/foundation/components/Icon/icons";

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

export function PlanPanel() {
  const plan = useSessionStore((s) => s.plan);
  const planMode = useSessionStore((s) => s.planMode);

  if (planMode && (!plan || plan.entries.length === 0)) {
    return (
      <div className="plan-panel plan-panel--empty">
        <TaskListIcon size="xl" color="var(--wb-text-tertiary)" />
        <p>计划模式已开启</p>
        <p className="plan-panel__hint">
          发送一个任务，grok 会先制定计划再执行。
        </p>
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

  return (
    <div className="plan-panel">
      <div className="plan-panel__header">
        <h3 className="plan-panel__title">
          <TaskListIcon size="sm" /> 执行计划
        </h3>
        <span className="plan-panel__progress-text">
          {completed}/{total}
        </span>
      </div>
      <div className="plan-panel__progress-bar">
        <div
          className="plan-panel__progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {inProgress > 0 && (
        <div className="plan-panel__active-hint">
          <LoaderIcon size="sm" /> {inProgress} 项进行中
        </div>
      )}
      <ul className="plan-panel__list">
        {plan.entries.map((entry, idx) => (
          <PlanRow key={idx} entry={entry} index={idx} />
        ))}
      </ul>
    </div>
  );
}

function PlanRow({ entry, index }: { entry: PlanEntry; index: number }) {
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
        <div className="plan-panel__row-content">{entry.content}</div>
        <div className="plan-panel__row-meta">
          <span className="plan-panel__row-status">{STATUS_LABEL[entry.status]}</span>
          <span className="plan-panel__row-priority">
            优先级：{PRIORITY_LABEL[entry.priority]}
          </span>
          <span className="plan-panel__row-index">#{index + 1}</span>
        </div>
      </div>
    </li>
  );
}
