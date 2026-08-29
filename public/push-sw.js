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
