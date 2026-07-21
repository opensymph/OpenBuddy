import {
  ExpertTabIcon, SkillTabIcon, ConnectorTabIcon,
} from "@/foundation/components/Icon/icons";

export type MarketTab = "experts" | "skills" | "connectors";

const TABS: { key: MarketTab; label: string; Icon: typeof ExpertTabIcon }[] = [
  { key: "experts", label: "专家", Icon: ExpertTabIcon },
  { key: "skills", label: "技能", Icon: SkillTabIcon },
  { key: "connectors", label: "连接器", Icon: ConnectorTabIcon },
];

/** The dark pill tab group (专家 / 技能 / 连接器) shown at the top-left of every
 *  market tab's topbar (截图 1–4). */
export function MarketPills({
  active, onChange,
}: {
  active: MarketTab;
  onChange: (t: MarketTab) => void;
}) {
  return (
    <div className="um-pills" role="tablist" aria-label="专家·技能·连接器">
      {TABS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={`um-pill${active === key ? " um-pill--active" : ""}`}
          onClick={() => onChange(key)}
        >
          <Icon size="sm" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
