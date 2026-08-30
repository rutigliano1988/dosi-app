// Edge Function: push-resub
// La invoca el service worker en el evento `pushsubscriptionchange`: la
// suscripción push del navegador rotó y hay que apuntar la fila de
// `push_subscriptions` al endpoint nuevo. Identidad: (oldEndpoint,
// action_secret) — el mismo par que protege dose-action. verify_jwt=false.
import { sbAdmin, corsHeaders, corsPreflight } from '../_shared/edge.ts';

const json = (req: Request, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { error: 'method' }, 405);

  let payload: {
    oldEndpoint?: string;
    secret?: string;
    sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: 'bad json' }, 400);
  }

  const { oldEndpoint, secret, sub } = payload;
  if (!oldEndpoint || !secret || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return json(req, { error: 'bad request' }, 400);
  }

  const sb = sbAdmin();
  const { data: row } = await sb
    .from('push_subscriptions')
    .select('user_id')
    .eq('endpoint', oldEndpoint)
    .eq('action_secret', secret)
    .maybeSingle();
  if (!row) return json(req, { error: 'no-match' }, 404);

  const fresh = crypto.randomUUID();
  const { error } = await sb
    .from('push_subscriptions')
    .update({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      action_secret: fresh,
      last_seen_at: new Date().toISOString(),
    })
    .eq('endpoint', oldEndpoint)
    .eq('action_secret', secret);
  if (error) return json(req, { error: 'update-failed' }, 500);

  return json(req, { ok: true, secret: fresh });
});
