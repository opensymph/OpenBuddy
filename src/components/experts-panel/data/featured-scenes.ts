import type { FeaturedScene } from "@/lib/types";

/** Offline fallback for the 精选场景 strip (matches the target's 9 scenes).
 *  Each references up to 3 experts by id (resolved against the live catalog at
 *  render time) and carries a soft gradient used as the banner when the remote
 *  `featuredScenes.json` (which holds the photographic banners) is unreachable. */
export const FEATURED_SCENES: FeaturedScene[] = [
  { id: "content", zh: "内容创作", from: "#ffd9e0", to: "#ffe9d6",
    expertIds: ["AiContentCreatorTeam", "ContentCreator", "XiaohongshuOperationsExpert"] },
  { id: "invest", zh: "投资分析", from: "#d6e4ff", to: "#eef2f7",
    expertIds: ["TradingAgentTeam", "EquityResearchExpert", "StockPartnerTeam"] },
  { id: "legal", zh: "法律咨询", from: "#efe6d6", to: "#f4eee3",
    expertIds: ["LegalSearchPro", "ContractLegalExpert", "TaxComplianceTeam"] },
  { id: "smb", zh: "小微企业", from: "#d9f0e6", to: "#eef6f1",
    expertIds: ["SalesCoach", "WechatOfficialAccountExpert", "EntrepreneurshipCoach"] },
  { id: "ecom", zh: "电商运营", from: "#ffe6cc", to: "#fff1e0",
    expertIds: ["ChinaEcommerceOperationsExpert", "CrossBorderEcommerceExpert", "ContentMonetizationTeam"] },
  { id: "data", zh: "数据分析", from: "#d6ecff", to: "#e3f3f6",
    expertIds: ["DataAnalyticsReporter", "GPTResearcherTeam", "HuashuDataPro"] },
  { id: "doc", zh: "专业文档", from: "#e7e2f7", to: "#f1eefb",
    expertIds: ["DocumentGenerationExpert", "DocumentProcessingExpert", "OpenSpecDocTeam"] },
  { id: "product", zh: "产品设计", from: "#ffe0ec", to: "#f3e6ff",
    expertIds: ["UiDesigner", "ProductManagementExpert", "ProductStrategyTeam"] },
  { id: "eng", zh: "工程开发", from: "#dcefe6", to: "#e6f1ff",
    expertIds: ["SeniorDeveloper", "SoftwareCompany", "WeChatMiniProgramDeveloper"] },
];

/** Remote `featuredScenes.json` (photographic banners). Loaded best-effort; on
 *  any failure the gradient `FEATURED_SCENES` above are used. */
export const FEATURED_SCENES_URL =
  "https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/featuredScenes.json";
