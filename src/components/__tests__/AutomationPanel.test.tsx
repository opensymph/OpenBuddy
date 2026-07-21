import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AutomationPanel } from "../AutomationPanel";
import type { AutomationSnapshot } from "@/lib/types";

// ---- mock Tauri IPC 层 ----
const emptySnapshot: AutomationSnapshot = { automations: [], records: [] };
let snapshot: AutomationSnapshot = emptySnapshot;

vi.mock("@/lib/grok-client", () => ({
  automationsSnapshot: vi.fn(async () => snapshot),
  automationsSave: vi.fn(async (a: unknown) => a),
  automationsDelete: vi.fn(async () => {}),
  automationsSetStatus: vi.fn(async () => {}),
  automationsRun: vi.fn(async () => {}),
  automationRecordsArchive: vi.fn(async () => {}),
  automationRecordsDelete: vi.fn(async () => {}),
  grokListWorkspaces: vi.fn(async () => []),
  providersList: vi.fn(async () => []),
  skillsList: vi.fn(async () => []),
  agentsList: vi.fn(async () => []),
  mcpList: vi.fn(async () => []),
}));

beforeEach(() => {
  snapshot = emptySnapshot;
});

describe("AutomationPanel（截图 1/3 空态）", () => {
  it("渲染 定时任务/运行记录 页签", async () => {
    render(<AutomationPanel />);
    expect(screen.getByText("定时任务")).toBeInTheDocument();
    expect(screen.getByText("运行记录")).toBeInTheDocument();
  });

  it("定时任务空态：hero 文案 + 添加按钮 + 12 个模板", async () => {
    render(<AutomationPanel />);
    await waitFor(() => expect(screen.getByText("开启你的第一个自动化任务吧")).toBeInTheDocument());
    expect(screen.getByText("+ 添加自动化")).toBeInTheDocument();
    expect(screen.getByText("自动化任务模版")).toBeInTheDocument();
    expect(screen.getByText("每日 AI 新闻推送")).toBeInTheDocument();
    expect(screen.getByText("可爱萌宠手机壁纸")).toBeInTheDocument();
  });

  it("运行记录空态：暂无运行记录", async () => {
    render(<AutomationPanel />);
    fireEvent.click(screen.getByText("运行记录"));
    await waitFor(() => expect(screen.getByText("暂无运行记录")).toBeInTheDocument());
  });

  it("点击「+ 添加自动化」进入表单（截图 2 字段）", async () => {
    render(<AutomationPanel />);
    await waitFor(() => screen.getByText("+ 添加自动化"));
    fireEvent.click(screen.getByText("+ 添加自动化"));
    await waitFor(() => expect(screen.getByText("添加自动化任务")).toBeInTheDocument());
    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(screen.getByText(/工作空间/)).toBeInTheDocument();
    expect(screen.getByText("提示词")).toBeInTheDocument();
    expect(screen.getByText("执行频率")).toBeInTheDocument();
    expect(screen.getByText("周期")).toBeInTheDocument();
    expect(screen.getByText("按间隔")).toBeInTheDocument();
    expect(screen.getByText("单次")).toBeInTheDocument();
    expect(screen.getByText(/生效日期区间/)).toBeInTheDocument();
    expect(screen.getByText(/推送到微信小程序/)).toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeInTheDocument();
    // 提示词工具条 chips
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText(/技能/)).toBeInTheDocument();
    expect(screen.getByText("召唤专家")).toBeInTheDocument();
    expect(screen.getByText("完全访问权限")).toBeInTheDocument();
  });

  it("点击模板卡片预填进入创建表单", async () => {
    render(<AutomationPanel />);
    await waitFor(() => screen.getByText("每日 AI 新闻推送"));
    fireEvent.click(screen.getByText("每日 AI 新闻推送"));
    await waitFor(() => {
      const nameInput = document.querySelector(".atm-modal-input") as HTMLInputElement;
      expect(nameInput?.value).toBe("每日 AI 新闻推送");
    });
  });

  it("频率切换：按间隔显示 每 N 小时，单次显示日期选择", async () => {
    render(<AutomationPanel />);
    await waitFor(() => screen.getByText("+ 添加自动化"));
    fireEvent.click(screen.getByText("+ 添加自动化"));
    await waitFor(() => screen.getByText("执行频率"));
    fireEvent.click(screen.getByText("按间隔"));
    expect(screen.getByText("每")).toBeInTheDocument();
    expect(screen.getByText("小时")).toBeInTheDocument();
    fireEvent.click(screen.getByText("单次"));
    // 单次模式下隐藏生效日期区间
    expect(screen.queryByText(/生效日期区间/)).not.toBeInTheDocument();
    // 切回周期恢复
    fireEvent.click(screen.getByText("周期"));
    expect(screen.getByText(/生效日期区间/)).toBeInTheDocument();
  });
});

describe("AutomationPanel（有任务/有记录）", () => {
  const baseAutomation = {
    id: "a1",
    name: "每日 AI 新闻推送",
    prompt: "整理 AI 新闻",
    cwds: "",
    status: "ACTIVE" as const,
    skills: [],
    connectorIds: [],
    permissionMode: "fullAccess" as const,
    scheduleType: "recurring" as const,
    schedule: {
      freq: "DAILY" as const,
      interval: 1,
      byday: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
      bymonthday: [],
      bymonth: [],
      byhour: 9,
      byminute: 0,
      intervalHours: 1,
    },
    pushToWeChat: false,
    createdAt: new Date().toISOString(),
  };

  it("任务列表：显示名称与调度摘要", async () => {
    snapshot = { automations: [baseAutomation], records: [] };
    render(<AutomationPanel />);
    await waitFor(() => expect(screen.getByText("每日 AI 新闻推送")).toBeInTheDocument());
    expect(screen.getByText("当前")).toBeInTheDocument();
    expect(screen.getByText("每天 09:00")).toBeInTheDocument();
    // 有任务时工具栏出现搜索/批量管理/添加自动化
    expect(screen.getByPlaceholderText("搜索自动化/记录")).toBeInTheDocument();
    expect(screen.getByText("批量管理")).toBeInTheDocument();
    expect(screen.getByText("添加自动化")).toBeInTheDocument();
  });

  it("运行记录：按天分组显示", async () => {
    snapshot = {
      automations: [baseAutomation],
      records: [
        {
          id: "r1",
          automationId: "a1",
          automationName: "每日 AI 新闻推送",
          status: "success",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          archived: false,
        },
      ],
    };
    render(<AutomationPanel />);
    fireEvent.click(screen.getByText("运行记录"));
    await waitFor(() => expect(screen.getByText("今天")).toBeInTheDocument());
    expect(screen.getByText("每日 AI 新闻推送")).toBeInTheDocument();
    expect(screen.getByText("成功")).toBeInTheDocument();
  });
});
