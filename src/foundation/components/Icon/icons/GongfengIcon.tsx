import { forwardRef } from "react";
import { createIcon } from "../Icon";

const GongfengIconRaw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      viewBox="0 0 100 88.2"
      fill="currentColor"
      {...props}
    >
      <path d="M19 7.2h38.42V0H23.08zM9.75 23.45H87.9l-4.17-7.2h-69.9zm78.31 41.43H9.41l4.16 7.2H84z" fill="#5270a4" />
      <path d="M74.34 0H62.73v7.2h15.84z" fill="currentColor" />
      <path d="M97.57 48.69H76.7v7.2h16.79z" fill="#5270a4" />
      <path d="M4.23 55.89H25.7v-7.2H0z" fill="currentColor" />
      <path d="M31.5 48.69h40.13v7.2H31.5z" fill="#5270a4" />
      <path d="M78.86 81h-48v7.2h44z" fill="currentColor" />
      <path d="M22.86 88.2h2.6V81h-6.83zM.38 39.7h42.29v-7.2H4.46z" fill="#5270a4" />
      <path d="M93 32.5H48.48v7.2h48.78z" fill="currentColor" />
    </svg>
));
GongfengIconRaw.displayName = "GongfengIconRaw";

export const GongfengIcon = createIcon(GongfengIconRaw);
