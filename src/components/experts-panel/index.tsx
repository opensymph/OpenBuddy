import { useState } from "react";
import { MarketPills, type MarketTab } from "./MarketHeader";
import { ExpertsTab } from "./experts/ExpertsTab";
import { SkillsTab } from "./skills/SkillsTab";
import { ConnectorsTab } from "./connectors/ConnectorsTab";

interface Props {
  /** Navigate to the home page (after summoning an expert). */
  onGoHome?: () => void;
  onToast?: (message: string) => void;
}

/** 专家·技能·连接器 — WorkBuddy-style unified market page.
 *  The pill group is rendered once here and passed into each tab's topbar
 *  left slot, mirroring WorkBuddy's `headerLeft` pattern. */
export function ExpertsPanel({ onGoHome, onToast }: Props) {
  const [tab, setTab] = useState<MarketTab>("experts");

  const pills = <MarketPills active={tab} onChange={setTab} />;

  return (
    <div className="um-market">
      {tab === "experts" && (
        <ExpertsTab pills={pills} onGoHome={onGoHome} onToast={onToast} />
      )}
      {tab === "skills" && <SkillsTab pills={pills} onToast={onToast} />}
      {tab === "connectors" && <ConnectorsTab pills={pills} onToast={onToast} />}
    </div>
  );
}
