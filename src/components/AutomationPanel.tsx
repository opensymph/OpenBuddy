/**
 * 自动化面板 - OpenBuddy 本地定时任务调度器
 *
 * WorkBuddy 的自动化依赖腾讯后端（IM 推送、企业连接器、积分）。
 * OpenBuddy 把自动化重新定义为「本地定时跑一个 grok prompt」：
 *  - 用户配置 cron-style 计划（once/daily/weekly/monthly）+ prompt
 *  - 后端 scheduler 每分钟检查，到点时新建 grok 会话发 prompt
 *  - 可选绑定 expert（agent）和 model
 *  - 结果像普通对话一样出现在侧栏
 *
 * 数据存在 ~/.grok/openbuddy-automations.json，scheduler 在 Tauri 后端跑。
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

// 推荐模板（基于 WorkBuddy i18n key 的常见自动化）
const TEMPLATES: { name: string; prompt: string; schedule: Schedule; icon: typeof ClockIcon }[] = [
  {
    name: "每日 AI 资讯",
    prompt: "帮我整理今天 AI 领域的重要新闻，按重要性排序，每条给一句话摘要和来源。",
    schedule: { type: "daily", time: "09:00" },
    icon: ClockIcon,
  },
  {
    name: "每天 5 个英语单词",
    prompt: "推荐 5 个实用的英语单词，给出释义、例句和记忆技巧。",
    schedule: { type: "daily", time: "08:00" },
    icon: ClockIcon,
  },
  {
    name: "周报模板",
    prompt: "帮我生成本周工作周报的模板，包含本周完成、下周计划、风险与求助三部分。",
    schedule: { type: "weekly", weekdays: [5], time: "17:00" },
    icon: ClockIcon,
  },
  {
    name: "睡前故事",
    prompt: "写一个适合儿童的睡前故事，主题温暖，300 字左右。",
    schedule: { type: "daily", time: "21:00" },
    icon: ClockIcon,
  },
];

export function AutomationPanel({ onToast }: AutomationPanelProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAutomations(await automationsList());
    } catch (e) {
      onToast?.(`加载自动化失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = useCallback(
    async (a: Automation) => {
      setBusy(a.id);
      try {
        await automationsToggle(a.id, a.status !== "active");
        reload();
      } catch (e) {
        onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [onToast, reload],
  );

  const handleRun = useCallback(
    async (a: Automation) => {
      setBusy(a.id);
      try {
        await automationsRun(a.id);
        onToast?.(`已触发「${a.name}」，结果将出现在侧栏`);
        reload();
      } catch (e) {
        onToast?.(`运行失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        setBusy(null);
      }
    },
    [onToast, reload],
  );

  const handleDelete = useCallback(
    async (a: Automation) => {
      if (!confirm(`确定删除自动化「${a.name}」？`)) return;
      try {
        await automationsDelete(a.id);
        onToast?.("已删除");
        reload();
      } catch (e) {
        onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reload],
  );

  const handleSave = useCallback(
    async (a: Automation) => {
      try {
        await automationsSave(a);
        onToast?.(a.id ? "已保存" : "已创建");
        setEditing(null);
        reload();
      } catch (e) {
        onToast?.(`保存失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, reload],
  );

  const filtered = automations.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  );
  const activeCount = automations.filter((a) => a.status === "active").length;

  return (
    <div className="automation-panel">
      <div className="automation-panel__header">
        <h2 className="automation-panel__title">自动化</h2>
        <div className="automation-panel__header-actions">
          <button
            className="automation-panel__action-btn"
            onClick={reload}
            disabled={loading}
            title="刷新"
          >
            <RefreshCwIcon size="sm" /> 刷新
          </button>
          <button
            className="automation-panel__create-btn"
            onClick={() =>
              setEditing({
                id: "",
                name: "",
                prompt: "",
                schedule: { type: "daily", time: "09:00" },
                status: "active",
                createdAt: "",
              })
            }
          >
            <AddCircleIcon size="sm" /> 创建自动化
          </button>
        </div>
      </div>

      <div className="automation-panel__search">
        <SearchIcon size="md" className="automation-panel__search-icon" />
        <input
          type="text"
          className="automation-panel__search-input"
          placeholder="搜索自动化…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="automation-panel__stats">
        {automations.length} 个自动化 · {activeCount} 个运行中
      </div>

      {/* 快速创建模板 */}
      {automations.length === 0 && !loading && (
        <div className="automation-panel__section">
          <h3 className="automation-panel__section-title">推荐模板</h3>
          <div className="automation-panel__templates">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.name}
                  className="automation-panel__template"
                  onClick={() =>
                    setEditing({
                      id: "",
                      name: tpl.name,
                      prompt: tpl.prompt,
                      schedule: tpl.schedule,
                      status: "active",
                      createdAt: "",
                    })
                  }
                >
                  <Icon size="md" />
                  <div>
                    <div className="automation-panel__template-name">{tpl.name}</div>
                    <div className="automation-panel__template-schedule">
                      {describeSchedule(tpl.schedule)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="automation-panel__list">
        {filtered.length === 0 && automations.length > 0 && !loading && (
          <div className="automation-panel__empty">无匹配的自动化</div>
        )}
        {filtered.map((a) => (
          <div
            key={a.id}
            className={`automation-panel__item ${
              a.status !== "active" ? "automation-panel__item--paused" : ""
            }`}
          >
            <div className="automation-panel__item-icon">
              <AgentToolIcon size="md" />
            </div>
            <div className="automation-panel__item-content">
              <div className="automation-panel__item-name">{a.name}</div>
              <div className="automation-panel__item-prompt" title={a.prompt}>
                {a.prompt}
              </div>
              <div className="automation-panel__item-meta">
                <span className="automation-panel__item-schedule">
                  <ClockIcon size="sm" /> {describeSchedule(a.schedule)}
                </span>
                {a.nextRunAt && a.status === "active" && (
                  <span className="automation-panel__item-next">
                    下次：{formatTime(a.nextRunAt)}
                  </span>
                )}
                {a.lastRunAt && (
                  <span className="automation-panel__item-last">
                    上次：{formatTime(a.lastRunAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="automation-panel__item-actions">
              <button
                className="automation-panel__icon-btn"
                onClick={() => handleRun(a)}
                disabled={busy === a.id}
                title="立即运行"
              >
                <PlayIcon size="sm" />
              </button>
              <button
                className="automation-panel__icon-btn"
                onClick={() => handleToggle(a)}
                disabled={busy === a.id}
                title={a.status === "active" ? "暂停" : "启用"}
              >
                {a.status === "active" ? <PauseIcon size="sm" /> : <PlayIcon size="sm" />}
              </button>
              <button
                className="automation-panel__icon-btn"
                onClick={() => setEditing(a)}
                title="编辑"
              >
                <EditToolIcon size="sm" />
              </button>
              <button
                className="automation-panel__icon-btn automation-panel__icon-btn--danger"
                onClick={() => handleDelete(a)}
                title="删除"
              >
                <DeleteIcon size="sm" />
              </button>
            </div>
          </div>
        ))}
        {loading && <div className="automation-panel__empty">加载中…</div>}
      </div>

      {editing && (
        <AutomationEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function AutomationEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: Automation;
  onCancel: () => void;
  onSave: (a: Automation) => void;
}) {
  const [draft, setDraft] = useState<Automation>(initial);
  const set = (patch: Partial<Automation>) => setDraft((d) => ({ ...d, ...patch }));
  const setSchedule = (patch: Partial<Schedule>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } as Schedule }));

  const submit = () => {
    if (!draft.name.trim() || !draft.prompt.trim()) {
      alert("名称和提示词不能为空");
      return;
    }
    onSave(draft);
  };

  return (
    <div className="modal-overlay automation-editor__overlay" onClick={onCancel}>
      <div className="automation-editor" onClick={(e) => e.stopPropagation()}>
        <div className="automation-editor__header">
          <h3>{initial.id ? "编辑自动化" : "创建自动化"}</h3>
          <button className="automation-editor__close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <label className="automation-editor__field">
          <span>名称</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="例如：每日代码审查"
          />
        </label>

        <label className="automation-editor__field">
          <span>提示词（到点会自动发送给 grok）</span>
          <textarea
            value={draft.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            rows={4}
            placeholder="例如：审查今天的 git 提交，给出改进建议。"
          />
        </label>

        <div className="automation-editor__row">
          <label className="automation-editor__field">
            <span>计划类型</span>
            <select
              value={draft.schedule.type}
              onChange={(e) => {
                const type = e.target.value;
                // Reset to sensible defaults when switching type.
                if (type === "once") {
                  setSchedule({ type: "once", at: new Date(Date.now() + 3600_000).toISOString() } as Schedule);
                } else if (type === "daily") {
                  setSchedule({ type: "daily", time: "09:00" } as Schedule);
                } else if (type === "weekly") {
                  setSchedule({ type: "weekly", weekdays: [1], time: "09:00" } as Schedule);
                } else if (type === "monthly") {
                  setSchedule({ type: "monthly", day: 1, time: "09:00" } as Schedule);
                }
              }}
            >
              <option value="once">单次</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </label>
          {draft.schedule.type === "once" && (
            <label className="automation-editor__field">
              <span>触发时间</span>
              <input
                type="datetime-local"
                value={toLocalInput(("at" in draft.schedule ? draft.schedule.at : "") || "")}
                onChange={(e) =>
                  setSchedule({ at: fromLocalInput(e.target.value) } as Schedule)
                }
              />
            </label>
          )}
          {(draft.schedule.type === "daily" ||
            draft.schedule.type === "weekly" ||
            draft.schedule.type === "monthly") && (
            <label className="automation-editor__field">
              <span>时间 (HH:MM)</span>
              <input
                type="time"
                value={"time" in draft.schedule ? draft.schedule.time : "09:00"}
                onChange={(e) => setSchedule({ time: e.target.value } as Schedule)}
              />
            </label>
          )}
          {draft.schedule.type === "weekly" && (
            <label className="automation-editor__field automation-editor__field--wide">
              <span>星期（0=周日, 6=周六）</span>
              <div className="automation-editor__weekdays">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const days = "weekdays" in draft.schedule ? draft.schedule.weekdays : [];
                  const checked = days.includes(d);
                  return (
                    <label key={d} className="automation-editor__weekday">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...days, d].sort()
                            : days.filter((x) => x !== d);
                          setSchedule({ weekdays: next } as Schedule);
                        }}
                      />
                      {["日", "一", "二", "三", "四", "五", "六"][d]}
                    </label>
                  );
                })}
              </div>
            </label>
          )}
          {draft.schedule.type === "monthly" && (
            <label className="automation-editor__field">
              <span>日期（1-31）</span>
              <input
                type="number"
                min={1}
                max={31}
                value={"day" in draft.schedule ? draft.schedule.day : 1}
                onChange={(e) =>
                  setSchedule({ day: Math.max(1, Math.min(31, Number(e.target.value))) } as Schedule)
                }
              />
            </label>
          )}
        </div>

        <div className="automation-editor__footer">
          <button className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn--primary" onClick={submit}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function describeSchedule(s: Schedule): string {
  const wdNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  switch (s.type) {
    case "once":
      return `单次 · ${formatTime(s.at)}`;
    case "daily":
      return `每天 ${s.time}`;
    case "weekly":
      return `每${s.weekdays.map((d) => wdNames[d]).join("/")} ${s.time}`;
    case "monthly":
      return `每月 ${s.day} 日 ${s.time}`;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalInput(local: string): string {
  if (!local) return new Date().toISOString();
  return new Date(local).toISOString();
}
