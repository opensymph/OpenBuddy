import { forwardRef } from "react";
import { createIcon } from "../Icon";

const MoreDotsIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
));
MoreDotsIconRaw.displayName = "MoreDotsIconRaw";

export const MoreDotsIcon = createIcon(MoreDotsIconRaw);
