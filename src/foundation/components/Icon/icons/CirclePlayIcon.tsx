import { forwardRef } from "react";
import { createIcon } from "../Icon";

const CirclePlayIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
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
      <path d="M10 8l6 4-6 4V8z" />
    </svg>
));
CirclePlayIconRaw.displayName = "CirclePlayIconRaw";

export const CirclePlayIcon = createIcon(CirclePlayIconRaw);
