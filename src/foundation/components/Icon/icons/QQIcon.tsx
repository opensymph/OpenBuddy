import { forwardRef } from "react";
import { createIcon } from "../Icon";

const QQIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <path d="M11 3C8.1 3 5.8 5.2 5.8 8.2v1.5c-.8 1.4-1.4 3.2-1 4.1.2.5.6.7 1 .6.2.8.7 1.5 1.3 2-.3.5-.8 1-1.5 1.3-.3.1-.2.7.3.7 1 0 1.8-.3 2.4-.7.8.4 1.7.6 2.7.6s1.9-.2 2.7-.6c.6.4 1.4.7 2.4.7.5 0 .6-.6.3-.7-.7-.3-1.2-.8-1.5-1.3.6-.5 1.1-1.2 1.3-2 .4.1.8-.1 1-.6.4-.9-.2-2.7-1-4.1V8.2C16.2 5.2 13.9 3 11 3Z" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
));
QQIconRaw.displayName = "QQIconRaw";

export const QQIcon = createIcon(QQIconRaw);
