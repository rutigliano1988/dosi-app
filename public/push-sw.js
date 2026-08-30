/* Dosi — handlers de Web Push. Lo importa el service worker que genera Workbox
   (vite.config.ts → workbox.importScripts). No usa módulos: script clásico. */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let d;
  try { d = event.data.json(); } catch { return; }
  // d = { kind, title, body, tag, doseId?, endpoint, secret, actionUrl }
  const actions =
    d.kind === 'dose' || d.kind === 'caregiver-nudge'
      ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
      : d.kind === 'caregiver-miss'
        ? [{ action: 'cg-mark', title: 'Ya la tomó' }, { action: 'cg-nudge', title: 'Recordárselo' }]
        : [];
  if (d.endpoint && d.secret) {
    event.waitUntil(idbSet('latest', { endpoint: d.endpoint, secret: d.secret }).catch(() => {}));
  }
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: d.tag,
      renotify: Boolean(d.tag),
      data: d,
      actions,
    })
  );
});

// Solo se permite POSTear el secret a las Edge Functions de este proyecto Supabase.
const OK_ACTION = 'https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/';

const RESUB_URL = OK_ACTION + 'push-resub';
// Clave VAPID PÚBLICA (se transmite al navegador, no es secreta). Mismo valor
// que VITE_VAPID_PUBLIC_KEY en Vercel. Si se regenera el par VAPID hay que
// actualizarla aquí, en Vercel y en los secrets de Supabase.
const VAPID_PUBLIC_KEY =
  'BJ7u9DE_0t6GldAJg8gfTwolLD-VL5AjrFMRORzs_rpoWzeoGp4DRognS93YqmPyp_QIt3Aikva1prFNdNiB9Dc';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Mini clave-valor sobre IndexedDB (store `kv` de la DB `dosi-push`).
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dosi-push', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return idbOpen().then((db) => new Promise((resolve, reject) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
function idbSet(key, val) {
  return idbOpen().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {};
  event.notification.close();

  if (event.action === 'take' || event.action === 'snooze') {
    if (typeof d.actionUrl !== 'string' || !d.actionUrl.startsWith(OK_ACTION)) { return; }
    event.waitUntil(
      fetch(d.actionUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: d.endpoint, secret: d.secret, doseId: d.doseId, action: event.action,
        }),
      })
        .then((r) => { if (!r.ok) return self.clients.openWindow('/'); })
        .catch(() => self.clients.openWindow('/'))
    );
    return;
  }

  if (event.action === 'cg-mark' || event.action === 'cg-nudge') {
    if (typeof d.actionUrl !== 'string' || !d.actionUrl.startsWith(OK_ACTION)) { return; }
    event.waitUntil(
      fetch(d.actionUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: d.endpoint, secret: d.secret,
          patientId: d.patientId, doseId: d.doseId,
          action: event.action === 'cg-mark' ? 'mark' : 'nudge',
        }),
      })
        .then((r) => { if (!r.ok) return self.clients.openWindow('/'); })
        .catch(() => self.clients.openWindow('/'))
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins.find((x) => x.url.startsWith(self.location.origin));
      return w ? w.focus() : self.clients.openWindow('/');
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const cached = await idbGet('latest').catch(() => null);
    const oldEndpoint = (event.oldSubscription && event.oldSubscription.endpoint) || (cached && cached.endpoint);
    const secret = cached && cached.secret;
    if (!oldEndpoint || !secret) return;

    let newSub;
    try {
      newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      return;
    }

    try {
      const r = await fetch(RESUB_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oldEndpoint, secret, sub: newSub.toJSON() }),
      });
      if (r.ok) {
        const body = await r.json();
        if (body && body.secret) {
          await idbSet('latest', { endpoint: newSub.endpoint, secret: body.secret }).catch(() => {});
        }
      }
      // Un 404 { error: 'no-match' } de push-resub significa "la fila ya se rotó"
      // (p. ej. un reintento del SW tras un resub previo con éxito): la respuesta
      // no-ok simplemente cae aquí sin log ni reintento. No-op silencioso.
    } catch {
      // el syncPush del siguiente arranque de la app re-registra la suscripción
    }
  })());
});
