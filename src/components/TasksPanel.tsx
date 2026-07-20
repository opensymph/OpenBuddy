/**
 * 运行中任务面板 - 显示 grok 的后台任务和子代理
 *
 * grok 通过工具调用启动的 background tasks 和 spawn_subagent 在后台运行。
 * 这里通过 `x.ai/task/list` + `x.ai/subagent/list_running` 观测它们，
 * 通过 `x.ai/task/kill` / `x.ai/subagent/cancel` 取消。
 *
 * 这个面板嵌入到 ChatView 右侧或作为浮层。监听 `grok://task-update` 自动刷新。
 */
import { useCallback, useEffect, useState } from "react";
import {
  TaskListIcon,
  DeleteIcon,
  RefreshCwIcon,
  CheckIcon,
} from "@/foundation/components/Icon/icons";
import { taskKill, tasksList } from "@/lib/grok-client";
import type { RunningTask } from "@/lib/types";

interface TasksPanelProps {
  /** Optional: listen for task update events to auto-refresh. Set to a counter
   *  that increments on each `grok://task-update`. */
  refreshSignal?: number;
  onToast?: (msg: string) => void;
}

export function TasksPanel({ refreshSignal, onToast }: TasksPanelProps) {
  const [tasks, setTasks] = useState<RunningTask[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await tasksList());
    } catch {
      // grok may not support task/list — show empty.
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshSignal]);

  const handleKill = useCallback(
    async (taskId: string) => {
      try {
        await taskKill(taskId);
        onToast?.("已终止任务");
        reload();
      } catch (e) {
        onToast?.(`终止失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reload],
  );

  if (tasks.length === 0 && !loading) {
    return null; // Hide entirely when empty — panel only shows when there's work.
  }

  return (
    <div className="tasks-panel">
      <div className="tasks-panel__header">
        <h3 className="tasks-panel__title">
          <TaskListIcon size="sm" /> 运行中任务 ({tasks.length})
        </h3>
        <button
          className="tasks-panel__refresh"
          onClick={reload}
          disabled={loading}
          title="刷新"
        >
          <RefreshCwIcon size="sm" />
        </button>
      </div>
      <ul className="tasks-panel__list">
        {tasks.map((task) => (
          <li key={task.id} className="tasks-panel__item">
            <div className="tasks-panel__item-icon">
              {task.status === "completed" ? (
                <CheckIcon size="sm" />
              ) : (
                <TaskListIcon size="sm" />
              )}
            </div>
            <div className="tasks-panel__item-body">
              <div className="tasks-panel__item-desc">
                {task.description ?? task.id}
              </div>
              <div className="tasks-panel__item-meta">
                {task.kind && <span>{task.kind}</span>}
                {task.status && <span>· {task.status}</span>}
                <span className="tasks-panel__item-id">#{task.id.slice(0, 8)}</span>
              </div>
            </div>
            <button
              className="tasks-panel__kill"
              onClick={() => handleKill(task.id)}
              title="终止"
            >
              <DeleteIcon size="sm" />
            </button>
          </li>
        ))}
        {loading && <li className="tasks-panel__loading">加载中…</li>}
      </ul>
    </div>
  );
}
