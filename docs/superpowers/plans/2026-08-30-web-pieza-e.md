# Pieza E — Pase de consolidación · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el punch-list acumulado de las Piezas A/B/C/D — 10 correcciones de bugs, consistencia y limpieza, sin features nuevas.

**Architecture:** Sin cambios de arquitectura. Tres extracciones de código puro (`_shared/cors.ts` nuevo; `snoozePatch` + `deliveredAny` en `_shared/reminders.ts`) para poder testear en Vitest lógica que hoy vive en `functions/*/index.ts` (Vitest no puede importar esos ficheros — traen imports de Deno). Una Edge Function nueva `push-resub`. Una migración de un `drop constraint`.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, `@supabase/supabase-js`, Deno (Edge Functions), Supabase.

## Global Constraints

- **Idioma de la UI:** todo string visible va por `src/i18n/strings.ts` con clave en `es` **y** `en`. El patrón `lang === 'es' ? … : …` inline solo se mantiene donde ya existe.
- **Sin cambios de esquema** salvo el `drop constraint` de la Task 5. Sin datos que migrar.
- **Contrato de las Edge Functions no cambia** — solo su implementación interna. Los clientes viejos siguen funcionando.
- **TypeScript estricto** (`tsconfig.app.json`): `verbatimModuleSyntax: true` → imports de solo tipo con `import type`. `noUnusedLocals` / `noUnusedParameters`. `erasableSyntaxOnly` (sin enums/namespaces; generadores y `as const` OK). `jsx: react-jsx` → **nunca** `import React`; `import type { JSX } from 'react'` es la forma correcta en React 19. `allowImportingTsExtensions` → imports a `../../supabase/functions/_shared/*` llevan `.ts`; imports dentro de `src/` **no** llevan extensión; imports entre ficheros `_shared/*` llevan `.ts`.
- **Fechas siempre en hora local.** `isoDate(d)` de `src/lib/schedule.ts`. Nunca `toISOString()` para derivar un día.
- **`_shared/cors.ts` y `_shared/reminders.ts` NO deben traer imports de Deno** (`Deno.env`, `jsr:`, `npm:`) — Vitest los importa desde `src/`.
- **Clave VAPID pública** (se hardcodea en `push-sw.js`, es pública, se transmite al navegador): `BJ7u9DE_0t6GldAJg8gfTwolLD-VL5AjrFMRORzs_rpoWzeoGp4DRognS93YqmPyp_QIt3Aikva1prFNdNiB9Dc`. Es el mismo valor que la env var `VITE_VAPID_PUBLIC_KEY` de Vercel y de `.env.local`.
- **Regex de preview deploys de Vercel:** `/^https:\/\/dosi(-app)?-[a-z0-9-]+-rutigliano1988s-projects\.vercel\.app$/`.
- **Migración #8 irreversible en la práctica.** No se espera querer volver atrás.
- **Verification gate (cada task de código):**
  ```
  rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build
  ```
  `npm run lint` = oxlint (warnings no fallan; errors sí). `npm run test` = `vitest run`. `npm run build` = `tsc -b && vite build`. Suite actual: **120 tests verdes**.
- **Commits** en español, terminando con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- **Rama:** `feat/web-pieza-e` desde `main` (`da0d38e` o posterior). No commitear en `main`.

## Acciones del controlador (no las hace un subagente)

Estas dos van vía MCP de Supabase y las ejecuta el controlador en el orden indicado:

- **Tras la Task 5:** `apply_migration` con el SQL de `supabase/migrations/…_pieza_e_drop_obsolete_dose_unique.sql`.
- **Tras las Tasks 1, 3, 4, 6** (todas las que tocan `_shared/*` o un `index.ts` de función): `deploy_edge_function` para **`send-reminders`, `dose-action`, `caregiver-action`, `push-resub`**, cada una bundleando su `index.ts` + todos los `_shared/*.ts` que importe (`edge.ts`, `cors.ts`, `schedule.ts`, `reminders.ts`, `types.ts`). Verificar con `curl`: `OPTIONS` → 200 con el header `Access-Control-Allow-Origin`; POST con body inválido → 400; POST sin auth → 401/404.

---

## File Structure

**Crear:**
- `supabase/functions/_shared/cors.ts` — `isAllowedOrigin(origin)` + `CORS_FALLBACK_ORIGIN`. Puro, sin Deno.
- `src/lib/cors.shared.test.ts` — Vitest de `_shared/cors.ts`.
- `supabase/functions/push-resub/index.ts` — Edge Function de re-suscripción.
- `supabase/migrations/20260830HHMMSS_pieza_e_drop_obsolete_dose_unique.sql` — el `drop constraint` (el implementador pone el timestamp real).

**Modificar:**
- `supabase/functions/_shared/edge.ts` — usa `isAllowedOrigin` en vez del `CORS_ALLOW` local.
- `supabase/functions/_shared/reminders.ts` — añade `snoozePatch` y `deliveredAny`.
- `src/lib/reminders.shared.test.ts` — tests de `snoozePatch` y `deliveredAny`.
- `supabase/functions/dose-action/index.ts` — la rama snooze usa `snoozePatch`.
- `supabase/functions/send-reminders/index.ts` — los 3 bucles de envío usan `deliveredAny`.
- `supabase/config.toml` — `[functions.push-resub] verify_jwt = false`.
- `public/push-sw.js` — cachea `secret` en IndexedDB + handler `pushsubscriptionchange`.
- `src/screens/CalendarScreen.tsx` — pestaña Semana usa `buildAdherence` + label.
- `src/lib/adherence.ts` — `adherenceLabel` lee de `strings.ts`.
- `src/screens/DetailScreen.tsx` — label junto al `%` de 30 días.
- `src/screens/AddMedScreen.tsx` — `dose` default `''`, placeholder por i18n.
- `src/icons/index.tsx` — icono `logout`.
- `src/screens/ProfileScreen.tsx` — icono de "Cerrar sesión" + pluralización de la fila de sync.
- `src/App.tsx` — pluralización de la barra de sync.
- `src/i18n/strings.ts` — claves nuevas.

---

## Task 1: `_shared/cors.ts` + CORS de preview deploys (#9)

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `src/lib/cors.shared.test.ts`
- Modify: `supabase/functions/_shared/edge.ts` (líneas 76-90: `CORS_ALLOW` y `corsHeaders`)

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  // _shared/cors.ts
  export function isAllowedOrigin(origin: string): boolean
  export const CORS_FALLBACK_ORIGIN = 'https://dosi-app.vercel.app'
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/cors.shared.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../../supabase/functions/_shared/cors.ts';

describe('isAllowedOrigin', () => {
  it('acepta prod y localhost', () => {
    expect(isAllowedOrigin('https://dosi-app.vercel.app')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173')).toBe(true);
  });
  it('acepta preview deploys del proyecto', () => {
    expect(isAllowedOrigin('https://dosi-n56hlu8nm-rutigliano1988s-projects.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://dosi-app-git-feat-web-pieza-e-rutigliano1988s-projects.vercel.app')).toBe(true);
  });
  it('rechaza orígenes ajenos y trucos de sufijo', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://dosi-app.vercel.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://dosi-x-otracosa.vercel.app')).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- cors`
Expected: FAIL — `Failed to resolve import ".../cors.ts"`.

- [ ] **Step 3: Implementar `supabase/functions/_shared/cors.ts`**

```ts
// Política CORS de las Edge Functions. Puro y sin imports de Deno para que
// Vitest lo pueda importar desde src/.

const STATIC = new Set([
  'https://dosi-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);

// Preview deploys de Vercel de este proyecto: `dosi-<hash>-…` (deploy alias) y
// `dosi-app-git-<rama>-…` (branch alias). Solo Vercel crea hosts bajo ese
// subdominio.
const PREVIEW = /^https:\/\/dosi(-app)?-[a-z0-9-]+-rutigliano1988s-projects\.vercel\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  return STATIC.has(origin) || PREVIEW.test(origin);
}

export const CORS_FALLBACK_ORIGIN = 'https://dosi-app.vercel.app';
```

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `npm run test -- cors`
Expected: PASS — 3 bloques.

- [ ] **Step 5: Cablear en `supabase/functions/_shared/edge.ts`**

Reemplazar el bloque `const CORS_ALLOW = new Set([...])` (líneas ~76-80) y el cuerpo de `corsHeaders` (líneas ~82-90) por:
```ts
import { isAllowedOrigin, CORS_FALLBACK_ORIGIN } from './cors.ts';

// … (resto del fichero) …

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : CORS_FALLBACK_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
```
El `import` va con el resto de imports al principio del fichero. `corsPreflight` (más abajo) no cambia.

- [ ] **Step 6: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: lint sin errores, **120 + 3 = 123 tests** verdes, build OK.

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/_shared/edge.ts src/lib/cors.shared.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-e): CORS de las Edge Functions acepta preview deploys

_shared/cors.ts puro (testeable desde src/) con isAllowedOrigin: allowlist
estatica + regex de los preview deploys del proyecto en Vercel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **Controlador:** tras esta task, no despliegues todavía — espera a las Tasks 3, 4, 6 y despliega las 4 funciones juntas.

---

## Task 2: `snoozePatch` + `deliveredAny` en `_shared/reminders.ts` (#6, #7 puros)

**Files:**
- Modify: `supabase/functions/_shared/reminders.ts` (añadir al final, tras `expiryAlertDecision`)
- Modify: `src/lib/reminders.shared.test.ts` (añadir bloques al final)

**Interfaces:**
- Consumes: `shiftTime`, `strToMin` de `./schedule.ts` (ya importados parcialmente — `strToMin` ya está; añadir `shiftTime`).
- Produces:
  ```ts
  export function snoozePatch(
    dose: { time: string; date: string },
    mins: number,
  ): { time: string; total_min: number; reminded_count: 0; reminded_at: null; date?: string }

  export function deliveredAny(statuses: number[]): boolean
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/reminders.shared.test.ts` (importar `snoozePatch, deliveredAny` en la cabecera):
```ts
describe('snoozePatch', () => {
  it('sin cruce de medianoche: no incluye date', () => {
    const p = snoozePatch({ time: '08:00', date: '2026-08-30' }, 10);
    expect(p).toEqual({ time: '08:10', total_min: 490, reminded_count: 0, reminded_at: null });
    expect('date' in p).toBe(false);
  });
  it('cruza medianoche: date sube un día', () => {
    const p = snoozePatch({ time: '23:55', date: '2026-08-30' }, 10);
    expect(p).toEqual({ time: '00:05', total_min: 5, reminded_count: 0, reminded_at: null, date: '2026-08-31' });
  });
  it('cruza fin de año', () => {
    const p = snoozePatch({ time: '23:58', date: '2026-12-31' }, 10);
    expect(p.date).toBe('2027-01-01');
    expect(p.time).toBe('00:08');
  });
});

describe('deliveredAny', () => {
  it('true si algún status es 0', () => {
    expect(deliveredAny([0])).toBe(true);
    expect(deliveredAny([410, 0])).toBe(true);
  });
  it('false si ninguno entregó', () => {
    expect(deliveredAny([])).toBe(false);
    expect(deliveredAny([500, 502])).toBe(false);
    expect(deliveredAny([404, 410])).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- reminders.shared`
Expected: FAIL — `snoozePatch is not a function`.

- [ ] **Step 3: Implementar en `supabase/functions/_shared/reminders.ts`**

Cambiar la línea 2 de import a:
```ts
import { expandTimes, strToMin, daysBetween, isoDate, shiftTime } from './schedule.ts';
```
Añadir al final del fichero:
```ts
/**
 * Campos a actualizar en `doses` al posponer `mins` minutos. Si la nueva hora
 * cae en el día siguiente (cruzó medianoche), incluye `date`. Puro.
 */
export function snoozePatch(
  dose: { time: string; date: string },
  mins: number,
): { time: string; total_min: number; reminded_count: 0; reminded_at: null; date?: string } {
  const nt = shiftTime(dose.time, mins);
  const base = { time: nt, total_min: strToMin(nt), reminded_count: 0 as const, reminded_at: null };
  if (strToMin(nt) < strToMin(dose.time)) {
    const [y, m, d] = dose.date.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { ...base, date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` };
  }
  return base;
}

/** true si al menos un envío web-push se entregó (status 0 de webpushSend). */
export function deliveredAny(statuses: number[]): boolean {
  return statuses.some((s) => s === 0);
}
```
(`isoDate` sigue importándose aunque `snoozePatch` construya la fecha a mano — no lo quites, otras funciones del fichero lo usan.)

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `npm run test -- reminders.shared`
Expected: PASS.

- [ ] **Step 5: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: **123 + 5 = 128 tests** verdes.

```bash
git add supabase/functions/_shared/reminders.ts src/lib/reminders.shared.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-e): snoozePatch y deliveredAny en _shared/reminders

Piezas puras testeables para el fix de snooze cruzando medianoche
(dose-action) y el de marcar "avisado" solo si se entrego (send-reminders).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `dose-action` snooze cruza medianoche (#6)

**Files:**
- Modify: `supabase/functions/dose-action/index.ts` (línea 6 import; líneas 53-59 rama snooze)

**Interfaces:**
- Consumes: `snoozePatch(dose, mins)` de `../_shared/reminders.ts` (Task 2).
- Produces: nada para otras tasks.

- [ ] **Step 1: Modificar `supabase/functions/dose-action/index.ts`**

Línea 6:
```ts
import { shiftTime, strToMin } from '../_shared/schedule.ts';
```
→
```ts
import { snoozePatch } from '../_shared/reminders.ts';
```
(Ya no se usan `shiftTime` ni `strToMin` directamente en este fichero — quítalos del import. Si `strToMin` se usa en otro sitio del fichero, déjalo; revisa.)

Líneas 53-59 (la rama snooze, tras el comentario `// snooze: +10 min…`):
```ts
  // snooze: +10 min. Si cruza medianoche, snoozePatch también sube `date`.
  await sb.from('doses').update(snoozePatch(dose, 10)).eq('id', doseId);
  return json(req, { ok: true });
```

- [ ] **Step 2: Verification gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, 128 tests (los `functions/*/index.ts` no se testean ni type-checkean por `tsc -b`, pero el gate no debe romperse).

Nota: `supabase/functions/*/index.ts` no lo cubre `tsc`. Verificar a ojo que `dose` (de `.select('*')`) tiene `.time` y `.date` — sí, la fila `doses` los tiene.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/dose-action/index.ts
git commit -m "$(cat <<'EOF'
fix(pieza-e): dose-action snooze que cruza medianoche sube date

Posponer 23:55 -> 00:05 ahora mueve la fila al dia siguiente; antes se
quedaba en la fecha de ayer y send-reminders no la volvia a ver.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `send-reminders` marca "enviado" solo si se entregó (#7)

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (import; bucle de aviso de toma ~96-116; bucles de stock ~183-203 y caducidad ~214-234)

**Interfaces:**
- Consumes: `deliveredAny(statuses)` de `../_shared/reminders.ts` (Task 2).

- [ ] **Step 1: Modificar el import**

En la línea de import de `../_shared/reminders.ts` (actualmente importa `dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft, caregiverMissDue`), añadir `deliveredAny`.

- [ ] **Step 2: Bucle de aviso de toma (~98-115)**

Reemplazar:
```ts
      for (const sub of userSubs) {
        const status = await webpushSend(
          sub,
          JSON.stringify({ ...payload, endpoint: sub.endpoint, secret: sub.action_secret }),
        );
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (status === 0) {
          pushes++;
        }
      }

      await sb.from('doses')
        .update({
          reminded_count: ((dose.reminded_count ?? 0) as number) + 1,
          reminded_at: now.toISOString(),
        })
        .eq('id', dose.id);
```
por:
```ts
      const statuses: number[] = [];
      for (const sub of userSubs) {
        const status = await webpushSend(
          sub,
          JSON.stringify({ ...payload, endpoint: sub.endpoint, secret: sub.action_secret }),
        );
        statuses.push(status);
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (status === 0) {
          pushes++;
        }
      }

      if (deliveredAny(statuses)) {
        await sb.from('doses')
          .update({
            reminded_count: ((dose.reminded_count ?? 0) as number) + 1,
            reminded_at: now.toISOString(),
          })
          .eq('id', dose.id);
      }
```

- [ ] **Step 3: Bucle de stock (~184-203)**

En el bloque `if (stockDec === 'send') {`, recoger los status en un array y envolver el `upsert` a `sent_alerts`:
```ts
      if (stockDec === 'send') {
        const statuses: number[] = [];
        for (const sub of userSubs) {
          const st = await webpushSend(sub, JSON.stringify({
            kind: 'stock',
            title: `Se acaba tu ${med.name}`,
            body: `Te quedan ~${daysLeft(med)} días`,
            tag: `stock-${med.id}`,
            endpoint: sub.endpoint,
            secret: sub.action_secret,
          }));
          statuses.push(st);
          if (st === 404 || st === 410) {
            await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else if (st === 0) {
            pushes++;
          }
        }
        if (deliveredAny(statuses)) {
          await sb.from('sent_alerts').upsert(
            { user_id: userId, med_id: med.id, kind: 'stock', sent_at: new Date().toISOString() },
            { onConflict: 'user_id,med_id,kind' },
          );
        }
      } else if (stockDec === 'clear') {
```

- [ ] **Step 4: Bucle de caducidad (~215-234)**

Igual que Step 3 pero para el bloque `if (expDec === 'send') {` — array `statuses`, y `if (deliveredAny(statuses)) { await sb.from('sent_alerts').upsert({ ..., kind: 'expiry', ... }, ...) }`.

- [ ] **Step 5: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, 128 tests.

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "$(cat <<'EOF'
fix(pieza-e): send-reminders marca "avisado" solo si algun push se entrego

Aviso de toma (reminded_count) y alertas de stock/caducidad (sent_alerts)
ya no se marcan cuando todos los envios fallan por error transitorio; se
reintenta al siguiente tick.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **Controlador:** tras esta task, aún falta la Task 6 (`push-resub`). Despliega las 4 funciones juntas después de la Task 6.

---

## Task 5: Migración — quitar la constraint obsoleta (#8)

**Files:**
- Create: `supabase/migrations/20260830HHMMSS_pieza_e_drop_obsolete_dose_unique.sql` (el implementador pone el timestamp real, formato `YYYYMMDDHHMMSS`)

**Interfaces:** ninguna.

- [ ] **Step 1: Crear el fichero de migración**

```sql
-- La clave natural de `doses` es el PK `id` = `${medId}-${YYYY-MM-DD}-${HH:MM}`
-- desde Pieza A; todos los upserts usan onConflict:'id'. Esta UNIQUE quedo
-- obsoleta y ademas rompe posponer una toma sobre la hora exacta de otra
-- (Pieza E #6). Sin riesgo: ningun codigo usa (user_id, med_id, date, time)
-- como clave de conflicto.
alter table doses drop constraint if exists doses_user_id_med_id_date_time_key;
```

- [ ] **Step 2: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde (el fichero .sql no afecta al build).

```bash
git add supabase/migrations/
git commit -m "$(cat <<'EOF'
feat(pieza-e): migracion — quitar constraint UNIQUE obsoleta de doses

doses_user_id_med_id_date_time_key quedo obsoleta en Pieza A (el PK id es
la clave natural) y rompe posponer una toma sobre la hora de otra.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **Controlador:** tras esta task, aplica la migración vía MCP `apply_migration` (name `pieza_e_drop_obsolete_dose_unique`, query = el contenido del .sql). Verifica con `execute_sql` de solo lectura: `select conname from pg_constraint where conrelid = 'doses'::regclass;` → la constraint ya no aparece.

---

## Task 6: Edge Function `push-resub` (#5 backend)

**Files:**
- Create: `supabase/functions/push-resub/index.ts`
- Modify: `supabase/config.toml` (añadir bloque `[functions.push-resub]`)

**Interfaces:**
- Consumes: `sbAdmin`, `corsHeaders`, `corsPreflight` de `../_shared/edge.ts`.
- Produces: endpoint `POST /functions/v1/push-resub` con body `{ oldEndpoint, secret, sub: { endpoint, keys: { p256dh, auth } } }` → `200 { ok: true, secret: <nuevo> }` | `400` | `404 { error: 'no-match' }`.

- [ ] **Step 1: Crear `supabase/functions/push-resub/index.ts`**

```ts
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
```

- [ ] **Step 2: `supabase/config.toml`**

Añadir tras el bloque `[functions.caregiver-action]`:
```toml
[functions.push-resub]
verify_jwt = false
```

- [ ] **Step 3: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde (no afecta al build de la web).

```bash
git add supabase/functions/push-resub/ supabase/config.toml
git commit -m "$(cat <<'EOF'
feat(pieza-e): Edge Function push-resub

Re-apunta la fila de push_subscriptions al endpoint nuevo cuando el
navegador rota la suscripcion. Auth por (oldEndpoint, action_secret),
rota el secret en cada resub. verify_jwt=false.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **Controlador:** ahora despliega las **4 funciones** (`send-reminders`, `dose-action`, `caregiver-action`, `push-resub`) vía MCP `deploy_edge_function`, cada una con su `index.ts` + los `_shared/*.ts` que importe. Verifica `push-resub` con `curl`:
> - `curl -X OPTIONS` con `Origin: https://dosi-app.vercel.app` → 200, header `access-control-allow-origin: https://dosi-app.vercel.app`.
> - `curl -X OPTIONS` con `Origin: https://dosi-abc123-rutigliano1988s-projects.vercel.app` → 200, ese origin reflejado.
> - POST `{}` → 400.
> - POST `{ oldEndpoint:"x", secret:"y", sub:{endpoint:"z",keys:{p256dh:"a",auth:"b"}} }` → 404 `no-match`.
> - (Opcional, con fila sembrada por SQL) POST con `oldEndpoint`/`secret` reales → 200 + `secret` nuevo; comprobar la fila actualizada.

---

## Task 7: SW `pushsubscriptionchange` + IndexedDB (#5 frontend)

**Files:**
- Modify: `public/push-sw.js`

**Interfaces:**
- Consumes: la Edge Function `push-resub` (Task 6) en `OK_ACTION + 'push-resub'`.
- Produces: nada.

- [ ] **Step 1: Añadir constantes y helpers al principio de `public/push-sw.js`**

Tras la línea `const OK_ACTION = 'https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/';` (línea 29):
```js
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
```

- [ ] **Step 2: Cachear el `secret` en el handler `push`**

En el handler `push` existente, dentro del `try { d = event.data.json(); }` ya se parsea `d`. Añadir, antes del `event.waitUntil(self.registration.showNotification(...))`:
```js
  if (d.endpoint && d.secret) {
    event.waitUntil(idbSet('latest', { endpoint: d.endpoint, secret: d.secret }).catch(() => {}));
  }
```
(`event.waitUntil` se puede llamar varias veces; no interfiere con el `showNotification`.)

- [ ] **Step 3: Handler `pushsubscriptionchange`**

Añadir al final del fichero:
```js
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
    } catch (e) {
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
    } catch (e) {
      // el syncPush del siguiente arranque de la app re-registra la suscripción
    }
  })());
});
```

- [ ] **Step 4: Verification gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. `public/push-sw.js` no lo linta oxlint (está fuera de `src/`) pero el `vite build` lo copia a `dist/` y Workbox lo referencia por `importScripts` — comprobar que `dist/push-sw.js` existe y contiene el handler nuevo.

- [ ] **Step 5: Verificación manual (limitada)**

`npm run dev`, DevTools → Application → Service Workers: confirmar que el SW registra sin errores de sintaxis (la consola del SW no debe tener `SyntaxError`). El evento `pushsubscriptionchange` no se puede disparar a mano de forma fiable; la verificación real es la inspección de código + el `curl` a `push-resub` de la Task 6.

- [ ] **Step 6: Commit**

```bash
git add public/push-sw.js
git commit -m "$(cat <<'EOF'
feat(pieza-e): handler pushsubscriptionchange en el service worker

Cachea el action_secret del ultimo push en IndexedDB; al rotar la
suscripcion, re-suscribe y llama a push-resub para apuntar la fila al
endpoint nuevo. Clave VAPID publica hardcodeada.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Pestaña Semana usa `buildAdherence` (#1)

**Files:**
- Modify: `src/screens/CalendarScreen.tsx` (líneas 22-23 comentario; 50-64 `weekData`/`weekTotals`; 131-169 tira; 174-198 tarjeta resumen)

**Interfaces:**
- Consumes: `buildAdherence` de `../lib/adherence` (ya importado en el fichero). `AdherenceSummary.perDay` = `{ date, taken, skipped, missed, pending, scheduled }[]` (una entrada por día del rango, orden asc). `AdherenceSummary.rate` = `number | null`.

- [ ] **Step 1: Reemplazar `weekData` y `weekTotals` (líneas ~49-64)**

```ts
  // Adherencia de la semana (mismo motor que la vista Mes).
  const weekAdh = useMemo(
    () => buildAdherence(meds, historyDoses, isoDate(week[0]), todayStr, new Date()),
    [meds, historyDoses, todayStr], // eslint-disable-line react-hooks/exhaustive-deps
  );
```
Borrar `weekData` y `weekTotals` por completo. La función `dosesForDate` (líneas 43-47) se mantiene — la usa el timeline del día.

- [ ] **Step 2: Tira semanal (líneas ~131-169)**

Dentro del `week.map((d, i) => { ... })`, reemplazar el uso de `wd`/`pct` por lectura de `weekAdh.perDay[i]` con la **misma regla que las celdas del mes**:
```tsx
{week.map((d, i) => {
  const da = weekAdh.perDay[i];
  const due = da ? da.taken + da.missed + da.skipped : 0;
  const isFuture = isoDate(d) > todayStr;
  const sel = selected === i;
  let dot: JSX.Element;
  if (isFuture || !da || due === 0) {
    dot = <div style={{ width: 8, height: 8, borderRadius: 4, background: sel ? 'rgba(0,0,0,0.15)' : theme.border }} />;
  } else if (da.missed + da.skipped === 0) {
    dot = <div style={{ width: 9, height: 9, borderRadius: 5, background: sel ? (theme.dark ? '#1c1812' : '#fff') : theme.success }} />;
  } else {
    dot = <ProgressRing theme={theme} value={da.taken / due} size={22} stroke={3}
            color={sel ? (theme.dark ? '#1c1812' : '#fff') : theme.success} showLabel={false} />;
  }
  return (
    <button key={i} onClick={() => setSelected(i)} style={{
      width: 40, padding: '6px 4px', borderRadius: 14, border: 0,
      background: sel ? theme.accent : 'transparent',
      color: sel ? theme.accentText : theme.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>{days[(d.getDay() + 6) % 7]}</div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</div>
      <div>{dot}</div>
    </button>
  );
})}
```
Necesita `import type { JSX } from 'react';` (ya está en el fichero por la vista Mes).

- [ ] **Step 3: Tarjeta resumen de la semana (líneas ~174-198)**

```tsx
<Card theme={theme} style={{ padding: 18 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <ProgressRing theme={theme} value={weekAdh.rate ?? 0} size={72} color={theme.success} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12.5, color: theme.textDim, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {t('adherence')}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: theme.text, letterSpacing: -0.4, fontFamily: '"Instrument Serif", Georgia, serif' }}>
        {weekAdh.rate === null ? '—' : Math.round(weekAdh.rate * 100) + '%'}
        {weekAdh.rate !== null && (
          <span style={{ fontSize: 14, fontFamily: 'inherit', color: theme.textDim }}> · {adherenceLabel(weekAdh.rate, lang)}</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: theme.textDim }}>
        {weekAdh.skipped} {t('skippedCountLabel')} · {weekAdh.missed} {t('missedCountLabel')} · {weekAdh.taken + weekAdh.missed} {lang === 'es' ? 'dosis · esta semana' : 'doses · this week'}
      </div>
    </div>
  </div>
</Card>
```
`adherenceLabel` se importa de `../lib/adherence` en la Task 9; si haces esta task antes, añade el import aquí y la Task 9 solo cambia el cuerpo de la función. Import: `import { buildAdherence, adherenceLabel } from '../lib/adherence';`

- [ ] **Step 4: Comentario del prop**

Línea 23: `historyDoses: Dose[];  // last 7 days from Supabase` → `// last 90 days from Supabase`.

- [ ] **Step 5: Verification gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, 128 tests (sin tests nuevos — pantalla; el gate es tipos + build).

- [ ] **Step 6: Verificación manual**

`npm run dev`, Calendario → pestaña Semana: la tarjeta y la tira usan la misma métrica que la pestaña Mes. Para un día con 1 tomada + 1 omitida, la Semana ya no lo cuenta 100% (antes sí). Comparar el % de un día concreto entre Semana y Mes → deben coincidir.

- [ ] **Step 7: Commit**

```bash
git add src/screens/CalendarScreen.tsx
git commit -m "$(cat <<'EOF'
fix(pieza-e): la pestana Semana del calendario usa buildAdherence

Misma metrica que la pestana Mes: omitidas fuera del denominador, cuenta
los olvidos derivados. Antes podia leer 100% donde Mes leia 50%.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `adherenceLabel` cableado + strings (#10)

**Files:**
- Modify: `src/lib/adherence.ts` (líneas 1-6 imports; 154-159 `adherenceLabel`)
- Modify: `src/i18n/strings.ts` (bloques `es` y `en`)
- Modify: `src/screens/DetailScreen.tsx` (línea ~225, la del `%` de 30 días)
- Modify: `src/screens/CalendarScreen.tsx` — solo si la Task 8 no dejó ya el label en la tarjeta del mes; añadirlo también ahí.

**Interfaces:**
- Consumes: `tstr` de `../i18n/strings`.
- Produces: `adherenceLabel(rate: number | null, lang: Lang): string` (misma firma; ahora lee de `strings.ts`).

- [ ] **Step 1: Claves i18n**

`src/i18n/strings.ts`, bloque `es` (junto a `adherence`):
```ts
  adhExcellent: 'Excelente', adhGood: 'Buena', adhIrregular: 'Irregular',
```
Bloque `en` (posición equivalente):
```ts
  adhExcellent: 'Excellent', adhGood: 'Good', adhIrregular: 'Irregular',
```

- [ ] **Step 2: `adherenceLabel` lee de `strings.ts`**

`src/lib/adherence.ts` — añadir a los imports (línea ~2, junto a `import type { Lang }`):
```ts
import { tstr } from '../i18n/strings';
```
(Es un import de valor, no `import type` — `tstr` es una función. `Lang` sigue con `import type`.)

Reemplazar el cuerpo de `adherenceLabel` (líneas 154-159):
```ts
export function adherenceLabel(rate: number | null, lang: Lang): string {
  if (rate === null) return '—';
  if (rate >= 0.9) return tstr(lang, 'adhExcellent');
  if (rate >= 0.7) return tstr(lang, 'adhGood');
  return tstr(lang, 'adhIrregular');
}
```

- [ ] **Step 3: Ejecutar los tests existentes de `adherenceLabel`**

Run: `npm run test -- adherence`
Expected: PASS — los tests comparan contra `'Excelente'`/`'Buena'`/`'Irregular'`/`'Excellent'`/`'Good'`, que son los valores de las claves nuevas. No hay que tocarlos.

- [ ] **Step 4: `DetailScreen.tsx` — label junto al `%` de 30 días**

Línea ~224-226, el `<span>` del `%`:
```tsx
<span style={{ fontSize: 20, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif' }}>
  {am!.rate === null ? '—' : Math.round(am!.rate * 100) + '%'}
  {am!.rate !== null && (
    <span style={{ fontSize: 13, fontFamily: 'inherit', color: theme.textDim }}> · {adherenceLabel(am!.rate, lang)}</span>
  )}
</span>
```
Import: en `DetailScreen.tsx` la línea 6 `import { buildAdherence } from '../lib/adherence';` → `import { buildAdherence, adherenceLabel } from '../lib/adherence';`. Verificar que `lang` es una prop del componente (sí, `DetailScreen` recibe `lang`).

- [ ] **Step 5: `CalendarScreen.tsx` — tarjeta del mes**

En la tarjeta "Resumen del mes visible" (vista Mes), en el `<div>` del `%` (donde pone `{monthView.summary.rate === null ? '—' : Math.round(...) + '%'}`), añadir tras el `%`:
```tsx
{monthView.summary.rate !== null && (
  <span style={{ fontSize: 13, fontWeight: 400, color: theme.textDim }}> · {adherenceLabel(monthView.summary.rate, lang)}</span>
)}
```
(La tarjeta de Semana ya lo lleva de la Task 8.)

- [ ] **Step 6: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, 128 tests.

```bash
git add src/lib/adherence.ts src/i18n/strings.ts src/screens/DetailScreen.tsx src/screens/CalendarScreen.tsx
git commit -m "$(cat <<'EOF'
feat(pieza-e): adherenceLabel cableado en Semana / Mes / Detalle

"84% · Buena" en las tres tarjetas de resumen. adherenceLabel deja de
hardcodear strings — lee de strings.ts (claves adhExcellent/Good/Irregular).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Fixes triviales de cliente — pluralización, AddMed, icono (#2, #3, #4)

**Files:**
- Modify: `src/i18n/strings.ts` (bloques `es` y `en`)
- Modify: `src/App.tsx` (~línea 570)
- Modify: `src/screens/ProfileScreen.tsx` (~líneas 216, 223)
- Modify: `src/screens/AddMedScreen.tsx` (líneas 97, 370)
- Modify: `src/icons/index.tsx` (nueva `logout`, export `I`)

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Claves i18n**

`src/i18n/strings.ts`, bloque `es` (junto a `syncPending`/`syncPendingRow`):
```ts
  syncPendingOne: '1 cambio sin sincronizar · toca para reintentar',
  syncPendingRowOne: '1 cambio sin sincronizar',
  dosePlaceholder: 'p. ej. 500 mg',
```
Bloque `en`:
```ts
  syncPendingOne: '1 change not synced · tap to retry',
  syncPendingRowOne: '1 change not synced',
  dosePlaceholder: 'e.g. 500 mg',
```

- [ ] **Step 2: Pluralización en los call sites**

`src/App.tsx` (~línea 570), donde pone `{t('syncPending', { n: pendingSync })}`:
```tsx
{t(pendingSync === 1 ? 'syncPendingOne' : 'syncPending', { n: pendingSync })}
```
`src/screens/ProfileScreen.tsx` (~línea 223), `label={t('syncPendingRow', { n: pendingSync })}`:
```tsx
label={t(pendingSync === 1 ? 'syncPendingRowOne' : 'syncPendingRow', { n: pendingSync })}
```

- [ ] **Step 3: AddMed dosis vacía**

`src/screens/AddMedScreen.tsx`:
- Línea 370: `dose: initialData?.dose ?? '500 mg',` → `dose: initialData?.dose ?? '',`
- Línea 97: `placeholder="500 mg"` → `placeholder={t('dosePlaceholder')}`

- [ ] **Step 4: Icono `logout`**

`src/icons/index.tsx` — añadir tras `const share` (o donde encaje alfabéticamente):
```tsx
const logout: IconFn = (s = 22, c = 'currentColor') => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M15 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
    <path d="M10 12h11M17 8l4 4-4 4" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
```
Añadir `logout` al objeto `export const I` (línea ~170-174).

`src/screens/ProfileScreen.tsx` línea ~216: `<Row theme={theme} icon={I.back} label={t('accountSignOut')} onPress={onSignOut} danger />` → `icon={I.logout}`.

- [ ] **Step 5: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, 128 tests.

```bash
git add src/i18n/strings.ts src/App.tsx src/screens/ProfileScreen.tsx src/screens/AddMedScreen.tsx src/icons/index.tsx
git commit -m "$(cat <<'EOF'
fix(pieza-e): pluralizacion de la barra de sync, AddMed dosis vacia, icono logout

- "1 cambio" / "N cambios" segun cantidad
- el campo Dosis de una medicina nueva empieza vacio (antes "500 mg")
- fila "Cerrar sesion" con icono propio (antes reusaba la flecha atras)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificación final de la rama (antes de la revisión de rama completa)

- [ ] `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — verde, **~132 tests**.
- [ ] Migración aplicada (controlador) — `select conname from pg_constraint where conrelid='doses'::regclass` no lista `doses_user_id_med_id_date_time_key`.
- [ ] Las 4 Edge Functions desplegadas (controlador) — `curl` de humo OK para cada una.
- [ ] `git log --oneline main..feat/web-pieza-e` — ~10 commits limpios.

## Checklist E2E para el usuario (tras la revisión, antes del merge)

1. **Calendario → Semana:** la tarjeta y la tira muestran la misma métrica que la pestaña Mes (un día 1-tomada-1-omitida ya no es 100%). "84% · Buena" bajo el porcentaje.
2. **Calendario → Mes** y **detalle de medicina:** también muestran "· Excelente/Buena/Irregular".
3. **Barra de sync** con 1 cambio pendiente dice "1 cambio" (no "1 cambios"). Forzar: apagar el WiFi, marcar una toma, mirar la barra.
4. **Nueva medicina:** el campo "Dosis" empieza **vacío**, con el placeholder "p. ej. 500 mg". Editar una medicina existente conserva su dosis.
5. **Perfil → Cerrar sesión:** icono de puerta con flecha (no la flecha de "atrás").
6. **Posponer una toma de las 23:5x** desde la notificación → al día siguiente la toma aparece en "Hoy" (no se pierde). *(Requiere simular la hora o esperar; opcional.)*
7. **PDF del informe médico en iPhone real** (PWA instalada) — el smoke test que quedó pendiente de Pieza D: "Guardar PDF" → se comparte / abre correctamente.
8. Los recordatorios y los avisos al cuidador siguen llegando (regresión de las Edge Functions redesplegadas).

---

## Self-Review (hecho por el planificador)

**1. Cobertura del spec:**
- #1 pestaña Semana → Task 8. ✅
- #2 pluralización → Task 10. ✅
- #3 AddMed dosis → Task 10. ✅
- #4 icono logout → Task 10. ✅
- #5 pushsubscriptionchange + push-resub → Tasks 6 (backend) + 7 (SW). ✅
- #6 dose-action snooze medianoche → Tasks 2 (`snoozePatch` puro) + 3 (wiring). ✅
- #7 send-reminders deliveredAny → Tasks 2 (`deliveredAny` puro) + 4 (3 bucles). ✅
- #8 migración drop constraint → Task 5 + acción del controlador. ✅
- #9 CORS preview deploys → Task 1. ✅
- #10 adherenceLabel → Task 9. ✅
- Extracciones puras (`_shared/cors.ts`, `snoozePatch`, `deliveredAny`) → Tasks 1, 2. ✅
- Tests del spec (`cors.shared.test.ts`, ampliación de `reminders.shared.test.ts`) → Tasks 1, 2. ✅
- Acciones del controlador (migración, deploy de 4 funciones) → sección "Acciones del controlador" + notas en Tasks 5 y 6. ✅

**2. Placeholders:** el timestamp del fichero de migración (`20260830HHMMSS`) es el único marcador — es un valor que el implementador genera (`date +%Y%m%d%H%M%S`), no una laguna de contenido. El resto son bloques de código completos.

**3. Consistencia de tipos:**
- `isAllowedOrigin(origin: string): boolean` — Task 1 (definición) y Task 1 Step 5 (uso en edge.ts). ✅
- `CORS_FALLBACK_ORIGIN` — Task 1. ✅
- `snoozePatch(dose: { time; date }, mins): { time; total_min; reminded_count: 0; reminded_at: null; date? }` — Task 2 (def) y Task 3 (uso). ✅
- `deliveredAny(statuses: number[]): boolean` — Task 2 (def) y Task 4 (3 usos). ✅
- `adherenceLabel(rate: number | null, lang: Lang): string` — firma sin cambios; Task 9 (cuerpo), Tasks 8 y 9 (usos). ✅
- `AdherenceSummary.perDay` / `.rate` — consumidos en Task 8 con los mismos nombres que Pieza D. ✅
- Claves i18n: `syncPendingOne`, `syncPendingRowOne`, `dosePlaceholder` (Task 10); `adhExcellent`/`adhGood`/`adhIrregular` (Task 9) — cada una en `es` y `en`. ✅
- `push-resub` body `{ oldEndpoint, secret, sub: { endpoint, keys: { p256dh, auth } } }` — Task 6 (función) y Task 7 (el SW lo envía con esa forma exacta). ✅

**Gap detectado y corregido inline:** el import de `adherenceLabel` en `CalendarScreen.tsx` lo necesitan tanto la Task 8 (tarjeta de Semana) como la Task 9 (tarjeta de Mes). Añadida la nota en Task 8 Step 3 de incluir el import ahí, y en Task 9 Step 5 de solo añadir el uso. Si las tasks se ejecutan en orden (8 antes que 9) no hay conflicto.
