// Edge Function: dose-action
// La invoca el service worker cuando el usuario pulsa "Tomar" / "Posponer" en la
// notificación. Identidad por `endpoint` + `action_secret` (verify_jwt=false), sin
// sesión de usuario. `take` es idempotente; `snooze` mueve +10 min.
import { sbAdmin, corsHeaders, corsPreflight, markDoseTaken } from '../_shared/edge.ts';
import { shiftTime, strToMin } from '../_shared/schedule.ts';

const json = (req: Request, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { error: 'method' }, 405);

  let payload: { endpoint?: string; secret?: string; doseId?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: 'bad json' }, 400);
  }

  const { endpoint, secret, doseId, action } = payload;
  if (!endpoint || !secret || !doseId || (action !== 'take' && action !== 'snooze')) {
    return json(req, { error: 'bad request' }, 400);
  }

  const sb = sbAdmin();

  const { data: sub } = await sb
    .from('push_subscriptions')
    .select('user_id, action_secret')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!sub || sub.action_secret !== secret) return json(req, { error: 'unauthorized' }, 401);

  const { data: dose } = await sb
    .from('doses')
    .select('*')
    .eq('id', doseId)
    .eq('user_id', sub.user_id)
    .maybeSingle();
  if (!dose) return json(req, { error: 'not found' }, 404);

  if (action === 'take') {
    const r = await markDoseTaken(sb, doseId, sub.user_id);
    return json(req, { ok: r === 'ok' }, r === 'ok' ? 200 : 404);
  }

  // snooze: +10 min, recalcula total_min y resetea el contador de avisos.
  const nt = shiftTime(dose.time, 10);
  await sb
    .from('doses')
    .update({ time: nt, total_min: strToMin(nt), reminded_count: 0, reminded_at: null })
    .eq('id', doseId);
  return json(req, { ok: true });
});
