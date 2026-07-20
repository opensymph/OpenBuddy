/**
 * 自动化面板 — 1:1 复刻 WorkBuddy automation
 *
 * UI 结构对齐 WorkBuddy project-detail-page 中的自动化:
 *  - 调度类型: daily / workday / weekly / monthly / once / interval
 *  - 任务卡片: 带状态指示灯 + 调度描述 + 上/下次运行 + 操作按钮
 *  - 执行记录 tab
 *  - 创建/编辑弹窗: 与 WB 对齐的字段布局
 *  - 推荐模板: 空状态时展示
 */
import { useCallback, useEffect, useState } from "react";
import {
  AgentToolIcon,
  AddCircleIcon,
  SearchIcon,
  PlayIcon,
  PauseIcon,
  DeleteIcon,
  EditToolIcon,
  RefreshCwIcon,
  ClockIcon,
  XCloseIcon,
  CirclePlayIcon,
} from "@/foundation/components/Icon/icons";
import {
  automationsDelete,
  automationsList,
  automationsRun,
  automationsSave,
  automationsToggle,
} from "@/lib/grok-client";
import type { Automation, Schedule } from "@/lib/types";

interface AutomationPanelProps {
  onToast?: (msg: string) => void;
}

type TriggerType = "schedule" | "interval" | "once";
type ScheduleFrequency = "daily" | "workday" | "weekly_monday" | "monthly_1st";

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "workday", label: "工作日" },
  { value: "weekly_monday", label: "每周一" },
  { value: "monthly_1st", label: "每月1日" },
];

const TEMPLATES: {
  name: string; prompt: string; schedule: Schedule;
  triggerType: TriggerType; frequency?: ScheduleFrequency;
}[] = [
  {
    name: "每日 AI 资讯",
    prompt: "帮我整理今天 AI 领域的重要新闻，按重要性排序，每条给一句话摘要和来源。",
    schedule: { type: "daily", time: "09:00" },
    triggerType: "schedule", frequency: "daily",
  },
  {
    name: "每天 5 个英语单词",
    prompt: "推荐 5 个实用的英语单词，给出释义、例句和记忆技巧。",
    schedule: { type: "daily", time: "08:00" },
    triggerType: "schedule", frequency: "daily",
  },
  {
    name: "工作日周报模板",
    prompt: "帮我生成本周工作周报的模板，包含本周完成、下周计划、风险与求助三部分。",
    schedule: { type: "weekly", weekdays: [5], time: "17:00" },
    triggerType: "schedule", frequency: "weekly_monday",
  },
  {
    name: "睡前故事",
    prompt: "写一个适合儿童的睡前故事，主题温暖，300 字左右。",
    schedule: { type: "daily", time: "21:00" },
    triggerType: "schedule", frequency: "daily",
  },
  {
    name: "代码仓库健康检查",
    prompt: "检查当前项目目录下的代码健康状况，包括：未使用的依赖、过时的包、常见的 lint 问题。给出改进建议。",
    schedule: { type: "weekly", weekdays: [1], time: "10:00" },
    triggerType: "schedule", frequency: "weekly_monday",
  },
  {
    name: "每日站会提醒",
    prompt: "帮我准备每日站会内容：昨天完成了什么、今天计划做什么、有什么阻碍需要帮助。",
    schedule: { type: "daily", time: "09:30" },
    triggerType: "schedule", frequency: "workday",
  },
];

export function AutomationPanel({ onToast }: AutomationPanelProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "records">("list");

  const reload = useCallback(async () => {
    setLoading(true);
    try { setAutomations(await automationsList()); }
    catch (e) { onToast?.(`加载自动化失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => { reload(); }, [reload]);

  const handleToggle = useCallback(async (a: Automation) => {
    setBusy(a.id);
    try { await automationsToggle(a.id, a.status !== "active"); reload(); }
    catch (e) { onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setBusy(null); }
  }, [onToast, reload]);

  const handleRun = useCallback(async (a: Automation) => {
    setBusy(a.id);
    try { await automationsRun(a.id); onToast?.(`已触发「${a.name}」，结果将出现在侧栏`); reload(); }
    catch (e) { onToast?.(`运行失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setBusy(null); }
  }, [onToast, reload]);

  const handleDelete = useCallback(async (a: Automation) => {
    if (!confirm(`确定删除自动化「${a.name}」？`)) return;
    try { await automationsDelete(a.id); onToast?.("已删除"); reload(); }
    catch (e) { onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reload]);

  const handleSave = useCallback(async (a: Automation) => {
    try { await automationsSave(a); onToast?.(a.id ? "已保存" : "已创建"); setEditing(null); reload(); }
    catch (e) { onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reload]);

  const filtered = automations.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  const activeCount = automations.filter((a) => a.status === "active").length;

  return (
    <div className="atm-panel">
      {/* Header */}
      <div className="atm-panel-header">
        <div className="atm-panel-header-left">
          <h2 className="atm-panel-title">自动化</h2>
          <div className="atm-panel-stats">
            <span className="atm-panel-stat">
              <AgentToolIcon size="sm" />
              {automations.length} 个任务
            </span>
            <span className="atm-panel-stat atm-panel-stat--active">
              <CirclePlayIcon size="sm" />
              {activeCount} 个运行中
            </span>
          </div>
        </div>
        <div className="atm-panel-header-actions">
          <button className="atm-panel-refresh" onClick={reload} disabled={loading} title="刷新">
            <RefreshCwIcon size="sm" />
          </button>
          <button className="atm-panel-create-btn" onClick={() => setEditing({
            id: "", name: "", prompt: "",
            schedule: { type: "daily", time: "09:00" },
            status: "active", createdAt: "",
          })}>
            <AddCircleIcon size="sm" />
            <span>创建自动化</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="atm-panel-tabs">
        <button className={`atm-panel-tab${tab === "list" ? " atm-panel-tab--active" : ""}`}
          onClick={() => setTab("list")}>
          <AgentToolIcon size="sm" /><span>任务列表</span>
        </button>
        <button className={`atm-panel-tab${tab === "records" ? " atm-panel-tab--active" : ""}`}
          onClick={() => setTab("records")}>
          <ClockIcon size="sm" /><span>执行记录</span>
        </button>
      </div>

      {/* Search */}
      <div className="atm-panel-search">
        <SearchIcon size="sm" className="atm-panel-search-icon" />
        <input type="text" className="atm-panel-search-input"
          placeholder="搜索自动化…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {tab === "list" ? (
        <div className="atm-panel-content">
          {/* Templates when empty */}
          {automations.length === 0 && !loading && (
            <div className="atm-panel-section">
              <div className="atm-panel-empty-state">
                <AgentToolIcon size="xl" className="atm-panel-empty-icon" />
                <h3>开始使用自动化</h3>
                <p>创建定时任务，让 AI 助理按计划为你工作</p>
              </div>
              <h3 className="atm-panel-section-title">推荐模板</h3>
              <div className="atm-template-grid">
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.name} className="atm-template-card" onClick={() => setEditing({
                    id: "", name: tpl.name, prompt: tpl.prompt,
                    schedule: tpl.schedule, status: "active", createdAt: "",
                  })}>
                    <div className="atm-template-icon"><ClockIcon size="md" /></div>
                    <div className="atm-template-info">
                      <div className="atm-template-name">{tpl.name}</div>
                      <div className="atm-template-schedule">{describeSchedule(tpl.schedule)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Task list */}
          {filtered.length === 0 && automations.length > 0 && !loading && (
            <div className="atm-panel-empty">无匹配的自动化</div>
          )}
          <div className="atm-task-list">
            {filtered.map((a) => (
              <div key={a.id} className={`atm-task-card${a.status !== "active" ? " atm-task-card--paused" : ""}`}>
                <div className="atm-task-card-left">
                  <div className={`atm-task-status-dot${a.status === "active" ? " atm-task-status-dot--active" : ""}`} />
                  <div className="atm-task-card-icon"><AgentToolIcon size="md" /></div>
                </div>
                <div className="atm-task-card-body">
                  <div className="atm-task-card-name">{a.name}</div>
                  <div className="atm-task-card-prompt" title={a.prompt}>{a.prompt}</div>
                  <div className="atm-task-card-meta">
                    <span className="atm-task-card-schedule">
                      <ClockIcon size="sm" /> {describeSchedule(a.schedule)}
                    </span>
                    {a.nextRunAt && a.status === "active" && (
                      <span className="atm-task-card-next">下次：{formatTime(a.nextRunAt)}</span>
                    )}
                    {a.lastRunAt && (
                      <span className="atm-task-card-last">上次：{formatTime(a.lastRunAt)}</span>
                    )}
                  </div>
                </div>
                <div className="atm-task-card-actions">
                  <button className="atm-task-action" onClick={() => handleRun(a)}
                    disabled={busy === a.id} title="立即运行">
                    <PlayIcon size="sm" />
                  </button>
                  <button className="atm-task-action" onClick={() => handleToggle(a)}
                    disabled={busy === a.id} title={a.status === "active" ? "暂停" : "启用"}>
                    {a.status === "active" ? <PauseIcon size="sm" /> : <CirclePlayIcon size="sm" />}
                  </button>
                  <button className="atm-task-action" onClick={() => setEditing(a)} title="编辑">
                    <EditToolIcon size="sm" />
                  </button>
                  <button className="atm-task-action atm-task-action--danger"
                    onClick={() => handleDelete(a)} title="删除">
                    <DeleteIcon size="sm" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {loading && <div className="atm-panel-empty">加载中…</div>}
        </div>
      ) : (
        <div className="atm-panel-content">
          <div className="atm-records">
            {automations.filter(a => a.lastRunAt).length === 0 ? (
              <div className="atm-panel-empty">
                <ClockIcon size="xl" className="atm-panel-empty-icon" />
                <p>暂无执行记录</p>
              </div>
            ) : (
              <div className="atm-record-list">
                {automations.filter(a => a.lastRunAt).map((a) => (
                  <div key={a.id} className="atm-record-item">
                    <div className="atm-record-dot" />
                    <div className="atm-record-info">
                      <span className="atm-record-name">{a.name}</span>
                      <span className="atm-record-time">{formatTime(a.lastRunAt!)}</span>
                    </div>
                    <span className="atm-record-status">已完成</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <AutomationEditor initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  );
}

// ============================================================
// Automation Editor Dialog (对齐 WB 自动化创建/编辑弹窗)
// ============================================================

function AutomationEditor({
  initial, onCancel, onSave,
}: {
  initial: Automation;
  onCancel: () => void;
  onSave: (a: Automation) => void;
}) {
  const [draft, setDraft] = useState<Automation>(initial);
  const set = (patch: Partial<Automation>) => setDraft((d) => ({ ...d, ...patch }));
  const setSchedule = (patch: Partial<Schedule>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } as Schedule }));

  const [triggerType, setTriggerType] = useState<TriggerType>(() => {
    if (draft.schedule.type === "once") return "once";
    return "schedule";
  });

  const submit = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) { alert("名称和提示词不能为空"); return; }
    onSave(draft);
  };

  return (
    <div className="modal-overlay atm-editor-overlay" onClick={onCancel}>
      <div className="atm-editor" onClick={(e) => e.stopPropagation()}>
        <div className="atm-editor-header">
          <h3>{initial.id ? "编辑自动化" : "创建自动化"}</h3>
          <button className="atm-editor-close" onClick={onCancel}>
            <XCloseIcon size="md" />
          </button>
        </div>

        <div className="atm-editor-body">
          {/* Name */}
          <div className="atm-editor-field">
            <label className="atm-editor-label">任务名称</label>
            <input type="text" className="atm-editor-input" value={draft.name}
              onChange={(e) => set({ name: e.target.value })} placeholder="例如：每日代码审查" />
          </div>

          {/* Prompt */}
          <div className="atm-editor-field">
            <label className="atm-editor-label">提示词</label>
            <textarea className="atm-editor-textarea" value={draft.prompt}
              onChange={(e) => set({ prompt: e.target.value })} rows={4}
              placeholder="到点时自动发送给 AI 的指令" />
          </div>

          {/* Trigger Type */}
          <div className="atm-editor-field">
            <label className="atm-editor-label">触发方式</label>
            <div className="atm-editor-trigger-types">
              {([
                { value: "schedule", label: "定时" },
                { value: "once", label: "单次" },
              ] as { value: TriggerType; label: string }[]).map((opt) => (
                <button key={opt.value}
                  className={`atm-editor-trigger-btn${triggerType === opt.value ? " atm-editor-trigger-btn--active" : ""}`}
                  onClick={() => {
                    setTriggerType(opt.value);
                    if (opt.value === "once") {
                      setSchedule({ type: "once", at: new Date(Date.now() + 3600_000).toISOString() } as Schedule);
                    } else {
                      setSchedule({ type: "daily", time: "09:00" } as Schedule);
                    }
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule details */}
          {triggerType === "schedule" && (
            <div className="atm-editor-schedule-row">
              <div className="atm-editor-field">
                <label className="atm-editor-label">频率</label>
                <select className="atm-editor-select" value={draft.schedule.type === "weekly" ? "weekly_monday" : draft.schedule.type === "monthly" ? "monthly_1st" : draft.schedule.type}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "daily") setSchedule({ type: "daily", time: "09:00" } as Schedule);
                    else if (v === "workday") setSchedule({ type: "weekly", weekdays: [1, 2, 3, 4, 5], time: "09:00" } as Schedule);
                    else if (v === "weekly_monday") setSchedule({ type: "weekly", weekdays: [1], time: "09:00" } as Schedule);
                    else if (v === "monthly_1st") setSchedule({ type: "monthly", day: 1, time: "09:00" } as Schedule);
                  }}>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="atm-editor-field">
                <label className="atm-editor-label">时间</label>
                <input type="time" className="atm-editor-input"
                  value={"time" in draft.schedule ? draft.schedule.time : "09:00"}
                  onChange={(e) => setSchedule({ time: e.target.value } as Schedule)} />
              </div>
            </div>
          )}

          {triggerType === "once" && (
            <div className="atm-editor-field">
              <label className="atm-editor-label">触发时间</label>
              <input type="datetime-local" className="atm-editor-input"
                value={toLocalInput(("at" in draft.schedule ? draft.schedule.at : "") || "")}
                onChange={(e) => setSchedule({ at: fromLocalInput(e.target.value) } as Schedule)} />
            </div>
          )}
        </div>

        <div className="atm-editor-footer">
          <button className="btn btn--ghost" onClick={onCancel}>取消</button>
          <button className="btn btn--primary" onClick={submit}>
            {initial.id ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function describeSchedule(s: Schedule): string {
  const wdNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  switch (s.type) {
    case "once": return `单次 · ${formatTime(s.at)}`;
    case "daily": return `每天 ${s.time}`;
    case "weekly": {
      if (arraysEqual(s.weekdays, [1, 2, 3, 4, 5])) return `工作日 ${s.time}`;
      return `每${s.weekdays.map((d) => wdNames[d]).join("/")} ${s.time}`;
    }
    case "monthly": return `每月 ${s.day} 日 ${s.time}`;
  }
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}

function fromLocalInput(local: string): string {
  if (!local) return new Date().toISOString();
  return new Date(local).toISOString();
}
