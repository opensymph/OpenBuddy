import { forwardRef } from "react";
import { createIcon } from "../Icon";

const PlayIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M5 5l14 7-14 7V5z" />
    </svg>
));
PlayIconRaw.displayName = "PlayIconRaw";

export const PlayIcon = createIcon(PlayIconRaw);
