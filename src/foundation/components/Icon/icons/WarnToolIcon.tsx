import { forwardRef } from "react";
import { createIcon } from "../Icon";

const WarnToolIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...props}
    >
      <path d="M8 2L1.5 13h13L8 2z" stroke="var(--wb-status-warning)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6.5v3" stroke="var(--wb-status-warning)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.5" fill="var(--wb-status-warning)" />
    </svg>
));
WarnToolIconRaw.displayName = "WarnToolIconRaw";

export const WarnToolIcon = createIcon(WarnToolIconRaw);
