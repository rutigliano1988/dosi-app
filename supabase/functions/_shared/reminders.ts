import type { Medicine } from './types.ts';
import { expandTimes, strToMin, daysBetween, isoDate } from './schedule.ts';

export interface DoseRow {
  time: string;
  status: string;
  reminded_count: number;
  reminded_at: string | null;
}

const WINDOW_MIN = 60;          // no se avisa una toma con más de 1 h de retraso
const SECOND_AFTER_MS = 15 * 60 * 1000;

/** true si toca enviar un aviso (1º o 2º) para esta dosis en el instante `now`. */
export function dueReminder(dose: DoseRow, now: Date): boolean {
  if (dose.status === 'taken' || dose.status === 'skipped') return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dueMin = strToMin(dose.time);
  if (nowMin >= dueMin + WINDOW_MIN) return false;
  if (dose.reminded_count === 0) return dueMin <= nowMin;
  if (dose.reminded_count === 1 && dose.reminded_at) {
    return now.getTime() - Date.parse(dose.reminded_at) >= SECOND_AFTER_MS;
  }
  return false;
}

/** Días de tratamiento que cubre el stock actual. */
export function daysLeft(med: Medicine): number {
  return Math.floor(med.stock / Math.max(1, expandTimes(med).length));
}

export type AlertDecision = 'send' | 'clear' | 'none';

export function stockAlertDecision(med: Medicine, alreadySent: boolean): AlertDecision {
  const dl = daysLeft(med);
  if (dl <= 3 && !alreadySent) return 'send';
  if (dl > 3 && alreadySent) return 'clear';
  return 'none';
}

export function expiryAlertDecision(med: Medicine, today: Date, alreadySent: boolean): AlertDecision {
  if (!med.expiry) return alreadySent ? 'clear' : 'none';
  const [y, m, d] = med.expiry.split('-').map(Number);
  const dUntil = daysBetween(isoDate(today), new Date(y, m - 1, d));
  if (dUntil > 0 && dUntil <= 7 && !alreadySent) return 'send';
  if ((dUntil <= 0 || dUntil > 7) && alreadySent) return 'clear';
  return 'none';
}
