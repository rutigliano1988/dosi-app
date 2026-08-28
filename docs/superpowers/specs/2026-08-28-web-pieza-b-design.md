# Dosi Web — Pieza B: Recordatorios Web Push

- **Fecha:** 2026-08-28
- **Repo:** `dosi-app` (web), rama `main`
- **Depende de:** Pieza A (mergeada y en producción — motor `src/lib/schedule.ts`, cuentas, `doses`/`medicines` en Supabase)
- **Objetivo:** avisar al usuario a la hora de cada toma (y de stock bajo / caducidad) **aunque la app esté cerrada**, con botones "Tomar" / "Posponer" en la notificación.

## Contexto

La Pieza A dejó la web usable pero los avisos solo funcionan con la app abierta
(componente `NotificationToast` + campana manual). La Pieza B añade Web Push real:
service worker con handler de `push`, gestión de suscripciones, y un backend en
Supabase Edge Functions que decide qué tomas están pendientes y dispara la
notificación.

**Estado relevante del proyecto:**
- Web: React 19 + Vite 8 + `vite-plugin-pwa` en modo `generateSW` (Workbox). No hay
  uso previo de `serviceWorker` / `pushManager` / `Notification` API.
- `src/lib/schedule.ts`: motor puro (solo importa `type { Medicine, Dose }`). Fechas
  en **hora local** (`getHours`, `getDay`).
- Supabase `uwcktxqrfuelmscmkhbs` (free tier — **se pausa tras ~7 días sin actividad de API**).
  Tablas `medicines`, `doses` (`doses.id` = PK `text` con formato `${medId}-${YYYY-MM-DD}-${HH:MM}`;
  `UNIQUE(user_id,med_id,date,time)`; cascade con la medicina). RLS por `user_id`.
  Auth anónima + email OTP (Brevo SMTP).
- No hay `supabase/` dir ni CLI local; se usa el MCP de Supabase (`apply_migration`,
  `deploy_edge_function`).

## Decisiones tomadas (brainstorming 2026-08-28)

| Tema | Decisión |
|---|---|
| Mantener el backend despierto | **Cron externo** (cron-job.org) hace POST cada minuto a la Edge Function: ese tráfico mantiene Supabase activo **y** dispara los recordatorios. Cero coste. Punto único de fallo = cron-job.org. |
| Acciones de la notificación | Botones **"Tomar"** y **"Posponer"** en la notificación. El SW registra la acción contra Supabase vía un endpoint que usa la suscripción como identidad, sin abrir la app. |
| Frecuencia del cron | **Cada 1 minuto** (~43K invocaciones/mes de 500K gratis). |
| Reintento si se ignora | **Un 2º aviso a los 15 min** si la dosis sigue pendiente. Luego queda "perdida" en la app. Sin más reintentos. |
| Eventos que disparan push | **Hora de toma** + **stock bajo** (≤ 3 días) + **caducidad próxima** (≤ 7 días). Stock/caducidad avisan **una sola vez** (re-armable si la condición se revierte). |
| Cuándo se pide permiso | **Ambos**: se ofrece al guardar la 1ª medicina; si se rechaza/salta, queda un banner en Hoy + una fila en Perfil. |
| Plataforma objetivo | **Detección de plataforma**: Android/escritorio activan directo; iOS muestra primero "añade Dosi a la pantalla de inicio" (Web Push en iOS exige PWA instalada, 16.4+). |
| Cómo sabe el servidor qué toca con la app cerrada | **El servidor materializa las filas de `doses`** ejecutando el motor en la tz del usuario (Opción 1). `doses` sigue siendo la única fuente de verdad. |

## Arquitectura

```
Cliente (navegador / PWA)
├── public/push-sw.js         SW: handlers 'push' y 'notificationclick'  (via workbox.importScripts)
├── src/lib/push.ts           soporte, permiso, enable/disable/sync de la suscripción
└── UI                        hoja al añadir 1ª medicina · banner en Hoy · fila en Perfil

Supabase
├── migración                 tablas push_subscriptions, sent_alerts · columnas en doses
├── functions/_shared/schedule.ts   copia del motor + nowInTz(tz)
├── functions/send-reminders  cron cada minuto: materializa doses, notifica, contador
└── functions/dose-action     el SW la llama para Tomar / Posponer

Externo
└── cron-job.org              POST cada minuto a send-reminders con X-Cron-Secret
```

**Flujo de un recordatorio:**
1. cron-job.org → `POST /functions/v1/send-reminders` (cabecera `X-Cron-Secret`).
2. La función, con service role, por cada usuario con ≥1 suscripción: calcula `now` en su
   tz, materializa las `doses` de hoy (`ON CONFLICT (id) DO NOTHING`), busca las pendientes
   que tocan → `web-push` a cada dispositivo → `reminded_count++`, `reminded_at = now()`.
3. Llega la notificación con botones **Tomar** / **Posponer**.
4. Al pulsar, el SW hace `POST /functions/v1/dose-action` con `{endpoint, secret, doseId, action}`.
   La función identifica al usuario por la suscripción y marca / pospone en `doses`.
5. Si no se toca: 2º aviso a los 15 min; después la app la muestra como "perdida".

**VAPID:** par de claves generado una vez. Pública → `VITE_VAPID_PUBLIC_KEY` (Vercel, va al
bundle). Privada + subject → secretos de la Edge Function.

## Modelo de datos

### Tabla `push_subscriptions` (una fila por navegador/dispositivo)

```sql
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  action_secret text not null,
  timezone      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
```
- Re-suscribir en el mismo navegador → `upsert` por `endpoint` (actualiza `user_id`,
  `action_secret`, `timezone`, `last_seen_at`).
- Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` y saltan RLS.

### Tabla `sent_alerts` (stock / caducidad, "avisar una vez")

```sql
create table public.sent_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  med_id  text not null references public.medicines(id) on delete cascade,
  kind    text not null check (kind in ('stock','expiry')),
  sent_at timestamptz not null default now(),
  primary key (user_id, med_id, kind)
);
alter table public.sent_alerts enable row level security;
create policy "own alerts" on public.sent_alerts
  for select using (auth.uid() = user_id);
```
`send-reminders` inserta al avisar y **borra la fila cuando la condición deja de cumplirse**
(stock repuesto por encima del umbral, caducidad alejada) → re-armado.

### Columnas nuevas en `doses`

```sql
alter table public.doses add column reminded_count smallint not null default 0;
alter table public.doses add column reminded_at    timestamptz;
```
`0` = nunca avisada · `1` = 1er aviso enviado · `2` = 2º aviso (+15 min) enviado · `≥2` = no más.
Posponer resetea a `0`. Marcar tomada/saltada: el scheduler ya filtra por `status`.
(`add column … not null default` es rápido en Postgres 17, sin reescritura.)

### Zona horaria

Vive en `push_subscriptions.timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`,
p.ej. `"Europe/Madrid"`). El scheduler agrupa las dosis por usuario y usa la tz de su
suscripción **más reciente** (`last_seen_at`). Si un usuario tuviera dispositivos en tz
distintas se usa una — caso raro, documentado.

### Sin cambios en `medicines`

El scheduler lee `schedule`, `duration`, `stock`, `expiry` (ya existen). `daysLeft =
floor(stock / expandTimes(med).length)`.

## Cliente

### `public/push-sw.js`

Se añade en `vite.config.ts` con `workbox: { importScripts: ['push-sw.js'] }` — el SW que
genera Workbox lo importa. **No** se cambia a `injectManifest`. El archivo vive en `public/`
(se copia tal cual a la raíz de `dist/`).

**`push`:**
```js
self.addEventListener('push', (event) => {
  const d = event.data.json();
  // d = { kind, title, body, tag, doseId?, endpoint, secret, actionUrl }
  const actions = d.kind === 'dose'
    ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
    : [];
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png',
    tag: d.tag, renotify: true, data: d, actions,
  }));
});
```

**`notificationclick`:**
```js
self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data;
  event.notification.close();
  if (event.action === 'take' || event.action === 'snooze') {
    event.waitUntil(
      fetch(d.actionUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: d.endpoint, secret: d.secret, doseId: d.doseId, action: event.action }),
      }).catch(() => self.clients.openWindow('/'))
    );
  } else {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        const w = wins.find((x) => x.url.startsWith(self.location.origin));
        return w ? w.focus() : self.clients.openWindow('/');
      })
    );
  }
});
```
El SW no necesita IndexedDB ni localStorage: `endpoint`, `secret` y `actionUrl` vienen en
cada payload (el servidor los conoce por la fila de `push_subscriptions`).

### `src/lib/push.ts`

```ts
pushSupported(): boolean          // serviceWorker in navigator && PushManager in window && Notification in window
pushPermission(): NotificationPermission   // 'default' | 'granted' | 'denied'
isStandalone(): boolean           // display-mode: standalone || navigator.standalone
needsInstallFirst(): boolean      // iOS (UA) && !isStandalone()

enablePush(userId: string): Promise<'ok' | 'denied' | 'unsupported' | 'needs-install'>
  // 1. if !pushSupported() -> 'unsupported'
  // 2. if needsInstallFirst() -> 'needs-install'
  // 3. perm = await Notification.requestPermission(); if != 'granted' -> 'denied'
  // 4. reg = await navigator.serviceWorker.ready
  //    sub = await reg.pushManager.getSubscription()
  //       ?? await reg.pushManager.subscribe({ userVisibleOnly: true,
  //             applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })
  // 5. const json = sub.toJSON()
  //    await supabase.from('push_subscriptions').upsert({
  //      user_id: userId, endpoint: sub.endpoint,
  //      p256dh: json.keys.p256dh, auth: json.keys.auth,
  //      action_secret: crypto.randomUUID(),
  //      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  //      user_agent: navigator.userAgent.slice(0, 200),
  //      last_seen_at: new Date().toISOString(),
  //    }, { onConflict: 'endpoint' })
  //    -> 'ok'

disablePush(): Promise<void>
  // reg.pushManager.getSubscription() -> delete row by endpoint + sub.unsubscribe()

syncPush(userId: string): Promise<void>
  // en arranque con permiso 'granted': si no hay subscription -> re-subscribe (llama a enablePush)
  // si la hay -> upsert refrescando timezone + last_seen_at (mantiene action_secret nuevo, es inocuo)
```
`urlBase64ToUint8Array` es el helper estándar de conversión de la clave VAPID.

### UX de permiso ("ambos")

1. **Al guardar la 1ª medicina** (`App.tsx`: `meds` pasa de 0→1, `pushPermission()==='default'`,
   `!settings.pushAsked`, `pushSupported()`): hoja *"¿Quieres que te avisemos a la hora de
   cada toma?"* → *Activar* / *Ahora no*. En `needsInstallFirst()`, la hoja explica primero
   *"Añade Dosi a tu pantalla de inicio"* (instrucciones breves iOS). En cualquier caso
   `settings.pushAsked = true`.
2. **Banner en `HomeScreen`**: mientras `pushSupported() && pushPermission()==='default'` —
   tarjeta descartable *"Activa los recordatorios"* + botón *Activar*. Descartar →
   `settings.pushBannerDismissed = true` (oculta en ese dispositivo; queda la fila de Perfil).
3. **`ProfileScreen` → sección "Recordatorios"**: una fila que refleja el estado real:
   - `unsupported` → "Este navegador no admite recordatorios"
   - `needs-install` → "Añade Dosi a tu pantalla de inicio para activarlos"
   - `default` → "Recordatorios: desactivados" (toca → `enablePush`)
   - `granted` → "Recordatorios: activados" (toca → `disablePush`)
   - `denied` → "Bloqueados en el navegador — actívalos en los ajustes del sitio"

`AppSettings` (en `src/data/settings.ts`) gana `pushAsked: boolean` y `pushBannerDismissed: boolean`
(ambos por dispositivo, en localStorage — no van a Supabase).

### Integración en `App.tsx`

- Arranque con `pushPermission()==='granted'` → `syncPush(userId)`. Igual tras `confirmSignIn`
  (con el nuevo `userId`).
- `handleSignOut` → `await disablePush()` antes de limpiar el estado.
- La hoja del punto 1 se dispara desde el `onSave` de alta cuando corresponde.

Strings nuevas en `es` y `en` para las 3 superficies.

## Backend

### VAPID y secretos (una vez, manual)

- `npx web-push generate-vapid-keys` → `publicKey`, `privateKey`.
- **Vercel** → env var `VITE_VAPID_PUBLIC_KEY` = publicKey.
- **Supabase → Edge Functions → Secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` = `mailto:rutigliano2@gmail.com`, `CRON_SECRET` = aleatorio (32+ chars).
  `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.

### `supabase/functions/_shared/schedule.ts`

Copia de las funciones puras de `src/lib/schedule.ts` (`isoDate`, `daysBetween`, `isoWeekday`,
`minToStr`, `strToMin`, `isValidHHMM`, `medState`, `expandTimes`, `isActiveOn`, `treatmentDay`,
`buildTodayDoses`, `shiftTime`) — **firmas idénticas** — más:
- `strToMin` y `minToStr` se **exportan** aquí (en la versión del navegador son privadas)
  porque `dose-action` los necesita para recalcular `total_min` al posponer.

```ts
export function nowInTz(tz: string): Date {
  // Date cuyos getters locales (getFullYear/Month/Date/Hours/Minutes/Day) reflejan
  // el reloj de pared en `tz`. Implementación: new Date(originalDate.toLocaleString('en-CA', { timeZone: tz })).
  // Caveat DST: durante la hora del cambio de horario puede desfasar ±1 h (2 veces/año). Aceptado.
}
```
El `Medicine`/`Dose` de tipos: el archivo compartido redeclara los tipos mínimos que necesita
(no importa de `src/`), o los copia. **Anti-deriva:** `src/lib/schedule.shared.test.ts` (Vitest,
Node) importa `../../supabase/functions/_shared/schedule.ts` y le pasa **los mismos vectores**
que `schedule.test.ts`; si divergen, el test falla en el gate del repo.

### `send-reminders` (Edge Function, cron cada minuto)

```
POST · si header X-Cron-Secret != CRON_SECRET -> 401 · deploy con verify_jwt = false
sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

subs = sb.from('push_subscriptions').select('*')            // todas
byUser = group(subs, s => s.user_id)

para cada (userId, userSubs) en byUser:
  tz   = userSubs ordenadas por last_seen_at desc [0].timezone
  now  = nowInTz(tz)
  today = isoDate(now)
  meds = sb.from('medicines').select('*').eq('user_id', userId)   // normaliza como rowToMed

  // materializar
  fresh = buildTodayDoses(meds, now)
  sb.from('doses').upsert(
    fresh.map(d => ({ id: d.id, user_id: userId, med_id: d.medId, date: today,
                      time: d.time, total_min: d.totalMin, status: 'upcoming' })),
    { onConflict: 'id', ignoreDuplicates: true })            // no pisa taken/skipped/pospuestas

  dosesHoy = sb.from('doses').select('*').eq('user_id', userId).eq('date', today)
  nowMin = now.getHours()*60 + now.getMinutes()

  para cada dose en dosesHoy con status ∉ ('taken','skipped'):
    dueMin = strToMin(dose.time)
    first  = dose.reminded_count === 0 && dueMin <= nowMin && nowMin < dueMin + 60
    second = dose.reminded_count === 1 && dose.reminded_at
             && (Date.now() - Date.parse(dose.reminded_at)) >= 15*60*1000
             && nowMin < dueMin + 60
    si first || second:
      med = meds.find(m => m.id === dose.med_id)
      payload = { kind:'dose', title:`Hora de tu ${med.name}`,
                  body: med.dose + (med.notes ? ' · ' + med.notes.split('.')[0] : ''),
                  tag: dose.id, doseId: dose.id, actionUrl: `${SUPABASE_URL}/functions/v1/dose-action` }
      para cada sub en userSubs:
        try { webpush.sendNotification({endpoint:sub.endpoint, keys:{p256dh:sub.p256dh, auth:sub.auth}},
                JSON.stringify({ ...payload, endpoint: sub.endpoint, secret: sub.action_secret })) }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410)
                      sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) }
      sb.from('doses').update({ reminded_count: dose.reminded_count + 1, reminded_at: new Date().toISOString() })
        .eq('id', dose.id)

  // alertas stock / caducidad  (solo medicinas no finalizadas ni pausadas)
  para cada med con medState(med, now) === 'active':
    daysLeft = Math.floor(med.stock / Math.max(1, expandTimes(med).length))
    has = sent_alerts row (userId, med.id, 'stock')
    si daysLeft <= 3 && !has: push {kind:'stock', title:`Se acaba tu ${med.name}`,
        body:`Te quedan ~${daysLeft} días`} ; insert sent_alerts
    si daysLeft > 3 && has:  delete sent_alerts
    si med.expiry:
      dUntil = daysBetween(today, parse(med.expiry))   // >0 futuro
      hasE = sent_alerts (userId, med.id, 'expiry')
      si 0 < dUntil <= 7 && !hasE: push {kind:'expiry', title:`${med.name} caduca pronto`,
          body:`El ${med.expiry}`} ; insert
      si (dUntil > 7 || dUntil <= 0) && hasE: delete

return { users: byUser.size, pushes: total }
```

Ventana `nowMin < dueMin + 60`: un aviso no sale con horas de retraso si el cron estuvo caído;
esa dosis queda "perdida" en la app.

### `dose-action` (Edge Function, la llama el SW)

```
POST · CORS: Access-Control-Allow-Origin https://dosi-app.vercel.app + responder OPTIONS
body { endpoint, secret, doseId, action }   action ∈ ('take','snooze')
sb = service role

sub = sb.from('push_subscriptions').select('user_id, action_secret').eq('endpoint', endpoint).single()
si !sub || sub.action_secret !== secret -> 401
dose = sb.from('doses').select('*').eq('id', doseId).eq('user_id', sub.user_id).single()
si !dose -> 404

action 'take':
  sb.from('doses').update({ status: 'taken' }).eq('id', doseId)
  sb.rpc o update: medicines.stock = greatest(0, stock - 1) where id = dose.med_id and user_id = sub.user_id
action 'snooze':
  nt = shiftTime(dose.time, 10)
  sb.from('doses').update({ time: nt, total_min: strToMin(nt), reminded_count: 0, reminded_at: null }).eq('id', doseId)

-> 200 { ok: true }
```
`verify_jwt = false` (ni el cron ni el SW llevan JWT de usuario; la seguridad es
`X-Cron-Secret` / `action_secret`).

### web-push en Deno

`import webpush from 'npm:web-push@3'`. `webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY,
VAPID_PRIVATE_KEY)`. `sendNotification(subscription, JSON.stringify(payload))`.

### Despliegue

1. Migración (tablas + columnas) → `apply_migration`.
2. Generar VAPID; secretos en Supabase + `VITE_VAPID_PUBLIC_KEY` en Vercel.
3. `deploy_edge_function` para `_shared` (si el MCP lo requiere aparte), `send-reminders`,
   `dose-action` — todas con `verify_jwt = false`.
4. Merge del cliente (SW + `push.ts` + UI) → deploy Vercel.
5. cron-job.org: job cada minuto, `POST …/functions/v1/send-reminders`, header
   `X-Cron-Secret: <secreto>`.
6. E2E en un Android real.

## Casos límite

| Situación | Comportamiento |
|---|---|
| Suscripción caducada (404/410) | `send-reminders` borra la fila. El cliente re-suscribe en el siguiente arranque (`syncPush`). |
| Cron caído 30 min | Al volver dispara el 1er aviso de lo vencido en la última hora; lo más viejo queda "perdido". |
| Usuario con 2 dispositivos | Se notifica a todos. "Tomar" desde uno marca la dosis; un dispositivo ya notificado no se "des-notifica" (aceptado). El `tag`=doseId hace que el 2º aviso reemplace al 1º. |
| Dosis pospuesta desde la notificación | `dose-action` mueve `time` +10 y resetea `reminded_count`; el cron reavisa a la hora nueva. |
| Cambio de horario de verano | `nowInTz` desfasa ±1 h solo durante la hora del cambio, 2 veces/año. Aceptado. |
| iOS sin PWA instalada | `enablePush` → `needs-install`; la UI guía a añadir a inicio, no suscribe. |
| Permiso denegado | Fila de Perfil "Bloqueados en el navegador"; no se reintenta pedir permiso. |
| Stock repuesto tras alerta | El cron borra la fila `sent_alerts` cuando `daysLeft` sube → re-armado. |
| Medicina borrada | `doses` y `sent_alerts` caen por `on delete cascade`. |
| Cierre de sesión | `disablePush()` borra la suscripción; la cuenta anónima nueva no hereda avisos. |
| Doble "Tomar" (2 dispositivos, o app + notificación) | `status='taken'` es idempotente; el stock podría descontarse 2 veces — se acepta el borde (o `dose-action` comprueba `dose.status !== 'taken'` antes de descontar → **se hace esta comprobación**). |

## Pruebas

- **Motor compartido** — `src/lib/schedule.shared.test.ts` (Vitest): mismos vectores que
  `schedule.test.ts` contra `_shared/schedule.ts`; tests de `nowInTz` (tz e instante fijos →
  hora de pared esperada).
- **`send-reminders`** — `deno test` con cliente Supabase sembrado en una branch de Supabase:
  materialización idempotente, ventana 1er/2º aviso, tope +60 min, alertas stock/caducidad
  una sola vez y re-armado.
- **`dose-action`** — secret correcto/incorrecto → 200/401; `take` marca + descuenta stock una
  vez; doble `take` no vuelve a descontar; `snooze` mueve hora y resetea contador; preflight OPTIONS.
- **Manual E2E** (checklist en el plan) en un Android real: activar → recibir aviso puntual →
  "Tomar" marca sin abrir la app → "Posponer" reavisa +10 min → 2º aviso a +15 min → push de
  stock bajo → desactivar desde Perfil corta los avisos.
- **Gate del repo**: `npm run lint && npm run test && npm run build` verde (los nuevos tests
  de Vitest incluidos).

## Puesta en marcha (orden estricto)

1. `apply_migration` — tablas `push_subscriptions`, `sent_alerts`, columnas en `doses`.
2. Generar VAPID; poner secretos (Supabase) + `VITE_VAPID_PUBLIC_KEY` (Vercel).
3. Desplegar Edge Functions (`verify_jwt = false`).
4. Merge del cliente → deploy Vercel.
5. Crear el cron en cron-job.org.
6. E2E en Android real; luego dar por cerrada la Pieza B.

## Fuera de alcance

- Recordatorios por email / SMS (solo push).
- Ajuste por dosis individual ("no me avises de esta toma").
- Historial de notificaciones enviadas dentro de la app.
- Resumen diario ("buenos días, hoy tienes 3 tomas").
- Compartir con cuidadores / notificar a un familiar si se olvida una toma.
- App nativa iOS (el móvil Expo usa su propio `expo-notifications`).
- Reintentos configurables / preferencias de "no molestar" por franja horaria.

## Riesgos / notas

- **Punto único de fallo: cron-job.org.** Si cae, no hay avisos hasta que vuelva. Aceptado
  para v1; una alternativa futura es un 2º cron redundante (GitHub Actions, 5 min).
- **DST**: ventana de ±1 h durante la hora del cambio, 2 veces al año.
- **iOS**: Web Push exige PWA instalada; si el familiar usa iPhone hay fricción de onboarding.
- **Coste**: todo gratis (cron-job.org 1 min, Edge Functions ~43K/500K mes). Sin dependencia
  de Brevo (eso es solo email de la Pieza A).
- **`schedule.ts` duplicado**: mitigado por el test anti-deriva, pero es deuda; si el motor
  cambia mucho, considerar un paquete compartido.
