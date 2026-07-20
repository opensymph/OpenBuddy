import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ArrowToolIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...props}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
ArrowToolIconRaw.displayName = "ArrowToolIconRaw";

export const ArrowToolIcon = createIcon(ArrowToolIconRaw);
