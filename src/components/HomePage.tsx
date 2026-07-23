import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Composer } from "./Composer";
import type { ModelOption } from "./ModelSelector";
import type { WorkspaceInfo } from "@/lib/grok-client";
import type { AgentEntry } from "@/lib/types";
import { MoreIcon } from "@/foundation/components/Icon/icons";
import { useHorizontalScroll } from "./use-horizontal-scroll";
import { useSessionsStore, HOME_DRAFT_KEY } from "@/stores/sessions-store";
import { usePendingExpertStore } from "@/stores/pending-expert-store";
import {
  COLLAPSED_VISIBLE_COUNT,
  HOME_MODES,
  getMode,
  type HomeCategory,
  type HomeModeId,
  type HomeTemplate,
} from "./home-scenes";

/** 模板 chip 右侧的 ↘ 斜箭头(复刻 WorkBuddy 的 quick-actions-sub 箭头)。 */
function ArrowRightSubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <g transform="translate(0 14) scale(1 -1)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          transform="matrix(1 0 0 1 2.25385 2.09996)"
          d="M8.5963 5.775L8.5963 3.9772Q8.5963 2.6005 8.537 2.1664Q8.5175 2.0232 8.4867 1.9021L0.7425 9.6463L0 8.9038L7.7442 1.1596Q7.6231 1.1288 7.4799 1.1092Q7.0458 1.05 5.6691 1.05L3.8712 1.05L3.8712 0.0001L5.669 0.0001Q7.1171 0 7.6219 0.0689Q8.5026 0.1891 8.9799 0.6664Q9.4572 1.1437 9.5774 2.0244Q9.6463 2.5292 9.6462 3.9773L9.6462 5.775L8.5963 5.775Z"
        />
      </g>
    </svg>
  );
}

/**
 * WorkBuddy 风格首页:双行大标题 + 场景 tab + 能力 chip 行 + Composer。
 *
 * 复刻 WorkBuddy 的三级交互:
 *  1. 顶部场景 tab(日常办公/代码开发/设计创意)切换下方能力 chip 列表;
 *  2. 点击能力 chip → 该分类被选中,能力行隐藏并替换为推荐模板行(↘),
 *     同时在输入框内插入一个不可编辑的黑色"操作类型"标签(× 可删);
 *  3. 点击模板 chip → 把对应 prompt 填入输入框(保留操作类型标签)。
 * 能力行支持横向滚动(左右箭头 + 边缘渐隐 + 拖拽),超出折叠为前 N 个 + "更多"。
 */
export function HomePage({
  onSend,
  streaming,
  apiReady,
  onOpenSettings,
  onPlaceholder,
  modelId,
  models,
  onModelChange,
  cwd,
  workspaces,
  onSelectWorkspace,
  onSelectMode,
  onSelectExpert,
  onNavigateConnectors,
}: {
  onSend: (text: string) => void;
  streaming: boolean;
  apiReady: boolean;
  onOpenSettings: () => void;
  onPlaceholder: (label: string) => void;
  modelId?: string;
  models?: ModelOption[];
  onModelChange?: (id: string) => void;
  cwd?: string;
  workspaces?: WorkspaceInfo[];
  onSelectWorkspace?: (cwd: string) => void;
  onSelectMode?: (modeId: HomeModeId) => void;
  onSelectExpert?: (agent: AgentEntry) => void;
  onNavigateConnectors?: () => void;
}) {
  const [modeId, setModeId] = useState<HomeModeId>("working");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  // 输入框内黑色"操作类型"标签。
  const [sceneTag, setSceneTag] = useState<{ label: string; icon: HomeCategory["icon"] } | null>(null);
  // 受控填充 Composer 的内容 + nonce(点模板时写入 prompt)。
  const [externalText, setExternalText] = useState("");
  const [externalTextNonce, setExternalTextNonce] = useState(0);
  // 首页草稿(哨兵 key):用户离开首页再回来,未发送的字还在。
  const homeDraft = useSessionsStore((s) => s.drafts[HOME_DRAFT_KEY] ?? "");
  const setDraft = useSessionsStore((s) => s.setDraft);

  // Pending expert (set after "召唤" in the detail modal).
  const pendingExpert = usePendingExpertStore((s) => s.expert);
  const pendingHandledRef = useRef<string | null>(null);

  // When a pending expert arrives with a quickPrompt, pre-fill the composer.
  useEffect(() => {
    if (!pendingExpert) return;
    // Only auto-fill once per expert (avoid re-filling if user clears it).
    if (pendingHandledRef.current === pendingExpert.expertId) return;
    pendingHandledRef.current = pendingExpert.expertId;
    if (pendingExpert.quickPrompt) {
      fillComposer(pendingExpert.quickPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExpert]);

  const mode = getMode(modeId);
  const categories = mode.categories;
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  /** 写入 Composer 并聚焦(nonce 递增保证连续点同一模板也生效)。 */
  const fillComposer = (text: string) => {
    setExternalText(text);
    setExternalTextNonce((n) => n + 1);
  };

  // 切换场景 tab:换 chip 列表,并清空选中/标签/输入。
  const handleModeChange = (next: HomeModeId) => {
    setModeId(next);
    setSelectedCategoryId(undefined);
    setExpanded(false);
    setSceneTag(null);
    fillComposer("");
  };

  // 点击能力 chip:选中则插标签 + 显示模板行;再点一次则取消。
  const handleCategoryClick = (cat: HomeCategory) => {
    if (selectedCategoryId === cat.id) {
      // 取消选中:清空标签与输入,回到能力行。
      setSelectedCategoryId(undefined);
      setSceneTag(null);
      fillComposer("");
      return;
    }
    setSelectedCategoryId(cat.id);
    setSceneTag({ label: cat.label, icon: cat.icon });
    fillComposer(""); // 选中分类时清空旧输入,只留标签(匹配 WorkBuddy)
  };

  // 点击模板 chip:把 prompt 填入输入框(保留操作类型标签)。
  const handleTemplateClick = (tpl: HomeTemplate) => {
    fillComposer(tpl.prompt);
  };

  // 输入框标签的 ×:清空标签、选中态与输入。
  const handleClearSceneTag = () => {
    setSceneTag(null);
    setSelectedCategoryId(undefined);
    fillComposer("");
  };

  // 能力行:未选中且未展开时,折叠为前 N 个 + "更多"。
  const shouldCollapse =
    !selectedCategory && !expanded && categories.length > COLLAPSED_VISIBLE_COUNT;
  const visibleCategories = shouldCollapse
    ? categories.slice(0, COLLAPSED_VISIBLE_COUNT)
    : categories;

  const listScroll = useHorizontalScroll([
    categories.length,
    expanded,
    selectedCategoryId,
    modeId,
  ]);
  const subScroll = useHorizontalScroll([
    selectedCategoryId,
    selectedCategory?.templates.length ?? 0,
  ]);

  const sceneCls = (id: HomeModeId) =>
    "home__scene" + (modeId === id ? " home__scene--active" : "");

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__header">
          <h1 className="home__title">OpenBuddy</h1>
          <p className="home__subtitle">{mode.subtitle}</p>
        </header>

        <div className="home__scenes" role="tablist" aria-label="场景">
          {HOME_MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={modeId === m.id}
              aria-label={m.label}
              className={sceneCls(m.id)}
              onClick={() => handleModeChange(m.id)}
            >
              <m.icon size={14} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <section className="home__composer-area">
          {/* 二级:能力 chip 行(选中分类后隐藏,替换为三级模板行) */}
          {!selectedCategory && (
            <div
              className={
                "home__chips" +
                (listScroll.canScrollLeft ? " home__chips--fade-left" : "") +
                (listScroll.canScrollRight ? " home__chips--fade-right" : "")
              }
            >
              {listScroll.canScrollLeft && (
                <button
                  type="button"
                  className="home__chips-arrow home__chips-arrow--left"
                  aria-label="向左滚动"
                  onClick={() => listScroll.scrollByStep("left")}
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <div ref={listScroll.containerRef} className="home__chips-list" {...listScroll.bind}>
                {visibleCategories.map((cat) => (
                  <button
                    key={cat.id}
                    className="home__chip"
                    aria-label={cat.label}
                    onClick={() => handleCategoryClick(cat)}
                  >
                    <span className="home__chip-icon" aria-hidden="true">
                      <cat.icon size={16} />
                    </span>
                    <span>{cat.label}</span>
                  </button>
                ))}
                {shouldCollapse && (
                  <button
                    className="home__chip home__chip--more"
                    aria-label="更多"
                    onClick={() => setExpanded(true)}
                  >
                    <span className="home__chip-icon" aria-hidden="true">
                      <MoreIcon size="sm" />
                    </span>
                    <span>更多</span>
                  </button>
                )}
              </div>
              {listScroll.canScrollRight && (
                <button
                  type="button"
                  className="home__chips-arrow home__chips-arrow--right"
                  aria-label="向右滚动"
                  onClick={() => listScroll.scrollByStep("right")}
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}

          {/* 三级:推荐模板行(↘),仅在选中某个能力分类后显示 */}
          {selectedCategory && (
            <div
              className={
                "home__chips home__chips--sub" +
                (subScroll.canScrollLeft ? " home__chips--fade-left" : "") +
                (subScroll.canScrollRight ? " home__chips--fade-right" : "")
              }
            >
              {subScroll.canScrollLeft && (
                <button
                  type="button"
                  className="home__chips-arrow home__chips-arrow--left"
                  aria-label="向左滚动"
                  onClick={() => subScroll.scrollByStep("left")}
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <div ref={subScroll.containerRef} className="home__chips-list" {...subScroll.bind}>
                {selectedCategory.templates.map((tpl, i) => (
                  <button
                    key={i}
                    className="home__template"
                    title={tpl.prompt}
                    aria-label={tpl.title}
                    onClick={() => handleTemplateClick(tpl)}
                  >
                    <span className="home__template-text">{tpl.title}</span>
                    <span className="home__template-arrow" aria-hidden="true">
                      <ArrowRightSubIcon />
                    </span>
                  </button>
                ))}
              </div>
              {subScroll.canScrollRight && (
                <button
                  type="button"
                  className="home__chips-arrow home__chips-arrow--right"
                  aria-label="向右滚动"
                  onClick={() => subScroll.scrollByStep("right")}
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}

          <Composer
            streaming={streaming}
            onSend={onSend}
            onCancel={() => {}}
            apiReady={apiReady}
            onOpenSettings={onOpenSettings}
            onPlaceholder={onPlaceholder}
            sceneTag={sceneTag}
            onClearSceneTag={handleClearSceneTag}
            externalText={externalText}
            externalTextNonce={externalTextNonce}
            modelId={modelId}
            models={models}
            onModelChange={onModelChange}
            cwd={cwd}
            workspaces={workspaces}
            onSelectWorkspace={onSelectWorkspace}
            showMeta
            draft={homeDraft}
            draftKey={HOME_DRAFT_KEY}
            onDraftChange={(t) => setDraft(HOME_DRAFT_KEY, t)}
            onSelectMode={(id) => {
              setModeId(id);
              onSelectMode?.(id);
            }}
            onSelectExpert={onSelectExpert}
            onNavigateConnectors={onNavigateConnectors}
            activeExpertName={pendingExpert?.name}
          />
        </section>
      </div>
    </div>
  );
}
