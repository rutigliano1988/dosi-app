import type { PillColorKey } from '../theme/tokens';

export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped' | 'missed';
export type FreqKind = 'daily' | 'weekdays' | 'interval' | 'everyNDays';
export type DurationKind = 'ongoing' | 'days' | 'until';

export interface MedSchedule {
  freq: FreqKind;
  times: string[];               // 'daily'/'weekdays'/'everyNDays': tomas explícitas ordenadas
                                 // 'interval': un solo elemento = hora de la 1ª toma
  weekdays?: number[];           // 'weekdays': 1=lunes … 7=domingo
  intervalHours?: 6 | 8 | 12;    // 'interval'
  intervalDays?: number;         // 'everyNDays': cada cuántos días. Ancla: duration.startedOn.
}

export interface MedDuration {
  kind: DurationKind;
  days?: number;                 // 'days' (mín. 1)
  until?: string;                // 'until': fecha ISO 'YYYY-MM-DD'
  startedOn: string;             // fecha ISO en que se creó o reanudó — obligatorio
}

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: PillColorKey;
  schedule: MedSchedule;
  duration: MedDuration;
  stock: number;
  expiry?: string;               // opcional ahora; fecha ISO
  notes?: string;
  paused?: boolean;
}

export interface Dose {
  id: string;                    // `${medId}-${YYYY-MM-DD}-${time}` (fecha local)
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string;                 // ISO — presente en dosis históricas de Supabase
}

export interface CaregiverRow {
  id: string;
  ownerUserId: string;
  caregiverUserId: string | null;
  name: string | null;          // nombre del cuidador (null hasta aceptar)
  ownerName: string | null;     // nombre del paciente
  pairCode: string | null;
  pairCodeExpiresAt: string | null;
}
