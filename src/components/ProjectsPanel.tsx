/**
 * 项目面板 — 对齐 WorkBuddy 项目列表页 + 新建项目弹窗。
 *
 *  - hero: 标题「项目」+ 副标题 + 「新建项目」+ 协作插画
 *  - 我的项目: 搜索 + 卡片网格（点击进入详情）
 *  - 从模版创建: 业务模板卡片
 *  - CreateProjectDialog: 对齐目标截图（项目名称 + 指令[选择模板] + 连接器/专家/技能 +添加 + 取消/确定）
 *  - 内部 openId 切换 列表 / ProjectDetailView（无需改 App 路由）
 */
import { useEffect, useRef, useState } from "react";
import { AddIcon, SearchIcon, MoreDotsIcon, ChevronDownIcon } from "@/foundation/components/Icon/icons";
import heroImg from "@/assets/landing-hero.png";
import { useProjectsStore, type ProjectMeta, type RefItem } from "@/stores/projects-store";
import {
  TEMPLATE_OPTIONS,
  getTemplate,
  ConfigRow,
  RefPickerDialog,
  useOutsideClose,
  PICKER_OPTIONS,
} from "./project-picker";
import { ProjectDetailView } from "./ProjectDetailView";

interface ProjectsPanelProps {
  cwd?: string;
  onSelectWorkspace?: (cwd: string) => void;
  onToast?: (msg: string) => void;
  onStartProject?: (project: ProjectMeta) => void;
}

const FROM_TEMPLATES = TEMPLATE_OPTIONS.filter((t) => t.id !== "custom");

export function ProjectsPanel({ onToast }: ProjectsPanelProps) {
  const projects = useProjectsStore((s) => s.projects);
  const rename = useProjectsStore((s) => s.rename);
  const remove = useProjectsStore((s) => s.remove);
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState<CreatePreset | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const openProject = projects.find((p) => p.id === openId) ?? null;
  if (openProject) {
    return <ProjectDetailView project={openProject} onBack={() => setOpenId(null)} onToast={onToast} />;
  }

  const handleRename = (p: ProjectMeta) => {
    const next = window.prompt("重命名项目", p.name);
    if (next && next.trim() && next.trim() !== p.name) rename(p.id, next.trim());
  };
  const handleDelete = (p: ProjectMeta) => {
    if (window.confirm(`确定删除项目「${p.name}」？`)) {
      remove(p.id);
      onToast?.("已删除项目");
    }
  };

  return (
    <div className="project-page">
      <section className="project-hero">
        <div className="project-hero__text">
          <h1 className="project-hero__title">项目</h1>
          <p className="project-hero__subtitle">多人协同，打造超级团队</p>
          <button type="button" className="project-hero__create" onClick={() => setCreate({})}>
            <AddIcon size="sm" />
            <span>新建项目</span>
          </button>
        </div>
        <img className="project-hero__art" src={heroImg} alt="多人协同插画" draggable={false} />
      </section>

      <section className="project-section">
        <div className="project-section__head">
          <h3 className="project-section__title">我的项目</h3>
          <div className="project-search">
            <SearchIcon size="sm" className="project-search__icon" />
            <input
              type="text"
              className="project-search__input"
              placeholder="搜索项目"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="project-grid-empty">
            {projects.length === 0
              ? "还没有项目，点击「新建项目」或从下方模版创建。"
              : "没有匹配的项目。"}
          </div>
        ) : (
          <div className="project-grid">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEnter={() => setOpenId(p.id)}
                onRename={() => handleRename(p)}
                onDelete={() => handleDelete(p)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="project-section">
        <div className="project-section__head">
          <h3 className="project-section__title">从模版创建</h3>
        </div>
        <div className="project-grid">
          {FROM_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="project-card2"
              onClick={() => setCreate({ templateId: t.id })}
            >
              <span className="project-card2__glyph">
                <ProjectGlyph />
              </span>
              <span className="project-card2__body">
                <span className="project-card2__name">{t.title}</span>
                <span className="project-card2__desc">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {create && (
        <CreateProjectDialog
          preset={create}
          onCancel={() => setCreate(null)}
          onConfirm={(saved) => {
            setCreate(null);
            setOpenId(saved.id);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Project Card
// ============================================================

function ProjectCard({
  project, onEnter, onRename, onDelete,
}: {
  project: ProjectMeta;
  onEnter: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  return (
    <div className="project-card2" ref={ref}>
      <div className="project-card2__main" onClick={onEnter}>
        <span className="project-card2__glyph"><ProjectGlyph /></span>
        <span className="project-card2__body">
          <span className="project-card2__name">{project.name}</span>
          <span className="project-card2__sub">{addedLabel(project.createdAt)}</span>
        </span>
      </div>
      <div className="project-card2__more-wrap">
        <button
          type="button"
          className="project-card2__more"
          aria-label="更多操作"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        >
          <MoreDotsIcon size="sm" />
        </button>
        {menuOpen && (
          <div className="project-card2__menu" onClick={(e) => e.stopPropagation()}>
            <button className="project-card2__menu-item" onClick={() => { setMenuOpen(false); onEnter(); }}>进入项目</button>
            <button className="project-card2__menu-item" onClick={() => { setMenuOpen(false); onRename(); }}>重命名</button>
            <div className="project-card2__menu-sep" />
            <button className="project-card2__menu-item project-card2__menu-item--danger" onClick={() => { setMenuOpen(false); onDelete(); }}>删除</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Create Project Dialog (对齐目标截图)
// ============================================================

interface CreatePreset { templateId?: string }

function CreateProjectDialog({
  preset, onCancel, onConfirm,
}: {
  preset: CreatePreset;
  onCancel: () => void;
  onConfirm: (saved: ProjectMeta) => void;
}) {
  const add = useProjectsStore((s) => s.add);
  const initial = preset.templateId ? getTemplate(preset.templateId) : undefined;
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string | undefined>(initial?.id);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [connectors, setConnectors] = useState<RefItem[]>(initial?.connectors ?? []);
  const [experts, setExperts] = useState<RefItem[]>(initial?.experts ?? []);
  const [skills, setSkills] = useState<RefItem[]>(initial?.skills ?? []);
  const [pickerFor, setPickerFor] = useState<null | "connectors" | "experts" | "skills">(null);
  const [tplOpen, setTplOpen] = useState(false);
  const tplRef = useOutsideClose<HTMLDivElement>(tplOpen, () => setTplOpen(false));

  const applyTemplate = (id: string) => {
    const t = getTemplate(id);
    setTemplateId(id);
    setInstructions(t?.instructions ?? "");
    setConnectors(t?.connectors ?? []);
    setExperts(t?.experts ?? []);
    setSkills(t?.skills ?? []);
    setTplOpen(false);
  };

  const currentTpl = getTemplate(templateId);

  const setPicked = (k: typeof pickerFor, items: RefItem[]) => {
    if (k === "connectors") setConnectors(items);
    else if (k === "experts") setExperts(items);
    else if (k === "skills") setSkills(items);
    setPickerFor(null);
  };

  const submit = () => {
    if (!name.trim()) return;
    const saved = add({
      name: name.trim(),
      templateId,
      instructions: instructions.trim() || undefined,
      connectors, experts, skills,
    });
    onConfirm(saved);
  };

  return (
    <div className="modal-overlay create-colleague-overlay" onClick={onCancel}>
      <div className="create-colleague-dialog create-project-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="create-colleague-header">
          <h3>新建项目</h3>
          <button className="create-colleague-close" onClick={onCancel} aria-label="关闭">×</button>
        </div>

        <div className="create-colleague-body">
          <div className="create-colleague-field">
            <label className="create-colleague-label">项目名称</label>
            <input
              type="text"
              className="create-colleague-input"
              value={name}
              maxLength={15}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入项目名称"
              autoFocus
            />
          </div>

          <div className="create-colleague-field">
            <div className="proj-field-head">
              <label className="create-colleague-label">指令</label>
              <div className="proj-tpl-select" ref={tplRef}>
                <button type="button" className="proj-tpl-select__btn" onClick={() => setTplOpen((v) => !v)}>
                  {currentTpl && currentTpl.id !== "custom" ? currentTpl.title : "选择模板"}
                  <ChevronDownIcon size="sm" />
                </button>
                {tplOpen && (
                  <div className="proj-tpl-select__menu">
                    {TEMPLATE_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`proj-tpl-select__item${t.id === templateId ? " proj-tpl-select__item--on" : ""}`}
                        onClick={() => applyTemplate(t.id)}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <textarea
              className="create-colleague-textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="提供当前项目的背景信息和规范，让 OpenBuddy 的回复更精准、更符合要求。比如：项目目标、团队习惯、风格偏好、输出约束等"
            />
          </div>

          <ConfigRow label="连接器" items={connectors} onAdd={() => setPickerFor("connectors")} onRemove={(id) => setConnectors((p) => p.filter((x) => x.id !== id))} />
          <ConfigRow label="专家" items={experts} onAdd={() => setPickerFor("experts")} onRemove={(id) => setExperts((p) => p.filter((x) => x.id !== id))} />
          <ConfigRow label="技能" items={skills} onAdd={() => setPickerFor("skills")} onRemove={(id) => setSkills((p) => p.filter((x) => x.id !== id))} />
        </div>

        <div className="create-colleague-footer create-project-footer">
          <span className="proj-version-note">切换模版会覆盖当前编辑内容</span>
          <button className="btn btn--ghost" onClick={onCancel}>取消</button>
          <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>确定</button>
        </div>
      </div>

      {pickerFor && (
        <RefPickerDialog
          title={pickerFor === "connectors" ? "连接器" : pickerFor === "experts" ? "专家" : "技能"}
          options={PICKER_OPTIONS[pickerFor]}
          selected={pickerFor === "connectors" ? connectors : pickerFor === "experts" ? experts : skills}
          onCancel={() => setPickerFor(null)}
          onConfirm={(items) => setPicked(pickerFor, items)}
        />
      )}
    </div>
  );
}

// ============================================================
// Glyph + helpers
// ============================================================

function ProjectGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="6" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="17.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.7 8.4 10.5 15.6M16.3 8.4 13.5 15.6M8 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function addedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "添加于 今天";
  return `添加于 ${days} 天前`;
}
