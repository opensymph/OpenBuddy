import { useState } from "react";
import type { HomeModeId } from "../home-scenes";
import { getMode } from "../home-scenes";
import { ChevronDownIcon } from "@/foundation/components/Icon/icons";

interface PracticeCasesProps {
  activeMode: HomeModeId;
  onSelectTemplate: (prompt: string) => void;
}

export function PracticeCases({ activeMode, onSelectTemplate }: PracticeCasesProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const mode = getMode(activeMode);
  const categories = mode.categories;

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  return (
    <div className="practice-cases">
      <div className="practice-cases__header">
        <span className="practice-cases__title">实践案例</span>
        <span className="practice-cases__subtitle">从这里开始你的第一步</span>
      </div>

      <div className="practice-cases__categories">
        {categories.map((category) => (
          <div key={category.id} className="practice-category">
            <button
              className={`practice-category__header ${expandedCategory === category.id ? "expanded" : ""}`}
              onClick={() => toggleCategory(category.id)}
            >
              <div className="practice-category__header-main">
                <span className="practice-category__icon">{category.icon && <category.icon size={20} />}</span>
                <span className="practice-category__label">{category.label}</span>
              </div>
              <span className="practice-category__arrow">
                <ChevronDownIcon size={18} />
              </span>
            </button>

            {expandedCategory === category.id && (
              <div className="practice-category__content">
                <div className="practice-category__templates">
                  {category.templates.map((template, index) => (
                    <button
                      key={index}
                      className="practice-template"
                      onClick={() => onSelectTemplate(template.prompt)}
                    >
                      <span className="practice-template__title">{template.title}</span>
                      <span className="practice-template__subtitle">{template.prompt.substring(0, 60)}...</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}