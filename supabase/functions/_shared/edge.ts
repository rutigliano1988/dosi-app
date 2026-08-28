// Utilidades comunes para las Edge Functions (Deno). No lo ve `src/`.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:rutigliano2@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

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

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://dosi-app.vercel.app',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function corsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return null;
}
