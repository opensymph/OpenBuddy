import { forwardRef } from "react";
import { createIcon } from "../Icon";

const TemplateLightbulbIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 14c.2-.63.76-1.2 1.36-1.75A6 6 0 1 0 6 8c0 1.47.63 2.79 1.64 3.7.6.55 1.16 1.12 1.36 1.75" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
));
TemplateLightbulbIconRaw.displayName = "TemplateLightbulbIconRaw";

export const TemplateLightbulbIcon = createIcon(TemplateLightbulbIconRaw);
