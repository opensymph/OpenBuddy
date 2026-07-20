import {
  Briefcase,
  FileText,
  Landmark,
  BarChart3,
  Search,
  Video,
  Code2,
  Globe,
  Bot,
  Layers,
  PenTool,
  Image,
  Palette,
  type LucideIcon,
} from "lucide-react";

/**
 * 首页"场景 → 能力分类 → 推荐模板"三级数据。
 *
 * 复刻 WorkBuddy 的 home 交互:顶部三个场景 tab(日常办公/代码开发/设计创意)
 * 切换时会换掉中间的能力 chip 行;点击某个能力 chip 会在输入框插入一个不可
 * 编辑的"操作类型"标签,并把该行替换为该能力下的推荐模板(带 ↘ 箭头);点击
 * 模板则把对应 prompt 填入输入框。WorkBuddy 这些数据是后端下发的,这里我们
 * 内置一份等价的静态数据。
 */

export type HomeModeId = "working" | "coding" | "design";

export interface HomeTemplate {
  /** 模板 chip 上显示的短标题。 */
  title: string;
  /** 点击模板后填入输入框的完整 prompt。 */
  prompt: string;
}

export interface HomeCategory {
  id: string;
  /** 能力分类名,同时作为输入框里黑色标签的文案。 */
  label: string;
  icon: LucideIcon;
  templates: HomeTemplate[];
}

export interface HomeMode {
  id: HomeModeId;
  label: string;
  /** 双行大标题下方的副标题,跟随场景 tab 切换。 */
  subtitle: string;
  icon: LucideIcon;
  categories: HomeCategory[];
}

/** 未展开时,能力 chip 行最多显示几个(超出折叠为"更多")。 */
export const COLLAPSED_VISIBLE_COUNT = 3;

export const HOME_MODES: HomeMode[] = [
  {
    id: "working",
    label: "日常办公",
    subtitle: "你的职场超能力",
    icon: Briefcase,
    categories: [
      {
        id: "doc",
        label: "文档处理",
        icon: FileText,
        templates: [
          {
            title: "财报分析全流程",
            prompt:
              "请帮我完成一份财报分析全流程:从原始财务数据整理、关键指标计算、同比环比分析,到最终输出结构化的分析报告(含结论与建议)。",
          },
          {
            title: "MD转PDF文档",
            prompt:
              "请将我提供的 Markdown 文档转换为排版精美的 PDF 文档,保留标题层级、表格、代码块与图片,并自动生成目录。",
          },
          {
            title: "竞品对比分析",
            prompt:
              "请帮我做一份竞品对比分析:列出主要竞品,从功能、定价、目标用户、优劣势等维度做成对比表格,并给出差异化建议。",
          },
          {
            title: "项目周报转Word",
            prompt:
              "请把我提供的项目进展要点整理成一份规范的 Word 周报,包含本周完成、下周计划、风险与需要协助的事项。",
          },
        ],
      },
      {
        id: "finance",
        label: "金融服务",
        icon: Landmark,
        templates: [
          {
            title: "投资组合建议",
            prompt:
              "请根据我的风险偏好与投资期限,给出一份资产配置与投资组合建议,并说明每类资产的比例与理由。",
          },
          {
            title: "财报指标解读",
            prompt:
              "请解读这份财报中的关键指标(营收、净利润、毛利率、经营性现金流等),指出亮点与潜在风险点。",
          },
          {
            title: "风险评估报告",
            prompt:
              "请帮我撰写一份风险评估报告:识别主要风险、评估影响程度与发生概率,并给出对应的应对预案。",
          },
        ],
      },
      {
        id: "data",
        label: "数据分析及可视化",
        icon: BarChart3,
        templates: [
          {
            title: "销售数据看板",
            prompt:
              "请根据我提供的销售数据,设计一个数据看板方案:包含核心指标卡、趋势折线图、Top 排行与维度下钻。",
          },
          {
            title: "用户留存分析",
            prompt:
              "请帮我做用户留存分析:计算次日 / 7 日 / 30 日留存,绘制留存曲线,并分析用户流失的主要原因。",
          },
          {
            title: "异常值检测",
            prompt:
              "请对这份数据做异常值检测,说明所使用的方法(如 IQR / Z-score),并列出疑似异常的记录。",
          },
        ],
      },
      {
        id: "research",
        label: "深度研究",
        icon: Search,
        templates: [
          {
            title: "行业调研报告",
            prompt:
              "请帮我做一份行业调研报告:涵盖市场规模、竞争格局、技术趋势与代表企业,并附信息来源。",
          },
          {
            title: "技术选型对比",
            prompt:
              "请对比几种候选技术方案,从性能、生态、学习成本、可维护性等维度给出选型建议与理由。",
          },
          {
            title: "文献综述整理",
            prompt:
              "请围绕该主题整理一份文献综述,归纳主流观点、常用研究方法以及尚未解决的问题。",
          },
        ],
      },
      {
        id: "video",
        label: "视频生成",
        icon: Video,
        templates: [
          {
            title: "产品宣传脚本",
            prompt:
              "请为我的产品写一支 30 秒宣传视频脚本,包含分镜、画面描述、旁白与字幕,并标注时长。",
          },
          {
            title: "教程视频大纲",
            prompt:
              "请把该操作流程拆解成教程视频大纲,逐镜头说明画面内容与讲解要点,方便后续录制。",
          },
        ],
      },
    ],
  },
  {
    id: "coding",
    label: "代码开发",
    subtitle: "你的开发超能力",
    icon: Code2,
    categories: [
      {
        id: "dev",
        label: "日常开发",
        icon: Code2,
        templates: [
          {
            title: "代码审查",
            prompt:
              "请审查以下代码,指出潜在的 bug、边界条件、性能与可读性问题,并给出具体的修改建议。",
          },
          {
            title: "单元测试生成",
            prompt:
              "请为以下函数生成完整的单元测试,覆盖正常流程、边界条件与异常用例,并附上必要的 mock。",
          },
          {
            title: "重构建议",
            prompt:
              "请分析以下代码并给出重构方案,目标是降低耦合、提升可测试性与可读性,说明每一步的理由。",
          },
        ],
      },
      {
        id: "web",
        label: "网站开发",
        icon: Globe,
        templates: [
          {
            title: "落地页搭建",
            prompt:
              "请帮我搭建一个产品落地页,包含 Hero 区、特性介绍、用户评价与行动按钮,要求响应式且语义化。",
          },
          {
            title: "接口联调排查",
            prompt:
              "请帮我排查前后端接口联调问题:我会给出请求与响应,请定位问题并给出修复方案。",
          },
        ],
      },
      {
        id: "agent",
        label: "Agent 应用",
        icon: Bot,
        templates: [
          {
            title: "Agent 工作流设计",
            prompt:
              "请帮我设计一个 Agent 工作流:明确目标、工具清单、状态流转与异常兜底,并画出步骤说明。",
          },
          {
            title: "提示词工程优化",
            prompt:
              "请优化以下系统提示词,提升指令遵循度与输出稳定性,并解释每处改动的意图。",
          },
        ],
      },
      {
        id: "skill",
        label: "Skill 开发",
        icon: Layers,
        templates: [
          {
            title: "Skill 脚手架",
            prompt:
              "请帮我生成一个 Skill 的脚手架,包含目录结构、元数据声明与一个最小可运行的示例。",
          },
          {
            title: "技能调试",
            prompt:
              "请帮我调试这个技能:我会描述期望行为与实际表现,请定位偏差并给出修复建议。",
          },
        ],
      },
    ],
  },
  {
    id: "design",
    label: "设计创意",
    subtitle: "你的设计超能力",
    icon: Palette,
    categories: [
      {
        id: "ppt",
        label: "PPT设计",
        icon: Layers,
        templates: [
          {
            title: "像素风介绍PPT",
            prompt:
              "请制作一个 6 页的产品介绍 PPT,采用炫酷丰富的像素风格排版与像素主题设计风格。",
          },
          {
            title: "论文答辩PPT",
            prompt:
              "请制作一份 10 页的硕士论文答辩 PPT,风格严谨学术,主色调采用深藏青,结构清晰。",
          },
          {
            title: "产品发布PPT",
            prompt:
              "请制作一份 10 页的产品发布会 PPT,风格为极简未来主义,突出核心卖点与路线图。",
          },
        ],
      },
      {
        id: "poster",
        label: "视觉海报",
        icon: Image,
        templates: [
          {
            title: "活动主视觉",
            prompt:
              "请为本次活动设计一张主视觉海报,给出构图、配色、字体与文案排版的完整方案。",
          },
          {
            title: "节日营销海报",
            prompt:
              "请设计一张节日营销海报,要求氛围感强、信息层级清晰,并适配移动端竖版尺寸。",
          },
        ],
      },
      {
        id: "brand",
        label: "品牌设计",
        icon: PenTool,
        templates: [
          {
            title: "Logo 概念",
            prompt:
              "请为我的品牌提出 3 个 Logo 概念,分别说明设计理念、配色与适用场景。",
          },
          {
            title: "品牌视觉规范",
            prompt:
              "请帮我制定一份品牌视觉规范,涵盖标志、标准色、辅助图形与字体使用规则。",
          },
        ],
      },
      {
        id: "webdesign",
        label: "网站设计",
        icon: Globe,
        templates: [
          {
            title: "首页改版方案",
            prompt:
              "请给出一份网站首页改版方案:包含信息架构、视觉风格与关键模块的布局建议。",
          },
          {
            title: "组件库设计",
            prompt:
              "请帮我规划一套基础组件库,列出核心组件、状态变体与设计 token 的组织方式。",
          },
        ],
      },
    ],
  },
];

export function getMode(modeId: HomeModeId): HomeMode {
  return HOME_MODES.find((m) => m.id === modeId) ?? HOME_MODES[0];
}
