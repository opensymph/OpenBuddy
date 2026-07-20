import { forwardRef } from "react";
import { createIcon } from "../Icon";

const Code2IconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
    ref={ref}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
));
Code2IconRaw.displayName = "Code2IconRaw";

export const Code2Icon = createIcon(Code2IconRaw);
