// Utilidades comunes para las Edge Functions (Deno). No lo ve `src/`.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { isAllowedOrigin, CORS_FALLBACK_ORIGIN } from './cors.ts';

// VAPID se configura de forma perezosa (no en la carga del módulo): así, si los
// secretos aún no están puestos, la función responde 401/200 en vez de 500 en
// cada arranque; solo el envío real falla hasta que se configuran.
let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!pub || !priv) {
    console.error('[edge] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configurados');
    return false;
  }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:rutigliano2@gmail.com', pub, priv);
  vapidReady = true;
  return true;
}

/** Cliente Supabase con la service-role key (salta RLS). */
export function sbAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

export interface PushRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  action_secret: string;
}

/** Envía una notificación. Devuelve 0 si fue bien, o el statusCode HTTP si falló. */
export async function webpushSend(sub: PushRow, payloadJson: string): Promise<number> {
  if (!ensureVapid()) return 500;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payloadJson,
    );
    return 0;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return typeof code === 'number' ? code : 500;
  }
}

/** Marca una dosis como tomada y descuenta 1 de stock. Idempotente. */
export async function markDoseTaken(
  sb: SupabaseClient,
  doseId: string,
  patientUserId: string,
): Promise<'ok' | 'not-found'> {
  const { data: dose } = await sb
    .from('doses').select('med_id, status')
    .eq('id', doseId).eq('user_id', patientUserId).maybeSingle();
  if (!dose) return 'not-found';
  if (dose.status === 'taken') return 'ok';
  await sb.from('doses').update({ status: 'taken' }).eq('id', doseId);
  const { data: med } = await sb
    .from('medicines').select('stock')
    .eq('id', dose.med_id).eq('user_id', patientUserId).maybeSingle();
  if (med) {
    await sb.from('medicines')
      .update({ stock: Math.max(0, (med.stock ?? 0) - 1) })
      .eq('id', dose.med_id).eq('user_id', patientUserId);
  }
  return 'ok';
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : CORS_FALLBACK_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function corsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  return null;
}
