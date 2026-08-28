// Tipos mínimos que necesita el motor compartido y las Edge Functions.
// NO importa de src/ (Deno no ve ese árbol). Debe seguir la forma de
// src/data/types.ts — si esa cambia, actualizar aquí también.

export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped' | 'missed';
export type FreqKind = 'daily' | 'weekdays' | 'interval';
export type DurationKind = 'ongoing' | 'days' | 'until';

export interface MedSchedule {
  freq: FreqKind;
  times: string[];
  weekdays?: number[];
  intervalHours?: 6 | 8 | 12;
}

export interface MedDuration {
  kind: DurationKind;
  days?: number;
  until?: string;
  startedOn: string;
}

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: string;
  schedule: MedSchedule;
  duration: MedDuration;
  stock: number;
  expiry?: string;
  notes?: string;
  paused?: boolean;
}

export interface Dose {
  id: string;
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string;
}

import { isoDate } from './schedule.ts';

// Normaliza una fila `medicines` de Supabase (schedule/duration son jsonb y
// pueden venir en formato viejo). Equivalente a rowToMed de src/data/sync.ts.
export function rowToMed(r: Record<string, unknown>): Medicine {
  const sched = (r.schedule ?? {}) as Record<string, unknown>;
  const dur = (r.duration ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    dose: String(r.dose ?? ''),
    form: (r.form ?? 'pill') as MedForm,
    color: String(r.color ?? 'coral'),
    schedule: {
      freq: (sched.freq ?? 'daily') as FreqKind,
      times: Array.isArray(sched.times) && sched.times.length ? (sched.times as string[]) : ['08:00'],
      weekdays: Array.isArray(sched.weekdays) ? (sched.weekdays as number[]) : undefined,
      intervalHours: sched.intervalHours as (6 | 8 | 12 | undefined),
    },
    duration: {
      kind: (dur.kind ?? 'ongoing') as DurationKind,
      days: typeof dur.days === 'number' ? dur.days : undefined,
      until: typeof dur.until === 'string' ? dur.until : undefined,
      startedOn: typeof dur.startedOn === 'string' ? dur.startedOn : isoDate(new Date()),
    },
    stock: typeof r.stock === 'number' ? r.stock : 0,
    expiry: typeof r.expiry === 'string' ? r.expiry : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    paused: r.paused === true,
  };
}
