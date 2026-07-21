import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { XCloseIcon, FolderOpenIcon } from "@/foundation/components/Icon/icons";
import { skillsAdd } from "@/lib/grok-client";

/** "导入技能" modal (截图 5): drag/click drop zone + 非高风险自动安装 checkbox +
 *  file requirements. openbuddy has no cloud install / security scanner, so the
 *  checkbox is UI-only and install = register a local path via grok's
 *  `skills_add` (a SKILL.md or a folder containing one; .zip must be unpacked). */
export function ImportSkillModal({
  onClose, onToast, onInstalled,
}: {
  onClose: () => void;
  onToast?: (m: string) => void;
  onInstalled?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [autoInstall, setAutoInstall] = useState(true);
  const [busy, setBusy] = useState(false);

  const install = async (path: string) => {
    setBusy(true);
    try {
      await skillsAdd(path);
      onToast?.(`已导入技能：${path.split(/[\\/]/).pop()}`);
      onInstalled?.();
      onClose();
    } catch (e) {
      onToast?.(`导入失败：${String(e).replace(/^Error:\s*/, "")}（.zip 请先解压为含 SKILL.md 的文件夹）`);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    try {
      const sel = await openDialog({
        multiple: false,
        title: "选择技能文件（SKILL.md 或 .zip）",
        filters: [{ name: "技能", extensions: ["md", "zip"] }],
      });
      if (sel && !Array.isArray(sel)) await install(sel);
    } catch { /* cancelled */ }
  };

  const pickFolder = async () => {
    try {
      const sel = await openDialog({ directory: true, multiple: false, title: "选择技能文件夹" });
      if (sel && !Array.isArray(sel)) await install(sel);
    } catch { /* cancelled */ }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    // Tauri webview exposes a local path on dropped files via the `path` field.
    const files = Array.from(e.dataTransfer.files) as (File & { path?: string })[];
    const p = files[0]?.path;
    if (p) await install(p);
    else onToast?.("无法读取拖入文件的路径，请点击选择");
  };

  return (
    <div className="modal-overlay sk-import-overlay" onClick={onClose}>
      <div className="sk-import" onClick={(e) => e.stopPropagation()}>
        <div className="sk-import-head">
          <h3>导入技能</h3>
          <button type="button" className="sk-import-close" onClick={onClose}>
            <XCloseIcon size="md" />
          </button>
        </div>
        <div className="sk-import-body">
          <div
            className={`sk-drop${dragging ? " sk-drop--drag" : ""}${busy ? " sk-drop--busy" : ""}`}
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <FolderOpenIcon size="xl" className="sk-drop-icon" />
            <div className="sk-drop-title">{dragging ? "松开以导入" : busy ? "导入中…" : "拖拽文件或点击上传"}</div>
          </div>
          <button type="button" className="sk-import-folder" onClick={pickFolder}>
            或选择一个含 SKILL.md 的文件夹
          </button>

          <label className="sk-import-check">
            <input type="checkbox" checked={autoInstall}
              onChange={(e) => setAutoInstall(e.target.checked)} />
            <span>非高风险自动安装</span>
          </label>

          <div className="sk-import-req">
            <div className="sk-import-req-title">文件要求</div>
            <ul className="sk-import-req-list">
              <li>文件夹或者 .zip 需要包含 SKILL.md 文件</li>
              <li>.md 文件需包含 YAML 格式的技能名称和描述</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
