import type { Medicine, Dose } from './types';

// ─── Helpers de fecha (siempre hora local del Date que se pasa) ───────────────

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(isoStart: string, end: Date): number {
  const [y, m, d] = isoStart.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((endMid - start) / 86_400_000);
}

export function isoWeekday(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function minToStr(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function strToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isValidHHMM(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

// ─── Estado de un tratamiento ────────────────────────────────────────────────

export function medState(med: Medicine, today: Date): 'active' | 'paused' | 'finished' {
  if (med.paused) return 'paused';
  const dur = med.duration;
  if (dur.kind === 'days' && dur.days != null && daysBetween(dur.startedOn, today) >= dur.days) {
    return 'finished';
  }
  if (dur.kind === 'until' && dur.until && isoDate(today) > dur.until) {
    return 'finished';
  }
  return 'active';
}

// ─── Expansión de horas / actividad por día ──────────────────────────────────

export function expandTimes(med: Medicine): string[] {
  const s = med.schedule;
  let list: string[];
  if (s.freq === 'interval' && s.intervalHours && s.times[0]) {
    const anchor = strToMin(s.times[0]);
    const n = Math.floor(24 / s.intervalHours);
    list = [];
    for (let k = 0; k < n; k++) {
      list.push(minToStr(anchor + k * s.intervalHours * 60));
    }
  } else {
    list = [...s.times];
  }
  return [...new Set(list.filter(isValidHHMM))].sort();
}

export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  return true;
}

// ─── Día de tratamiento (solo duración 'days') ───────────────────────────────

export function treatmentDay(med: Medicine, today: Date): { current: number; total: number } | null {
  const dur = med.duration;
  if (dur.kind !== 'days' || dur.days == null) return null;
  const elapsed = daysBetween(dur.startedOn, today);
  const current = Math.min(Math.max(elapsed + 1, 1), dur.days);
  return { current, total: dur.days };
}

// ─── Dosis de hoy ────────────────────────────────────────────────────────────

export function buildTodayDoses(meds: Medicine[], now: Date): Dose[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const doses: Dose[] = [];
  for (const m of meds) {
    if (!isActiveOn(m, now)) continue;
    for (const t of expandTimes(m)) {
      const totalMin = strToMin(t);
      if (Number.isNaN(totalMin)) continue;
      const status: Dose['status'] =
        totalMin < nowMin - 30 ? 'missed'
        : totalMin < nowMin + 30 ? 'now'
        : 'upcoming';
      doses.push({ id: `${m.id}-${isoDate(now)}-${t}`, medId: m.id, time: t, totalMin, status });
    }
  }
  return doses.sort((a, b) => a.totalMin - b.totalMin);
}

export function shiftTime(time: string, mins: number): string {
  return minToStr(strToMin(time) + mins);
}

// ─── Reloj de pared en una zona horaria (solo _shared) ───────────────────────

/**
 * Devuelve un Date cuyos getters LOCALES (getFullYear/Month/Date/Hours/Minutes/Day)
 * reflejan el reloj de pared en `tz`. Se construye parseando el string 'en-CA'
 * ("2026-08-28, 19:00:39"). Si `tz` es inválida o el parseo falla, devuelve `base`.
 * Caveat DST: durante la hora del cambio de horario puede desfasar ±1 h (2 veces/año).
 */
export function nowInTz(tz: string, base: Date = new Date()): Date {
  try {
    const s = base.toLocaleString('en-CA', { timeZone: tz, hour12: false });
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return base;
    let hh = Number(m[4]);
    if (hh === 24) hh = 0; // algunos runtimes escriben "24:00" para medianoche
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, Number(m[5]), Number(m[6]));
  } catch {
    return base;
  }
}
