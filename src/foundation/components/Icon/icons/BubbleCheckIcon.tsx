import { forwardRef } from "react";
import { createIcon } from "../Icon";

const BubbleCheckIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M13.3332 4L5.99984 11.3333L2.6665 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
BubbleCheckIconRaw.displayName = "BubbleCheckIconRaw";

export const BubbleCheckIcon = createIcon(BubbleCheckIconRaw);
