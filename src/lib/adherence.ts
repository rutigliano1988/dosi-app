import type { Medicine, Dose } from '../data/types';
import type { Lang } from '../i18n/strings';
import { tstr } from '../i18n/strings';
import { expectedDosesOn, isoDate } from './schedule';

export type DoseOutcome = 'taken' | 'skipped' | 'missed' | 'pending';

export interface DayAdherence {
  date: string;
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  scheduled: number;
}

export interface MedAdherence {
  medId: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
}

export interface AdherenceSummary {
  from: string;
  to: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
  perMed: MedAdherence[];
  perDay: DayAdherence[];
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function* eachDayISO(fromISO: string, toISO: string): Generator<string> {
  const end = isoToLocalDate(toISO).getTime();
  let cur = isoToLocalDate(fromISO);
  while (cur.getTime() <= end) {
    yield isoDate(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
}

function ratio(taken: number, missed: number): number | null {
  const denom = taken + missed;
  return denom === 0 ? null : taken / denom;
}

/** Estado de una toma: de la fila si existe y es definitiva; si no, por la hora. */
export function outcomeFor(
  row: { status: string } | undefined,
  dayISO: string,
  time: string,
  now: Date,
): DoseOutcome {
  if (row?.status === 'taken') return 'taken';
  if (row?.status === 'skipped') return 'skipped';
  const [h, m] = time.split(':').map(Number);
  const dt = isoToLocalDate(dayISO);
  dt.setHours(h, m, 0, 0);
  return dt.getTime() < now.getTime() ? 'missed' : 'pending';
}

/**
 * Adherencia en [fromISO, toISO] (inclusive). Cruza el horario esperado de cada
 * día con las filas `rows`. Cuenta también filas reales que ya no están
 * "esperadas" (medicina pausada/finalizada/horario cambiado) para no perder
 * historial — siempre que su medicina siga existiendo en `meds`.
 */
export function buildAdherence(
  meds: Medicine[],
  rows: Dose[],
  fromISO: string,
  toISO: string,
  now: Date,
): AdherenceSummary {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const rowsByDate = new Map<string, Dose[]>();
  for (const r of rows) {
    if (!r.date) continue;
    const list = rowsByDate.get(r.date);
    if (list) list.push(r);
    else rowsByDate.set(r.date, [r]);
  }
  const medIds = new Set(meds.map((m) => m.id));

  const perDay: DayAdherence[] = [];
  const medAcc = new Map<string, { taken: number; skipped: number; missed: number }>();
  let taken = 0;
  let skipped = 0;
  let missed = 0;

  // ids de tomas ya contabilizadas en un día anterior (por su fecha original).
  // Evita el doble conteo de una fila pospuesta que cruzó medianoche: conserva
  // su id (fecha D) pero su `date` pasó a D+1.
  const consumed = new Set<string>();

  for (const dayISO of eachDayISO(fromISO, toISO)) {
    const day = isoToLocalDate(dayISO);
    const seen = new Set<string>();
    const items: { medId: string; time: string; id: string }[] = [];

    for (const e of expectedDosesOn(meds, day)) {
      const id = `${e.medId}-${dayISO}-${e.time}`;
      consumed.add(id);
      seen.add(id);
      items.push({ medId: e.medId, time: e.time, id });
    }
    for (const r of rowsByDate.get(dayISO) ?? []) {
      if (consumed.has(r.id) || seen.has(r.id) || !medIds.has(r.medId)) continue;
      seen.add(r.id);
      items.push({ medId: r.medId, time: r.time, id: r.id });
    }

    let dTaken = 0;
    let dSkipped = 0;
    let dMissed = 0;
    let dPending = 0;
    for (const it of items) {
      const oc = outcomeFor(rowById.get(it.id), dayISO, it.time, now);
      const acc = medAcc.get(it.medId) ?? { taken: 0, skipped: 0, missed: 0 };
      if (oc === 'taken') { dTaken++; acc.taken++; }
      else if (oc === 'skipped') { dSkipped++; acc.skipped++; }
      else if (oc === 'missed') { dMissed++; acc.missed++; }
      else dPending++;
      medAcc.set(it.medId, acc);
    }

    taken += dTaken;
    skipped += dSkipped;
    missed += dMissed;
    perDay.push({
      date: dayISO,
      taken: dTaken,
      skipped: dSkipped,
      missed: dMissed,
      pending: dPending,
      scheduled: dTaken + dSkipped + dMissed + dPending,
    });
  }

  const perMed: MedAdherence[] = meds
    .filter((m) => {
      const a = medAcc.get(m.id);
      return a != null && a.taken + a.skipped + a.missed > 0;
    })
    .map((m) => {
      const a = medAcc.get(m.id)!;
      return { medId: m.id, taken: a.taken, skipped: a.skipped, missed: a.missed, rate: ratio(a.taken, a.missed) };
    });

  return { from: fromISO, to: toISO, taken, skipped, missed, rate: ratio(taken, missed), perMed, perDay };
}

export function adherenceLabel(rate: number | null, lang: Lang): string {
  if (rate === null) return '—';
  if (rate >= 0.9) return tstr(lang, 'adhExcellent');
  if (rate >= 0.7) return tstr(lang, 'adhGood');
  return tstr(lang, 'adhIrregular');
}
