import { forwardRef } from "react";
import { createIcon } from "../Icon";

// 来自 lucide-react Star 图标，strokeWidth 1.5 对齐 WorkBuddy 风格
const StarIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
    ref={ref}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
));
StarIconRaw.displayName = "StarIconRaw";
export const StarIcon = createIcon(StarIconRaw);
