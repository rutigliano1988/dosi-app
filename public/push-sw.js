/* Dosi — handlers de Web Push. Lo importa el service worker que genera Workbox
   (vite.config.ts → workbox.importScripts). No usa módulos: script clásico. */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let d;
  try { d = event.data.json(); } catch { return; }
  // d = { kind, title, body, tag, doseId?, endpoint, secret, actionUrl }
  const actions = d.kind === 'dose'
    ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
    : [];
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: d.tag,
      renotify: true,
      data: d,
      actions,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {};
  event.notification.close();

  if (event.action === 'take' || event.action === 'snooze') {
    event.waitUntil(
      fetch(d.actionUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: d.endpoint, secret: d.secret, doseId: d.doseId, action: event.action,
        }),
      }).catch(() => self.clients.openWindow('/'))
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
