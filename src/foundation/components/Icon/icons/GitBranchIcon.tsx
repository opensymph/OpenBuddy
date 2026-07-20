import { forwardRef } from "react";
import { createIcon } from "../Icon";

const GitBranchIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
    ref={ref}
    viewBox="0 0 16 16"
    fill="currentColor"
    stroke="none"
    {...props}
  >
    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.878A2.5 2.5 0 0 1 6 6h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm6 9.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm.75-9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM3.25 12a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
  </svg>
));
GitBranchIconRaw.displayName = "GitBranchIconRaw";

export const GitBranchIcon = createIcon(GitBranchIconRaw);
