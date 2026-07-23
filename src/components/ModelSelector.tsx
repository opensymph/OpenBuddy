import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * Model picker dropdown for the Composer. Shows the current model id on a
 * trigger button; clicking opens a small menu listing every available model.
 * Selecting one calls onModelChange.
 */
export interface ModelOption {
  id: string;
  label?: string;
  /** Optional provider kind, used to group/sort models in the dropdown. */
  providerKind?: string;
  /** Optional provider id this model belongs to. */
  providerId?: string;
}

export function ModelSelector({
  modelId,
  models,
  onModelChange,
}: {
  /** Currently selected model id (displayed on the trigger). */
  modelId?: string;
  models: ModelOption[];
  onModelChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = models.find((m) => m.id === modelId);
  const triggerLabel = current?.label || current?.id || modelId || "Auto";

  return (
    <div className="model-selector" ref={ref}>
      <button
        className="model-selector__trigger"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="model-selector__label">{triggerLabel}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="model-selector__arrow" />
      </button>
      {open && (
        <ul className="model-selector__menu" role="listbox">
          {models.length === 0 && (
            <li className="model-selector__empty">未配置模型</li>
          )}
          {models.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={
                  "model-selector__item" +
                  (m.id === modelId ? " model-selector__item--active" : "")
                }
                onClick={() => {
                  onModelChange(m.id);
                  setOpen(false);
                }}
                role="option"
                aria-selected={m.id === modelId}
              >
                <span className="model-selector__item-label">{m.label || m.id}</span>
                <span className="model-selector__item-id">{m.id}</span>
                {m.id === modelId && <Check size={14} className="model-selector__check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
