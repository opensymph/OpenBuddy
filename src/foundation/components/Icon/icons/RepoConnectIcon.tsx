import { forwardRef } from "react";
import { createIcon } from "../Icon";

const RepoConnectIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 14 14"
      fill="none"
      {...props}
    >
      <path d="M7.5819 6.4181L7.5819 1.75L6.4181 1.75L6.4181 6.4181L1.75 6.4181L1.75 7.5819L6.4181 7.5819L6.4181 12.25L7.5819 12.25L7.5819 7.5819L12.25 7.5819L12.25 6.4181L7.5819 6.4181Z" fill="currentColor" fillRule="evenodd" />
    </svg>
));
RepoConnectIconRaw.displayName = "RepoConnectIconRaw";

export const RepoConnectIcon = createIcon(RepoConnectIconRaw);
