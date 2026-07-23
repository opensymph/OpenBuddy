import { useCallback, useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  SearchIcon, MyExpertIcon, ChevronLeftIcon, DeleteIcon, SparklesIcon,
  FolderOpenIcon, RefreshCwIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsDelete, agentsList, expertsDefaultRoot, expertsLoad, expertsReadAgentPrompt, expertsLinkAgents,
} from "@/lib/grok-client";
import type { AgentEntry, ExpertCatalog, ExpertItem, FeaturedScene } from "@/lib/types";
import { FEATURED_SCENES } from "../data/featured-scenes";
import { Chip, SegmentTabs } from "../shared/ui";
import { ThumbImg } from "../shared/ThumbImg";
import { ExpertCard } from "./ExpertCard";
import { ExpertDetailModal } from "./ExpertDetailModal";
import { FeaturedScenes } from "./FeaturedScenes";
import { MyExpertsEmpty } from "./MyExpertsEmpty";
import { usePendingExpertStore } from "@/stores/pending-expert-store";

type ListTab = "expert" | "team";
type Sort = "popular" | "newest";
const OPC_ID = "00-OPC";
const LS_ROOT = "expertsRoot";
/** Manifest label overrides to match the target UI exactly. */
const LABEL_OVERRIDE: Record<string, string> = { "13-TencentZone": "腾讯专家" };
const DEFAULT_PICK = "E:/Grok/agents";

interface Props {
  pills: React.ReactNode;
  /** Navigate back to the home page (after summoning an expert). */
  onGoHome?: () => void;
  onToast?: (message: string) => void;
}

export function ExpertsTab({ pills, onGoHome, onToast }: Props) {
  const [view, setView] = useState<"center" | "my">("center");
  const [listTab, setListTab] = useState<ListTab>("expert");
  const [sort, setSort] = useState<Sort>("popular");
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** Expert whose detail modal is currently open. */
  const [modalExpert, setModalExpert] = useState<ExpertItem | null>(null);
  const setPendingExpert = usePendingExpertStore((s) => s.set);

  const [root, setRoot] = useState<string>(() => {
    try { return localStorage.getItem(LS_ROOT) || ""; } catch { return ""; }
  });
  const [catalog, setCatalog] = useState<ExpertCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needPick, setNeedPick] = useState(false);

  const [locals, setLocals] = useState<AgentEntry[]>([]);
  const [localsLoading, setLocalsLoading] = useState(false);

  const persist = (r: string) => { try { localStorage.setItem(LS_ROOT, r); } catch { /* ignore */ } };

  const loadCatalog = useCallback(async (r: string) => {
    setLoading(true); setError(""); setNeedPick(false);
    try {
      const c = await expertsLoad(r);
      setCatalog(c);
      setRoot(c.root || r);
      persist(c.root || r);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Resolve the data root on first mount.
  useEffect(() => {
    let disposed = false;
    (async () => {
      if (root) { loadCatalog(root); return; }
      try {
        const d = await expertsDefaultRoot();
        if (disposed) return;
        if (d) loadCatalog(d);
        else setNeedPick(true);
      } catch {
        if (!disposed) setNeedPick(true);
      }
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadLocals = useCallback(async () => {
    setLocalsLoading(true);
    try { setLocals(await agentsList()); }
    catch (e) { onToast?.(`加载我的专家失败：${String(e).replace(/^Error:\s*/, "")}`); }
    finally { setLocalsLoading(false); }
  }, [onToast]);
  useEffect(() => { if (view === "my") reloadLocals(); }, [view, reloadLocals]);

  const expertById = useMemo(
    () => new Map((catalog?.experts ?? []).map((e) => [e.id, e])),
    [catalog],
  );

  // Scenes: prefer the catalog's local featuredScenes.json; fall back to the
  // curated gradient scenes. Drop any scene with no resolvable expert.
  const scenes = useMemo<FeaturedScene[]>(() => {
    const fromCatalog = (catalog?.featuredScenes ?? []).map((s) => ({
      id: s.id,
      zh: s.zh,
      expertIds: s.expertIds,
      imageLocal: s.imageLocal,
      image: s.imageUrl,
    } as FeaturedScene));
    const pool = fromCatalog.length > 0 ? fromCatalog : FEATURED_SCENES;
    return pool.filter((s) => s.expertIds.some((id) => expertById.has(id)));
  }, [catalog, expertById]);

  const byType = useMemo(
    () => (catalog?.experts ?? []).filter((e) => {
      // "expert" tab shows single agents; "team" tab shows teams.
      const targetType = listTab === "expert" ? "agent" : "team";
      return e.type === targetType;
    }),
    [catalog, listTab],
  );

  // 全部 + OPC (if any) + categories present in this type set; counts hidden.
  const chips = useMemo(() => {
    const present = new Set(byType.map((e) => e.cat));
    const opc = byType.some((e) => e.opc);
    const out: { id: string | null; label: string }[] = [{ id: null, label: "全部" }];
    if (opc) out.push({ id: OPC_ID, label: "OPC 一人公司" });
    for (const c of catalog?.categories ?? []) {
      if (present.has(c.id)) {
        out.push({ id: c.id, label: LABEL_OVERRIDE[c.id] || c.zh || c.id });
      }
    }
    return out;
  }, [byType, catalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = byType.filter((e) => {
      if (cat === OPC_ID) return !!e.opc;
      if (cat && e.cat !== cat) return false;
      if (!q) return true;
      return (
        (e.title || "").toLowerCase().includes(q) ||
        (e.name || "").toLowerCase().includes(q) ||
        (e.desc || "").toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return [...list].sort((a, b) => {
      if (sort === "newest") return (b.updated || "").localeCompare(a.updated || "");
      const ap = a.pos ?? Number.MAX_SAFE_INTEGER;
      const bp = b.pos ?? Number.MAX_SAFE_INTEGER;
      return ap - bp;
    });
  }, [byType, cat, search, sort]);

  const chooseDir = useCallback(async () => {
    try {
      const sel = await openDialog({
        directory: true, multiple: false, title: "选择专家数据目录",
        defaultPath: root || DEFAULT_PICK,
      });
      const pick = Array.isArray(sel) ? sel[0] : sel;
      if (!pick) return;
      await loadCatalog(pick);
      if (!error) onToast?.(`已切换专家数据目录：${pick}`);
    } catch { /* cancelled */ }
  }, [root, loadCatalog, onToast, error]);

  const handleCreate = () =>
    onToast?.("在 ~/.grok/agents/ 新建 .md 文件即可创建专家（后续将接入创建向导）");

  const handleDeleteLocal = useCallback(async (a: AgentEntry) => {
    if (!confirm(`确定删除专家「${a.name}」？`)) return;
    try { await agentsDelete(a.path); onToast?.("已删除"); reloadLocals(); }
    catch (e) { onToast?.(`删除失败：${String(e).replace(/^Error:\s*/, "")}`); }
  }, [onToast, reloadLocals]);

  /** Read the full prompt, set pending expert, navigate home. */
  const handleSummonFromModal = useCallback(async (expert: ExpertItem, promptOverride?: string) => {
    setModalExpert(null);

    // Read the full agent prompt from disk.
    let fullPrompt = "";
    if (expert.plugin && expert.agentName && root) {
      try {
        const raw = await expertsReadAgentPrompt(root, expert.plugin, expert.agentName);
        // Strip frontmatter to get just the body.
        const trimmed = raw.trimStart();
        if (trimmed.startsWith("---")) {
          const afterOpen = trimmed.indexOf("\n");
          if (afterOpen !== -1) {
            const rest = trimmed.slice(afterOpen + 1);
            const closeIdx = rest.search(/\n---\s*(\n|$)/);
            fullPrompt = closeIdx !== -1 ? rest.slice(closeIdx).replace(/^\n---\s*/, "").trim() : raw.trim();
          } else {
            fullPrompt = raw.trim();
          }
        } else {
          fullPrompt = raw.trim();
        }
      } catch { /* fallback: empty prompt */ }
    }

    // For team experts: link member agents into ~/.grok/agents/ so grok's
    // Task tool can spawn them by bare name during multi-agent orchestration.
    if (expert.type === "team" && expert.plugin && root) {
      expertsLinkAgents(root, expert.plugin).catch(() => { /* best-effort */ });
    }

    const name = expert.title || expert.name;
    setPendingExpert({
      name,
      prompt: fullPrompt,
      description: expert.desc || name,
      quickPrompt: promptOverride || expert.init || undefined,
      expertId: expert.id,
      source: "marketplace",
      avatarLocal: expert.avatarLocal,
    });

    // Navigate to home page.
    onGoHome?.();
  }, [root, setPendingExpert, onGoHome]);

  /** For local agents: set pending + go home. */
  const handleUseLocal = useCallback((a: AgentEntry) => {
    // Extract body from raw.
    let body = a.raw || a.description || "";
    const trimmed = body.trimStart();
    if (trimmed.startsWith("---")) {
      const afterOpen = trimmed.indexOf("\n");
      if (afterOpen !== -1) {
        const rest = trimmed.slice(afterOpen + 1);
        const closeIdx = rest.search(/\n---\s*(\n|$)/);
        if (closeIdx !== -1) body = rest.slice(closeIdx).replace(/^\n---\s*/, "").trim();
      }
    }
    setPendingExpert({
      name: a.name,
      prompt: body,
      description: a.description || a.name,
      expertId: a.name,
      source: "local",
    });
    onGoHome?.();
  }, [setPendingExpert, onGoHome]);

  // ---- no data dir yet ----
  if (needPick && !catalog) {
    return (
      <div className="um-page">
        <header className="um-topbar"><div className="um-topbar-left">{pills}</div></header>
        <div className="um-scroll">
          <div className="ec-empty">
            <FolderOpenIcon size="xl" className="ec-empty-icon" />
            <p>未找到专家数据目录</p>
            <p className="ec-empty-hint">请选择包含 <code>_meta/_expert_center.json</code> 的 WorkBuddy 数据目录（如 <code>E:\Grok\agents</code>）</p>
            <button type="button" className="um-btn um-btn--primary" onClick={chooseDir}>
              <FolderOpenIcon size="sm" /><span>选择来源目录</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 我的专家 sub-page ----
  if (view === "my") {
    return (
      <div className="um-page">
        <header className="um-topbar">
          <div className="um-topbar-left">
            <button type="button" className="um-back" onClick={() => setView("center")}>
              <ChevronLeftIcon size="sm" /><span>全部专家</span>
            </button>
          </div>
        </header>
        <div className="um-scroll">
          {localsLoading ? (
            <div className="ec-loading">加载中…</div>
          ) : locals.length === 0 ? (
            <MyExpertsEmpty onCreate={handleCreate} />
          ) : (
            <div className="ec-my-grid">
              {locals.map((a) => (
                <article key={a.path} className="ec-my-card">
                  <div className="ec-card-head">
                    <ThumbImg name={a.name} size={44} shape="square" />
                    <div className="ec-card-titles">
                      <div className="ec-card-title">{a.name}</div>
                      <div className="ec-card-sub">{a.scope === "user" ? "用户级" : "项目级"}</div>
                    </div>
                  </div>
                  <p className="ec-card-desc">{a.description || "（无描述）"}</p>
                  <div className="ec-my-card-foot">
                    <button type="button" className="ec-card-tag ec-card-tag--btn"
                      onClick={() => handleUseLocal(a)}>使用</button>
                    <button type="button" className="ec-my-del" title="删除"
                      onClick={() => handleDeleteLocal(a)}><DeleteIcon size="sm" /></button>
                  </div>
                </article>
              ))}
              <button type="button" className="ec-create-tile" onClick={handleCreate}>
                <span className="ec-create-plus">+</span><span>创建专家</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- expert center ----
  return (
    <div className="um-page">
      <header className="um-topbar">
        <div className="um-topbar-left">{pills}</div>
        <div className="um-topbar-right">
          <div className="um-search">
            <SearchIcon size="sm" className="um-search-icon" />
            <input className="um-search-input" value={search} placeholder="搜索专家职称或描述"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="um-btn um-btn--grey" onClick={() => setView("my")}>
            <MyExpertIcon size="sm" /><span>我的专家</span>
          </button>
        </div>
      </header>

      <div className="um-scroll">
        <div className="ec-source-bar">
          <span className="ec-source-label" title={root}>来源：{root || "—"}</span>
          <button type="button" className="ec-source-btn" onClick={chooseDir} title="切换来源目录">
            <FolderOpenIcon size="sm" /><span>选择目录</span>
          </button>
          <button type="button" className="ec-source-btn" onClick={() => root && loadCatalog(root)}
            disabled={loading} title="重新加载">
            <RefreshCwIcon size="sm" />
          </button>
        </div>

        {loading && !catalog && <div className="ec-loading">加载专家数据…</div>}
        {error && (
          <div className="ec-error">
            加载失败：{error}
            <button type="button" className="ec-source-btn" onClick={chooseDir}>选择目录</button>
          </div>
        )}

        {catalog && (
          <>
            <FeaturedScenes scenes={scenes} expertById={expertById} onSummon={(e) => setModalExpert(e)} />

            <div className="ec-list-head">
              <SegmentTabs<ListTab>
                className="ec-list-tabs"
                items={[{ key: "expert", label: "专家" }, { key: "team", label: "专家团" }]}
                value={listTab}
                onChange={(k) => { setListTab(k); setCat(null); }}
              />
              <SegmentTabs<Sort>
                className="ec-sort"
                items={[{ key: "popular", label: "最热" }, { key: "newest", label: "最新" }]}
                value={sort}
                onChange={setSort}
              />
            </div>

            <div className="ec-chips">
              {chips.map((c) => (
                <Chip key={c.id ?? "all"} label={c.label}
                  active={cat === c.id} onClick={() => setCat(c.id)} />
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="ec-empty">
                <SparklesIcon size="xl" className="ec-empty-icon" />
                <p>{search ? `没有找到与「${search}」匹配的专家` : "暂无该分类的专家"}</p>
              </div>
            ) : (
              <div className="ec-grid">
                {visible.map((e) => (
                  <ExpertCard key={e.id} expert={e} onSummon={() => setModalExpert(e)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {modalExpert && (
        <ExpertDetailModal
          expert={modalExpert}
          onClose={() => setModalExpert(null)}
          onSummon={handleSummonFromModal}
        />
      )}
    </div>
  );
}
