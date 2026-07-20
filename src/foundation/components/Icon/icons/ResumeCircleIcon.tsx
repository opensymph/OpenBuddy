import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ResumeCircleIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="currentColor" fillRule="evenodd" transform="matrix(1 0 0 1 0.991547 0.991547)" d="M14.0169 7.0085Q14.0169 9.9114 11.9642 11.9642Q9.9114 14.0169 7.0085 14.0169Q4.1055 14.0169 2.0527 11.9642Q0 9.9114 0 7.0085Q0 4.1055 2.0527 2.0527Q4.1055 0 7.0085 0Q9.2354 0 11.0484 1.2809Q12.046 1.9858 12.7216 2.9356L12.7216 0.6957L13.9216 0.6957L13.9216 3.5092Q13.9216 3.9478 13.898 4.1204Q13.8436 4.5194 13.6015 4.7615Q13.3593 5.0036 12.9604 5.0581Q12.7877 5.0816 12.3491 5.0816L9.5357 5.0816L9.5357 3.8816L11.9106 3.8816Q11.3115 2.9361 10.356 2.261Q8.8543 1.2 7.0085 1.2Q4.6025 1.2 2.9012 2.9012Q1.2 4.6025 1.2 7.0085Q1.2 9.4144 2.9012 11.1156Q4.6025 12.8169 7.0085 12.8169Q9.4144 12.8169 11.1156 11.1156Q12.8169 9.4144 12.8169 7.0085L14.0169 7.0085Z" />
    </svg>
));
ResumeCircleIconRaw.displayName = "ResumeCircleIconRaw";

export const ResumeCircleIcon = createIcon(ResumeCircleIconRaw);
