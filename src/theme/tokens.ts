export type ThemeName = 'light' | 'dark';

export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  elev: string;
  text: string;
  textDim: string;
  textSoft: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  success: string;
  successSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
  pillBg: string;
  dark: boolean;
}

export const THEMES: Record<ThemeName, Omit<Theme, 'dark'>> = {
  light: {
    bg:          '#f4efe6',
    surface:     '#ffffff',
    surface2:    '#faf6ee',
    elev:        '#ffffff',
    text:        '#1c1812',
    textDim:     '#6c6358',
    textSoft:    '#94897b',
    border:      'rgba(28,24,18,0.07)',
    borderStrong:'rgba(28,24,18,0.14)',
    accent:      '#c2530a',
    accentSoft:  '#fbe7d3',
    accentText:  '#5c2706',
    success:     '#5f7a4a',
    successSoft: '#e1ead3',
    warn:        '#9a6b1e',
    warnSoft:    '#f3e3c4',
    danger:      '#b03020',
    dangerSoft:  '#f4d9d2',
    pillBg:      '#fbf6ec',
  },
  dark: {
    bg:          '#14110d',
    surface:     '#1e1a14',
    surface2:    '#231e17',
    elev:        '#26211a',
    text:        '#f1ebde',
    textDim:     '#a89f8e',
    textSoft:    '#766c5d',
    border:      'rgba(255,245,222,0.07)',
    borderStrong:'rgba(255,245,222,0.14)',
    accent:      '#b5e85c',
    accentSoft:  '#2d3a18',
    accentText:  '#161a09',
    success:     '#9bc56e',
    successSoft: '#26321a',
    warn:        '#e9b969',
    warnSoft:    '#3a2f17',
    danger:      '#ec7a6a',
    dangerSoft:  '#3a1e18',
    pillBg:      '#221d16',
  },
};

export function getTheme(name: ThemeName): Theme {
  return { ...THEMES[name], dark: name === 'dark' };
}

// ─── Medicine pill colors ───
export type PillColorKey = 'coral' | 'sage' | 'ocean' | 'amber' | 'plum' | 'rose';

export interface PillColorEntry {
  dot: string;
  soft: string;
  label: string;
}

export const PILL_COLORS: Record<PillColorKey, PillColorEntry> = {
  coral: { dot: '#d97757', soft: '#f7e3d6', label: 'Coral' },
  sage:  { dot: '#7c9070', soft: '#e0e8da', label: 'Sage'  },
  ocean: { dot: '#5a8fa8', soft: '#dceaf0', label: 'Ocean' },
  amber: { dot: '#c89653', soft: '#f3e6d0', label: 'Amber' },
  plum:  { dot: '#8a6890', soft: '#e9dfeb', label: 'Plum'  },
  rose:  { dot: '#c46b7a', soft: '#f0dde1', label: 'Rose'  },
};
