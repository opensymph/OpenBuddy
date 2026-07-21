import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SearchIcon, InstalledSkillIcon, AddCircleIcon, RefreshCwIcon,
  PuzzlePieceIcon, DeleteIcon,
} from "@/foundation/components/Icon/icons";
import { skillsList, skillsRemove, skillsToggle } from "@/lib/grok-client";
import type { SkillCatalogItem, SkillInfo } from "@/lib/types";
import { SKILL_CATEGORIES, SKILL_LIST } from "../data/skills-catalog";
import { Chip, SegmentTabs } from "../shared/ui";
import { SkillCard } from "./SkillCard";
import { ImportSkillModal } from "./ImportSkillModal";

type Seg = "recommend" | "skillhub" | "plugin";
const FEATURED_WINDOW = 4;

interface Props {
  pills: React.ReactNode;
  onToast?: (m: string) => void;
}

export function SkillsTab({ pills, onToast }: Props) {
  const [installed, setInstalled] = useState(false); // true = 我安装的 view
  const [seg, setSeg] = useState<Seg>("recommend");
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const [locals, setLocals] = useState<SkillInfo[]>([]);
  const [localsLoading, setLocalsLoading] = useState(false);

  const reloadLocals = useCallback(async () => {
    setLocalsLoading(true);
    try { setLocals(await skillsList()); }
    catch (e) { onToast?.(`加载技能失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setLocalsLoading(false); }
  }, [onToast]);

  useEffect(() => { reloadLocals(); }, [reloadLocals]);

  const installedNames = useMemo(
    () => new Set(locals.map((s) => (s.displayName || s.name).toLowerCase())),
    [locals],
  );

  const featured = useMemo(() => SKILL_LIST.filter((s) => s.featured), []);
  const featuredView = useMemo(() => {
    if (featured.length <= FEATURED_WINDOW) return featured;
    const start = (offset * FEATURED_WINDOW) % featured.length;
    return Array.from({ length: FEATURED_WINDOW }, (_, i) => featured[(start + i) % featured.length]);
  }, [featured, offset]);

  const segItems = useMemo(
    () => SKILL_LIST.filter((s) => s.seg === seg),
    [seg],
  );

  const chips = useMemo(() => {
    const present = new Set(segItems.map((s) => s.cat));
    return SKILL_CATEGORIES.filter((c) => present.has(c.id));
  }, [segItems]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return segItems.filter((s) => {
      if (cat && s.cat !== cat) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
    });
  }, [segItems, cat, search]);

  const handleAdd = (item: SkillCatalogItem) => {
    onToast?.(`「${item.name}」为在线目录项，请导入对应的本地 SKILL.md 完成安装`);
    setImportOpen(true);
  };

  const handleToggle = useCallback(async (s: SkillInfo, enabled: boolean) => {
    try { await skillsToggle(s.name, enabled); reloadLocals(); }
    catch (e) { onToast?.(`切换失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadLocals]);

  const handleRemove = useCallback(async (s: SkillInfo) => {
    if (!s.path) { onToast?.("内置技能无法移除"); return; }
    if (!confirm(`确定移除技能「${s.displayName || s.name}」？`)) return;
    try { await skillsRemove(s.path); onToast?.("已移除"); reloadLocals(); }
    catch (e) { onToast?.(`移除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadLocals]);

  return (
    <div className="um-page">
      <header className="um-topbar">
        <div className="um-topbar-left">{pills}</div>
        <div className="um-topbar-right">
          <div className="um-search">
            <SearchIcon size="sm" className="um-search-icon" />
            <input className="um-search-input" value={search} placeholder="搜索技能"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button"
            className={`um-btn um-btn--grey${installed ? " um-btn--active" : ""}`}
            onClick={() => setInstalled((v) => !v)}>
            <InstalledSkillIcon size="sm" /><span>我安装的</span>
          </button>
          <button type="button" className="um-btn um-btn--grey"
            onClick={() => setImportOpen(true)}>
            <AddCircleIcon size="sm" /><span>添加技能</span>
          </button>
        </div>
      </header>

      <div className="um-scroll">
        {installed ? (
          <section className="sk-installed">
            <h3 className="ec-section-title">我安装的（{locals.length}）</h3>
            {localsLoading ? (
              <div className="ec-loading">加载中…</div>
            ) : locals.length === 0 ? (
              <div className="ec-empty">
                <PuzzlePieceIcon size="xl" className="ec-empty-icon" />
                <p>还没有安装任何技能</p>
                <p className="ec-empty-hint">点击右上角「添加技能」导入本地 SKILL.md</p>
              </div>
            ) : (
              <div className="sk-inst-list">
                {locals.map((s) => (
                  <div key={s.name + (s.path ?? "")} className="sk-inst-row">
                    <div className="sk-card-head" style={{ flex: 1 }}>
                      <PuzzlePieceIcon size="md" className="sk-inst-icon" />
                      <div className="sk-inst-info">
                        <div className="sk-card-name">{s.displayName || s.name}</div>
                        <p className="sk-card-desc">{s.description || "（无描述）"}</p>
                      </div>
                    </div>
                    <label className="sk-toggle" title={s.enabled ? "已启用" : "已禁用"}>
                      <input type="checkbox" checked={s.enabled}
                        onChange={() => handleToggle(s, !s.enabled)} />
                      <span className="sk-toggle-track"><span className="sk-toggle-thumb" /></span>
                    </label>
                    {s.path && (
                      <button type="button" className="sk-inst-del" title="移除"
                        onClick={() => handleRemove(s)}><DeleteIcon size="sm" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="sk-featured">
              <div className="sk-featured-head">
                <h3 className="ec-section-title">精选技能</h3>
                <button type="button" className="sk-refresh"
                  onClick={() => setOffset((o) => o + 1)} title="换一批">
                  <RefreshCwIcon size="sm" /><span>换一换</span>
                </button>
              </div>
              <div className="sk-featured-grid">
                {featuredView.map((s) => (
                  <SkillCard key={s.id} item={s}
                    installed={installedNames.has(s.name.toLowerCase())} onAdd={handleAdd} />
                ))}
              </div>
            </section>

            <div className="sk-seg-row">
              <SegmentTabs<Seg>
                items={[
                  { key: "recommend", label: "推荐" },
                  { key: "skillhub", label: "SkillHub" },
                  { key: "plugin", label: "套件" },
                ]}
                value={seg}
                onChange={(k) => { setSeg(k); setCat(""); }}
              />
            </div>

            <div className="ec-chips">
              <Chip label="全部" active={!cat} onClick={() => setCat("")} />
              {chips.map((c) => (
                <Chip key={c.id} label={c.zh} active={cat === c.id} onClick={() => setCat(c.id)} />
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="ec-empty">
                <PuzzlePieceIcon size="xl" className="ec-empty-icon" />
                <p>{search ? `没有找到与「${search}」匹配的技能` : "该分类暂无技能"}</p>
              </div>
            ) : (
              <div className="sk-grid">
                {visible.map((s) => (
                  <SkillCard key={s.id} item={s}
                    installed={installedNames.has(s.name.toLowerCase())} onAdd={handleAdd} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {importOpen && (
        <ImportSkillModal onClose={() => setImportOpen(false)} onToast={onToast}
          onInstalled={reloadLocals} />
      )}
    </div>
  );
}
