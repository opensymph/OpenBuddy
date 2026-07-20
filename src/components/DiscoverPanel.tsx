/**
 * 发现面板（一键启动器）- 对标 WorkBuddy discover-panel 的 launch wizard
 *
 * 工作流：
 *  1. 选一个「场景」（代码/文档/图片/表格/幻灯片 等，对应 WorkBuddy browseByScene）
 *  2. 展示该场景需要的能力（依赖哪些 skills / MCP / agents）
 *  3. 检查依赖是否已就绪（接 skillsList / mcpList / agentsList）
 *  4. 缺失的依赖可一键安装（接 marketplace install / 或引导到对应面板）
 *  5. 输入 prompt → 在新会话中运行（接 grokNewSession + grokSend）
 *
 * 与 WorkBuddy discover 的"1-click demo launcher"语义一致：
 * provision MCP + skill + expert，然后 run prompt。
 */
import { useCallback, useEffect, useState } from "react";
import {
  PlayIcon,
  Code2Icon,
  FileTextIcon,
  ImageToolIcon,
  DatabaseToolIcon,
  WbFileSlideIcon,
  SparklesIcon,
  CheckIcon,
  RefreshCwIcon,
} from "@/foundation/components/Icon/icons";
import {
  agentsList,
  mcpList,
  skillsList,
} from "@/lib/grok-client";
import type { AgentEntry, McpServerEntry, SkillInfo } from "@/lib/types";

// 内置场景（对应 WorkBuddy browseByScene: 代码/文档/图片/表格/幻灯片/其他/官方）
// 每个场景声明它推荐的能力，UI 检查这些是否已就绪。
interface Scene {
  key: string;
  label: string;
  icon: typeof Code2Icon;
  description: string;
  // 推荐的技能名（部分匹配 skillsList 的 name）
  recommendedSkills: string[];
  // 推荐的 MCP 关键词（部分匹配 mcpList 的 name）
  recommendedMcpKeywords: string[];
  // 推荐的助理名（部分匹配 agentsList 的 name）
  recommendedAgentKeywords: string[];
  // 场景 prompt 模板（用户可编辑）
  promptTemplate: string;
}

const SCENES: Scene[] = [
  {
    key: "code",
    label: "代码",
    icon: Code2Icon,
    description: "代码编写、审查、调试、重构",
    recommendedSkills: ["commit", "review"],
    recommendedMcpKeywords: ["filesystem", "github"],
    recommendedAgentKeywords: ["代码", "code"],
    promptTemplate:
      "请帮我审查这段代码，指出潜在问题并给出改进建议：\n\n（粘贴你的代码）",
  },
  {
    key: "document",
    label: "文档",
    icon: FileTextIcon,
    description: "撰写和优化文档、报告、邮件",
    recommendedSkills: [],
    recommendedMcpKeywords: [],
    recommendedAgentKeywords: ["文档", "doc"],
    promptTemplate:
      "请帮我撰写一份关于以下主题的文档：\n\n（描述你的主题和要求）",
  },
  {
    key: "image",
    label: "图片",
    icon: ImageToolIcon,
    description: "图片生成、分析、处理",
    recommendedSkills: [],
    recommendedMcpKeywords: ["image", "dalle", "stable-diffusion"],
    recommendedAgentKeywords: ["图", "image"],
    promptTemplate: "请描述你想生成或分析的图片：\n\n（描述图片内容）",
  },
  {
    key: "data",
    label: "表格/数据",
    icon: DatabaseToolIcon,
    description: "数据分析、可视化、SQL",
    recommendedSkills: [],
    recommendedMcpKeywords: ["sqlite", "postgres", "mysql"],
    recommendedAgentKeywords: ["数据", "分析", "data"],
    promptTemplate:
      "请帮我分析这份数据：\n\n（描述数据来源和分析目标）",
  },
  {
    key: "slides",
    label: "幻灯片",
    icon: WbFileSlideIcon,
    description: "生成 PPT、演示文稿",
    recommendedSkills: [],
    recommendedMcpKeywords: [],
    recommendedAgentKeywords: ["ppt", "幻灯", "slide"],
    promptTemplate: "请帮我生成一份演示文稿：\n\n（描述主题和页数）",
  },
];

interface DiscoverPanelProps {
  sessionId?: string;
  /** Called when the user launches the wizard — opens a new session + sends prompt. */
  onLaunch?: (prompt: string, agent?: AgentEntry) => void;
  onToast?: (msg: string) => void;
}

export function DiscoverPanel({ onLaunch, onToast }: DiscoverPanelProps) {
  const [selected, setSelected] = useState<Scene | null>(null);
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [chosenAgent, setChosenAgent] = useState<AgentEntry | undefined>(undefined);

  // Load all three registries so we can check scene dependencies.
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sk, mc, ag] = await Promise.all([
        skillsList().catch(() => [] as SkillInfo[]),
        mcpList().catch(() => [] as McpServerEntry[]),
        agentsList().catch(() => [] as AgentEntry[]),
      ]);
      setSkills(sk);
      setServers(mc);
      setAgents(ag);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSelectScene = (scene: Scene) => {
    setSelected(scene);
    setPrompt(scene.promptTemplate);
    // Auto-pick a matching agent if one exists.
    const match = agents.find((a) =>
      scene.recommendedAgentKeywords.some(
        (kw) =>
          a.name.toLowerCase().includes(kw.toLowerCase()) ||
          (a.description ?? "").toLowerCase().includes(kw.toLowerCase()),
      ),
    );
    setChosenAgent(match);
  };

  // Check which dependencies are satisfied.
  const depStatus = selected
    ? {
        skills: selected.recommendedSkills.map((kw) => ({
          kw,
          satisfied: skills.some(
            (s) =>
              s.enabled &&
              s.name.toLowerCase().includes(kw.toLowerCase()),
          ),
        })),
        mcp: selected.recommendedMcpKeywords.map((kw) => ({
          kw,
          satisfied: servers.some(
            (s) =>
              s.enabled &&
              s.name.toLowerCase().includes(kw.toLowerCase()),
          ),
        })),
        agents: selected.recommendedAgentKeywords.map((kw) => ({
          kw,
          satisfied: agents.some(
            (a) =>
              a.name.toLowerCase().includes(kw.toLowerCase()) ||
              (a.description ?? "").toLowerCase().includes(kw.toLowerCase()),
          ),
        })),
      }
    : null;

  const allSatisfied =
    depStatus &&
    [...depStatus.skills, ...depStatus.mcp, ...depStatus.agents].every(
      (d) => d.satisfied,
    );
  const hasAnyDeps =
    depStatus &&
    [...depStatus.skills, ...depStatus.mcp, ...depStatus.agents].length > 0;

  const handleLaunch = useCallback(async () => {
    if (!prompt.trim() || !onLaunch) return;
    setLaunching(true);
    try {
      onLaunch(prompt.trim(), chosenAgent);
      onToast?.("已启动新会话");
    } catch (e) {
      onToast?.(`启动失败：${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setLaunching(false);
    }
  }, [prompt, onLaunch, chosenAgent, onToast]);

  return (
    <div className="discover-panel">
      <div className="discover-panel__header">
        <h2 className="discover-panel__title">
          <PlayIcon size="md" /> 发现（一键启动器）
        </h2>
        <button
          className="discover-panel__action-btn"
          onClick={reload}
          disabled={loading}
          title="重新检查依赖"
        >
          <RefreshCwIcon size="sm" /> 刷新依赖
        </button>
      </div>

      <p className="discover-panel__desc">
        选一个场景，OpenBuddy 会检查所需的技能/MCP/助理是否就绪，
        然后在新会话里运行你的 prompt。缺依赖时会标红提示。
      </p>

      {/* 场景选择 */}
      <div className="discover-panel__scenes">
        {SCENES.map((scene) => {
          const Icon = scene.icon;
          const active = selected?.key === scene.key;
          return (
            <button
              key={scene.key}
              className={`discover-scene ${active ? "discover-scene--active" : ""}`}
              onClick={() => handleSelectScene(scene)}
            >
              <Icon size="lg" />
              <div>
                <div className="discover-scene__label">{scene.label}</div>
                <div className="discover-scene__desc">{scene.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 选中场景后的依赖检查 + prompt 编辑 */}
      {selected && (
        <div className="discover-launcher">
          <h3 className="discover-launcher__title">
            启动「{selected.label}」
          </h3>

          {/* 依赖状态 */}
          {hasAnyDeps && (
            <div className="discover-launcher__deps">
              <div className="discover-launcher__deps-label">
                能力依赖检查：
                {allSatisfied ? (
                  <span className="discover-launcher__deps-ok">
                    <CheckIcon size="sm" /> 全部就绪
                  </span>
                ) : (
                  <span className="discover-launcher__deps-warn">
                    部分缺失（仍可启动）
                  </span>
                )}
              </div>
              <div className="discover-launcher__dep-list">
                {depStatus?.skills.map((d) => (
                  <DepChip key={`s-${d.kw}`} label={`技能: ${d.kw}`} satisfied={d.satisfied} />
                ))}
                {depStatus?.mcp.map((d) => (
                  <DepChip key={`m-${d.kw}`} label={`MCP: ${d.kw}`} satisfied={d.satisfied} />
                ))}
                {depStatus?.agents.map((d) => (
                  <DepChip key={`a-${d.kw}`} label={`助理: ${d.kw}`} satisfied={d.satisfied} />
                ))}
              </div>
              {!allSatisfied && (
                <p className="discover-launcher__deps-hint">
                  缺失项可在「专家·技能·连接器」面板安装，或忽略直接启动
                  （grok 会用内置能力尝试）。
                </p>
              )}
            </div>
          )}

          {/* 助理选择（可选） */}
          {agents.length > 0 && (
            <div className="discover-launcher__field">
              <label className="discover-launcher__field-label">
                使用助理（可选，作为 prompt 的角色引导）
              </label>
              <select
                className="discover-launcher__select"
                value={chosenAgent?.path ?? ""}
                onChange={(e) =>
                  setChosenAgent(agents.find((a) => a.path === e.target.value))
                }
              >
                <option value="">不指定</option>
                {agents.map((a) => (
                  <option key={a.path} value={a.path}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt 编辑器 */}
          <div className="discover-launcher__field">
            <label className="discover-launcher__field-label">Prompt</label>
            <textarea
              className="discover-launcher__textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder="描述你想让 grok 做的事…"
            />
          </div>

          <button
            className="discover-launcher__launch"
            onClick={handleLaunch}
            disabled={!prompt.trim() || launching}
          >
            {launching ? (
              "启动中…"
            ) : (
              <>
                <SparklesIcon size="sm" /> 在新会话中运行
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function DepChip({ label, satisfied }: { label: string; satisfied: boolean }) {
  return (
    <span
      className={`discover-dep ${satisfied ? "discover-dep--ok" : "discover-dep--miss"}`}
      title={satisfied ? "已就绪" : "未安装/未启用"}
    >
      {satisfied ? <CheckIcon size={10} /> : "⚠"}
      {label}
    </span>
  );
}
