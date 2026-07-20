import { forwardRef } from "react";
import { createIcon } from "../Icon";

const CheckIconRaw = forwardRef<SVGSVGElement>((_props, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
));
CheckIconRaw.displayName = "CheckIconRaw";

export const CheckIcon = createIcon(CheckIconRaw);
