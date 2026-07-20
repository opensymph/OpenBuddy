import { forwardRef } from "react";
import { createIcon } from "../Icon";

const PinFilledIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path transform="matrix(1 0 0 1 2.20556 0)" d="M1.2944 10C0.4704 10 0 9.0594 0.4943 8.4001L2.294 6L2.294 2C2.294 0.8954 3.1895 0 4.294 0L7.294 0C8.3986 0 9.294 0.8954 9.294 2L9.294 6L11.0944 8.3999C11.5889 9.0592 11.1185 10 10.2944 10L6.459 10L6.4594 16L5.1294 16.0001L5.129 10L1.2944 10Z" fill="currentColor" fillRule="evenodd" />
    </svg>
));
PinFilledIconRaw.displayName = "PinFilledIconRaw";

export const PinFilledIcon = createIcon(PinFilledIconRaw);
