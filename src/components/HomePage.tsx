import { useState } from "react";
import { Briefcase, Code2, Palette, Landmark, BarChart3 } from "lucide-react";
import { Composer } from "./Composer";
import type { ModelOption } from "./ModelSelector";
import type { WorkspaceInfo } from "@/lib/grok-client";
import { FileTextIcon, MoreIcon } from "@/foundation/components/Icon/icons";

const SCENES = [
  { label: "日常办公", icon: <Briefcase size={14} /> },
  { label: "代码开发", icon: <Code2 size={14} /> },
  { label: "设计创意", icon: <Palette size={14} /> },
];
// Chips: clicking one seeds the Composer with a starter prompt (instead of a
// useless toast). Each chip maps to a concrete grok-runnable prompt template.
const CHIPS: { label: string; icon: React.ReactNode; prompt: string }[] = [
  {
    label: "文档处理",
    icon: <FileTextIcon size="sm" />,
    prompt: "请帮我处理文档：我会告诉你具体需求（例如改写、润色、总结、翻译、生成大纲）。",
  },
  {
    label: "金融服务",
    icon: <Landmark size={14} />,
    prompt: "请帮我分析金融/财务问题：例如投资组合建议、风险评估、财报解读。",
  },
  {
    label: "数据分析及可视化",
    icon: <BarChart3 size={14} />,
    prompt: "请帮我做数据分析：描述你的数据和想看的结论，我会给出分析步骤和可视化建议。",
  },
  {
    label: "更多",
    icon: <MoreIcon size="sm" />,
    prompt: "", // empty = just focus the input
  },
];

/** WorkBuddy 风格首页:双行大标题 + 场景标签 + 快捷 chips + Composer 卡片。 */
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
}) {
  const [scene, setScene] = useState("日常办公");
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);

  const handleChip = (chip: (typeof CHIPS)[number]) => {
    if (chip.prompt) {
      setSeedPrompt(chip.prompt);
    } else {
      // "更多" — no real backend for a category picker; keep the toast but
      // make it actionable (tell the user they can type / for commands).
      onPlaceholder('输入 "/" 查看可用命令');
    }
  };

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__header">
          <h1 className="home__title">OpenBuddy</h1>
          <p className="home__subtitle">你的职场超能力</p>
        </header>

        <div className="home__scenes" role="tablist">
          {SCENES.map((s) => (
            <button
              key={s.label}
              role="tab"
              aria-selected={scene === s.label}
              aria-label={s.label}
              className={"home__scene" + (scene === s.label ? " home__scene--active" : "")}
              onClick={() => setScene(s.label)}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <section className="home__composer-area">
          <div className="home__chips">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                className="home__chip"
                aria-label={c.label}
                onClick={() => handleChip(c)}
              >
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <Composer
            streaming={streaming}
            onSend={onSend}
            onCancel={() => {}}
            apiReady={apiReady}
            onOpenSettings={onOpenSettings}
            onPlaceholder={onPlaceholder}
            initialText={seedPrompt ?? undefined}
            onInitialTextConsumed={() => setSeedPrompt(null)}
            modelId={modelId}
            models={models}
            onModelChange={onModelChange}
            cwd={cwd}
            workspaces={workspaces}
            onSelectWorkspace={onSelectWorkspace}
            showMeta
          />
        </section>
      </div>
    </div>
  );
}
