import { forwardRef } from "react";
import { createIcon } from "../Icon";

const SubRepoIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
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
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
));
SubRepoIconRaw.displayName = "SubRepoIconRaw";

export const SubRepoIcon = createIcon(SubRepoIconRaw);
