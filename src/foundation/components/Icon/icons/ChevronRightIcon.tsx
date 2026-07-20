import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ChevronRightIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 10 10"
      fill="none"
      {...props}
    >
      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
ChevronRightIconRaw.displayName = "ChevronRightIconRaw";

export const ChevronRightIcon = createIcon(ChevronRightIconRaw);
