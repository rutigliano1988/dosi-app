import type { Medicine } from './types.ts';
import { expandTimes, strToMin, daysBetween, isoDate, shiftTime, cadenceSpanDays } from './schedule.ts';

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

/**
 * true si toca avisar al cuidador de esta toma (2ª hora tras la hora, sin marcar).
 * `daysAgo` = días entre la fecha de la toma y la de `now` (0 = hoy). Para tomas
 * tardías (p. ej. 23:30) la ventana [+60, +120) min cae en la madrugada del día
 * siguiente; el llamador pasa `daysAgo = 1` para esas.
 */
export function caregiverMissDue(dose: DoseRow, now: Date, daysAgo = 0): boolean {
  if (dose.status === 'taken' || dose.status === 'skipped') return false;
  if (dose.reminded_count < 1) return false;              // el paciente ni recibió sus avisos
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const elapsed = daysAgo * 1440 + nowMin - strToMin(dose.time);
  return elapsed >= 60 && elapsed < 120;                  // 2ª hora tras la toma
}

/** Días de tratamiento que cubre el stock actual. */
export function daysLeft(med: Medicine): number {
  return Math.floor(med.stock / Math.max(1, expandTimes(med).length) * cadenceSpanDays(med));
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

/**
 * Campos a actualizar en `doses` al posponer `mins` minutos. Si la nueva hora
 * cae en el día siguiente (cruzó medianoche), incluye `date`. Puro.
 */
export function snoozePatch(
  dose: { time: string; date: string },
  mins: number,
): { time: string; total_min: number; reminded_count: 0; reminded_at: null; date?: string } {
  const nt = shiftTime(dose.time, mins);
  const base = { time: nt, total_min: strToMin(nt), reminded_count: 0 as const, reminded_at: null };
  if (strToMin(nt) < strToMin(dose.time)) {
    const [y, m, d] = dose.date.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { ...base, date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` };
  }
  return base;
}

/** true si al menos un envío web-push se entregó (status 0 de webpushSend). */
export function deliveredAny(statuses: number[]): boolean {
  return statuses.some((s) => s === 0);
}

/**
 * true si el envío push se puede dar por terminado y NO merece reintento: algo se
 * entregó (status 0), o todos los intentos fallaron con un error definitivo del lado
 * de la suscripción (4xx). Un 5xx (incl. el 500 de "VAPID sin configurar") se trata
 * como transitorio y se reintenta. `[]` → false (no hubo a quién enviar).
 */
export function sendSettled(statuses: number[]): boolean {
  if (statuses.length === 0) return false;
  if (statuses.some((s) => s === 0)) return true;
  return statuses.every((s) => s >= 400 && s < 500);
}
