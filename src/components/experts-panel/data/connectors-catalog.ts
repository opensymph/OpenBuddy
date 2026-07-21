import type { ConnectorCatalogItem } from "@/lib/types";

/** Built-in connector directory (截图 4). These are MCP-type connectors, so the
 *  "+" action opens the MCP 服务管理 modal (本地无一键安装). Order matches the
 *  reference two-column layout (index 0,1 = first row left/right, …). */
export const CONNECTOR_LIST: ConnectorCatalogItem[] = [
  { id: "tongdaxin", name: "通达信", color: "#e5484d",
    desc: "通过通达信 MCP 查询全球股票行情数据、条件选股、研究报告、公告资讯和宏观信息。支持个股基本面分析、同行业对比和智能选股筛选。" },
  { id: "zxg", name: "腾讯自选股", color: "#e11d48",
    desc: "直连腾讯自选股，实时掌握毫秒级行情与资金动态，用自然语言分析自选数据、设置股价提醒、管理模拟交易，轻松搞定盯盘与投资决策。" },
  { id: "qq-mail", name: "QQ邮箱", color: "#ffba00",
    desc: "收发、搜索和整理 QQ 邮件。用自然语言读取邮件内容、汇总邮件线程、管理文件夹。" },
  { id: "ima-kb", name: "ima知识库", color: "#7c5cff",
    desc: "引用知识库资料及文件，浏览知识库详情。" },
  { id: "lexiang", name: "乐享知识库", color: "#2f80ed",
    desc: "搜索、创建和管理乐享知识库中的文档。支持导入 Markdown、按标签整理内容、追踪团队文档的更新动态。" },
  { id: "tencent-docs", name: "腾讯文档", color: "#2f80ed",
    desc: "创建、编辑和协作腾讯文档。用自然语言管理在线表格、文档和幻灯片，轻松完成内容查询、数据整理和团队协同。" },
  { id: "tencent-meet", name: "腾讯会议", color: "#006eff",
    desc: "通过命令行创建、查询和管理腾讯会议。支持快速发起会议、查看日程安排、管理参会人员。" },
  { id: "wecom", name: "企业微信", color: "#2f80ed",
    desc: "企业微信 10 人及以下企业支持消息、文档、日程、会议、待办等MCP能力；10 人以上企业仅支持创建、读取文档和智能表格。" },
  { id: "feishu", name: "飞书", color: "#3370ff",
    desc: "通过命令行管理飞书/Lark 全产品能力：即时通讯、邮箱、日历、云文档、电子表格、多维表格（Base）、幻灯片、画板、知识库、云空间、妙记、视频会议、任务、审批、考勤、通讯录、OKR 等。" },
  { id: "dingtalk", name: "钉钉", color: "#1677ff",
    desc: "通过命令行管理钉钉全产品能力：AI 表格、考勤、日历、群聊与机器人、通讯录、开放平台文档、DING 消息、钉钉文档、钉钉云盘、AI 听记、邮箱、OA 审批、日志、待办。" },
  { id: "tencent-survey", name: "腾讯问卷", color: "#2f80ed",
    desc: "创建、管理和分析腾讯问卷。用自然语言快速生成问卷、查看回收数据、设置题目逻辑。" },
  { id: "tapd", name: "TAPD", color: "#2f9e44",
    desc: "管理需求、缺陷、任务和迭代。查询项目进度、拆分需求、流转状态、填写工时，覆盖需求到发布的研发全生命周期。" },
  { id: "cnb", name: "CNB", color: "#fa541c",
    desc: "通过自然语言管理 CNB 平台：仓库、Issue、PR、流水线、制品库等操作。" },
  { id: "weiyun", name: "微云", color: "#1296db",
    desc: "查看、下载、删除微云文件，并且提供上传文件到微云、生成分享链接能力，帮你管理微云文件" },
  { id: "fubangshou", name: "福帮手", color: "#0ea5e9",
    desc: "福帮手人机协同连接器：面向 WorkBuddy 的身份识别、场景包查询、首值与继续使用记录、乐包状态确认和超级合伙人交接。" },
  { id: "wps", name: "金山文档", color: "#2f80ed",
    desc: "创建、搜索和管理金山文档（WPS 云文档）。支持新建多种文档类型（Word/Excel/PDF/PPT/智能表格/多维表格/智能文档）、读取与搜索文档内容、编辑更新、分享、移动重命名整理、标签收藏管理、知识库空间操作…" },
];
