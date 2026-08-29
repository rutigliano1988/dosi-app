import { supabase } from './supabase';
import type { CaregiverRow } from '../data/types';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function genCode(): string {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export interface PatientDose {
  id: string;
  medId: string;
  time: string;
  totalMin: number;
  status: string;
  caregiverAlertedAt: string | null;
  nudgedAt: string | null;
}

function toRow(r: Record<string, unknown>): CaregiverRow {
  return {
    id: String(r.id),
    ownerUserId: String(r.owner_user_id),
    caregiverUserId: (r.caregiver_user_id as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    ownerName: (r.owner_name as string | null) ?? null,
    pairCode: (r.pair_code as string | null) ?? null,
    pairCodeExpiresAt: (r.pair_code_expires_at as string | null) ?? null,
  };
}

// ─── Lado paciente (consultas normales con RLS caregivers_owner) ──────────────

export async function myCaregiverRow(): Promise<CaregiverRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('caregivers').select('*').eq('owner_user_id', user.id).maybeSingle();
  return data ? toRow(data as Record<string, unknown>) : null;
}

async function upsertCode(ownerName: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('no session');
  const code = genCode();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const existing = await supabase
    .from('caregivers').select('id').eq('owner_user_id', user.id).maybeSingle();
  if (existing.data) {
    const patch: Record<string, unknown> = { pair_code: code, pair_code_expires_at: expires };
    if (ownerName) patch.owner_name = ownerName;
    await supabase.from('caregivers').update(patch).eq('id', existing.data.id);
  } else {
    await supabase.from('caregivers').insert({
      id: crypto.randomUUID(),
      owner_user_id: user.id,
      owner_name: ownerName || null,
      pair_code: code,
      pair_code_expires_at: expires,
    });
  }
  return code;
}

export const createPairCode = (ownerName: string) => upsertCode(ownerName);
export const regeneratePairCode = () => upsertCode('');

export async function cancelCaregiver(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('caregivers').delete().eq('owner_user_id', user.id).is('caregiver_user_id', null);
}

// ─── Lado cuidador (vía Edge Function) ───────────────────────────────────────

async function pushCreds(): Promise<{ endpoint: string; secret: string } | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    const { data } = await supabase
      .from('push_subscriptions').select('action_secret').eq('endpoint', sub.endpoint).maybeSingle();
    if (!data) return null;
    return { endpoint: sub.endpoint, secret: data.action_secret as string };
  } catch { return null; }
}

async function call<T>(body: Record<string, unknown>): Promise<T | { error: string }> {
  const creds = await pushCreds();
  if (!creds) return { error: 'no-push' };
  try {
    const { data, error } = await supabase.functions.invoke('caregiver-action', { body: { ...creds, ...body } });
    if (error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const j = await ctx.json();
          if (j && typeof j.error === 'string') return { error: j.error };
        }
      } catch { /* fall through to 'network' */ }
      return { error: 'network' };
    }
    return data as T;
  } catch { return { error: 'network' }; }
}

export async function acceptCode(
  code: string, name: string,
): Promise<{ patientId: string; ownerName: string | null } | { error: 'bad-code' | 'self' | 'no-push' | 'network' }> {
  const r = await call<{ ok: boolean; patientId: string; ownerName: string | null; error?: string }>({
    action: 'accept', code, caregiverName: name,
  });
  if ('error' in r) {
    const e = r.error;
    return { error: e === 'bad-code' || e === 'self' || e === 'no-push' ? e : 'network' };
  }
  return { patientId: r.patientId, ownerName: r.ownerName ?? null };
}

export async function listPatients(): Promise<{ relationId: string; patientId: string; ownerName: string | null }[]> {
  const r = await call<{ ok: boolean; patients: { relationId: string; patientId: string; ownerName: string | null }[] }>({
    action: 'list-patients',
  });
  return 'error' in r ? [] : r.patients;
}

export async function patientToday(patientId: string): Promise<{
  ownerName: string | null; today: string; patientNowMin: number;
  medicines: Record<string, unknown>[]; doses: PatientDose[];
} | { error: 'not-your-patient' | 'no-push' | 'network' }> {
  const r = await call<{
    ok: boolean; ownerName: string | null; today: string; patientNowMin: number;
    medicines: Record<string, unknown>[]; doses: Record<string, unknown>[]; error?: string;
  }>({ action: 'patient-today', patientId });
  if ('error' in r) {
    return { error: r.error === 'not-your-patient' || r.error === 'no-push' ? r.error : 'network' };
  }
  return {
    ownerName: r.ownerName ?? null,
    today: r.today,
    patientNowMin: r.patientNowMin,
    medicines: r.medicines,
    doses: r.doses.map((d) => ({
      id: String(d.id), medId: String(d.med_id), time: String(d.time),
      totalMin: Number(d.total_min), status: String(d.status),
      caregiverAlertedAt: (d.caregiver_alerted_at as string | null) ?? null,
      nudgedAt: (d.nudged_at as string | null) ?? null,
    })),
  };
}

export async function markDoseForPatient(patientId: string, doseId: string): Promise<void> {
  await call({ action: 'mark', patientId, doseId });
}

export async function nudgePatient(patientId: string, doseId: string): Promise<'sent' | 'cooldown' | 'skipped'> {
  const r = await call<{ ok: boolean; cooldown?: boolean; skipped?: boolean }>({
    action: 'nudge', patientId, doseId,
  });
  if ('error' in r) return 'sent'; // el error de red se traga; el cuidador puede reintentar
  if (r.cooldown) return 'cooldown';
  if (r.skipped) return 'skipped';
  return 'sent';
}

export async function stopCaring(relationId: string): Promise<void> {
  await call({ action: 'stop-caring', relationId });
}
