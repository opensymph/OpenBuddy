import { useState } from "react";
import { Play, Pause, Settings, Plus } from "lucide-react";

export function AutomationPanel() {
  const [automations, setAutomations] = useState([
    { id: "1", name: "每日总结", enabled: true, lastRun: "刚刚" },
    { id: "2", name: "代码检查", enabled: false, lastRun: "未运行" },
    { id: "3", name: "数据备份", enabled: true, lastRun: "今天 14:30" },
  ]);

  const handleToggle = (id: string) => {
    setAutomations(autos => autos.map(auto => 
      auto.id === id ? { ...auto, enabled: !auto.enabled } : auto
    ));
  };

  return (
    <div className="automation-panel">
      <div className="automation-panel__header">
        <span className="automation-panel__title">自动化</span>
        <button className="automation-panel__add-btn">
          <Plus size={16} />
        </button>
      </div>

      <div className="automation-panel__list">
        {automations.map(auto => (
          <div key={auto.id} className="automation-item">
            <div className="automation-item__content">
              <span className="automation-item__name">{auto.name}</span>
              <span className="automation-item__time">{auto.lastRun}</span>
            </div>
            <button 
              className={`automation-item__toggle ${auto.enabled ? "enabled" : ""}`}
              onClick={() => handleToggle(auto.id)}
            >
              {auto.enabled ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        ))}
      </div>

      <button className="automation-panel__settings">
        <Settings size={16} />
        <span>设置自动化</span>
      </button>
    </div>
  );
}