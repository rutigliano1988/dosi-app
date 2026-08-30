import { supabase } from '../lib/supabase';
import { isoDate, expectedDosesOn } from '../lib/schedule';
import type { Medicine, Dose, FreqKind, DurationKind } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Fechas SIEMPRE en local (isoDate). Nunca toISOString() → desplaza el día en
// zonas UTC-negativas y las dosis de la tarde se guardan bajo el día siguiente.

function isoToday(): string {
  return isoDate(new Date());
}

// Normaliza una fila de Supabase (schedule/duration son jsonb, pueden venir en formato viejo)
export function rowToMed(r: Record<string, unknown>): Medicine {
  const sched = (r.schedule ?? {}) as Record<string, unknown>;
  const dur = (r.duration ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    dose: String(r.dose ?? ''),
    form: (r.form ?? 'pill') as Medicine['form'],
    color: (r.color ?? 'coral') as Medicine['color'],
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
      startedOn: typeof dur.startedOn === 'string' ? dur.startedOn : isoToday(),
    },
    stock: typeof r.stock === 'number' ? r.stock : 0,
    expiry: typeof r.expiry === 'string' ? r.expiry : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    paused: r.paused === true,
  };
}

// ─── Medicines ────────────────────────────────────────────────────────────────

export async function pushMed(med: Medicine, userId: string) {
  const { error } = await supabase.from('medicines').upsert({
    id:       med.id,
    user_id:  userId,
    name:     med.name,
    dose:     med.dose,
    form:     med.form,
    color:    med.color,
    schedule: med.schedule,
    duration: med.duration,
    stock:    med.stock,
    expiry:   med.expiry ?? null,
    notes:    med.notes ?? null,
    paused:   med.paused ?? false,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function pushMeds(meds: Medicine[], userId: string) {
  if (meds.length === 0) return;
  const { error } = await supabase.from('medicines').upsert(
    meds.map(med => ({
      id:       med.id,
      user_id:  userId,
      name:     med.name,
      dose:     med.dose,
      form:     med.form,
      color:    med.color,
      schedule: med.schedule,
      duration: med.duration,
      stock:    med.stock,
      expiry:   med.expiry ?? null,
      notes:    med.notes ?? null,
      paused:   med.paused ?? false,
    })),
    { onConflict: 'id' },
  );
  if (error) console.error('[dosi] pushMeds error:', error.message);
}

export async function deleteMed(id: string) {
  const { error } = await supabase.from('medicines').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Doses ───────────────────────────────────────────────────────────────────

// 'missed' es un estado derivado solo para la UI (buildTodayDoses lo calcula a
// partir de la hora). La columna doses.status tiene un CHECK que solo admite
// 'upcoming'|'now'|'taken'|'skipped', así que una toma pasada sin marcar se
// persiste como 'upcoming' — su último estado real. Los Edge Functions ya hacen
// lo mismo (hardcodean 'upcoming' en sus upserts).
export function persistedStatus(status: Dose['status']): Exclude<Dose['status'], 'missed'> {
  return status === 'missed' ? 'upcoming' : status;
}

export async function pushDose(dose: Dose, userId: string) {
  const { error } = await supabase.from('doses').upsert({
    id:        dose.id,
    user_id:   userId,
    med_id:    dose.medId,
    date:      isoToday(),
    time:      dose.time,
    total_min: dose.totalMin,
    status:    persistedStatus(dose.status),
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function pushDoses(doses: Dose[], userId: string) {
  if (doses.length === 0) return;
  const today = isoToday();
  const { error } = await supabase.from('doses').upsert(
    doses.map(d => ({
      id:        d.id,
      user_id:   userId,
      med_id:    d.medId,
      date:      today,
      time:      d.time,
      total_min: d.totalMin,
      status:    persistedStatus(d.status),
    })),
    { onConflict: 'id' },
  );
  if (error) console.error('[dosi] pushDoses error:', error.message);
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function pullHistory(userId: string, days = 90): Promise<import('./types').Dose[]> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(isoDate(d));
  }

  const { data, error } = await supabase
    .from('doses')
    .select('*')
    .eq('user_id', userId)
    .in('date', dates)
    .order('date', { ascending: true })
    .order('total_min', { ascending: true });

  if (error) { console.error('[dosi] pullHistory error:', error.message); return []; }

  return data.map(r => ({
    id:       r.id,
    medId:    r.med_id,
    time:     r.time,
    totalMin: r.total_min,
    status:   r.status,
    date:     r.date,
  }));
}

interface DoseInsert {
  id: string;
  user_id: string;
  med_id: string;
  date: string;
  time: string;
  total_min: number;
  status: 'upcoming';
}

/**
 * Filas `doses` que DEBERÍAN existir para los últimos `days` días (sin contar
 * hoy) y aún no están en `existing`. Pura y testeable — `backfillHistory` la usa.
 */
export function backfillCandidates(
  uid: string,
  meds: Medicine[],
  days: number,
  existing: Set<string>,
  now: Date,
): DoseInsert[] {
  const out: DoseInsert[] = [];
  for (let i = days; i >= 1; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = isoDate(day);
    for (const { medId, time, totalMin } of expectedDosesOn(meds, day)) {
      const id = `${medId}-${dateStr}-${time}`;
      if (existing.has(id)) continue;
      out.push({ id, user_id: uid, med_id: medId, date: dateStr, time, total_min: totalMin, status: 'upcoming' });
    }
  }
  return out;
}

/**
 * Al abrir la app: materializa las filas `doses` que faltan de los últimos
 * `days` días para que el historial y la adherencia sean estables. Nunca pisa
 * filas existentes (`ignoreDuplicates`). Devuelve cuántas insertó.
 */
export async function backfillHistory(uid: string, meds: Medicine[], days = 90): Promise<number> {
  if (!uid || meds.length === 0) return 0;
  const existing = new Set((await pullHistory(uid, days)).map((d) => d.id));
  const toInsert = backfillCandidates(uid, meds, days, existing, new Date());
  if (toInsert.length === 0) return 0;
  const { error } = await supabase.from('doses').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true });
  if (error) { console.error('[dosi] backfillHistory error:', error.message); return 0; }
  return toInsert.length;
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

interface PullResult {
  meds: Medicine[];
  doses: Dose[];
}

export async function pullAll(userId: string): Promise<PullResult | null> {
  const today = isoToday();

  const [medsRes, dosesRes] = await Promise.all([
    supabase.from('medicines').select('*').eq('user_id', userId),
    supabase.from('doses').select('*').eq('user_id', userId).eq('date', today),
  ]);

  if (medsRes.error) { console.error('[dosi] pull meds error:', medsRes.error.message); return null; }
  if (dosesRes.error) { console.error('[dosi] pull doses error:', dosesRes.error.message); return null; }

  if (medsRes.data.length === 0) return null; // no remote data yet

  const meds: Medicine[] = medsRes.data.map(r => rowToMed(r as Record<string, unknown>));

  const doses: Dose[] = dosesRes.data.map(r => ({
    id:       r.id,
    medId:    r.med_id,
    time:     r.time,
    totalMin: r.total_min,
    status:   r.status,
  }));

  return { meds, doses };
}
