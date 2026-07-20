import { forwardRef } from "react";
import { createIcon } from "../Icon";

const MoreFilledIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path transform="matrix(1 0 0 1 1 1)" fillRule="evenodd" d="M12.42 12.42Q14.665 10.1749 14.665 7Q14.665 3.8251 12.42 1.58Q10.1749 -0.665 7 -0.665Q3.8251 -0.665 1.58 1.58Q-0.665 3.8251 -0.665 7Q-0.665 10.1749 1.58 12.42Q3.825 14.665 7 14.665Q10.1749 14.665 12.42 12.42ZM3.6641 7C3.6641 6.4477 4.1118 6 4.6641 6C5.2163 6 5.6641 6.4477 5.6641 7C5.6641 7.5523 5.2163 8 4.6641 8C4.1118 8 3.6641 7.5523 3.6641 7ZM6 7C6 6.4477 6.4477 6 7 6C7.5523 6 8 6.4477 8 7C8 7.5523 7.5523 8 7 8C6.4477 8 6 7.5523 6 7ZM9.3359 7C9.3359 6.4477 9.7837 6 10.3359 6C10.8882 6 11.3359 6.4477 11.3359 7C11.3359 7.5523 10.8882 8 10.3359 8C9.7837 8 9.3359 7.5523 9.3359 7Z" />
    </svg>
));
MoreFilledIconRaw.displayName = "MoreFilledIconRaw";

export const MoreFilledIcon = createIcon(MoreFilledIconRaw);
