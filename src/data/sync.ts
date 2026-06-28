import { supabase } from '../lib/supabase';
import type { Medicine, Dose } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

  const meds: Medicine[] = medsRes.data.map(r => ({
    id:       r.id,
    name:     r.name,
    dose:     r.dose,
    form:     r.form,
    color:    r.color,
    schedule: r.schedule,
    duration: r.duration,
    stock:    r.stock,
    expiry:   r.expiry ?? undefined,
    notes:    r.notes ?? undefined,
    paused:   r.paused ?? false,
  }));

  const doses: Dose[] = dosesRes.data.map(r => ({
    id:       r.id,
    medId:    r.med_id,
    time:     r.time,
    totalMin: r.total_min,
    status:   r.status,
  }));

  return { meds, doses };
}
