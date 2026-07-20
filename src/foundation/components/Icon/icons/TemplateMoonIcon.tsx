import { forwardRef } from "react";
import { createIcon } from "../Icon";

const TemplateMoonIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
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
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
));
TemplateMoonIconRaw.displayName = "TemplateMoonIconRaw";

export const TemplateMoonIcon = createIcon(TemplateMoonIconRaw);
