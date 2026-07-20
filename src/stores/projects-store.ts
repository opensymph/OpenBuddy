import { create } from "zustand";

/**
 * 本地「项目」实体存储 — 对齐 WorkBuddy 项目列表 + 项目详情页的产品语义，落地为纯前端持久化。
 *
 * WorkBuddy 的项目/计划/任务/资产/成员/配置全由云端 facade 驱动；OpenBuddy 没有该后端，
 * 故这里把项目元数据 + 详情页内部数据（指令/连接器/专家/技能/看板/任务/资产/成员）
 * 一并存进 localStorage，使详情页的本地交互（增删改、看板流转）可跨刷新保留。
 */

export interface RefItem {
  id: string;
  name: string;
  iconUrl?: string;
}

export type PlanStatus = "pending" | "in_progress" | "paused" | "completed";

export interface PlanCard {
  id: string;
  title: string;
  status: PlanStatus;
  source?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  scope: "personal" | "shared";
  source: string;
  status: PlanStatus;
}

export interface AssetItem {
  id: string;
  name: string;
  kind: "folder" | "file";
  ext?: string;
  sizeLabel?: string;
  updater?: string;
  updatedAt?: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  cwd?: string;
  templateId?: string;
  instructions?: string;
  createdAt: string;
  // 详情
  connectors: RefItem[];
  experts: RefItem[];
  skills: RefItem[];
  plans: PlanCard[];
  tasks: TaskItem[];
  assets: AssetItem[];
  members: string[];
}

/** 计划看板列定义（对齐目标截图：待开始/进行中/暂停/完成）。 */
export const PLAN_COLUMNS: { status: PlanStatus; label: string }[] = [
  { status: "pending", label: "待开始" },
  { status: "in_progress", label: "进行中" },
  { status: "paused", label: "暂停" },
  { status: "completed", label: "完成" },
];

const STORAGE_KEY = "openbuddy.projects";

/** 旧数据/外部数据补齐缺省详情字段，保证组件可直接读数组。 */
function normalize(x: unknown): ProjectMeta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Partial<ProjectMeta> & { id?: unknown; name?: unknown };
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  return {
    id: o.id,
    name: o.name,
    cwd: o.cwd,
    templateId: o.templateId,
    instructions: o.instructions,
    createdAt: o.createdAt ?? new Date().toISOString(),
    connectors: Array.isArray(o.connectors) ? o.connectors : [],
    experts: Array.isArray(o.experts) ? o.experts : [],
    skills: Array.isArray(o.skills) ? o.skills : [],
    plans: Array.isArray(o.plans) ? o.plans : [],
    tasks: Array.isArray(o.tasks) ? o.tasks : [],
    assets: Array.isArray(o.assets) ? o.assets : [],
    members: Array.isArray(o.members) ? o.members : [],
  };
}

function load(): ProjectMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(normalize).filter(Boolean) as ProjectMeta[] : [];
  } catch {
    return [];
  }
}

function save(list: ProjectMeta[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / 隐私模式 — 静默降级为仅内存 */
  }
}

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface ProjectsState {
  projects: ProjectMeta[];
  add: (p: {
    name: string;
    cwd?: string;
    templateId?: string;
    instructions?: string;
    connectors?: RefItem[];
    experts?: RefItem[];
    skills?: RefItem[];
  }) => ProjectMeta;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  updateConfig: (
    id: string,
    patch: Partial<Pick<ProjectMeta, "instructions" | "connectors" | "experts" | "skills">>,
  ) => void;
  addPlan: (id: string, title: string, status?: PlanStatus) => void;
  movePlan: (id: string, cardId: string, status: PlanStatus) => void;
  removePlan: (id: string, cardId: string) => void;
  addTask: (id: string, title: string) => void;
  removeTask: (id: string, taskId: string) => void;
  addAsset: (id: string, a: Pick<AssetItem, "name" | "kind"> & Partial<AssetItem>) => void;
  removeAsset: (id: string, assetId: string) => void;
  addMember: (id: string, name: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => {
  const patch = (id: string, fn: (p: ProjectMeta) => ProjectMeta) => {
    const next = get().projects.map((p) => (p.id === id ? fn(p) : p));
    set({ projects: next });
    save(next);
  };
  return {
    projects: load(),
    add: (p) => {
      const item: ProjectMeta = {
        id: uid("proj"),
        name: p.name,
        cwd: p.cwd || undefined,
        templateId: p.templateId || undefined,
        instructions: p.instructions || undefined,
        createdAt: new Date().toISOString(),
        connectors: p.connectors ?? [],
        experts: p.experts ?? [],
        skills: p.skills ?? [],
        plans: [],
        tasks: [],
        assets: [],
        members: [],
      };
      const next = [item, ...get().projects];
      set({ projects: next });
      save(next);
      return item;
    },
    rename: (id, name) => patch(id, (p) => ({ ...p, name })),
    remove: (id) => {
      const next = get().projects.filter((p) => p.id !== id);
      set({ projects: next });
      save(next);
    },
    updateConfig: (id, cfg) => patch(id, (p) => ({ ...p, ...cfg })),
    addPlan: (id, title, status = "pending") =>
      patch(id, (p) => ({ ...p, plans: [...p.plans, { id: uid("plan"), title, status }] })),
    movePlan: (id, cardId, status) =>
      patch(id, (p) => ({
        ...p,
        plans: p.plans.map((c) => (c.id === cardId ? { ...c, status } : c)),
      })),
    removePlan: (id, cardId) =>
      patch(id, (p) => ({ ...p, plans: p.plans.filter((c) => c.id !== cardId) })),
    addTask: (id, title) =>
      patch(id, (p) => ({
        ...p,
        tasks: [
          ...p.tasks,
          { id: uid("task"), title, scope: "personal", source: "manual", status: "pending" },
        ],
      })),
    removeTask: (id, taskId) =>
      patch(id, (p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== taskId) })),
    addAsset: (id, a) =>
      patch(id, (p) => ({
        ...p,
        assets: [
          ...p.assets,
          {
            id: uid("asset"),
            name: a.name,
            kind: a.kind,
            ext: a.ext,
            sizeLabel: a.sizeLabel,
            updater: a.updater ?? "-",
            updatedAt: a.updatedAt ?? new Date().toISOString(),
          },
        ],
      })),
    removeAsset: (id, assetId) =>
      patch(id, (p) => ({ ...p, assets: p.assets.filter((a) => a.id !== assetId) })),
    addMember: (id, name) =>
      patch(id, (p) =>
        p.members.includes(name) ? p : { ...p, members: [...p.members, name] },
      ),
  };
});
