import { forwardRef } from "react";
import { createIcon } from "../Icon";

const CheckBoldIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      {...props}
    >
      <path fill="currentColor" transform="matrix(1 0 0 1 2.67627 3.97617)" d="M11.3137 0.9428L4.2426 8.0139L0 3.7712L0.9428 2.8284L4.2426 6.1283L10.3709 0L11.3137 0.9428Z" />
    </svg>
));
CheckBoldIconRaw.displayName = "CheckBoldIconRaw";

export const CheckBoldIcon = createIcon(CheckBoldIconRaw);
