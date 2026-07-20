import { forwardRef } from "react";
import { createIcon } from "../Icon";

const PhoneIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <rect x="6" y="3" width="10" height="16" rx="2" strokeWidth="1.5" />
      <path d="M9.5 16.5h3" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 6.2h6" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
));
PhoneIconRaw.displayName = "PhoneIconRaw";

export const PhoneIcon = createIcon(PhoneIconRaw);
