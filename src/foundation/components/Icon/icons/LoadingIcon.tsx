import { forwardRef } from "react";
import { createIcon } from "../Icon";

const LoadingIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path transform="matrix(1 0 0 1 2.07097 1.5)" fillRule="evenodd" d="M6.529 0L6.529 4L5.329 4L5.329 0L6.529 0ZM8.394 5.7697L11.8581 3.7697L11.258 2.7305L7.7939 4.7305L8.394 5.7697ZM3.4641 5.7698L0 3.7698L0.6 2.7305L4.0641 4.7305L3.4641 5.7698ZM7.7939 8.2697L11.258 10.2697L11.8581 9.2305L8.394 7.2305L7.7939 8.2697ZM4.0641 8.2697L0.6 10.2697L0 9.2305L3.4641 7.2305L4.0641 8.2697ZM6.529 9L6.529 13L5.329 13L5.329 9L6.529 9Z" />
    </svg>
));
LoadingIconRaw.displayName = "LoadingIconRaw";

export const LoadingIcon = createIcon(LoadingIconRaw);
