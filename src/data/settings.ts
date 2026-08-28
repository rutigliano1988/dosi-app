import type { ThemeName } from '../theme/tokens';
import type { Lang } from '../i18n/strings';

export interface AppSettings {
  themeName: ThemeName;
  lang: Lang;
  userName: string;
  onboarded: boolean;
}

const KEY = 'dosi-settings';
const DEFAULTS: AppSettings = { themeName: 'light', lang: 'es', userName: '', onboarded: false };

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function writeSettings(patch: Partial<AppSettings>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch { /* ignore */ }
}
