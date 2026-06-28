import React from 'react';

type IconFn = (size?: number, color?: string, fill?: boolean) => React.ReactElement;

const pill: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M14.5 3.5L3.5 14.5a4.95 4.95 0 0 0 7 7l11-11a4.95 4.95 0 0 0-7-7z" stroke={c} strokeWidth="1.7"/>
    <path d="M8 9l7 7" stroke={c} strokeWidth="1.7"/>
  </svg>
);

const check: IconFn = (s = 18, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5L9.5 18 20 7" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const plus: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const home: IconFn = (s = 24, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const box: IconFn = (s = 24, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <path d="M3 8.5L12 4l9 4.5M3 8.5v8L12 21l9-4.5v-8M3 8.5L12 13l9-4.5M12 13v8" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const cal: IconFn = (s = 24, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke={c} strokeWidth="1.7"/>
    <path d="M3.5 10h17M8 3v4M16 3v4" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

const user: IconFn = (s = 24, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.7"/>
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

const bell: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M10 21a2 2 0 0 0 4 0" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

const clock: IconFn = (s = 18, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.7"/>
    <path d="M12 7v5.5l3.5 2" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

const search: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="6.5" stroke={c} strokeWidth="1.8"/>
    <path d="M16 16l4.5 4.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const back: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M15 4l-8 8 8 8" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const close: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M5 5l14 14M19 5L5 19" stroke={c} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const chev: IconFn = (s = 18, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M9 5l7 7-7 7" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const more: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
    <circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>
  </svg>
);

const alert: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M12 4l10 17H2L12 4z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M12 10v5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="12" cy="18" r="1.1" fill={c}/>
  </svg>
);

const heart: IconFn = (s = 20, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const share: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="6" cy="12" r="2.5" stroke={c} strokeWidth="1.7"/>
    <circle cx="18" cy="6" r="2.5" stroke={c} strokeWidth="1.7"/>
    <circle cx="18" cy="18" r="2.5" stroke={c} strokeWidth="1.7"/>
    <path d="M8 11l8-4M8 13l8 4" stroke={c} strokeWidth="1.7"/>
  </svg>
);

const edit: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 20h4l11-11-4-4L4 16v4z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const trash: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" stroke={c} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);

const pause: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <rect x="7" y="5" width="3.5" height="14" rx="1" fill={c}/>
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill={c}/>
  </svg>
);

const drop: IconFn = (s = 20, c = 'currentColor', fill = false) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? c : 'none'}>
    <path d="M12 3s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const sun: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="4" stroke={c} strokeWidth="1.7"/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
);

const moon: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
  </svg>
);

const globe: IconFn = (s = 20, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.7"/>
    <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" stroke={c} strokeWidth="1.7"/>
  </svg>
);

const syrup: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M8 3h8v3l-2 3v10a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V9L8 6V3z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M10 15h4" stroke={c} strokeWidth="1.7"/>
  </svg>
);

export const I = {
  pill, check, plus, home, box, cal, user, bell, clock,
  search, back, close, chev, more, alert, heart, share,
  edit, trash, pause, drop, sun, moon, globe, syrup,
};
