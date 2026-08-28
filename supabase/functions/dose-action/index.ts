// Edge Function: dose-action
// La invoca el service worker cuando el usuario pulsa "Tomar" / "Posponer" en la
// notificación. Identidad por `endpoint` + `action_secret` (verify_jwt=false), sin
// sesión de usuario. `take` es idempotente; `snooze` mueve +10 min.
import { sbAdmin, CORS_HEADERS, corsPreflight } from '../_shared/edge.ts';
import { shiftTime, strToMin } from '../_shared/schedule.ts';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let payload: { endpoint?: string; secret?: string; doseId?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const { endpoint, secret, doseId, action } = payload;
  if (!endpoint || !secret || !doseId || (action !== 'take' && action !== 'snooze')) {
    return json({ error: 'bad request' }, 400);
  }

  const sb = sbAdmin();

  const { data: sub } = await sb
    .from('push_subscriptions')
    .select('user_id, action_secret')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!sub || sub.action_secret !== secret) return json({ error: 'unauthorized' }, 401);

  const { data: dose } = await sb
    .from('doses')
    .select('*')
    .eq('id', doseId)
    .eq('user_id', sub.user_id)
    .maybeSingle();
  if (!dose) return json({ error: 'not found' }, 404);

  if (action === 'take') {
    // Idempotente: si ya estaba tomada, no volvemos a descontar stock.
    if (dose.status !== 'taken') {
      await sb.from('doses').update({ status: 'taken' }).eq('id', doseId);

      const { data: med } = await sb
        .from('medicines')
        .select('stock')
        .eq('id', dose.med_id)
        .eq('user_id', sub.user_id)
        .maybeSingle();
      if (med) {
        await sb
          .from('medicines')
          .update({ stock: Math.max(0, (med.stock ?? 0) - 1) })
          .eq('id', dose.med_id)
          .eq('user_id', sub.user_id);
      }
    }
    return json({ ok: true });
  }

  // snooze: +10 min, recalcula total_min y resetea el contador de avisos.
  const nt = shiftTime(dose.time, 10);
  await sb
    .from('doses')
    .update({ time: nt, total_min: strToMin(nt), reminded_count: 0, reminded_at: null })
    .eq('id', doseId);
  return json({ ok: true });
});
