import { forwardRef } from "react";
import { createIcon } from "../Icon";

const RunningStatusIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" transform="matrix(1 0 0 1 0.5 0.5)" d="M8.165 4L8.165 0L6.835 0L6.835 4L8.165 4ZM3.374 2.4331L5.4954 4.5544L4.5549 5.4949L2.4336 3.3735L3.374 2.4331ZM10.4451 5.4952L12.5664 3.3739L11.626 2.4335L9.5046 4.5548L10.4451 5.4952ZM0 8.165L4 8.165L4 6.835L0 6.835L0 8.165ZM11 8.165L15 8.165L15 6.835L11 6.835L11 8.165ZM10.4451 9.5042L12.5664 11.6255L11.626 12.5659L9.5046 10.4446L10.4451 9.5042ZM3.374 12.5663L5.4954 10.445L4.5549 9.5045L2.4336 11.6258L3.374 12.5663ZM8.165 15L8.165 11L6.835 11L6.835 15L8.165 15Z" />
    </svg>
));
RunningStatusIconRaw.displayName = "RunningStatusIconRaw";

export const RunningStatusIcon = createIcon(RunningStatusIconRaw);
