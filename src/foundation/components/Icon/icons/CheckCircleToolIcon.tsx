import { forwardRef } from "react";
import { createIcon } from "../Icon";

const CheckCircleToolIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...props}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
CheckCircleToolIconRaw.displayName = "CheckCircleToolIconRaw";

export const CheckCircleToolIcon = createIcon(CheckCircleToolIconRaw);
