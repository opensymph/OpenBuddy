import { forwardRef } from "react";
import { createIcon } from "../Icon";

const SendPlaneIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* WorkBuddy 发送按钮实测 SVG(朝上的描边纸飞机) */}
      <path d="M2.032 13.524C2.00273 13.584 1.99221 13.6514 2.0018 13.7174C2.01139 13.7834 2.04066 13.845 2.08578 13.8942C2.1309 13.9433 2.18979 13.9777 2.25476 13.9929C2.31973 14.0081 2.38777 14.0034 2.45 13.9793L7.53467 12.084C7.83482 11.9722 8.16518 11.9722 8.46534 12.084L13.55 13.9787C13.6122 14.0026 13.6801 14.0073 13.7449 13.9921C13.8098 13.9769 13.8686 13.9426 13.9137 13.8935C13.9587 13.8445 13.988 13.783 13.9977 13.7171C14.0074 13.6512 13.9971 13.5839 13.968 13.524L8.30134 1.524C8.27434 1.46692 8.23169 1.41868 8.17834 1.3849C8.12499 1.35112 8.06315 1.33318 8 1.33318C7.93686 1.33318 7.87501 1.35112 7.82167 1.3849C7.76832 1.41868 7.72567 1.46692 7.69867 1.524L2.032 13.524Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12L8 1.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
));
SendPlaneIconRaw.displayName = "SendPlaneIconRaw";

export const SendPlaneIcon = createIcon(SendPlaneIconRaw);
