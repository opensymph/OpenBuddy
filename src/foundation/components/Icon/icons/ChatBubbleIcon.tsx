import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ChatBubbleIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <path d="M4 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-3l-4 3v-3H7a3 3 0 0 1-3-3V6Z" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8.5h6M8 11h4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
));
ChatBubbleIconRaw.displayName = "ChatBubbleIconRaw";

export const ChatBubbleIcon = createIcon(ChatBubbleIconRaw);
