import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ConfigureIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path transform="matrix(1 0 0 1 0.999868 1.49989)" fillRule="evenodd" d="M0.3011 12.4122Q0.6022 12.7102 1.0178 12.6286L1.9012 12.4553Q4.4733 11.9508 6.3267 10.0973L11.9021 4.5219Q12.678 3.7461 12.678 2.6489Q12.678 1.5517 11.9021 0.7758Q11.1263 0 10.0291 0Q8.9319 0 8.1561 0.7758L2.6125 6.3194Q0.7248 8.2071 0.2379 10.8318L0.0773 11.6977Q0 12.1142 0.3011 12.4122ZM11.0536 3.6734L10.7156 4.0114L8.6671 1.9618L9.0046 1.6244Q9.429 1.2 10.0291 1.2Q10.6292 1.2 11.0536 1.6244Q11.478 2.0487 11.478 2.6489Q11.478 3.249 11.0536 3.6734ZM1.3645 11.3378L1.6702 11.2778Q3.8834 10.8436 5.4782 9.2488L9.8671 4.86L7.8186 2.8103L3.461 7.1679Q1.8368 8.7922 1.4178 11.0507L1.3645 11.3378ZM6.0001 11.3L13.0001 11.3L13.0001 12.5L6.0001 12.5L6.0001 11.3Z" />
    </svg>
));
ConfigureIconRaw.displayName = "ConfigureIconRaw";

export const ConfigureIcon = createIcon(ConfigureIconRaw);
