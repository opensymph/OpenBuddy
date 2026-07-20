import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ArrowUpRightIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" transform="matrix(0.707107 -0.707107 0.707107 0.707107 -0.352462 8.28647)" d="M7.4694 11.9404L11.5552 7.8546L11.5649 7.845L11.5745 7.8354Q12.1772 7.2327 12.3683 6.9812Q12.75 6.4788 12.75 5.9702Q12.75 5.4616 12.3683 4.9593Q12.1772 4.7077 11.5745 4.1051L11.5552 4.0858L7.4694 0L6.529 0.9404L10.6148 5.0262L10.6341 5.0456Q10.7743 5.1858 10.8895 5.3054L0 5.3054L0 6.6354L10.8892 6.6354Q10.7741 6.7548 10.6341 6.8949L10.6245 6.9045L10.6148 6.9142L6.529 11L7.4694 11.9404Z" />
    </svg>
));
ArrowUpRightIconRaw.displayName = "ArrowUpRightIconRaw";

export const ArrowUpRightIcon = createIcon(ArrowUpRightIconRaw);
