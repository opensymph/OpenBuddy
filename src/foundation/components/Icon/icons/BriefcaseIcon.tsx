import { forwardRef } from "react";
import { createIcon } from "../Icon";

const BriefcaseIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <rect x="3" y="6.5" width="16" height="11" rx="1.6" strokeWidth="1.5" />
      <path d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 14 5v1.5" strokeWidth="1.5" />
      <path d="M3 11.5h16" strokeWidth="1.5" />
    </svg>
));
BriefcaseIconRaw.displayName = "BriefcaseIconRaw";

export const BriefcaseIcon = createIcon(BriefcaseIconRaw);
