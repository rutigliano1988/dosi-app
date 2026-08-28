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

function normMed(m: Partial<Medicine>): Medicine {
  return {
    id: m.id ?? crypto.randomUUID(),
    name: m.name ?? '',
    dose: m.dose ?? '',
    form: m.form ?? 'pill',
    color: m.color ?? 'coral',
    schedule: {
      freq: m.schedule?.freq ?? 'daily',
      times: m.schedule?.times?.length ? m.schedule.times : ['08:00'],
      weekdays: m.schedule?.weekdays,
      intervalHours: m.schedule?.intervalHours,
    },
    duration: {
      kind: m.duration?.kind ?? 'ongoing',
      days: m.duration?.days,
      until: m.duration?.until,
      startedOn: m.duration?.startedOn ?? todayStr(),
    },
    stock: m.stock ?? 0,
    expiry: m.expiry,
    notes: m.notes,
    paused: m.paused,
  };
}

export const dosiStore = {
  todayStr,
  read(key: string): StoredState | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredState;
      return { ...parsed, meds: (parsed.meds ?? []).map(normMed) };
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
