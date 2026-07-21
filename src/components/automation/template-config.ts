/**
 * 自动化任务模版 — 1:1 复刻 WorkBuddy template-config.ts + zh-cn 文案。
 *
 * 每个模板包含：中文标题/描述、预填 prompt、调度配置与图标。
 * 点击模板即以这些初始值进入「添加自动化任务」表单。
 */
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { IconComponentProps } from "@/foundation/components/Icon/Icon";
import {
  TemplateAlarmClockIcon,
  TemplateCalendarIcon,
  TemplateFilmIcon,
  TemplateHospitalIcon,
  TemplateImageIcon,
  TemplateLanguagesIcon,
  TemplateLightbulbIcon,
  TemplateListTodoIcon,
  TemplateMessagesSquareIcon,
  TemplateMoonIcon,
  TemplateNewsIcon,
  TemplateWeeklyReportIcon,
} from "@/foundation/components/Icon/icons";
import type { AutomationSchedule } from "@/lib/types";

export const ALL_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekdayCode = (typeof ALL_DAYS)[number];

/** Foundation createIcon 产物（forwardRef SVG 组件）。 */
export type TemplateIcon = ForwardRefExoticComponent<
  Omit<IconComponentProps, "ref"> & RefAttributes<SVGSVGElement>
>;

export interface AutomationTemplate {
  id: string;
  title: string;
  content: string;
  prompt: string;
  scheduleType: "recurring" | "once";
  schedule: AutomationSchedule;
  /** once 模式：YYYY-MM-DD / HH:MM */
  scheduledDate?: string;
  scheduledTime?: string;
  validFromDate?: string;
  validUntilDate?: string;
  Icon: TemplateIcon;
}

function daily(byhour: number, byminute = 0): AutomationSchedule {
  return {
    freq: "DAILY",
    interval: 1,
    byday: [...ALL_DAYS],
    bymonthday: [],
    bymonth: [],
    byhour,
    byminute,
    intervalHours: 1,
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "daily-ai-news",
    title: "每日 AI 新闻推送",
    content: "关注当天 AI 领域的重要动态，侧重 AI coding 与具身智能进展，筛选 3-5 条值得关注的信息。",
    prompt:
      "关注当天 AI 领域的重要动态，侧重 AI coding 与具身智能方向。筛选 3-5 条有价值的信息，简要说明事件内容及值得关注的原因。",
    scheduleType: "recurring",
    schedule: daily(9, 0),
    Icon: TemplateNewsIcon,
  },
  {
    id: "daily-english-words",
    title: "每日 5 个英语单词",
    content: "每天推荐 5 个高频实用英语单词，包含词义、音标、例句与记忆提示。",
    prompt:
      "每天推荐 5 个实用英语单词，优先选取生活和职场中常见词汇。输出词义、音标、例句，以及一条便于记忆的小提示。",
    scheduleType: "recurring",
    schedule: daily(8, 30),
    Icon: TemplateLanguagesIcon,
  },
  {
    id: "daily-bedtime-story",
    title: "每日儿童睡前故事",
    content: "生成 3-5 分钟可读的温和睡前故事，情节完整并附简短寓意。",
    prompt:
      "写一个适合儿童的睡前故事，语言温和易懂，阅读时长约 3-5 分钟。故事需有完整情节，结尾附上简短寓意。",
    scheduleType: "recurring",
    schedule: daily(20, 30),
    Icon: TemplateMoonIcon,
  },
  {
    id: "weekly-work-report",
    title: "每周工作周报",
    content: "每周五汇总仓库 PR 与 Issue 进展，输出关键变更与待关注事项。",
    prompt:
      "梳理本周仓库中的 PR 与 Issue 情况，包括新增、已关闭及重点讨论。输出一份周报，涵盖主要进展、关键变更和待关注事项。",
    scheduleType: "recurring",
    schedule: {
      freq: "WEEKLY",
      interval: 1,
      byday: ["FR"],
      bymonthday: [],
      bymonth: [],
      byhour: 17,
      byminute: 0,
      intervalHours: 1,
    },
    Icon: TemplateWeeklyReportIcon,
  },
  {
    id: "classic-movie-recommendation",
    title: "经典电影推荐",
    content: "推荐一部高分经典电影，简要介绍剧情梗概、亮点与推荐理由，全程不剧透。",
    prompt:
      "给我推荐一部公认的经典电影（评分高、口碑好），简要介绍剧情梗概、亮点所在，以及它为什么值得一看，但是不要剧透。",
    scheduleType: "recurring",
    schedule: daily(20, 0),
    Icon: TemplateFilmIcon,
  },
  {
    id: "history-today",
    title: "历史上的今天",
    content: "从科技、电影、音乐等领域挑选一件\"今天发生过\"的有趣事件，200-300 字讲清来龙去脉。",
    prompt:
      "历史上的今天发生过什么有趣的事？从科技、电影、音乐等领域中挑一个，讲讲它的来龙去脉吧。控制在 200-300 字左右。",
    scheduleType: "recurring",
    schedule: daily(9, 30),
    Icon: TemplateCalendarIcon,
  },
  {
    id: "daily-why",
    title: "每日一个为什么",
    content: "每天抛出一个有趣问题，先提问再解答，语气轻松、通俗易懂，答案控制在 200-300 字。",
    prompt:
      "随机挑选一个有趣的冷知识或生活百科问题，并给出详细、有趣、通俗易懂的解答。每次问题尽量不重复，覆盖科学、生活、历史、自然、食物、文化、动物、人体等多个领域；先抛出问题再揭晓答案；语气轻松有趣；答案控制在 200-300 字。",
    scheduleType: "recurring",
    schedule: daily(18, 30),
    Icon: TemplateLightbulbIcon,
  },
  {
    id: "parent-contact-reminder",
    title: "父母联系提醒",
    content: "每周日 10:00 提醒你给家人打电话或发消息，简单问候近况。",
    prompt: "每周日十点提醒我给家人打电话或发消息，简单问候近况。",
    scheduleType: "recurring",
    schedule: {
      freq: "WEEKLY",
      interval: 1,
      byday: ["SU"],
      bymonthday: [],
      bymonth: [],
      byhour: 10,
      byminute: 0,
      intervalHours: 1,
    },
    validFromDate: "2026-03-18",
    validUntilDate: "2026-06-30",
    Icon: TemplateAlarmClockIcon,
  },
  {
    id: "health-checkup-appointment-reminder",
    title: "体检预约提醒",
    content: "在 2026/04/08 07:00 提醒你确认体检时间、准备证件，并注意空腹与其他事项。",
    prompt: "4月8号七点提醒我确认体检时间、准备证件，提前空腹并留意注意事项。",
    scheduleType: "once",
    schedule: daily(7, 0),
    scheduledDate: "2026-04-08",
    scheduledTime: "07:00",
    Icon: TemplateHospitalIcon,
  },
  {
    id: "interview-preparation-reminder",
    title: "面试准备提醒",
    content: "工作日每 2 小时提醒你复习大模型面试内容，并生成 3 个模拟问题。",
    prompt: "每两小时提醒我复习关于大模型的项目亮点、技术难点、常见问答，并生成 3 个模拟面试问题。",
    scheduleType: "recurring",
    schedule: {
      freq: "HOURLY",
      interval: 2,
      byday: ["MO", "TU", "WE", "TH", "FR"],
      bymonthday: [],
      bymonth: [],
      byhour: 9,
      byminute: 0,
      intervalHours: 2,
    },
    validFromDate: "2026-03-18",
    validUntilDate: "2026-04-30",
    Icon: TemplateMessagesSquareIcon,
  },
  {
    id: "pre-meeting-preparation",
    title: "会议前准备",
    content: "在会议开始前提醒你整理议题、目标、待确认问题和关键结论。",
    prompt: "在会议开始前，提醒我整理议题、目标、需要确认的问题，以及要同步的关键结论。",
    scheduleType: "once",
    schedule: daily(14, 30),
    scheduledDate: "2026-03-22",
    scheduledTime: "14:30",
    Icon: TemplateListTodoIcon,
  },
  {
    id: "cute-pet-phone-wallpaper",
    title: "可爱萌宠手机壁纸",
    content: "随机从 7 种不同风格中挑选一种，为你生成一张 9:16 竖版高清萌宠手机壁纸。",
    prompt: [
      "帮我生成一张手机壁纸，以下主题随机选一个就可以。",
      "主体：可爱萌宠。格式要求：手机壁纸、高清分辨率，size:576x1024，9:16 竖版比例。",
      "主题 1：毛绒绒云朵主题，精美边框，创意排版，漫画浪漫主义，复杂华丽，漂浮云朵元素，薄荷绿与天空蓝主色调，温柔可爱。",
      "主题 2：模糊感与笔触感结合的极简精致插画，深邃宝石蓝背景，超现实主义美学，层次丰富，光影与反射形成视觉张力，同时保持和谐高级感。",
      "主题 3：武政谅风格卡通手机壁纸，丝网印刷艺术风格，细腻颗粒肌理，柔和胶版印刷质感，极简纯扁平插画，主体为猫咪，高饱和多巴胺色系。",
      "主题 4：虚拟电子风格，体素块构成，乱码与数字故障纹理，轻微失真星环，全息炫彩半透明水晶质感，随机色彩断层与扫描线，高饱和克莱因蓝背景，蜜桃粉点缀。",
      "主题 5：精致绘本插画风格，线条简洁流畅，高级米色单色调与大面积留白，略仰视角，淡雅水彩渲染，精致可爱且有童趣。",
      "主题 6：复古主义风格，花卉布局错落有致，极繁细致，以自然柔和色系为主，线条勾勒清晰，高饱和色彩呈现华丽质感。",
      "主题 7：随手乱画的极简风，幼稚滑稽，潦草手绘，形象失真，稚拙可爱，同时带一点梦境、故事感与治愈氛围。",
      "请只选择其中一个主题来创作，不要混用多个主题。",
    ].join("\n"),
    scheduleType: "recurring",
    schedule: daily(21, 0),
    Icon: TemplateImageIcon,
  },
];
