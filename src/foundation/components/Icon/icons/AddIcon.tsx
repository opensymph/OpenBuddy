import { forwardRef } from "react";
import { createIcon } from "../Icon";

const AddIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      {...props}
    >
      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
));
AddIconRaw.displayName = "AddIconRaw";

export const AddIcon = createIcon(AddIconRaw);
