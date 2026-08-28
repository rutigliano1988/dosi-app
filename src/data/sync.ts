import { supabase } from '../lib/supabase';
import type { Medicine, Dose, FreqKind, DurationKind } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Normaliza una fila de Supabase (schedule/duration son jsonb, pueden venir en formato viejo)
function rowToMed(r: Record<string, unknown>): Medicine {
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
  if (error) console.error('[dosi] pushMed error:', error.message);
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
  if (error) console.error('[dosi] deleteMed error:', error.message);
}

// ─── Doses ───────────────────────────────────────────────────────────────────

export async function pushDose(dose: Dose, userId: string) {
  const { error } = await supabase.from('doses').upsert({
    id:        dose.id,
    user_id:   userId,
    med_id:    dose.medId,
    date:      todayISO(),
    time:      dose.time,
    total_min: dose.totalMin,
    status:    dose.status,
  }, { onConflict: 'user_id,med_id,date,time' });
  if (error) console.error('[dosi] pushDose error:', error.message);
}

export async function pushDoses(doses: Dose[], userId: string) {
  if (doses.length === 0) return;
  const today = todayISO();
  const { error } = await supabase.from('doses').upsert(
    doses.map(d => ({
      id:        d.id,
      user_id:   userId,
      med_id:    d.medId,
      date:      today,
      time:      d.time,
      total_min: d.totalMin,
      status:    d.status,
    })),
    { onConflict: 'user_id,med_id,date,time' },
  );
  if (error) console.error('[dosi] pushDoses error:', error.message);
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function pullHistory(userId: string, days = 7): Promise<import('./types').Dose[]> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
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

// ─── Pull ─────────────────────────────────────────────────────────────────────

interface PullResult {
  meds: Medicine[];
  doses: Dose[];
}

export async function pullAll(userId: string): Promise<PullResult | null> {
  const today = todayISO();

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
