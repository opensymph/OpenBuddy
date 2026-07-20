import { forwardRef } from "react";
import { createIcon } from "../Icon";

const AutomationEmptyRecordsIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      {...props}
    >
      <path fill="currentColor" fillOpacity={.5} transform="matrix(1 0 0 1 6 6)" d="M12 1.995L27 1.995L27 -1.995L12 -1.995L11.8362 -1.995Q6.858 -1.9952 5.1143 -1.7572Q2.0295 -1.3361 0.3467 0.3467Q-1.3361 2.0295 -1.7572 5.1143Q-1.9952 6.858 -1.995 11.8362L-1.995 12L-1.995 24L-1.995 24.1638Q-1.9952 29.142 -1.7572 30.8857Q-1.3361 33.9705 0.3467 35.6533Q2.0295 37.3361 5.1143 37.7572Q6.858 37.9952 11.8362 37.995L12 37.995L24 37.995L24.1638 37.995Q29.142 37.9952 30.8857 37.7572Q33.9705 37.3361 35.6533 35.6533Q37.3361 33.9705 37.7572 30.8857Q37.9952 29.142 37.995 24.1638L37.995 24L37.995 9L34.005 9L34.005 24L34.005 24.1639Q34.0051 28.871 33.8038 30.3461Q33.5645 32.0994 32.832 32.832Q32.0994 33.5645 30.3461 33.8038Q28.871 34.0051 24.1639 34.005L24 34.005L12 34.005L11.8361 34.005Q7.129 34.0051 5.6539 33.8038Q3.9006 33.5645 3.168 32.832Q2.4355 32.0994 2.1962 30.3461Q1.9949 28.871 1.995 24.1639L1.995 24L1.995 12L1.995 11.8361Q1.9949 7.129 2.1962 5.6539Q2.4355 3.9006 3.168 3.168Q3.9006 2.4355 5.6539 2.1962Q7.129 1.9949 11.8361 1.995L12 1.995Z" fillRule="evenodd" />
      <path fill="currentColor" fillOpacity={.5} transform="matrix(1 0 0 1 27 3)" d="M1.4107 19.4107L19.4107 1.4107L16.5893 -1.4107L-1.4107 16.5893L1.4107 19.4107Z" fillRule="evenodd" />
      <rect fill="currentColor" fillOpacity={.5} transform="matrix(1 0 0 1 13.5 16.5)" y="-1.995" width="10.5" height="3.99" />
      <rect fill="currentColor" fillOpacity={.5} transform="matrix(1 0 0 1 13.5 28.5)" y="-1.995" width="21" height="3.99" />
    </svg>
));
AutomationEmptyRecordsIconRaw.displayName = "AutomationEmptyRecordsIconRaw";

export const AutomationEmptyRecordsIcon = createIcon(AutomationEmptyRecordsIconRaw);
