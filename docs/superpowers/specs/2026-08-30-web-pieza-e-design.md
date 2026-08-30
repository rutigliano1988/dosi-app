# Dosi Web — Pieza E: Pase de consolidación

- **Fecha:** 2026-08-30
- **Repo:** `dosi-app` (web), rama `main` (a partir de `0a407ad`, merge de Pieza D)
- **Objetivo:** cerrar el punch-list acumulado de las Piezas A/B/C/D. Cero features nuevas — todo corrección de bugs, consistencia y limpieza.
- **Entrega:** un único merge a `main` tras revisión y E2E del usuario, como A/B/C/D. El E2E incluye el smoke test del informe PDF en iPhone que quedó pendiente de Pieza D.

## Contexto

Cuatro piezas web han shipeado en ~3 días. Cada una dejó un punch-list de cosas menores no bloqueantes, anotadas en el ledger y en la memoria del proyecto. La Pieza E las agrupa. El item que la dispara: la pestaña **Semana** del calendario (código pre-Pieza D) calcula la adherencia con una fórmula distinta a la vista **Mes** nueva — mete las omitidas en el denominador y no cuenta los olvidos derivados (las filas que el backfill de Pieza D materializa quedan como `status='upcoming'`). Misma pantalla, un tap de diferencia, puede leer 100% donde Mes lee 50%. Y Semana es la vista por defecto.

## Decisiones tomadas (brainstorming 2026-08-30)

| Tema | Decisión |
|---|---|
| Alcance | Pase de consolidación: 10 items del punch-list A/B/C/D. Sin features. |
| CORS de preview deploys (#9) | **Incluir** — `corsHeaders` acepta también orígenes `dosi(-app)?-<slug>-rutigliano1988s-projects.vercel.app`. |
| `adherenceLabel` código muerto (#10) | **Cablearlo** en las tarjetas de resumen de Semana, Mes y detalle de medicina ("84% · Buena"). |
| `pushsubscriptionchange` (#5) | **Resub completo**: SW cachea el `secret` en IndexedDB y llama a una Edge Function nueva `push-resub` que actualiza la fila del endpoint viejo al nuevo. |
| Handler del SW: clave VAPID | Hardcodeada en `push-sw.js` (es pública). Comentario + nota en `reference_external.md` de que si se regenera el par VAPID hay que actualizarla aquí. |
| Migración #8 | `drop constraint if exists doses_user_id_med_id_date_time_key` — obsoleta desde Pieza A. Vía MCP `apply_migration`. |
| Testeo de lógica en `functions/*/index.ts` | Extraer las piezas puras a `_shared/*` (que sí se testean en Vitest) antes de tocarlas. |

## Alcance

### Dentro

| # | Item | Ficheros |
|---|---|---|
| 1 | Pestaña Semana del calendario usa `buildAdherence` (misma métrica que Mes) | `src/screens/CalendarScreen.tsx` |
| 2 | Pluralización "1 cambio" / "N cambios" en la barra de sync | `src/i18n/strings.ts`, `src/App.tsx`, `src/screens/ProfileScreen.tsx` |
| 3 | AddMed campo "Dosis" empieza vacío (hoy default `'500 mg'`) | `src/screens/AddMedScreen.tsx`, `src/i18n/strings.ts` |
| 4 | Icono `logout` propio para la fila "Cerrar sesión" (hoy reusa `I.back`) | `src/icons/index.tsx`, `src/screens/ProfileScreen.tsx` |
| 5 | Handler `pushsubscriptionchange` en el SW + Edge Function `push-resub` | `public/push-sw.js`, `supabase/functions/push-resub/index.ts` (nueva), `supabase/config.toml` |
| 6 | `dose-action` snooze que cruza medianoche sube también `date` | `supabase/functions/dose-action/index.ts`, `supabase/functions/_shared/reminders.ts` |
| 7 | `send-reminders` marca "avisado"/"alerta enviada" solo si algún push se entregó | `supabase/functions/send-reminders/index.ts`, `supabase/functions/_shared/reminders.ts` |
| 8 | Migración: quitar la constraint `doses_user_id_med_id_date_time_key` | `supabase/migrations/…_pieza_e_drop_obsolete_dose_unique.sql` |
| 9 | CORS de las Edge Functions acepta preview deploys del proyecto | `supabase/functions/_shared/cors.ts` (nueva), `supabase/functions/_shared/edge.ts` |
| 10 | `adherenceLabel` cableado en Semana/Mes/Detalle + strings a `strings.ts` | `src/lib/adherence.ts`, `src/i18n/strings.ts`, `src/screens/CalendarScreen.tsx`, `src/screens/DetailScreen.tsx` |

### Fuera (explícito)

- Acceso del cuidador al historial / calendario / adherencia del paciente.
- Resumen diario al cuidador ("Ana tomó 4/5 hoy").
- Versionado del historial de horario (pausar una medicina sube el % — limitación conocida de Pieza D).
- Notificar a la otra parte al revocar la relación de cuidador.
- Permisos graduales del cuidador.
- Cualquier feature nueva del cuidador.
- Vista anual del calendario.
- Rediseño de cualquier pantalla.
- El smoke test del PDF en iOS es manual (parte del E2E), no código.

## Arquitectura

Sin cambios de arquitectura. Tres extracciones de código puro para poder testear lógica que hoy vive en `functions/*/index.ts` (que Vitest no puede importar — traen imports de Deno):

```
_shared/cors.ts (NUEVO, puro)
  isAllowedOrigin(origin) ───────────► _shared/edge.ts lo importa y lo usa en corsHeaders
                                       (edge.ts lo re-exporta para compat)
  testeado en src/lib/cors.shared.test.ts

_shared/reminders.ts (ya testeado en Vitest)
  + snoozePatch(dose, mins) ─────────► dose-action/index.ts lo usa
  + deliveredAny(statuses) ──────────► send-reminders/index.ts lo usa
  testeado en src/lib/reminders.shared.test.ts

push-resub/index.ts (NUEVO Edge Function, verify_jwt=false)
  usa sbAdmin() + corsHeaders() de _shared/edge.ts
```

## Detalle por item

### #1 — Pestaña Semana usa `buildAdherence`

En `src/screens/CalendarScreen.tsx`:
- Borrar `weekData` (líneas ~50-57) y `weekTotals` (~60-64).
- Nuevo:
  ```ts
  const weekAdh = useMemo(
    () => buildAdherence(meds, historyDoses, isoDate(week[0]), todayStr, new Date()),
    [meds, historyDoses, todayStr], // week deriva de today
  );
  ```
- La tira semanal (`week.map`, ~131-169): cada botón lee `weekAdh.perDay[i]` (7 entradas, orden ascendente — `buildAdherence` garantiza una entrada por día del rango). Regla de color/anillo **idéntica a las celdas del mes** (`CalendarScreen.tsx` vista Mes): `due = taken+missed+skipped`; futuro o `due===0` → punto gris; `missed+skipped===0` → verde lleno; resto → `<ProgressRing value={taken/due} showLabel={false} />`.
- La tarjeta resumen de la semana (~174-198): `weekAdh.rate` (`null` → "—"), total `weekAdh.taken + weekAdh.missed`, subtexto `weekAdh.skipped` omitidas · `weekAdh.missed` olvidadas — misma forma que la tarjeta del mes. Añadir ` · {adherenceLabel(weekAdh.rate, lang)}` cuando `rate !== null` (item #10).
- El timeline del día (`DayTimeline` + `dosesForDate`) no cambia. `dosesForDate` se mantiene (lo usa el timeline de ambas vistas).
- El comentario del prop `historyDoses` ("last 7 days") pasa a "last 90 days".

### #2 — Pluralización de la barra de sync

`src/i18n/strings.ts` — claves nuevas en `es` y `en`:
- `syncPendingOne` — es: `'1 cambio sin sincronizar · toca para reintentar'`, en: `'1 change not synced · tap to retry'`
- `syncPendingRowOne` — es: `'1 cambio sin sincronizar'`, en: `'1 change not synced'`

Call sites:
- `src/App.tsx` (~570): `{t(pendingSync === 1 ? 'syncPendingOne' : 'syncPending', { n: pendingSync })}`
- `src/screens/ProfileScreen.tsx` (~223): `label={t(pendingSync === 1 ? 'syncPendingRowOne' : 'syncPendingRow', { n: pendingSync })}`

### #3 — AddMed "Dosis" vacío

`src/screens/AddMedScreen.tsx`:
- Línea ~370: `dose: initialData?.dose ?? '500 mg'` → `dose: initialData?.dose ?? ''`
- Línea ~97: `placeholder="500 mg"` → `placeholder={t('dosePlaceholder')}`
- `src/i18n/strings.ts`: `dosePlaceholder` — es: `'p. ej. 500 mg'`, en: `'e.g. 500 mg'`

### #4 — Icono `logout`

`src/icons/index.tsx`:
- Nuevo `const logout: IconFn` — puerta con flecha saliente (path SVG estándar de "logout", trazo 1.7, viewBox 24). Ejemplo de path: rectángulo abierto por la derecha + flecha `M10 17l5-5-5-5 M15 12H3`.
- Añadir `logout` al objeto `export const I`.

`src/screens/ProfileScreen.tsx` línea ~216: `icon={I.back}` → `icon={I.logout}` en la `Row` de `accountSignOut`.

### #5 — `pushsubscriptionchange` + `push-resub`

**`public/push-sw.js`:**
- Constantes nuevas al principio: `VAPID_PUBLIC_KEY` (string, mismo valor que `VITE_VAPID_PUBLIC_KEY`, con comentario "regenerar el par VAPID ⇒ actualizar aquí y en Vercel y en los secrets de Supabase") y `RESUB_URL = OK_ACTION + 'push-resub'`.
- Helper `urlBase64ToUint8Array(base64)` inline (copia de `src/lib/push.ts`).
- Helpers `idbGet(key)` / `idbSet(key, val)` — promesas sobre un object store `kv` de una DB `dosi-push` (v1). ~20 líneas.
- En el handler `push` existente, tras parsear `d`: `event.waitUntil((async () => { try { await idbSet('latest', { endpoint: d.endpoint, secret: d.secret }); } catch {} })())` — no debe bloquear ni romper el `showNotification`.
- Handler nuevo:
  ```js
  self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
      const cached = await idbGet('latest').catch(() => null);
      const oldEndpoint = event.oldSubscription?.endpoint || cached?.endpoint;
      const secret = cached?.secret;
      if (!oldEndpoint || !secret) return;
      let newSub;
      try {
        newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch { return; }
      try {
        const r = await fetch(RESUB_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oldEndpoint, secret, sub: newSub.toJSON() }),
        });
        if (r.ok) {
          const { secret: fresh } = await r.json();
          await idbSet('latest', { endpoint: newSub.endpoint, secret: fresh });
        }
      } catch {}
    })());
  });
  ```

**`supabase/functions/push-resub/index.ts`** (nueva, `verify_jwt=false`):
- `corsPreflight` / método POST / parse JSON `{ oldEndpoint, secret, sub: { endpoint, keys: { p256dh, auth } } }`.
- Validación: los 3 presentes y `sub.endpoint` + `sub.keys` bien formados → si no, `400`.
- `sbAdmin()`, buscar fila: `.from('push_subscriptions').select('user_id, timezone, user_agent').eq('endpoint', oldEndpoint).eq('action_secret', secret).maybeSingle()`. No encontrada → `404 { error: 'no-match' }`.
- `const fresh = crypto.randomUUID();`
- `.update({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, action_secret: fresh, last_seen_at: new Date().toISOString() }).eq('endpoint', oldEndpoint).eq('action_secret', secret)`.
- Responder `200 { ok: true, secret: fresh }`.
- CORS: `corsHeaders(req)` en todas las respuestas.

**`supabase/config.toml`:** añadir `[functions.push-resub]` con `verify_jwt = false`.

**Modelo de amenaza (documentado):** para redirigir los push de una víctima hay que conocer su endpoint exacto **y** su `action_secret` actual. El `action_secret` solo se conoce server-side y en el dispositivo de la víctima (ya se le envía en cada payload — mismo modelo que `dose-action`/`caregiver-action`). Cada resub rota el secret.

### #6 — `dose-action` snooze cruza medianoche

**`supabase/functions/_shared/reminders.ts`** — función pura nueva:
```ts
/** Campos a actualizar en `doses` al posponer `mins` minutos. Si la nueva hora
 *  cae en el día siguiente (cruzó medianoche), incluye `date`. */
export function snoozePatch(
  dose: { time: string; date: string },
  mins: number,
): { time: string; total_min: number; reminded_count: 0; reminded_at: null; date?: string } {
  const nt = shiftTime(dose.time, mins);
  const patch = { time: nt, total_min: strToMin(nt), reminded_count: 0 as const, reminded_at: null };
  if (strToMin(nt) < strToMin(dose.time)) {
    const [y, m, d] = dose.date.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    return { ...patch, date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}` };
  }
  return patch;
}
```
(`shiftTime` y `strToMin` ya se exportan de `_shared/schedule.ts`.)

**`supabase/functions/dose-action/index.ts`** — la rama snooze (líneas ~53-59):
```ts
import { snoozePatch } from '../_shared/reminders.ts';
// …
await sb.from('doses').update(snoozePatch(dose, 10)).eq('id', doseId);
return json(req, { ok: true });
```
El `id` de la fila no cambia (ya pasaba al mover solo `time`). `send-reminders` lee por `date`+`user_id`. Depende de #8: sin la constraint, mover a un slot ocupado ya no revienta.

### #7 — `send-reminders` marca "enviado" solo si se entregó

**`supabase/functions/_shared/reminders.ts`** — función pura nueva:
```ts
/** true si al menos un envío web-push se entregó (status 0 de webpushSend). */
export function deliveredAny(statuses: number[]): boolean {
  return statuses.some((s) => s === 0);
}
```

**`supabase/functions/send-reminders/index.ts`** — en los **3 bucles de envío** (aviso de toma, alerta de stock, alerta de caducidad), acumular los status y solo hacer el `update`/`upsert` de "marcado" si `deliveredAny(statuses)`:
- Aviso de toma (~98-115): recoger `status` de cada `webpushSend` en un array; `if (deliveredAny(statuses)) { await sb.from('doses').update({ reminded_count: +1, reminded_at: now.toISOString() })… }`.
- Stock (~184-203) y caducidad (~215-234): igual — el `upsert` a `sent_alerts` solo si `deliveredAny`.
- Las ramas 404/410 (borrar la suscripción muerta) se mantienen dentro del bucle, sin cambios.
- El paso 2.5 (caregiver-miss) ya lo hace bien (`caregiver_alerted_at` solo si `cgSent`) — no se toca.

### #8 — Migración: quitar la constraint obsoleta

`supabase/migrations/20260830HHMMSS_pieza_e_drop_obsolete_dose_unique.sql`:
```sql
-- La clave natural de `doses` es el PK `id` = `${medId}-${YYYY-MM-DD}-${HH:MM}`
-- desde Pieza A; todos los upserts usan onConflict:'id'. Esta UNIQUE quedó
-- obsoleta y además rompe posponer una toma sobre la hora exacta de otra.
alter table doses drop constraint if exists doses_user_id_med_id_date_time_key;
```
Aplicada vía MCP `apply_migration`. Sin riesgo: ningún código usa `(user_id, med_id, date, time)` como clave de conflicto.

### #9 — CORS acepta preview deploys

**`supabase/functions/_shared/cors.ts`** (nueva, puro, sin imports de Deno):
```ts
const STATIC = new Set([
  'https://dosi-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);

const PREVIEW = /^https:\/\/dosi(-app)?-[a-z0-9-]+-rutigliano1988s-projects\.vercel\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  return STATIC.has(origin) || PREVIEW.test(origin);
}

export const CORS_FALLBACK_ORIGIN = 'https://dosi-app.vercel.app';
```

**`supabase/functions/_shared/edge.ts`:**
- Borrar el `CORS_ALLOW` local; `import { isAllowedOrigin, CORS_FALLBACK_ORIGIN } from './cors.ts'`.
- `corsHeaders`: `'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : CORS_FALLBACK_ORIGIN`.
- Re-exportar `isAllowedOrigin` si algún otro fichero lo necesita (no hoy).

Cubre `dosi-<hash>-rutigliano1988s-projects.vercel.app` (deploy alias) y `dosi-app-git-<rama>-rutigliano1988s-projects.vercel.app` (branch alias). Ambos bajo el subdominio del proyecto en Vercel — solo Vercel puede crear hosts ahí.

**Redeploy:** `send-reminders`, `dose-action`, `caregiver-action`, `push-resub` (todas importan `corsHeaders`).

### #10 — `adherenceLabel` cableado

**`src/lib/adherence.ts`:**
```ts
import { tstr } from '../i18n/strings';
// …
export function adherenceLabel(rate: number | null, lang: Lang): string {
  if (rate === null) return '—';
  if (rate >= 0.9) return tstr(lang, 'adhExcellent');
  if (rate >= 0.7) return tstr(lang, 'adhGood');
  return tstr(lang, 'adhIrregular');
}
```
**`src/i18n/strings.ts`** — claves nuevas: `adhExcellent` (es `'Excelente'` / en `'Excellent'`), `adhGood` (`'Buena'` / `'Good'`), `adhIrregular` (`'Irregular'` / `'Irregular'`). Los tests existentes de `adherenceLabel` en `src/lib/adherence.test.ts` siguen verdes (comparan contra esos mismos literales).

**Consumidores** — junto al `%`, cuando `rate !== null`, añadir ` · {adherenceLabel(rate, lang)}`:
- `CalendarScreen.tsx` — tarjeta resumen de Semana (item #1) y de Mes.
- `DetailScreen.tsx` — bloque de adherencia de 30 días (la línea del `%`).

## Errores y casos límite

| Situación | Comportamiento |
|---|---|
| Snooze de `23:55` el 31-dic | `snoozePatch` → `date` = `2027-01-01`, `time` = `00:05`. El `id` de la fila sigue con la fecha vieja (inconsistencia pre-existente, inocua). |
| Snooze sobre un slot que ya tiene fila | Con #8 aplicado: se permite, quedan dos filas para ese `(med, date, time)` con ids distintos. Raro; acción explícita del usuario. |
| `pushsubscriptionchange` sin `secret` cacheado (SW recién instalado, nunca recibió un push) | El handler no hace nada. `syncPush` del siguiente arranque re-registra la suscripción (comportamiento actual, ya funciona). |
| `push-resub` con `secret` desactualizado (dos rotaciones seguidas sin abrir la app) | `404 no-match`. Cae al self-heal de `syncPush` en el siguiente arranque. |
| Todos los envíos de un aviso fallan por error transitorio | `deliveredAny` → false → no se marca → reintento al siguiente tick del cron. |
| Un usuario con 2 suscripciones, una entrega y otra da 410 | `deliveredAny` → true (por la que entregó) → se marca. La muerta se borra en el bucle. |
| Preview deploy con origin que no matchea el regex | Cae al fallback `https://dosi-app.vercel.app` → el navegador bloquea la respuesta CORS (comportamiento actual para orígenes desconocidos). |
| `adherenceLabel` con `rate` justo en `0.7` / `0.9` | `>=` inclusivo: `0.9` → "Excelente", `0.7` → "Buena". Ya cubierto por los tests de Pieza D. |
| AddMed editando una medicina que sí tenía dosis `'500 mg'` | `initialData.dose` está definido → se conserva. Solo las **nuevas** empiezan vacías. |

## Testing

- **`src/lib/cors.shared.test.ts`** (nuevo): `isAllowedOrigin` — `https://dosi-app.vercel.app` → true; `http://localhost:5173` → true; `https://dosi-k3j2h1-rutigliano1988s-projects.vercel.app` → true; `https://dosi-app-git-feat-x-rutigliano1988s-projects.vercel.app` → true; `https://evil.com` → false; `https://dosi-app.vercel.app.evil.com` → false; `''` → false.
- **`src/lib/reminders.shared.test.ts`** (ampliar): `snoozePatch` — `{ time: '08:00', date: '2026-08-30' }` +10 → sin `date`, `time '08:10'`, `total_min 490`; `{ time: '23:55', date: '2026-08-30' }` +10 → `date '2026-08-31'`, `time '00:05'`; `{ time: '23:58', date: '2026-12-31' }` +10 → `date '2027-01-01'`. `deliveredAny` — `[0]` → true; `[0, 410]` → true; `[]` → false; `[500, 502]` → false.
- **`src/lib/adherence.test.ts`**: sin cambios (los tests de `adherenceLabel` siguen pasando con las claves nuevas).
- **Sin unit test** (inspección + manual, en el E2E):
  - #1 Semana — verificar que Semana y Mes muestran el mismo % para los días solapados.
  - #2/#3/#4 — visual + gate de tipos.
  - #5 `push-resub` — el usuario siembra una fila de `push_subscriptions` (SQL en el editor de Supabase) y hace `curl` a `push-resub`: `{oldEndpoint, secret, sub}` válido → `200` + `secret` nuevo + fila actualizada; `secret` incorrecto → `404`. El handler del SW: inspección de código.
- **Gate:** `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`. Objetivo: **120 + ~12 tests nuevos verdes**.

## Riesgos / notas

- **`_shared/cors.ts` y `_shared/reminders.ts` se testean desde `src/`** — Vitest los importa con extensión `.ts` explícita (patrón ya establecido con `_shared/schedule.ts` / `_shared/reminders.ts`). No deben traer imports de Deno.
- **La clave VAPID pública queda hardcodeada en dos sitios** (`push-sw.js` y la env var `VITE_VAPID_PUBLIC_KEY` de Vercel). Si se regenera el par, actualizar ambos + los secrets de Supabase. Se anota en `reference_external.md`.
- **`push-resub` es una superficie nueva** con `verify_jwt=false`. Autenticada por `(endpoint, action_secret)` — el mismo par que ya protege `dose-action`. No amplía el modelo de amenaza existente.
- **La migración #8 es irreversible en la práctica** (re-crear la constraint fallaría si ya hay filas duplicadas por snooze). No se espera querer volver atrás.
- **`dose-action` / `send-reminders` / `caregiver-action` NO cambian de contrato** — solo su implementación interna. El redeploy no rompe clientes viejos.
- Sin cambios en el esquema salvo el `drop constraint`. Sin datos que migrar.
