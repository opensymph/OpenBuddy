import { forwardRef } from "react";
import { createIcon } from "../Icon";

const RepoIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
));
RepoIconRaw.displayName = "RepoIconRaw";

export const RepoIcon = createIcon(RepoIconRaw);
