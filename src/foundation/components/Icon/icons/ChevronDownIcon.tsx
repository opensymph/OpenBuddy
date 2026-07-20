import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ChevronDownIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 14 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path transform="translate(2.967, 4.717)" d="M7.2416 0L4.0333 3.2083L0.825 0L0 0.825L4.0333 4.8582L8.0666 0.825L7.2416 0Z" />
    </svg>
));
ChevronDownIconRaw.displayName = "ChevronDownIconRaw";

export const ChevronDownIcon = createIcon(ChevronDownIconRaw);
