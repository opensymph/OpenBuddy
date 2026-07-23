import { useState } from "react";
import { Users, MessageSquare, Search } from "lucide-react";

export function ColleaguesPanel() {
  const [colleagues] = useState([
    { id: "1", name: "张三", status: "在线", avatar: "👨‍💼" },
    { id: "2", name: "李四", status: "忙碌", avatar: "👨‍💼" },
    { id: "3", name: "王五", status: "在线", avatar: "👨‍💼" },
  ]);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredColleagues = colleagues.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="colleagues-panel">
      <div className="colleagues-panel__header">
        <span className="colleagues-panel__title">同事</span>
        <button className="colleagues-panel__add-btn">
          <Users size={16} />
        </button>
      </div>

      <div className="colleagues-panel__search">
        <Search size={16} className="colleagues-panel__search-icon" />
        <input
          type="text"
          placeholder="搜索同事..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="colleagues-panel__list">
        {filteredColleagues.map(colleague => (
          <div key={colleague.id} className="colleague-item">
            <div className="colleague-item__avatar">{colleague.avatar}</div>
            <div className="colleague-item__info">
              <span className="colleague-item__name">{colleague.name}</span>
              <span className={`colleague-item__status ${colleague.status.toLowerCase()}`}>
                {colleague.status}
              </span>
            </div>
            <button className="colleague-item__chat">
              <MessageSquare size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}