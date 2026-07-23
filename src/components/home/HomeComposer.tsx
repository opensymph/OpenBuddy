import { useState, useRef } from "react";
import { Send, Paperclip, Smile, LucideIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

interface HomeComposerProps {
  sceneTag?: { label: string; icon: LucideIcon } | null;
  onClearSceneTag?: () => void;
  onSend: (text: string) => void;
}

export function HomeComposer({ sceneTag, onClearSceneTag, onSend }: HomeComposerProps) {
  const [value, setValue] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (value.trim()) {
      onSend(value.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileAttach = async () => {
    const path = await openDialog({
      title: "选择文件",
      multiple: true,
      filters: [{ name: "All Files", extensions: ["*"] }]
    });
    if (path) {
      console.log("附件:", path);
      // 这里可以实现附件上传逻辑
    }
  };

  return (
    <div className="home-composer">
      {/* 场景标签 */}
      {sceneTag && (
        <div className="scene-tag">
          <span className="scene-tag__icon">{sceneTag.icon && <sceneTag.icon size={16} />}</span>
          <span className="scene-tag__label">{sceneTag.label}</span>
          <button className="scene-tag__remove" onClick={onClearSceneTag}>
            ×
          </button>
        </div>
      )}

      <div className="composer-card">
        <div className="composer-card__content">
          <textarea
            ref={textareaRef}
            className="composer-card__input"
            placeholder="输入你的指令..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{ height: "auto" }}
          />
        </div>

        <div className="composer-card__footer">
          <div className="composer-card__left">
            <button 
              className="composer-card__action-btn"
              onClick={handleFileAttach}
              title="添加附件"
            >
              <Paperclip size={20} />
            </button>
            <button 
              className="composer-card__action-btn"
              title="表情"
            >
              <Smile size={20} />
            </button>
          </div>

          <div className="composer-card__right">
            <button 
              className="composer-card__action-btn"
              onClick={() => setShowAddMenu(!showAddMenu)}
              title="更多"
            >
              <span className="more-btn">⋯</span>
            </button>

            <button 
              className="composer-card__send-btn"
              onClick={handleSend}
              disabled={!value.trim()}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* 添加菜单 */}
      {showAddMenu && (
        <div className="composer-add-menu">
          <button onClick={handleFileAttach}>📎 附件</button>
          <button>📷 拍照</button>
          <button>🎤 语音输入</button>
          <button>🗃️ 知识库</button>
        </div>
      )}
    </div>
  );
}