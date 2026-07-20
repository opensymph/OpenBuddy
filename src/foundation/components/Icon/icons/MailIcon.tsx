import { forwardRef } from "react";
import { createIcon } from "../Icon";

const MailIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <rect x="3" y="5" width="16" height="12" rx="1.8" strokeWidth="1.5" />
      <path d="m4 6 7 6 7-6" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
));
MailIconRaw.displayName = "MailIconRaw";

export const MailIcon = createIcon(MailIconRaw);
