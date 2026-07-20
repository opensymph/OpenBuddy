import { forwardRef } from "react";
import { createIcon } from "../Icon";

const PlaneIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <path d="m3 12 16-7-3 14-4-5-3 4v-4l-6-2Z" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
));
PlaneIconRaw.displayName = "PlaneIconRaw";

export const PlaneIcon = createIcon(PlaneIconRaw);
