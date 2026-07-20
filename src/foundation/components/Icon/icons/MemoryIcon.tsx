import { forwardRef } from "react";
import { createIcon } from "../Icon";

const MemoryIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <path d="M11 3.8a5 5 0 0 0-3.4 8.7c.5.5.9 1.1 1 1.8h4.8c.1-.7.5-1.3 1-1.8A5 5 0 0 0 11 3.8Z" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.7 16.2h4.6M9.4 18.2h3.2" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
));
MemoryIconRaw.displayName = "MemoryIconRaw";

export const MemoryIcon = createIcon(MemoryIconRaw);
