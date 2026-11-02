import React from 'react';

/**
 * The logo's idea drawn large: a roofline whose beams turn into circuit traces.
 * Purely decorative and coloured by `currentColor`, so it works on the dashboard
 * banner and on the sign-in panel without its own palette.
 */
export const BrandArt: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 360 240"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M28 214 172 34l60 74" />
    <path d="M232 108h34l66 106" opacity="0.55" />
    <path d="M86 214 172 106l38 46" opacity="0.75" />
    <path d="M210 152h38l18 26h34" opacity="0.75" />
    <path d="M144 214v-42h-28" opacity="0.55" />
    <path d="M172 34V14" opacity="0.4" />
    <path d="M198 66h28l16-20h40" />
    <path d="M6 214h348" opacity="0.3" />
    <circle cx="288" cy="46" r="6" fill="currentColor" stroke="none" />
    <circle cx="306" cy="178" r="6" fill="currentColor" stroke="none" opacity="0.75" />
    <circle cx="110" cy="172" r="5" fill="currentColor" stroke="none" opacity="0.55" />
    <circle cx="172" cy="10" r="4" fill="currentColor" stroke="none" opacity="0.4" />
  </svg>
);
