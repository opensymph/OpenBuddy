import { forwardRef } from "react";
import { createIcon } from "../Icon";

const CirclePauseIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="10" y1="15" x2="10" y2="9" />
      <line x1="14" y1="15" x2="14" y2="9" />
    </svg>
));
CirclePauseIconRaw.displayName = "CirclePauseIconRaw";

export const CirclePauseIcon = createIcon(CirclePauseIconRaw);
