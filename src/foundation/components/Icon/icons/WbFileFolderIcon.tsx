import { forwardRef } from "react";
import { createIcon } from "../Icon";

const WbFileFolderIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 16 16"
      {...props}
    >
      <path fill="#589ADB" transform="matrix(1 0 0 1 1 1.66667)" d="M0 3.2C0 2.0785 0 1.5178 0.2179 1.0913C0.4095 0.7162 0.7162 0.4095 1.0913 0.2179C1.5178 0 2.0785 0 3.2 0L5.1157 0C5.9158 0 6.3158 0 6.6592 0.1309C6.9622 0.2464 7.233 0.434 7.4475 0.6772C7.6906 0.9528 7.8311 1.3273 8.112 2.0764L9.3333 5.3333L0 5.3333L0 3.2Z" />
      <path fill="#5FB4FF" transform="matrix(1 0 0 1 1 4)" d="M10.8 0C11.9215 0 12.4822 0 12.9087 0.2179C13.2838 0.4095 13.5905 0.7162 13.7821 1.0913C14 1.5178 14 2.0785 14 3.2L14 7.1333C14 8.2548 14 8.8156 13.7821 9.242C13.5905 9.6172 13.2838 9.9238 12.9087 10.1155C12.4822 10.3333 11.9215 10.3333 10.8 10.3333L3.2 10.3333C2.0785 10.3333 1.5178 10.3333 1.0913 10.1155C0.7162 9.9238 0.4095 9.6172 0.2179 9.242C0 8.8156 0 8.2548 0 7.1333L0 0L10.8 0Z" />
    </svg>
));
WbFileFolderIconRaw.displayName = "WbFileFolderIconRaw";

export const WbFileFolderIcon = createIcon(WbFileFolderIconRaw);
