import { useCallback, useState } from "react";
import type { AgentEntry, ExpertItem } from "@/lib/types";
import { MarketPills, type MarketTab } from "./MarketHeader";
import { ExpertsTab } from "./experts/ExpertsTab";
import { SkillsTab } from "./skills/SkillsTab";
import { ConnectorsTab } from "./connectors/ConnectorsTab";

interface Props {
  /** Start a new chat framed by an expert/assistant persona. */
  onUseExpert?: (agent: AgentEntry) => void;
  onToast?: (message: string) => void;
}

/** 专家·技能·连接器 — WorkBuddy-style unified market page (截图 1–7).
 *  Replaces the old simplified `ExpertsPanel`. The pill group is rendered once
 *  here and passed into each tab's topbar left slot, mirroring WorkBuddy's
 *  `headerLeft` pattern. */
export function ExpertsPanel({ onUseExpert, onToast }: Props) {
  const [tab, setTab] = useState<MarketTab>("experts");

  // Summon = open a fresh session seeded with the expert's persona. grok has no
  // session-level system prompt, so we pack the persona into the description;
  // App.handleStartWithExpert turns it into the seeding preamble.
  const handleSummon = useCallback((expert: ExpertItem) => {
    const name = expert.title || expert.name;
    const persona = [
      expert.desc,
      expert.init ? `默认起手示例：${expert.init}` : "",
      expert.tags.length ? `擅长：${expert.tags.join("、")}` : "",
    ].filter(Boolean).join("\n");
    const agent: AgentEntry = {
      name,
      description: persona || name,
      scope: "user",
      path: "",
      raw: "",
    };
    if (onUseExpert) onUseExpert(agent);
    else onToast?.(`已选择专家「${name}」（未连接会话启动器）`);
  }, [onUseExpert, onToast]);

  const pills = <MarketPills active={tab} onChange={setTab} />;

  return (
    <div className="um-market">
      {tab === "experts" && (
        <ExpertsTab pills={pills} onSummon={handleSummon} onToast={onToast} />
      )}
      {tab === "skills" && <SkillsTab pills={pills} onToast={onToast} />}
      {tab === "connectors" && <ConnectorsTab pills={pills} onToast={onToast} />}
    </div>
  );
}
