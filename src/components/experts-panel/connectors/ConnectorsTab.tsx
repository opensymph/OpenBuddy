import { useState } from "react";
import { AddCircleIcon, AddIcon } from "@/foundation/components/Icon/icons";
import { CONNECTOR_LIST } from "../data/connectors-catalog";
import { LetterAvatar } from "../shared/LetterAvatar";
import { McpModal } from "./McpModal";

interface Props {
  pills: React.ReactNode;
  onToast?: (m: string) => void;
}

/** 连接器 tab (截图 4): a two-column directory of MCP-type connectors; both the
 *  per-row "+" and the top-right 自定义连接器 open the MCP 服务管理 modal. */
export function ConnectorsTab({ pills, onToast }: Props) {
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpEditing, setMcpEditing] = useState(false);

  const openList = () => { setMcpEditing(false); setMcpOpen(true); };
  const openEditor = () => { setMcpEditing(true); setMcpOpen(true); };

  return (
    <div className="um-page">
      <header className="um-topbar">
        <div className="um-topbar-left">{pills}</div>
        <div className="um-topbar-right">
          <button type="button" className="um-btn um-btn--grey" onClick={openEditor}>
            <AddCircleIcon size="sm" /><span>自定义连接器</span>
          </button>
        </div>
      </header>

      <div className="um-scroll">
        <div className="cn-grid">
          {CONNECTOR_LIST.map((c) => (
            <article key={c.id} className="cn-card" onClick={openList}>
              <LetterAvatar name={c.name} color={c.color} size={36} shape="square" />
              <div className="cn-card-info">
                <div className="cn-card-name">{c.name}</div>
                <p className="cn-card-desc">{c.desc}</p>
              </div>
              <button type="button" className="sk-add" title="配置 / 连接"
                onClick={(e) => { e.stopPropagation(); openList(); }}>
                <AddIcon size="sm" />
              </button>
            </article>
          ))}
        </div>
      </div>

      {mcpOpen && (
        <McpModal onClose={() => setMcpOpen(false)} onToast={onToast} initialEditing={mcpEditing} />
      )}
    </div>
  );
}
