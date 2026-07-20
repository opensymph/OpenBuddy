import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ArrowUpIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M8 3L8 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 7L8 3L12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
ArrowUpIconRaw.displayName = "ArrowUpIconRaw";

export const ArrowUpIcon = createIcon(ArrowUpIconRaw);
