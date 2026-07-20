import { forwardRef } from "react";
import { createIcon } from "../Icon";

// 来自 WorkBuddy LibraryIcon - 使用 lucide-react BookOpen 图标
const BookIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
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
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
));
BookIconRaw.displayName = "BookIconRaw";
export const BookIcon = createIcon(BookIconRaw);
