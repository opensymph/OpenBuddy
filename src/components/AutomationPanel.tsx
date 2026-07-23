/**
 * 自动化面板 — 1:1 复刻 WorkBuddy automation-panel/index.tsx。
 *
 * 三态（对应截图 1-3）：
 *  1. 定时任务：顶部 Segmented 页签；空态 hero（闹钟图标 + 「开启你的第一个自动化任务吧」
 *     + 「+ 添加自动化」）+「自动化任务模版」12 模板网格；有任务时按 当前/已暂停 分组列表。
 *  2. 添加/编辑：全页表单（AutomationEditPage）。
 *  3. 运行记录：空态（暂无运行记录）/ 按 今天·昨天·周X 分组的记录列表 + 状态筛选。
 *
 * 数据：automations_snapshot（本地 JSON 存储 + 进程内调度器）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddIcon,
  AlarmClockIcon,
  ArchiveIcon,
  AtmAddFromTemplateIcon,
  AtmBatchManageIcon,
  AutomationEmptyAlarmIcon,
  AutomationEmptyRecordsIcon,
  CheckBoldIcon,
  CheckIcon,
  ChevronDownIcon,
  CirclePauseIcon,
  DeleteIcon,
  ErrorCircleIcon,
  MoreDotsIcon,
  PlayIcon,
  ResumeCircleIcon,
  RunningStatusIcon,
  SearchIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsList,
  automationRecordsArchive,
  automationRecordsDelete,
  automationsDelete,
  automationsRun,
  automationsSave,
  automationsSetStatus,
  automationsSnapshot,
  grokListWorkspaces,
  mcpList,
  providersList,
  flattenModels,
  skillsList,
  type WorkspaceInfo,
} from "@/lib/grok-client";
import type {
  AgentEntry,
  Automation,
  AutomationRunRecord,
  AutomationSnapshot,
  AutomationStatus,
  SkillInfo,
} from "@/lib/types";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "./automation/template-config";
import {
  DAY_LABELS,
  automationFromDraft,
  buildDraft,
  describeSchedule,
  describeValidity,
  draftFromAutomation,
  formatRunTime,
  scheduledAtIso,
  startsInLabel,
  validateDraft,
  type AutomationDraft,
} from "./automation/schedule-utils";
import { Checkbox, Segmented } from "./automation/controls";
import { AutomationTemplateGrid } from "./automation/AutomationTemplateGrid";
import { AutomationEditPage, type ModelOption } from "./automation/AutomationEditPage";
import { AutomationPermissionConfirmDialog } from "./automation/AutomationPermissionConfirmDialog";
import { usePermissionConfirm } from "./automation/usePermissionConfirm";
import type { ConnectorOption } from "./automation/ConnectorSelector";

interface AutomationPanelProps {
  onToast?: (msg: string) => void;
  onNavigate?: (label: string) => void;
}

type TabKey = "tasks" | "records";
type RecordFilter = "all" | "success" | "failed" | "running" | "archived";

const RECORD_FILTERS: { key: RecordFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "success", label: "成功" },
  { key: "failed", label: "失败" },
  { key: "running", label: "运行中" },
  { key: "archived", label: "已归档" },
];

function recordStatusLabel(item: AutomationRunRecord): string {
  if (item.status === "running") return "运行中";
  if (item.status === "success") return "成功";
  if (item.status === "failed") return "失败";
  return item.status;
}

function RecordStatusIcon({ item }: { item: AutomationRunRecord }) {
  if (item.status === "running") {
    return (
      <span className="atm-status-icon-spinning" style={{ display: "inline-flex" }}>
        <RunningStatusIcon size={16} color="#00C29A" />
      </span>
    );
  }
  if (item.status === "success") return <CheckBoldIcon size={16} color="var(--wb-color-text-disabled, #000)" />;
  if (item.status === "failed") return <ErrorCircleIcon size={16} />;
  return <CheckIcon size={16} />;
}

/** 通用确认弹窗（替代 WB 的 Modal.confirm）。 */
function ConfirmDialog({
  title,
  content,
  okText,
  danger,
  onOk,
  onCancel,
}: {
  title: string;
  content: string;
  okText: string;
  danger?: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="atm-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="atm-confirm-title">{title}</h3>
        <p className="atm-confirm-content">{content}</p>
        <div className="atm-confirm-actions">
          <button type="button" className="atm-btn atm-btn--secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className={`atm-btn ${danger ? "atm-btn--danger" : "atm-btn--primary"}`} onClick={onOk}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationPanel({ onToast, onNavigate }: AutomationPanelProps) {
  // ---------- 数据 ----------
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("tasks");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<RecordFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [archivedGroupOpen, setArchivedGroupOpen] = useState(true);
  const [showTemplatePage, setShowTemplatePage] = useState(false);

  // ---------- 编辑态 ----------
  const [isCreating, setIsCreating] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [draft, setDraft] = useState<AutomationDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // ---------- 引用数据（工作空间/模型/技能/专家/连接器） ----------
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [experts, setExperts] = useState<AgentEntry[]>([]);
  const [connectors, setConnectors] = useState<ConnectorOption[]>([]);

  // ---------- 确认弹窗 ----------
  const [confirmState, setConfirmState] = useState<{
    title: string;
    content: string;
    okText: string;
    action: () => Promise<void>;
  } | null>(null);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        setSnapshot(await automationsSnapshot());
      } catch (e) {
        onToast?.(`加载自动化数据失败：${String(e).replace(/^Error:\s*/, "")}`);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onToast],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    grokListWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]));
    providersList()
      .then((list) => setModels(flattenModels(list)))
      .catch(() => setModels([]));
    skillsList().then(setSkills).catch(() => setSkills([]));
    agentsList().then(setExperts).catch(() => setExperts([]));
    mcpList()
      .then((list) =>
        setConnectors(
          list.map((c) => ({ id: c.name, name: c.name, connected: c.enabled })),
        ),
      )
      .catch(() => setConnectors([]));
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // ---------- 创建 / 编辑 ----------
  const handleCreate = useCallback((template?: AutomationTemplate) => {
    setIsCreating(true);
    setEditingAutomation(null);
    setDraft(buildDraft(template));
    setShowTemplatePage(false);
  }, []);

  const handleEdit = useCallback((automation: Automation) => {
    setIsCreating(false);
    setEditingAutomation(automation);
    setDraft(draftFromAutomation(automation));
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsCreating(false);
    setEditingAutomation(null);
    setDraft(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const message = validateDraft(draft, {
      isCreating,
      existingScheduledAt: editingAutomation
        ? scheduledAtIso({
            scheduledDate: editingAutomation.scheduledDate,
            scheduledTime: editingAutomation.scheduledTime,
          })
        : undefined,
    });
    if (message) {
      onToast?.(message);
      return;
    }
    setSaving(true);
    try {
      await automationsSave(automationFromDraft(draft, editingAutomation ?? undefined));
      handleCloseModal();
      await refresh(true);
      onToast?.("自动化任务已保存");
    } catch (e) {
      onToast?.(`保存自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setSaving(false);
    }
  }, [draft, isCreating, editingAutomation, handleCloseModal, onToast, refresh]);

  const handleFallbackToDefault = useCallback(() => {
    setDraft((current) => (current ? { ...current, permissionMode: "default" } : current));
  }, []);

  const {
    showConfirmDialog: showPermissionConfirm,
    requestSubmit: requestSaveWithPermissionCheck,
    requestAction: requestActionWithPermissionCheck,
    handleConfirm: handlePermissionConfirm,
    handleCancel: handlePermissionCancel,
    handleFallbackToDefault: handlePermissionFallback,
  } = usePermissionConfirm({
    currentMode: draft?.permissionMode ?? "fullAccess",
    initialMode: editingAutomation?.permissionMode ?? (editingAutomation ? "fullAccess" : undefined),
    onConfirmedSubmit: handleSave,
    onFallbackToDefault: handleFallbackToDefault,
  });

  const handleDelete = useCallback(() => {
    if (!editingAutomation) return;
    const name = editingAutomation.name;
    const id = editingAutomation.id;
    setConfirmState({
      title: `删除 ${name}？`,
      content: "此操作将永久删除该自动化任务并停止所有后续运行。",
      okText: "删除自动化任务",
      action: async () => {
        try {
          await automationsDelete(id);
          handleCloseModal();
          await refresh(true);
          onToast?.("自动化任务已删除");
        } catch (e) {
          onToast?.(`删除自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
        }
      },
    });
  }, [editingAutomation, handleCloseModal, onToast, refresh]);

  const handleRowDelete = useCallback(
    (automationId: string) => {
      const name = snapshot?.automations.find((a) => a.id === automationId)?.name || "";
      setConfirmState({
        title: `删除 ${name}？`,
        content: "此操作将永久删除该自动化任务并停止所有后续运行。",
        okText: "删除自动化任务",
        action: async () => {
          try {
            await automationsDelete(automationId);
            await refresh(true);
            onToast?.("自动化任务已删除");
          } catch (e) {
            onToast?.(`删除自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
          }
        },
      });
    },
    [snapshot, onToast, refresh],
  );

  const handleTogglePause = useCallback(
    async (automationId: string, currentStatus: AutomationStatus) => {
      const next: AutomationStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
      try {
        await automationsSetStatus(automationId, next);
        await refresh(true);
      } catch (e) {
        onToast?.(`保存自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, refresh],
  );

  const handleRunTest = useCallback(
    async (automationId: string) => {
      try {
        await automationsRun(automationId);
        onToast?.("已触发测试运行。测试运行不会影响正式调度时间。");
        await refresh(true);
      } catch (e) {
        onToast?.(`触发测试运行失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, refresh],
  );

  const handleTest = useCallback(() => {
    if (!editingAutomation || !draft || saving) return;
    const message = validateDraft(draft, { isCreating: false });
    if (message) {
      onToast?.(message);
      return;
    }
    requestActionWithPermissionCheck(() => {
      void (async () => {
        setSaving(true);
        try {
          await automationsSave(automationFromDraft(draft, editingAutomation));
          await handleRunTest(editingAutomation.id);
        } finally {
          setSaving(false);
        }
      })();
    });
  }, [editingAutomation, draft, saving, onToast, requestActionWithPermissionCheck, handleRunTest]);

  // ---------- 运行记录 ----------
  const handleArchiveRecord = useCallback(
    async (itemId: string) => {
      try {
        await automationRecordsArchive(itemId, true);
        await refresh(true);
        onToast?.("已归档");
      } catch (e) {
        onToast?.(`保存自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
      }
    },
    [onToast, refresh],
  );

  const handleDeleteRecord = useCallback(
    (itemId: string) => {
      setConfirmState({
        title: "删除该条运行记录？",
        content: "此操作将永久删除该条运行记录。",
        okText: "删除",
        action: async () => {
          try {
            await automationRecordsDelete(itemId);
            await refresh(true);
          } catch (e) {
            onToast?.(`删除自动化任务失败：${String(e).replace(/^Error:\s*/, "")}`);
          }
        },
      });
    },
    [onToast, refresh],
  );

  // ---------- 批量管理 ----------
  const handleToggleBatchMode = useCallback(() => {
    setIsBatchMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const ids = new Set(selectedIds);
    setConfirmState({
      title: `删除选中的 ${ids.size} 个任务？`,
      content: "此操作将永久删除选中的自动化任务并停止其所有后续运行。",
      okText: "删除",
      action: async () => {
        let failed = 0;
        for (const id of ids) {
          try {
            await automationsDelete(id);
          } catch {
            failed += 1;
          }
        }
        setSelectedIds(new Set());
        setIsBatchMode(false);
        if (failed === 0) onToast?.("自动化任务已删除");
        else onToast?.("删除自动化任务失败");
        await refresh(true);
      },
    });
  }, [selectedIds, onToast, refresh]);

  // ---------- 派生数据 ----------
  const scheduledAutomations = useMemo(
    () => snapshot?.automations.filter((a) => a.status === "ACTIVE") ?? [],
    [snapshot],
  );
  const pausedAutomations = useMemo(
    () => snapshot?.automations.filter((a) => a.status === "PAUSED") ?? [],
    [snapshot],
  );
  const automationById = useMemo(
    () => new Map((snapshot?.automations ?? []).map((a) => [a.id, a])),
    [snapshot],
  );
  const { completedItems, archivedItems } = useMemo(() => {
    const completed: AutomationRunRecord[] = [];
    const archived: AutomationRunRecord[] = [];
    for (const item of snapshot?.records ?? []) {
      if (item.archived) archived.push(item);
      else completed.push(item);
    }
    return { completedItems: completed, archivedItems: archived };
  }, [snapshot]);

  const query = searchQuery.trim().toLowerCase();
  const filteredScheduled = useMemo(
    () => (query ? scheduledAutomations.filter((a) => a.name.toLowerCase().includes(query)) : scheduledAutomations),
    [scheduledAutomations, query],
  );
  const filteredPaused = useMemo(
    () => (query ? pausedAutomations.filter((a) => a.name.toLowerCase().includes(query)) : pausedAutomations),
    [pausedAutomations, query],
  );
  const filteredRecords = useMemo(() => {
    let items = [...completedItems, ...archivedItems];
    if (filterStatus === "success") items = items.filter((i) => i.status === "success" && !i.archived);
    else if (filterStatus === "failed") items = items.filter((i) => i.status === "failed" && !i.archived);
    else if (filterStatus === "running") items = items.filter((i) => i.status === "running" && !i.archived);
    else if (filterStatus === "archived") items = items.filter((i) => i.archived);
    if (query) {
      items = items.filter((i) =>
        (automationById.get(i.automationId)?.name || i.automationName || "").toLowerCase().includes(query),
      );
    }
    return items;
  }, [completedItems, archivedItems, filterStatus, query, automationById]);

  const groupedRecords = useMemo(() => {
    const groups: { label: string; items: AutomationRunRecord[] }[] = [];
    const groupMap = new Map<string, AutomationRunRecord[]>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 864e5);
    const weekdayByJsDay = [DAY_LABELS.SU, DAY_LABELS.MO, DAY_LABELS.TU, DAY_LABELS.WE, DAY_LABELS.TH, DAY_LABELS.FR, DAY_LABELS.SA];
    const sorted = [...filteredRecords].sort(
      (a, b) => Date.parse(b.finishedAt || b.startedAt) - Date.parse(a.finishedAt || a.startedAt),
    );
    for (const item of sorted) {
      if (item.archived) continue;
      const date = new Date(item.finishedAt || item.startedAt);
      const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      let label: string;
      if (dateDay.getTime() === today.getTime()) label = "今天";
      else if (dateDay.getTime() === yesterday.getTime()) label = "昨天";
      else label = `${weekdayByJsDay[date.getDay()]} (${date.getMonth() + 1}/${date.getDate()})`;
      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label)!.push(item);
    }
    for (const [label, items] of groupMap) groups.push({ label, items });
    return groups;
  }, [filteredRecords]);

  const archivedRecords = useMemo(() => filteredRecords.filter((i) => i.archived), [filteredRecords]);

  const showDefaultTemplateGrid =
    !!snapshot &&
    scheduledAutomations.length === 0 &&
    pausedAutomations.length === 0 &&
    completedItems.length === 0 &&
    archivedItems.length === 0;
  const showTemplateEntryButton = !showDefaultTemplateGrid && !showTemplatePage;
  const allTasksEmpty = scheduledAutomations.length === 0 && pausedAutomations.length === 0;
  const allRecordsEmpty = completedItems.length === 0 && archivedItems.length === 0;
  const isToolbarRightHidden =
    (!showTemplatePage && activeTab === "tasks" && allTasksEmpty && showDefaultTemplateGrid) ||
    (!showTemplatePage && activeTab === "records" && allRecordsEmpty);

  // ============================================================
  // 编辑态渲染（截图 2）
  // ============================================================
  if ((editingAutomation || isCreating) && draft) {
    return (
      <div className="automation-panel code-buddy-automation">
        <AutomationEditPage
          mode={isCreating ? "create" : "edit"}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          workspaces={workspaces}
          models={models}
          skills={skills}
          experts={experts}
          connectors={connectors}
          records={
            editingAutomation
              ? (snapshot?.records ?? []).filter((r) => r.automationId === editingAutomation.id)
              : []
          }
          createdAt={editingAutomation?.createdAt}
          onSave={requestSaveWithPermissionCheck}
          onClose={handleCloseModal}
          onTest={isCreating ? undefined : handleTest}
          onDelete={isCreating ? undefined : handleDelete}
          onOpenConnectorSettings={() => onNavigate?.("专家·技能·连接器")}
          onArchiveRecord={handleArchiveRecord}
          onDeleteRecord={handleDeleteRecord}
        />
        <AutomationPermissionConfirmDialog
          open={showPermissionConfirm}
          onConfirm={handlePermissionConfirm}
          onCancel={handlePermissionCancel}
          onFallbackToDefault={handlePermissionFallback}
        />
        {confirmState && (
          <ConfirmDialog
            title={confirmState.title}
            content={confirmState.content}
            okText={confirmState.okText}
            danger
            onOk={() => {
              const action = confirmState.action;
              setConfirmState(null);
              void action();
            }}
            onCancel={() => setConfirmState(null)}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // 列表态渲染（截图 1 / 3）
  // ============================================================
  return (
    <div className="automation-panel code-buddy-automation">
      {/* ---------- 工具栏(顶部拖拽条,Tauri 2 需 data-tauri-drag-region) ---------- */}
      {showTemplatePage ? (
        <div className="atm-toolbar atm-toolbar--breadcrumb" data-tauri-drag-region>
          <div className="atm-toolbar-left">
            <div className="atm-detail-breadcrumb">
              <span className="atm-detail-status-icon">
                <AlarmClockIcon className="atm-task-status-icon atm-task-status-icon--scheduled" />
              </span>
              <button type="button" className="atm-detail-breadcrumb-link" onClick={() => setShowTemplatePage(false)}>
                自动化
              </button>
              <span className="atm-detail-breadcrumb-sep">/</span>
              <span className="atm-detail-breadcrumb-current">从模版添加</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="atm-toolbar" data-tauri-drag-region>
          <div className="atm-toolbar-left">
            {isBatchMode ? (
              <div className="atm-batch-info">
                <button
                  type="button"
                  className="atm-batch-action"
                  onClick={() => {
                    const allIds = [...scheduledAutomations, ...pausedAutomations].map((a) => a.id);
                    setSelectedIds((prev) =>
                      allIds.length > 0 && prev.size === allIds.length ? new Set() : new Set(allIds),
                    );
                  }}
                >
                  {selectedIds.size > 0 && selectedIds.size === scheduledAutomations.length + pausedAutomations.length
                    ? "取消"
                    : "全选"}
                </button>
                <button
                  type="button"
                  className="atm-batch-action atm-batch-delete"
                  disabled={selectedIds.size === 0}
                  onClick={handleBatchDelete}
                >
                  删除
                </button>
                <span className="atm-batch-count">
                  已选择<span className="atm-batch-count-num">{selectedIds.size}</span>项
                </span>
              </div>
            ) : (
              <Segmented
                className="atm-tabs"
                value={activeTab}
                onChange={(v) => setActiveTab(v as TabKey)}
                options={[
                  { value: "tasks", label: "定时任务" },
                  { value: "records", label: "运行记录" },
                ]}
              />
            )}
          </div>
          <div className="atm-toolbar-right">
            {isBatchMode ? (
              <button type="button" className="atm-toolbar-btn" onClick={handleToggleBatchMode}>
                退出管理
              </button>
            ) : isToolbarRightHidden ? null : (
              <>
                {activeTab === "records" && (
                  <div className="atm-filter-wrap" ref={filterRef}>
                    <button
                      type="button"
                      className={`atm-filter-btn${filterStatus !== "all" ? " atm-filter-btn--active" : ""}`}
                      onClick={() => setFilterOpen((v) => !v)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ color: "var(--wb-palette-black-70)" }}>
                        <path d="M2 4h12M4.5 8h7M6.5 12h3" />
                      </svg>
                      {filterStatus !== "all" && <span className="atm-filter-dot" />}
                    </button>
                    {filterOpen && (
                      <div className="atm-filter-menu atm-filter-menu--right">
                        {RECORD_FILTERS.map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            className={`atm-chip-option${filterStatus === f.key ? " active" : ""}`}
                            onClick={() => {
                              setFilterStatus(f.key);
                              setFilterOpen(false);
                            }}
                          >
                            <span className="atm-chip-option-check">{filterStatus === f.key && <CheckIcon size="sm" />}</span>
                            <span>{f.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="atm-search-input">
                  <SearchIcon size="sm" className="atm-search-input-icon" />
                  <input
                    type="text"
                    placeholder="搜索自动化/记录"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {activeTab === "tasks" && (
                  <>
                    <button type="button" className="atm-toolbar-btn" onClick={handleToggleBatchMode}>
                      <AtmBatchManageIcon />
                      <span>批量管理</span>
                    </button>
                    {showTemplateEntryButton && (
                      <button type="button" className="atm-toolbar-btn" onClick={() => setShowTemplatePage(true)}>
                        <AtmAddFromTemplateIcon />
                        <span>从模版添加</span>
                      </button>
                    )}
                    <button type="button" className="atm-create-btn" onClick={() => handleCreate()}>
                      <AddIcon />
                      <span>添加自动化</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- 内容 ---------- */}
      {loading && !snapshot ? (
        <div className="atm-panel-empty">加载中…</div>
      ) : showTemplatePage ? (
        <div className="atm-template-page">
          <AutomationTemplateGrid templates={AUTOMATION_TEMPLATES} onSelectTemplate={handleCreate} />
        </div>
      ) : activeTab === "tasks" ? (
        allTasksEmpty && showDefaultTemplateGrid ? (
          /* 截图 1：空态 hero + 模板网格 */
          <div className="atm-empty-state">
            <div className="atm-empty-state-hero">
              <div className="atm-empty-state-icon">
                <AutomationEmptyAlarmIcon width={48} height={48} />
              </div>
              <div className="atm-empty-state-text">开启你的第一个自动化任务吧</div>
              <div className="atm-empty-state-actions">
                <button type="button" className="atm-empty-action-btn" onClick={() => handleCreate()}>
                  + 添加自动化
                </button>
              </div>
            </div>
            <div className="atm-empty-state-templates">
              <div className="atm-empty-state-templates-title">自动化任务模版</div>
              <AutomationTemplateGrid templates={AUTOMATION_TEMPLATES} onSelectTemplate={handleCreate} />
            </div>
          </div>
        ) : (
          /* 任务列表：当前 / 已暂停 */
          <div className="atm-task-list">
            {filteredScheduled.length > 0 && <div className="atm-task-group-label">当前</div>}
            {filteredScheduled.map((automation) => (
              <AutomationRow
                key={automation.id}
                automation={automation}
                isBatchMode={isBatchMode}
                isSelected={selectedIds.has(automation.id)}
                onEdit={handleEdit}
                onRunTest={handleRunTest}
                onTogglePause={handleTogglePause}
                onDelete={handleRowDelete}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            ))}
            {filteredPaused.length > 0 && <div className="atm-task-group-label">已暂停</div>}
            {filteredPaused.map((automation) => (
              <AutomationRow
                key={automation.id}
                automation={automation}
                isBatchMode={isBatchMode}
                isSelected={selectedIds.has(automation.id)}
                onEdit={handleEdit}
                onRunTest={handleRunTest}
                onTogglePause={handleTogglePause}
                onDelete={handleRowDelete}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            ))}
            {(filteredScheduled.length === 0 && filteredPaused.length === 0) && (
              <div className="atm-panel-empty">没有匹配的自动化</div>
            )}
          </div>
        )
      ) : allRecordsEmpty || filteredRecords.length === 0 ? (
        /* 截图 3：运行记录空态 */
        <div className="atm-empty-state atm-empty-state--records">
          <div className="atm-empty-state-hero">
            <div className="atm-empty-state-icon">
              <AutomationEmptyRecordsIcon width={48} height={48} />
            </div>
            <div className="atm-empty-state-text">{allRecordsEmpty ? "暂无运行记录" : "没有匹配的记录"}</div>
          </div>
        </div>
      ) : (
        /* 运行记录列表 */
        <div className="atm-records-list">
          {groupedRecords.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label);
            return (
              <div className="atm-records-group" key={group.label}>
                <div
                  className="atm-records-group-label"
                  onClick={() =>
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.label)) next.delete(group.label);
                      else next.add(group.label);
                      return next;
                    })
                  }
                >
                  {group.label}
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className={`atm-records-group-chevron${isCollapsed ? " atm-records-group-chevron--collapsed" : ""}`}
                  />
                </div>
                {!isCollapsed &&
                  group.items.map((item) => (
                    <InboxRow
                      key={item.id}
                      item={item}
                      onArchive={handleArchiveRecord}
                      onDelete={handleDeleteRecord}
                    />
                  ))}
              </div>
            );
          })}
          {archivedRecords.length > 0 && (
            <div className="atm-records-group atm-records-group--archived">
              <div className="atm-records-group-label" onClick={() => setArchivedGroupOpen((v) => !v)}>
                已归档
                <ChevronDownIcon
                  width={14}
                  height={14}
                  className={`atm-records-group-chevron${archivedGroupOpen ? "" : " atm-records-group-chevron--collapsed"}`}
                />
              </div>
              {archivedGroupOpen &&
                archivedRecords.map((item) => (
                  <InboxRow key={item.id} item={item} archived onArchive={handleArchiveRecord} onDelete={handleDeleteRecord} />
                ))}
            </div>
          )}
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          content={confirmState.content}
          okText={confirmState.okText}
          danger
          onOk={() => {
            const action = confirmState.action;
            setConfirmState(null);
            void action();
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// AutomationRow — 任务行（复刻 WB AutomationRow）
// ============================================================

function AutomationRow({
  automation,
  isBatchMode,
  isSelected,
  onEdit,
  onRunTest,
  onTogglePause,
  onDelete,
  onToggleSelect,
}: {
  automation: Automation;
  isBatchMode: boolean;
  isSelected: boolean;
  onEdit: (a: Automation) => void;
  onRunTest: (id: string) => void;
  onTogglePause: (id: string, status: AutomationStatus) => void;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = automation.status === "ACTIVE";
  const scheduleDesc = describeSchedule(automation);
  const validityDesc = describeValidity(automation);
  const projectNames = automation.cwds
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((p) => p.split(/[\\/]/).filter(Boolean).pop() || p);
  const nextLabel = startsInLabel(automation.nextRunAt);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      className={`atm-row${isBatchMode ? " atm-row--batch" : ""}${menuOpen ? " atm-row--menu-open" : ""}`}
      onClick={() => (isBatchMode ? onToggleSelect(automation.id) : onEdit(automation))}
    >
      <div className="atm-row-left">
        {isBatchMode && (
          <span className="atm-row-leading">
            <Checkbox className="atm-row-checkbox" checked={!!isSelected} />
          </span>
        )}
        <div className="atm-row-content">
          <div className="atm-row-main">
            <span className="atm-row-name">{automation.name}</span>
          </div>
          <div className="atm-row-meta">
            {projectNames.map((name) => (
              <span className="atm-row-project" title={name} key={`${automation.id}-${name}`}>
                {name}
              </span>
            ))}
            {scheduleDesc && (
              <span className="atm-row-schedule" title={scheduleDesc}>
                {scheduleDesc}
              </span>
            )}
            {validityDesc && (
              <span className="atm-row-validity" title={validityDesc}>
                {validityDesc}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="atm-row-right">
        <span className="atm-row-right-text">
          {isActive && nextLabel ? (
            <span className="atm-row-next">{nextLabel}</span>
          ) : !isActive ? (
            <span className="atm-row-paused-label">已暂停</span>
          ) : (
            <span className="atm-row-paused-label">暂无后续执行</span>
          )}
        </span>
        {!isBatchMode && (
          <div className="atm-row-hover-actions">
            <button
              type="button"
              className="atm-row-action-btn"
              title="测试运行"
              onClick={(e) => {
                e.stopPropagation();
                onRunTest(automation.id);
              }}
            >
              <PlayIcon width={16} height={16} />
            </button>
            <div className="atm-row-menu-wrap" ref={menuRef}>
              <span
                className="atm-row-more-hint"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
              >
                <MoreDotsIcon width={16} height={16} />
              </span>
              {menuOpen && (
                <div className="atm-row-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="atm-row-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onTogglePause(automation.id, automation.status);
                    }}
                  >
                    {isActive ? <CirclePauseIcon width={14} height={14} /> : <ResumeCircleIcon width={14} height={14} />}
                    <span>{isActive ? "暂停" : "恢复"}</span>
                  </button>
                  <button
                    type="button"
                    className="atm-row-menu-item atm-row-menu-item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(automation.id);
                    }}
                  >
                    <DeleteIcon width={14} height={14} />
                    <span>删除</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// InboxRow — 运行记录行（复刻 WB InboxRow）
// ============================================================

function InboxRow({
  item,
  archived = false,
  onArchive,
  onDelete,
}: {
  item: AutomationRunRecord;
  archived?: boolean;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isRunning = item.status === "running";
  const date = new Date(item.finishedAt || item.startedAt);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateTime = `${formatRunTime(item.finishedAt || item.startedAt)}`;

  return (
    <div className={`atm-row atm-inbox-row${archived ? " atm-archived" : ""}${isRunning ? " atm-inbox-row--running" : ""}`}>
      <div className="atm-row-left">
        <div className="atm-row-content">
          <div className="atm-row-main atm-row-main-inbox">
            <span className="atm-row-name">{item.automationName}</span>
          </div>
          <span className="atm-row-result-label" title={recordStatusLabel(item)}>
            {recordStatusLabel(item)}
          </span>
        </div>
      </div>
      <div className="atm-row-right">
        <span className="atm-row-right-text">
          <span className="atm-row-time">{archived ? dateTime : time}</span>
          {archived ? (
            <ArchiveIcon size={16} color="var(--wb-color-text-disabled, #000)" />
          ) : (
            <RecordStatusIcon item={item} />
          )}
        </span>
        {!isRunning && (
          <div className="atm-row-hover-actions">
            {!archived && (
              <button
                type="button"
                className="atm-row-archive-btn"
                title="归档"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(item.id);
                }}
              >
                <ArchiveIcon width={14} height={14} />
              </button>
            )}
            <button
              type="button"
              className="atm-row-delete-btn"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
            >
              <DeleteIcon width={14} height={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
