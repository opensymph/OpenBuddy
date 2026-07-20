import { forwardRef } from "react";
import { createIcon } from "../Icon";

const SuccessToolIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...props}
    >
      <circle cx="8" cy="8" r="6" stroke="var(--wb-status-success)" strokeWidth="1.2" />
      <path d="M5 8l2 2 4-4" stroke="var(--wb-status-success)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
SuccessToolIconRaw.displayName = "SuccessToolIconRaw";

export const SuccessToolIcon = createIcon(SuccessToolIconRaw);
