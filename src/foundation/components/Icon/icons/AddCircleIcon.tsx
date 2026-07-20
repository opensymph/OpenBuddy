import { forwardRef } from "react";
import { createIcon } from "../Icon";

const AddCircleIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="currentColor" transform="matrix(1 0 0 1 1 1)" d="M7 0Q9.8995 0 11.9497 2.0503Q14 4.1005 14 7Q14 9.8995 11.9497 11.9497Q9.8995 14 7 14Q4.1005 14 2.0503 11.9497Q0 9.8995 0 7Q0 4.1005 2.0503 2.0503Q4.1005 0 7 0ZM7 1.33Q4.6514 1.33 2.9907 2.9907Q1.33 4.6514 1.33 7Q1.33 9.3486 2.9907 11.0093Q4.6514 12.67 7 12.67Q9.3486 12.67 11.0093 11.0093Q12.67 9.3486 12.67 7Q12.67 4.6514 11.0093 2.9907Q9.3486 1.33 7 1.33ZM6.335 4L6.335 6.335L4 6.335L4 7.665L6.335 7.665L6.335 10L7.665 10L7.665 7.665L10 7.665L10 6.335L7.665 6.335L7.665 4L6.335 4Z" fillRule="evenodd" />
    </svg>
));
AddCircleIconRaw.displayName = "AddCircleIconRaw";

export const AddCircleIcon = createIcon(AddCircleIconRaw);
