import { useState } from "react";
import { WbPinIcon } from "@/foundation/components/Icon/icons";

export function PinnedSection() {
  const [pinnedSessions, setPinnedSessions] = useState([
    { id: "1", title: "Q3 项目规划", pinned: true },
    { id: "2", title: "代码审查任务", pinned: true },
    { id: "3", title: "客户需求分析", pinned: true },
  ]);

  const handleUnpin = (id: string) => {
    setPinnedSessions(sessions => sessions.filter(s => s.id !== id));
  };

  return (
    <div className="pinned-section">
      <div className="pinned-section__header">
        <span className="pinned-section__title">置顶会话</span>
      </div>
      <div className="pinned-section__list">
        {pinnedSessions.map(session => (
          <div key={session.id} className="pinned-session">
            <div className="pinned-session__content">
              <span className="pinned-session__icon">📌</span>
              <span className="pinned-session__title">{session.title}</span>
            </div>
            <button 
              className="pinned-session__unpin"
              onClick={() => handleUnpin(session.id)}
              title="取消置顶"
            >
              <WbPinIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}