import { forwardRef } from "react";
import { createIcon } from "../Icon";

const FailedIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 14"
      fill="none"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" transform="matrix(1 0 0 1 2.21356 2.21356)" d="M5.6093 4.7864L9.5729 8.75L8.75 9.5729L4.7864 5.6093L0.8229 9.5729L0 8.75L3.9636 4.7864L0 0.8229L0.8229 0L4.7864 3.9636L8.75 0L9.5729 0.8229L5.6093 4.7864Z" />
    </svg>
));
FailedIconRaw.displayName = "FailedIconRaw";

export const FailedIcon = createIcon(FailedIconRaw);
