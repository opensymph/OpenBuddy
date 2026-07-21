/**
 * AutomationTemplateGrid — 自动化任务模版网格（compact 变体）。
 *
 * 复刻 WorkBuddy automation-template-grid.tsx 的 compact 分支：
 * 图标方块 + 标题 + 单行截断描述，点击即以模板预填进入创建表单。
 */
import type { AutomationTemplate } from "./template-config";

export function AutomationTemplateGrid({
  sectionTitle,
  templates,
  onSelectTemplate,
}: {
  sectionTitle?: string;
  templates: AutomationTemplate[];
  onSelectTemplate: (template: AutomationTemplate) => void;
}) {
  return (
    <div className="atm-template-section atm-template-section--compact">
      {sectionTitle ? <div className="atm-section-title">{sectionTitle}</div> : null}
      <div className="atm-template-list atm-template-list--compact">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="atm-template-card atm-template-card--compact"
            onClick={() => onSelectTemplate(template)}
          >
            <span className="atm-template-compact-avatar">
              <template.Icon className="atm-template-compact-icon" />
            </span>
            <span className="atm-template-compact-texts">
              <span className="atm-template-compact-title" title={template.title}>
                {template.title}
              </span>
              <span className="atm-template-compact-desc" title={template.content}>
                {template.content}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
