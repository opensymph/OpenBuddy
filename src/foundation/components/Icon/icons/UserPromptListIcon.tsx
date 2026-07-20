import { forwardRef } from "react";
import { createIcon } from "../Icon";

const UserPromptListIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 14.2 14.2"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" transform="matrix(1 0 0 1 -0.000360489 0.000120163)" d="M7.1 0Q10.0409 0 12.1205 2.0795Q14.2 4.1591 14.2 7.1Q14.2 9.7363 12.5289 11.6804L11.6771 10.8286Q13 9.2383 13 7.1Q13 4.6561 11.2719 2.9281Q9.5439 1.2 7.1 1.2Q4.6561 1.2 2.9281 2.9281Q1.2 4.6561 1.2 7.1Q1.2 9.5439 2.9281 11.2719Q4.6561 13 7.1 13Q9.2383 13 10.8286 11.6771L11.6804 12.5289Q9.7363 14.2 7.1 14.2Q4.1591 14.2 2.0795 12.1205Q0 10.0409 0 7.1Q0 4.1591 2.0795 2.0795Q4.1591 0 7.1 0ZM9.4756 10.3256L7.261 8.1099Q6.5 7.3485 6.5 6.2719L6.5 3.1L7.7 3.1L7.7 6.2719Q7.7 6.8516 8.1098 7.2616L10.3243 9.4773L9.4756 10.3256Z" />
    </svg>
));
UserPromptListIconRaw.displayName = "UserPromptListIconRaw";

export const UserPromptListIcon = createIcon(UserPromptListIconRaw);
