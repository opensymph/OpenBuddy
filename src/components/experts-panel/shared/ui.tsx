import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/foundation/components/Icon/icons";

/** A pill filter chip (category rows). */
export function Chip({
  label, active, count, onClick,
}: {
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`um-chip${active ? " um-chip--active" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="um-chip-count">{count}</span>
      )}
    </button>
  );
}

/** A segmented control (推荐 / SkillHub / 套件, 最热 / 最新, …). */
export function SegmentTabs<T extends string>({
  items, value, onChange, className,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={`um-segment${className ? ` ${className}` : ""}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          className={`um-segment-item${value === it.key ? " um-segment-item--active" : ""}`}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal scroll strip with an optional floating "next" chevron that
 *  appears only while more content is reachable to the right. */
export function ScrollRow({
  children, className, itemClassName,
}: {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canRight, setCanRight] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [children]);

  // Re-measure after images / fonts settle.
  useEffect(() => {
    const t = window.setTimeout(measure, 250);
    return () => window.clearTimeout(t);
  }, [children]);

  const scrollNext = () => {
    const el = ref.current;
    if (el) el.scrollBy({ left: el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className={`um-scrollrow${className ? ` ${className}` : ""}`}>
      <div ref={ref} className={`um-scrollrow-track${itemClassName ? ` ${itemClassName}` : ""}`}>
        {children}
      </div>
      {canRight && (
        <button type="button" className="um-scrollrow-next" onClick={scrollNext} aria-label="向右滚动">
          <ChevronRightIcon size="sm" />
        </button>
      )}
    </div>
  );
}
