import { forwardRef } from "react";
import { createIcon } from "../Icon";

const TencentDocsBrandIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 28 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="#2A65F5" d="M21.93 0H4.523a.495.495 0 0 0-.487.408L.008 23.19a.494.494 0 0 0 .487.579h9.596l.76-.235h4.457l.623.235h7.392c.24 0 .445-.172.487-.408l3.313-18.74L21.93 0Z" />
      <path fill="#00DCFF" d="M21.703 4.622h5.42L21.93 0l-.715 4.043c-.053.302.18.58.488.58" />
      <path fill="#FFF" d="m14.125.976-.974 5.525-9.497.016 4.126 4.452h4.579L10.091 23.77h5.84l2.271-12.801h6.894l.24-.005z" />
    </svg>
));
TencentDocsBrandIconRaw.displayName = "TencentDocsBrandIconRaw";

export const TencentDocsBrandIcon = createIcon(TencentDocsBrandIconRaw);
