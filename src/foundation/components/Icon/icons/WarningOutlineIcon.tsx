import { forwardRef } from "react";
import { createIcon } from "../Icon";

const WarningOutlineIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M6.86 2.572L1.215 12.002A1.333 1.333 0 002.355 14h11.29a1.333 1.333 0 001.14-2L9.14 2.572a1.333 1.333 0 00-2.28 0z" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 6v2.667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11.333h.007" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
WarningOutlineIconRaw.displayName = "WarningOutlineIconRaw";

export const WarningOutlineIcon = createIcon(WarningOutlineIconRaw);
