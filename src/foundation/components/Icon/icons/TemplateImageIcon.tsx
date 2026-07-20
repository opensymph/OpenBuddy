import { forwardRef } from "react";
import { createIcon } from "../Icon";

const TemplateImageIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
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
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.83 0L6 21" />
    </svg>
));
TemplateImageIconRaw.displayName = "TemplateImageIconRaw";

export const TemplateImageIcon = createIcon(TemplateImageIconRaw);
