import type { Medicine, Dose } from './types';

interface StoredState {
  meds: Medicine[];
  doses: Dose[];
  date: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dosiStore = {
  todayStr,
  read(key: string): StoredState | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as StoredState) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: StoredState): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  clear(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
