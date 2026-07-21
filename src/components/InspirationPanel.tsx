import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import {
  SearchIcon,
  LightbulbIcon,
  SparklesIcon,
} from "@/foundation/components/Icon/icons";
import { inspirationGenerate } from "@/lib/grok-client";
import { registerForeignUpdateListener } from "@/stores/session-store";
import type { InspirationRichCard, PromptComplete } from "@/lib/types";

const INTEREST_TAGS = [
  { id: "all", label: "全部" },
  { id: "efficiency_tools", label: "效率工具" },
  { id: "office_collaboration", label: "办公协作" },
  { id: "project_management", label: "项目管理" },
  { id: "data_analysis", label: "数据分析" },
  { id: "workplace_skills", label: "职场技能" },
  { id: "lifestyle", label: "生活好物" },
  { id: "health_wellness", label: "健康养生" },
  { id: "home_organization", label: "家居收纳" },
  { id: "cooking", label: "美食烹饪" },
  { id: "travel", label: "旅行出行" },
  { id: "finance", label: "理财消费" },
  { id: "ai_models", label: "AI 大模型" },
  { id: "product_design", label: "产品设计" },
  { id: "industry_trends", label: "行业趋势" },
  { id: "learning", label: "学习提升" },
  { id: "career", label: "职业发展" },
];

const GRADIENT_COVERS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
  "linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)",
  "linear-gradient(135deg, #13547a 0%, #80d0c7 100%)",
];

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getDemoCards(): InspirationRichCard[] {
  const now = new Date().toISOString();
  return [
    {
      cardId: "demo-001",
      title: "今天你最需要关注的变化，灵感已经先替你筛好了",
      summary: "一条灵感不会只给你一段资讯摘要，而会把重点变化、为什么值得看，以及下一步能做什么整理成更适合行动的研究结果。",
      detail: "每天最费神的一步，常常发生在真正开始之前：你得先判断，今天该把注意力放在哪里。\n\n灵感把这段前置动作提前放到了前面：先收拢，先排序，再把值得留神的变化摆出来。",
      category: "industry_trends",
      prompt: "帮我从今天的行业动态中筛出和我当前工作最相关的3条变化",
      actions: [{ label: "深入探索", type: "explore", payload: "explore-tech-trends" }],
      createdAt: now,
    },
    {
      cardId: "demo-002",
      title: "一个模糊想法，怎么一步步变成可交付结果",
      summary: "从一句模糊需求开始，逐步补成结构化方向，再推进成原型、文档或其他交付物。",
      detail: "很多想法卡住，往往是因为它一直停在\u201C感觉不错\u201D这一步。\n\n先把问题压清楚，再把交付物收窄，把背景补到够用，把顺序排出来。做到这里，事情就已经从\u201C我有一个念头\u201D走到了\u201C我们有一版可以继续推进的东西\u201D。",
      category: "efficiency_tools",
      prompt: "帮我用\"压问题→定交付物→补背景→排顺序\"四步法整理成提纲",
      actions: [{ label: "开始尝试", type: "task", payload: "start-tutorial" }],
      createdAt: now,
    },
    {
      cardId: "demo-003",
      title: "第一次接触新课题，怎么在 10 分钟内摸清背景",
      summary: "面对一个全新的主题，怎样在短时间内先建立方向感，再决定后面要往哪里深入。",
      detail: "先把背景地图搭出来：定义、时间点、角色、路径、连接点，这五个锚点一旦站住，陌生感会明显下降。\n\n对新课题来说，前10分钟先把地图拿到手，后面的半小时才更值得投入。",
      category: "learning",
      prompt: "帮我用定义、时间点、角色、路径、连接点五个锚点快速摸底一个新课题",
      actions: [{ label: "开始项目", type: "task", payload: "start-project" }],
      createdAt: now,
    },
  ];
}

interface InspirationPanelProps {
  cwd?: string;
  onToast?: (msg: string) => void;
  onLaunch?: (prompt: string) => void;
}

export function InspirationPanel({ cwd, onToast, onLaunch }: InspirationPanelProps) {
  const [activeTag, setActiveTag] = useState("all");
  const [cards, setCards] = useState<InspirationRichCard[]>(getDemoCards);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerCard, setDrawerCard] = useState<InspirationRichCard | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleGenerate = useCallback(async (category: string) => {
    setLoading(true);
    try {
      const cat = category === "all" ? "general" : category;
      const started = await inspirationGenerate(cat, cwd, 6);
      let acc = "";
      const unsubscribe = registerForeignUpdateListener(started.sessionId, (u) => {
        const chunk = u as unknown as { content?: { text?: string }[] };
        const delta = Array.isArray(chunk.content)
          ? chunk.content.map((c: { text?: string }) => c.text ?? "").join("")
          : ((chunk.content as unknown as { text?: string })?.text ?? "");
        if (delta) acc += delta;
      });
      const completeUnlisten = await listen<PromptComplete>("grok://complete", (e) => {
        if (e.payload.sessionId === started.sessionId) {
          const cleaned = acc.trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          try {
            const parsed = JSON.parse(cleaned);
            const arr: InspirationRichCard[] = (Array.isArray(parsed) ? parsed : []).map(
              (item: Record<string, unknown>, i: number) => ({
                cardId: `gen-${Date.now()}-${i}`,
                title: String(item.title ?? ""),
                summary: String(item.summary ?? ""),
                detail: String(item.takeaway ?? item.detail ?? ""),
                category: cat,
                prompt: String(item.prompt ?? item.title ?? ""),
                createdAt: new Date().toISOString(),
              })
            );
            if (mountedRef.current && arr.length > 0) {
              setCards(arr);
            }
          } catch {
            onToast?.("无法解析生成结果，请重试");
          }
          if (mountedRef.current) setLoading(false);
          unsubscribe();
          completeUnlisten();
        }
      });
      setTimeout(() => {
        if (mountedRef.current && loading) {
          setLoading(false);
          onToast?.("生成超时，请重试");
          unsubscribe();
          completeUnlisten();
        }
      }, 90_000);
    } catch (e) {
      onToast?.(`生成失败：${String(e).replace(/^Error:\s*/, "")}`);
      if (mountedRef.current) setLoading(false);
    }
  }, [cwd, onToast, loading]);

  const handleTagClick = useCallback((tagId: string) => {
    setActiveTag(tagId);
    handleGenerate(tagId);
  }, [handleGenerate]);

  const filteredCards = useMemo(() => {
    let list = cards;
    if (activeTag !== "all") {
      list = list.filter((c) => c.category === activeTag);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q)
      );
    }
    return list;
  }, [cards, activeTag, searchQuery]);

  const handleCardClick = (card: InspirationRichCard) => {
    setDrawerCard(card);
  };

  const handleAsk = (card: InspirationRichCard) => {
    setDrawerCard(null);
    const prompt = card.prompt || `关于「${card.title}」，帮我深入分析`;
    onLaunch?.(prompt);
  };

  return (
    <div className="inspiration-panel">
      <div className="insp-header">
        <div className="insp-top">
          <div className="insp-title-area">
            <h1>灵感</h1>
            <span className="insp-date">{getTodayDate()}</span>
          </div>
          <div className="insp-actions">
            <button
              className="insp-btn-strategy"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <SearchIcon size="sm" />
              搜索灵感
            </button>
          </div>
        </div>
        <p className="insp-subtitle">
          想要工作在云端完成交叉并用价值观去打动人
        </p>
        {searchOpen && (
          <div className="insp-search-bar">
            <SearchIcon size="sm" />
            <input
              type="text"
              placeholder="搜索灵感内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="insp-search-clear">
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="insp-tags">
        {INTEREST_TAGS.map((tag) => (
          <button
            key={tag.id}
            className={
              "inspiration-itag" + (activeTag === tag.id ? " selected" : "")
            }
            onClick={() => handleTagClick(tag.id)}
          >
            {tag.label}
          </button>
        ))}
      </div>

      <div className="insp-body">
        {loading && (
          <div className="insp-loading-container">
            <div className="insp-loading-badge">灵感准备中</div>
            <div className="insp-loading-hero">
              <div className="insp-loading-hero-circle">
                <div className="insp-loading-hero-bulb">
                  <LightbulbIcon size="xl" />
                  <div className="insp-bulb-glow" />
                </div>
              </div>
            </div>
            <div className="insp-loading-title">正在为你生成灵感</div>
            <div className="insp-loading-desc">
              grok 正在根据你的兴趣生成个性化内容，请稍候…
            </div>
            <div className="insp-loading-dots">
              <div className="insp-loading-dot" />
              <div className="insp-loading-dot" />
              <div className="insp-loading-dot" />
            </div>
          </div>
        )}

        {!loading && filteredCards.length === 0 && (
          <div className="inspiration-state-message">
            <div className="inspiration-state-icon">
              <LightbulbIcon size="xl" color="var(--wb-text-tertiary)" />
            </div>
            <div className="inspiration-state-text">暂无灵感内容</div>
            <div className="inspiration-state-sub">
              点击上方分类标签生成你感兴趣的灵感
            </div>
            <button
              className="inspiration-state-retry-btn"
              onClick={() => handleGenerate(activeTag)}
            >
              生成灵感
            </button>
          </div>
        )}

        {!loading && filteredCards.length > 0 && (
          <div className="insp-card-feed">
            {filteredCards.map((card) => (
              <div
                key={card.cardId}
                className="inspiration-card"
                onClick={() => handleCardClick(card)}
                role="button"
                tabIndex={0}
              >
                <div
                  className="inspiration-card-cover"
                  style={{
                    background: card.cover
                      ? undefined
                      : GRADIENT_COVERS[hashStr(card.cardId) % GRADIENT_COVERS.length],
                  }}
                >
                  {card.cover && <img src={card.cover} alt={card.title} />}
                  {!card.cover && (
                    <div className="inspiration-card-cover-text">
                      <SparklesIcon size="lg" />
                    </div>
                  )}
                </div>
                <div className="inspiration-card-body">
                  <div className="inspiration-card-title">{card.title}</div>
                  {card.summary && (
                    <div className="inspiration-card-summary">{card.summary}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawerCard && (
        <>
          <div
            className="insp-drawer-overlay"
            onClick={() => setDrawerCard(null)}
          />
          <div className={"insp-drawer open"}>
            <div className="insp-drawer-header">
              <button
                className="insp-drawer-close"
                onClick={() => setDrawerCard(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="insp-drawer-body">
              <div
                className="insp-drawer-cover"
                style={{
                  background: drawerCard.cover
                    ? undefined
                    : GRADIENT_COVERS[hashStr(drawerCard.cardId) % GRADIENT_COVERS.length],
                }}
              >
                {drawerCard.cover && (
                  <img src={drawerCard.cover} alt={drawerCard.title} />
                )}
              </div>
              <div className="insp-drawer-content">
                <div className="insp-drawer-title">{drawerCard.title}</div>
                <div className="insp-drawer-text">{drawerCard.summary}</div>
                {drawerCard.detail && (
                  <div className="insp-drawer-detail">{drawerCard.detail}</div>
                )}
              </div>
            </div>
            <div className="insp-drawer-ask">
              <button
                className="insp-drawer-ask-btn"
                onClick={() => handleAsk(drawerCard)}
              >
                <SparklesIcon size="sm" />
                深入探索
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
