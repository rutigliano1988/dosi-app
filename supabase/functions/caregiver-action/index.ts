// Edge Function: caregiver-action
// La invocan la app del cuidador y el service worker (botones del aviso de olvido).
// Identidad: { endpoint, action_secret } de push_subscriptions (verify_jwt=false).
// Verifica la relación caregivers en cada acción sobre un paciente.
import { sbAdmin, corsHeaders, corsPreflight, markDoseTaken, webpushSend } from '../_shared/edge.ts';
import { nowInTz, isoDate, buildTodayDoses } from '../_shared/schedule.ts';
import { rowToMed } from '../_shared/types.ts';

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let p: {
    endpoint?: string; secret?: string; action?: string;
    code?: string; caregiverName?: string;
    patientId?: string; relationId?: string; doseId?: string;
  };
  try { p = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { endpoint, secret, action } = p;
  if (!endpoint || !secret || !action) return json({ error: 'bad request' }, 400);

  const sb = sbAdmin();

  const { data: sub } = await sb
    .from('push_subscriptions').select('user_id, action_secret')
    .eq('endpoint', endpoint).maybeSingle();
  if (!sub || sub.action_secret !== secret) return json({ error: 'unauthorized' }, 401);
  const caregiverId = sub.user_id as string;

  // ── accept ────────────────────────────────────────────────────────────────
  if (action === 'accept') {
    const norm = String(p.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.length < 6) return json({ error: 'bad-code' }, 404);
    const { data: rel } = await sb
      .from('caregivers').select('*')
      .is('caregiver_user_id', null)
      .gt('pair_code_expires_at', new Date().toISOString())
      .ilike('pair_code', norm)
      .maybeSingle();
    if (!rel) return json({ error: 'bad-code' }, 404);
    if (rel.owner_user_id === caregiverId) return json({ error: 'self' }, 400);
    await sb.from('caregivers').update({
      caregiver_user_id: caregiverId,
      name: (p.caregiverName ?? '').slice(0, 60) || null,
      pair_code: null,
      pair_code_expires_at: null,
    }).eq('id', rel.id);
    return json({ ok: true, patientId: rel.owner_user_id, ownerName: rel.owner_name ?? null });
  }

  // ── list-patients ─────────────────────────────────────────────────────────
  if (action === 'list-patients') {
    const { data: rows } = await sb
      .from('caregivers').select('id, owner_user_id, owner_name')
      .eq('caregiver_user_id', caregiverId);
    return json({
      ok: true,
      patients: (rows ?? []).map((r) => ({
        relationId: r.id, patientId: r.owner_user_id, ownerName: r.owner_name ?? null,
      })),
    });
  }

  // ── acciones sobre un paciente: verificar la relación ─────────────────────
  const relQ = sb.from('caregivers').select('*').eq('caregiver_user_id', caregiverId);
  const { data: rel } = p.relationId
    ? await relQ.eq('id', p.relationId).maybeSingle()
    : await relQ.eq('owner_user_id', p.patientId ?? '').maybeSingle();
  if (!rel) return json({ error: 'not-your-patient' }, 403);
  const patientId = rel.owner_user_id as string;

  if (action === 'stop-caring') {
    await sb.from('caregivers').delete().eq('id', rel.id);
    return json({ ok: true });
  }

  if (action === 'patient-today') {
    const { data: pSubs } = await sb
      .from('push_subscriptions').select('timezone, last_seen_at')
      .eq('user_id', patientId).order('last_seen_at', { ascending: false }).limit(1);
    const tz = (pSubs?.[0]?.timezone as string) || 'Europe/Madrid';
    const now = nowInTz(tz);
    const today = isoDate(now);
    const { data: medRows } = await sb.from('medicines').select('*').eq('user_id', patientId);
    const meds = (medRows ?? []).map((r) => rowToMed(r as Record<string, unknown>));
    const fresh = buildTodayDoses(meds, now);
    if (fresh.length > 0) {
      await sb.from('doses').upsert(
        fresh.map((d) => ({
          id: d.id, user_id: patientId, med_id: d.medId, date: today,
          time: d.time, total_min: d.totalMin, status: 'upcoming',
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
    }
    const { data: doseRows } = await sb
      .from('doses').select('*').eq('user_id', patientId).eq('date', today);
    return json({
      ok: true,
      ownerName: rel.owner_name ?? null,
      today,
      patientNowMin: now.getHours() * 60 + now.getMinutes(),
      medicines: medRows ?? [],
      doses: doseRows ?? [],
    });
  }

  if (action === 'mark') {
    if (!p.doseId) return json({ error: 'bad request' }, 400);
    const r = await markDoseTaken(sb, p.doseId, patientId);
    return json({ ok: r === 'ok' }, r === 'ok' ? 200 : 404);
  }

  if (action === 'nudge') {
    if (!p.doseId) return json({ error: 'bad request' }, 400);
    const { data: dose } = await sb
      .from('doses').select('*').eq('id', p.doseId).eq('user_id', patientId).maybeSingle();
    if (!dose) return json({ error: 'not found' }, 404);
    if (dose.status === 'taken' || dose.status === 'skipped') return json({ ok: true, skipped: true });
    if (dose.nudged_at && Date.now() - Date.parse(dose.nudged_at) < 5 * 60 * 1000) {
      return json({ ok: true, cooldown: true });
    }
    const { data: med } = await sb
      .from('medicines').select('name').eq('id', dose.med_id).eq('user_id', patientId).maybeSingle();
    const { data: pSubs } = await sb.from('push_subscriptions').select('*').eq('user_id', patientId);
    const payload = {
      kind: 'caregiver-nudge',
      title: `${rel.name || 'Tu cuidador'} te recuerda tu ${med?.name ?? 'medicina'}`,
      body: `Toma de las ${dose.time}`,
      tag: `nudge-${dose.id}`,
      doseId: dose.id,
      actionUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/dose-action`,
    };
    for (const s of pSubs ?? []) {
      const st = await webpushSend(s, JSON.stringify({ ...payload, endpoint: s.endpoint, secret: s.action_secret }));
      if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
    await sb.from('doses').update({ nudged_at: new Date().toISOString() }).eq('id', dose.id);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
});
