import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari: navigator.standalone
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && 'ontouchend' in document); // iPadOS se disfraza de Mac
}

export function needsInstallFirst(): boolean {
  return isIOS() && !isStandalone();
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function upsertSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      action_secret: crypto.randomUUID(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user_agent: navigator.userAgent.slice(0, 200),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
}

export async function enablePush(
  userId: string,
): Promise<'ok' | 'denied' | 'unsupported' | 'needs-install' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  if (needsInstallFirst()) return 'needs-install';
  if (!VAPID_PUBLIC_KEY) { console.error('[dosi] enablePush: VITE_VAPID_PUBLIC_KEY is not set'); return 'error'; }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // TS 6.0 lib.dom: Uint8Array is generic over its buffer; the helper's
      // `Uint8Array` (ArrayBufferLike) needs a nudge to the `BufferSource`
      // PushManager wants. Cast to satisfy strict TS + lib.dom typing.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    await upsertSubscription(userId, sub);
    return 'ok';
  } catch (e) {
    console.error('[dosi] enablePush', e);
    return 'error';
  }
}

export async function pushHasSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) != null;
  } catch { return false; }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } finally {
    await sub.unsubscribe();
  }
}

export async function syncPush(userId: string): Promise<void> {
  if (!pushSupported() || pushPermission() !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) { await enablePush(userId); return; }
  const { count } = await supabase.from('push_subscriptions')
    .update(
      {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        last_seen_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('endpoint', sub.endpoint);
  if (!count) await upsertSubscription(userId, sub); // row vanished (GC'd) — re-insert
}
