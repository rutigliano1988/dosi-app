# Dosi Web — Pieza C: Aviso a un cuidador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el paciente no marca una toma en la hora siguiente a su hora, avisar por push a **un** cuidador (que también usa Dosi), con botones "Ya la tomó" y "Recordárselo" en el aviso y en una pantalla "Hoy de Ana" de solo lectura.

**Architecture:** Se reutiliza la tabla `caregivers` (existía, sin uso). El paciente genera un código de 6 chars que el cuidador introduce. La detección de olvido se añade a `send-reminders` (cron/min) apoyada en un predicado puro `caregiverMissDue` testeado en Vitest. Todo el acceso del cuidador a los datos del paciente pasa por una única Edge Function `caregiver-action` (`verify_jwt=false`, autenticada con el secreto de la suscripción push del cuidador) que verifica la relación `caregivers` en cada llamada — **no se tocan las políticas RLS de `medicines`/`doses`**.

**Tech Stack:** React 19 + TypeScript + Vite 8, Supabase JS v2, Supabase Edge Functions (Deno, `npm:web-push@3`), Vitest, service worker (Workbox `generateSW`).

**Spec:** `docs/superpowers/specs/2026-08-29-web-pieza-c-design.md`

## Global Constraints

- **TypeScript estricto** (`tsconfig.app.json`): `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax: true` (imports solo-de-tipo con `import type`), `erasableSyntaxOnly: true` (nada de `enum`/`namespace`/params con modificador). Con `"jsx": "react-jsx"` **nunca** `import React from 'react'` salvo que se use `React.` en posición de valor (seguir el patrón del archivo que se edita — `ProfileScreen.tsx`/`PushSheet.tsx` no lo importan).
- **Build de verificación:** `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — todo verde antes de cada commit que toque código. `npm run lint` = `oxlint`; los `warning` no rompen el gate pero no se dejan warnings nuevos evitables.
- **Fechas:** hora local (`d.getFullYear()/getMonth()/getDate()`), nunca `toISOString()` para fechas de calendario. Formato ISO `YYYY-MM-DD`.
- **Idiomas:** cada string nueva en `es` **y** en `en` en `src/i18n/strings.ts` (bloques `const es` ~línea 5 y `const en` ~línea 150+).
- **Estilo visual:** estilos inline con tokens de `theme` (no CSS Modules, no Tailwind). Copiar el patrón del vecino: `PushSheet.tsx` para hojas, `ProfileScreen.tsx` (`Row`, `SectionTitle`) para filas, `HomeScreen.tsx` (`DoseRow`) para filas de dosis.
- **Iconos disponibles** (`src/icons/index.tsx`, objeto `I`): `pill check plus user bell clock back close chev alert heart share edit trash sun moon globe`. Usar `I.heart` para la sección "Cuidador". No inventar iconos.
- **Commits temáticos y frecuentes**, uno por task. Mensajes multilínea con `git commit -F <tmpfile>` (el here-string de PowerShell da guerra con comillas). Terminar cada mensaje con:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **Rama:** `feat/web-pieza-c` desde `main`. Merge al final (auto-deploy Vercel).
- **Supabase:** proyecto `uwcktxqrfuelmscmkhbs`. Migraciones vía MCP `apply_migration`. Edge Functions vía MCP `deploy_edge_function` (bundle = `index.ts` + los `_shared/*.ts` nombrados `../_shared/xxx.ts`).
- **Imports Deno:** SIEMPRE con extensión `.ts` explícita en imports relativos (`'../_shared/edge.ts'`). Deno no resuelve extensiones. `oxlint` ignora `supabase/functions/*/index.ts`; los `_shared/*.ts` SÍ se lintan.
- **`doses.status`** en la BD solo admite `'upcoming' | 'now' | 'taken' | 'skipped'` (constraint). `'missed'` es estado calculado en cliente, nunca se persiste.
- **`caregivers` legado:** columnas NOT NULL sin default hoy: `id, owner_user_id, name, relation_key, color, added_date`. La migración quita el NOT NULL de `name, relation_key, color, added_date`.
- **Autenticación de `caregiver-action`:** `{ endpoint, secret }` en el body = la suscripción push del que llama (cuidador). El cliente lee su propio `action_secret` con `supabase.from('push_subscriptions').select('action_secret').eq('endpoint', …)` (RLS deja leer la propia fila).
- **Un cuidador por paciente** (índice único `caregivers(owner_user_id)`); un cuidador puede cuidar a varios pacientes.
- **Umbral de olvido:** aviso al cuidador cuando `nowMin ∈ [dueMin+60, dueMin+120)`, dosis sin marcar, `reminded_count ≥ 1`, `caregiver_alerted_at` NULL. Un aviso por toma.

## File Structure

| Archivo | Responsabilidad | Task |
|---|---|---|
| `supabase/migrations/20260829120000_pieza_c_caregivers.sql` | columnas + índice + política + drop-not-null | 1 |
| `supabase/functions/_shared/reminders.ts` | +`caregiverMissDue` | 2 |
| `supabase/functions/_shared/edge.ts` | +`markDoseTaken` helper, CORS por origen allowlisted | 3 |
| `supabase/functions/dose-action/index.ts` | usa `markDoseTaken`, CORS nuevo | 3 |
| `supabase/functions/caregiver-action/index.ts` | 6 acciones del cuidador | 4 |
| `supabase/functions/caregiver-action/deno.json` | — (no; se borró en Pieza B; no crear) | — |
| `supabase/functions/send-reminders/index.ts` | +paso de detección de olvido | 5 |
| `supabase/config.toml` | +`[functions.caregiver-action] verify_jwt=false` | 4 |
| `src/lib/reminders.shared.test.ts` | +tests `caregiverMissDue` | 2 |
| `src/data/sync.ts` | `export` de `rowToMed` | 6 |
| `src/lib/sync.rowToMed.test.ts` | paridad `sync.ts` ↔ `_shared` | 6 |
| `src/data/types.ts` | +`CaregiverRow` | 7 |
| `src/lib/caregiver.ts` | toda la lógica cliente (paciente + cuidador) | 7 |
| `src/lib/caregiver.test.ts` | test de `genCode` | 7 |
| `src/screens/CaregiverSheet.tsx` | hoja mostrar-código / meter-código | 8 |
| `src/screens/CaregiverScreen.tsx` | pantalla "Hoy de Ana" | 9 |
| `src/screens/ProfileScreen.tsx` | sección "Cuidador" | 10 |
| `public/push-sw.js` | kinds `caregiver-miss` / `caregiver-nudge` | 11 |
| `src/App.tsx` | estado, ruta, handlers, corte al cerrar sesión | 12 |
| `src/i18n/strings.ts` | strings `es`+`en` | 8, 9, 10, 12 |

---

## Phase 1 — Backend

### Task 1: Migración

**Files:**
- Create: `supabase/migrations/20260829120000_pieza_c_caregivers.sql`

**Interfaces:**
- Produces: columnas `caregivers.pair_code/pair_code_expires_at/owner_name`, `doses.caregiver_alerted_at/nudged_at`; índice `caregivers_one_per_owner`; política `"caregiver can leave"`.

- [ ] **Step 1: Comprobar que el proyecto está activo**

Usar MCP `get_project` con `id = uwcktxqrfuelmscmkhbs`. Expected: `"status": "ACTIVE_HEALTHY"`. Si `INACTIVE`: parar y pedir al usuario que lo restaure desde el dashboard.

- [ ] **Step 2: Escribir `supabase/migrations/20260829120000_pieza_c_caregivers.sql`**

```sql
-- Pieza C — Aviso a un cuidador. Reutiliza la tabla caregivers (legado móvil, sin uso).

-- columnas de emparejamiento
alter table public.caregivers add column if not exists pair_code            text;
alter table public.caregivers add column if not exists pair_code_expires_at timestamptz;
alter table public.caregivers add column if not exists owner_name           text;

-- el legado tenía estas NOT NULL sin default; se relajan
alter table public.caregivers alter column name         drop not null;
alter table public.caregivers alter column relation_key drop not null;
alter table public.caregivers alter column color        drop not null;
alter table public.caregivers alter column added_date   drop not null;

-- un cuidador por paciente (una fila por owner)
create unique index if not exists caregivers_one_per_owner
  on public.caregivers (owner_user_id);

-- el cuidador puede borrar su propia relación (corte al cerrar sesión + stop-caring)
drop policy if exists "caregiver can leave" on public.caregivers;
create policy "caregiver can leave" on public.caregivers
  for delete using (auth.uid() = caregiver_user_id);

-- doses: marca de "cuidador avisado" y "recordatorio enviado"
alter table public.doses add column if not exists caregiver_alerted_at timestamptz;
alter table public.doses add column if not exists nudged_at            timestamptz;
```

- [ ] **Step 3: Aplicar vía MCP**

`apply_migration` con `project_id = uwcktxqrfuelmscmkhbs`, `name = "pieza_c_caregivers"`, y el SQL de Step 2. Expected: sin error.

- [ ] **Step 4: Verificar**

`execute_sql`:
```sql
select
  (select count(*) from information_schema.columns where table_schema='public' and table_name='caregivers' and column_name in ('pair_code','pair_code_expires_at','owner_name')) as cg_cols,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='doses' and column_name in ('caregiver_alerted_at','nudged_at')) as dose_cols,
  (select count(*) from pg_indexes where indexname='caregivers_one_per_owner') as idx,
  (select count(*) from pg_policy where polrelid='public.caregivers'::regclass and polname='caregiver can leave') as pol,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='caregivers' and column_name='name' and is_nullable='YES') as name_nullable;
```
Expected: `cg_cols=3, dose_cols=2, idx=1, pol=1, name_nullable=1`.

- [ ] **Step 5: Commit**

```
git add supabase/migrations/20260829120000_pieza_c_caregivers.sql
git commit -F <tmpfile>
```
Mensaje:
```
feat(db): migración Pieza C — caregivers pairing + doses.caregiver_alerted_at/nudged_at

Aplicada a uwcktxqrfuelmscmkhbs vía MCP. Añade pair_code/pair_code_expires_at/
owner_name a caregivers, índice único por owner, política delete-as-caregiver,
relaja NOT NULL del legado (name/relation_key/color/added_date), y
caregiver_alerted_at/nudged_at a doses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 2: `caregiverMissDue` (núcleo puro)

**Files:**
- Modify: `supabase/functions/_shared/reminders.ts`
- Modify: `src/lib/reminders.shared.test.ts`

**Interfaces:**
- Consumes: `DoseRow` (`{ time: string; status: string; reminded_count: number; reminded_at: string | null }`), `strToMin` de `./schedule.ts` (ambos ya existen en el archivo).
- Produces: `caregiverMissDue(dose: DoseRow, now: Date): boolean`.

- [ ] **Step 1: Añadir el test en `src/lib/reminders.shared.test.ts`**

Al final del archivo, nuevo `describe`. El archivo ya importa de `'../../supabase/functions/_shared/reminders'`; añadir `caregiverMissDue` a esa lista de imports.

```ts
describe('caregiverMissDue', () => {
  const at = (h: number, m: number) => new Date(2026, 7, 28, h, m);
  const base = { time: '08:00', status: 'upcoming', reminded_count: 1, reminded_at: null } as const;

  it('true solo en la 2ª hora tras la toma', () => {
    expect(caregiverMissDue({ ...base }, at(8, 59))).toBe(false);  // 59 min
    expect(caregiverMissDue({ ...base }, at(9, 0))).toBe(true);    // 60 min
    expect(caregiverMissDue({ ...base }, at(9, 59))).toBe(true);   // 119 min
    expect(caregiverMissDue({ ...base }, at(10, 0))).toBe(false);  // 120 min
  });

  it('false si el paciente ni recibió sus avisos', () => {
    expect(caregiverMissDue({ ...base, reminded_count: 0 }, at(9, 30))).toBe(false);
  });

  it('false si ya está tomada o saltada', () => {
    expect(caregiverMissDue({ ...base, status: 'taken' }, at(9, 30))).toBe(false);
    expect(caregiverMissDue({ ...base, status: 'skipped' }, at(9, 30))).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `npx vitest run src/lib/reminders.shared.test.ts`
Expected: FAIL — `caregiverMissDue is not a function` / import no encontrado.

- [ ] **Step 3: Implementar en `supabase/functions/_shared/reminders.ts`**

Añadir tras `dueReminder`:

```ts
/** true si toca avisar al cuidador de esta toma (2ª hora tras la hora, sin marcar). */
export function caregiverMissDue(dose: DoseRow, now: Date): boolean {
  if (dose.status === 'taken' || dose.status === 'skipped') return false;
  if (dose.reminded_count < 1) return false;              // el paciente ni recibió sus avisos
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dueMin = strToMin(dose.time);
  return nowMin >= dueMin + 60 && nowMin < dueMin + 120;  // 2ª hora tras la toma
}
```

- [ ] **Step 4: Ejecutar — debe pasar**

Run: `npx vitest run src/lib/reminders.shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate completo**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 6: Commit**

```
git add supabase/functions/_shared/reminders.ts src/lib/reminders.shared.test.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(shared): caregiverMissDue — predicado de olvido para el aviso al cuidador

2ª hora tras la hora de la toma, sin marcar, con el paciente ya avisado ≥1 vez.
Cubierto por Vitest (vectores de frontera 59/60/119/120 min).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 3: `markDoseTaken` compartido + CORS por origen

**Files:**
- Modify: `supabase/functions/_shared/edge.ts`
- Modify: `supabase/functions/dose-action/index.ts`

**Interfaces:**
- Consumes: `sbAdmin()` (ya existe en `edge.ts`).
- Produces:
  - `markDoseTaken(sb: SupabaseClient, doseId: string, patientUserId: string): Promise<'ok' | 'not-found'>` — pone `status='taken'` y descuenta stock (idempotente).
  - `corsHeaders(req: Request): Record<string, string>` — `Access-Control-Allow-Origin` = origen de la petición si está en la allowlist (`https://dosi-app.vercel.app`, `http://localhost:5173`, `http://localhost:4173`), si no el de producción.
  - `corsPreflight(req)` cambia su firma interna para usar `corsHeaders(req)`.
- **Rompe** `dose-action` hasta que se actualice en el mismo commit (usa `CORS_HEADERS` como const).

- [ ] **Step 1: Editar `supabase/functions/_shared/edge.ts`**

Reemplazar el bloque `export const CORS_HEADERS` + `export function corsPreflight` por:

```ts
const CORS_ALLOW = new Set([
  'https://dosi-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': CORS_ALLOW.has(origin) ? origin : 'https://dosi-app.vercel.app',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function corsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  return null;
}
```

Y añadir, tras `webpushSend`:

```ts
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
```

(`SupabaseClient` ya se importa como `type` en `edge.ts`.)

- [ ] **Step 2: Editar `supabase/functions/dose-action/index.ts`**

- Import: cambiar `import { sbAdmin, CORS_HEADERS, corsPreflight } from '../_shared/edge.ts';` por
  `import { sbAdmin, corsHeaders, corsPreflight, markDoseTaken } from '../_shared/edge.ts';`
- El helper `json`: cambiar `headers: { ...CORS_HEADERS, 'content-type': 'application/json' }` por
  `headers: { ...corsHeaders(req), 'content-type': 'application/json' }` — **`json` pasa a recibir `req`**:
  `const json = (req: Request, body: unknown, status = 200): Response => …` y actualizar todas las llamadas a `json(req, …)`.
- La rama `action === 'take'`: reemplazar todo el bloque `if (dose.status !== 'taken') { … }` + `return json({ ok: true });` por:
  ```ts
  if (action === 'take') {
    const r = await markDoseTaken(sb, doseId, sub.user_id);
    return json(req, { ok: r === 'ok' }, r === 'ok' ? 200 : 404);
  }
  ```
  (El `dose` lookup previo se mantiene para la rama `snooze`; `take` ya no lo necesita pero no molesta. Si el linter se queja de `dose` sin usar en la rama take, dejarlo — se usa en snooze.)

- [ ] **Step 3: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. (Los `_shared/edge.ts` sí se lintan; `dose-action/index.ts` no. `tsc`/vitest no ven ninguno de los dos — nada en `src/` los importa.)

- [ ] **Step 4: Redeploy `dose-action` vía MCP**

`deploy_edge_function` con `project_id = uwcktxqrfuelmscmkhbs`, `name = "dose-action"`, `entrypoint_path = "index.ts"`, `verify_jwt = false`, `files` = `index.ts` (contenido nuevo) + `../_shared/edge.ts` (contenido nuevo) + `../_shared/schedule.ts` (sin cambios). Expected: `status: ACTIVE`, versión incrementada.

- [ ] **Step 5: Smoke test `dose-action`**

```
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS -H "origin: http://localhost:5173" https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/dose-action
# -> 200
curl -s -w " %{http_code}\n" -X POST -H "content-type: application/json" -d '{"endpoint":"x","secret":"x","doseId":"x","action":"take"}' https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/dose-action
# -> {"error":"unauthorized"} 401
```

- [ ] **Step 6: Commit**

```
git add supabase/functions/_shared/edge.ts supabase/functions/dose-action/index.ts
git commit -F <tmpfile>
```
Mensaje:
```
refactor(edge): markDoseTaken compartido + CORS por origen allowlisted

markDoseTaken (idempotente) extraído a _shared/edge.ts; dose-action y (Task 4)
caregiver-action lo usan. corsHeaders(req) refleja el origen si está en la
allowlist (prod + localhost 5173/4173) — permite probar en local y cierra el
Minor de Pieza B sobre CORS rígido. dose-action redesplegado.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 4: Edge Function `caregiver-action`

**Files:**
- Create: `supabase/functions/caregiver-action/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `sbAdmin`, `corsHeaders`, `corsPreflight`, `markDoseTaken`, `webpushSend` de `../_shared/edge.ts`; `nowInTz`, `isoDate`, `buildTodayDoses` de `../_shared/schedule.ts`; `rowToMed` de `../_shared/types.ts`.
- Produces: endpoint `POST /functions/v1/caregiver-action` con `action ∈ {accept, list-patients, stop-caring, patient-today, mark, nudge}`.
- HTTP: `401` secreto inválido · `403` relación inexistente · `404` dosis inexistente · `400` bad request / `self` · `404` `bad-code` · `200` `{ ok, ... }`.

- [ ] **Step 1: Crear `supabase/functions/caregiver-action/index.ts`**

```ts
// Edge Function: caregiver-action
// La invocan la app del cuidador y el service worker (botones del aviso de olvido).
// Identidad: { endpoint, action_secret } de push_subscriptions (verify_jwt=false).
// Verifica la relación caregivers en cada acción sobre un paciente.
import { sbAdmin, corsHeaders, corsPreflight, markDoseTaken, webpushSend } from '../_shared/edge.ts';
import { nowInTz, isoDate, buildTodayDoses } from '../_shared/schedule.ts';
import { rowToMed } from '../_shared/types.ts';

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let p: {
    endpoint?: string; secret?: string; action?: string;
    code?: string; caregiverName?: string;
    patientId?: string; relationId?: string; doseId?: string;
  };
  try { p = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { endpoint, secret, action } = p;
  if (!endpoint || !secret || !action) return json({ error: 'bad request' }, 400);

  const sb = sbAdmin();

  const { data: sub } = await sb
    .from('push_subscriptions').select('user_id, action_secret')
    .eq('endpoint', endpoint).maybeSingle();
  if (!sub || sub.action_secret !== secret) return json({ error: 'unauthorized' }, 401);
  const caregiverId = sub.user_id as string;

  // ── accept ────────────────────────────────────────────────────────────────
  if (action === 'accept') {
    const norm = String(p.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.length < 6) return json({ error: 'bad-code' }, 404);
    const { data: rel } = await sb
      .from('caregivers').select('*')
      .is('caregiver_user_id', null)
      .gt('pair_code_expires_at', new Date().toISOString())
      .ilike('pair_code', norm)
      .maybeSingle();
    if (!rel) return json({ error: 'bad-code' }, 404);
    if (rel.owner_user_id === caregiverId) return json({ error: 'self' }, 400);
    await sb.from('caregivers').update({
      caregiver_user_id: caregiverId,
      name: (p.caregiverName ?? '').slice(0, 60) || null,
      pair_code: null,
      pair_code_expires_at: null,
    }).eq('id', rel.id);
    return json({ ok: true, patientId: rel.owner_user_id, ownerName: rel.owner_name ?? null });
  }

  // ── list-patients ─────────────────────────────────────────────────────────
  if (action === 'list-patients') {
    const { data: rows } = await sb
      .from('caregivers').select('id, owner_user_id, owner_name')
      .eq('caregiver_user_id', caregiverId);
    return json({
      ok: true,
      patients: (rows ?? []).map((r) => ({
        relationId: r.id, patientId: r.owner_user_id, ownerName: r.owner_name ?? null,
      })),
    });
  }

  // ── acciones sobre un paciente: verificar la relación ─────────────────────
  const relQ = sb.from('caregivers').select('*').eq('caregiver_user_id', caregiverId);
  const { data: rel } = p.relationId
    ? await relQ.eq('id', p.relationId).maybeSingle()
    : await relQ.eq('owner_user_id', p.patientId ?? '').maybeSingle();
  if (!rel) return json({ error: 'not-your-patient' }, 403);
  const patientId = rel.owner_user_id as string;

  if (action === 'stop-caring') {
    await sb.from('caregivers').delete().eq('id', rel.id);
    return json({ ok: true });
  }

  if (action === 'patient-today') {
    const { data: pSubs } = await sb
      .from('push_subscriptions').select('timezone, last_seen_at')
      .eq('user_id', patientId).order('last_seen_at', { ascending: false }).limit(1);
    const tz = (pSubs?.[0]?.timezone as string) || 'Europe/Madrid';
    const now = nowInTz(tz);
    const today = isoDate(now);
    const { data: medRows } = await sb.from('medicines').select('*').eq('user_id', patientId);
    const meds = (medRows ?? []).map((r) => rowToMed(r as Record<string, unknown>));
    const fresh = buildTodayDoses(meds, now);
    if (fresh.length > 0) {
      await sb.from('doses').upsert(
        fresh.map((d) => ({
          id: d.id, user_id: patientId, med_id: d.medId, date: today,
          time: d.time, total_min: d.totalMin, status: 'upcoming',
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
    }
    const { data: doseRows } = await sb
      .from('doses').select('*').eq('user_id', patientId).eq('date', today);
    return json({
      ok: true,
      ownerName: rel.owner_name ?? null,
      today,
      patientNowMin: now.getHours() * 60 + now.getMinutes(),
      medicines: medRows ?? [],
      doses: doseRows ?? [],
    });
  }

  if (action === 'mark') {
    if (!p.doseId) return json({ error: 'bad request' }, 400);
    const r = await markDoseTaken(sb, p.doseId, patientId);
    return json({ ok: r === 'ok' }, r === 'ok' ? 200 : 404);
  }

  if (action === 'nudge') {
    if (!p.doseId) return json({ error: 'bad request' }, 400);
    const { data: dose } = await sb
      .from('doses').select('*').eq('id', p.doseId).eq('user_id', patientId).maybeSingle();
    if (!dose) return json({ error: 'not found' }, 404);
    if (dose.status === 'taken' || dose.status === 'skipped') return json({ ok: true, skipped: true });
    if (dose.nudged_at && Date.now() - Date.parse(dose.nudged_at) < 5 * 60 * 1000) {
      return json({ ok: true, cooldown: true });
    }
    const { data: med } = await sb
      .from('medicines').select('name').eq('id', dose.med_id).eq('user_id', patientId).maybeSingle();
    const { data: pSubs } = await sb.from('push_subscriptions').select('*').eq('user_id', patientId);
    const payload = {
      kind: 'caregiver-nudge',
      title: `${rel.name || 'Tu cuidador'} te recuerda tu ${med?.name ?? 'medicina'}`,
      body: `Toma de las ${dose.time}`,
      tag: `nudge-${dose.id}`,
      doseId: dose.id,
      actionUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/dose-action`,
    };
    for (const s of pSubs ?? []) {
      const st = await webpushSend(s, JSON.stringify({ ...payload, endpoint: s.endpoint, secret: s.action_secret }));
      if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
    await sb.from('doses').update({ nudged_at: new Date().toISOString() }).eq('id', dose.id);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
});
```

> **Nota sobre `ilike('pair_code', norm)`:** `pair_code` se guarda ya en mayúsculas (el cliente lo genera así), así que `ilike` con `norm` (mayúsculas, sin separadores) casa exacto. No usar comodines.

- [ ] **Step 2: Añadir a `supabase/config.toml`**

```toml
[functions.caregiver-action]
verify_jwt = false
```

- [ ] **Step 3: Deploy vía MCP**

`deploy_edge_function` con `name = "caregiver-action"`, `entrypoint_path = "index.ts"`, `verify_jwt = false`, `files` = `index.ts` + `../_shared/edge.ts` + `../_shared/schedule.ts` + `../_shared/types.ts`. Expected: `status: ACTIVE`.

- [ ] **Step 4: Smoke test**

```
# preflight
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS -H "origin: https://dosi-app.vercel.app" https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/caregiver-action
# -> 200
# secreto inválido
curl -s -w " %{http_code}\n" -X POST -H "content-type: application/json" -d '{"endpoint":"x","secret":"x","action":"list-patients"}' https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/caregiver-action
# -> {"error":"unauthorized"} 401
# bad code shape
curl -s -w " %{http_code}\n" -X POST -H "content-type: application/json" -d '{"endpoint":"x","secret":"x","action":"accept","code":"AB"}' https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/caregiver-action
# -> {"error":"unauthorized"} 401  (el secreto se comprueba antes que el código)
```

- [ ] **Step 5: Commit**

```
git add supabase/functions/caregiver-action/index.ts supabase/config.toml
git commit -F <tmpfile>
```
Mensaje:
```
feat(edge): caregiver-action — accept / list-patients / stop-caring / patient-today / mark / nudge

verify_jwt=false, autenticada con el secreto de la suscripción push del cuidador.
Verifica la relación caregivers en cada acción sobre un paciente. Reusa
markDoseTaken (mark) y dose-action vía payload (nudge). Desplegada en Supabase.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 5: Detección de olvido en `send-reminders`

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts`

**Interfaces:**
- Consumes: `caregiverMissDue` de `../_shared/reminders.ts` (Task 2).
- Produces: paso nuevo en el bucle por paciente; push `kind:'caregiver-miss'`; `doses.caregiver_alerted_at` se fija.

- [ ] **Step 1: Import**

En `supabase/functions/send-reminders/index.ts`, la línea de import de `reminders.ts`:
```ts
import { dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft, caregiverMissDue } from '../_shared/reminders.ts';
```

- [ ] **Step 2: Cargar los cuidadores al arranque**

Tras el bloque que construye `byUser` (y antes de `const SUPABASE_URL = …`):
```ts
  // Cuidadores activos, indexados por paciente.
  const { data: cgRows } = await sb.from('caregivers').select('*').not('caregiver_user_id', 'is', null);
  const caregiverByOwner = new Map<string, Record<string, unknown>>();
  for (const c of cgRows ?? []) caregiverByOwner.set(c.owner_user_id as string, c);
```

- [ ] **Step 3: Paso de detección de olvido**

Dentro del `try` del bucle `for (const [userId, userSubs] of byUser)`, **después** del `for (const dose of dosesHoy ?? [])` de avisos de toma (justo antes del comentario `// 3) Alertas de stock / caducidad`):

```ts
    // 2.5) Aviso al cuidador de tomas olvidadas.
    const cg = caregiverByOwner.get(userId);
    if (cg && cg.notify_on_miss !== false) {
      const cgSubs = byUser.get(cg.caregiver_user_id as string) ?? [];
      if (cgSubs.length > 0) {
        for (const dose of dosesHoy ?? []) {
          if (dose.status === 'taken' || dose.status === 'skipped') continue;
          if (dose.caregiver_alerted_at) continue;
          const dr = {
            time: dose.time as string,
            status: dose.status as string,
            reminded_count: (dose.reminded_count ?? 0) as number,
            reminded_at: (dose.reminded_at ?? null) as string | null,
          };
          if (!caregiverMissDue(dr, now)) continue;
          const med = meds.find((m) => m.id === dose.med_id);
          if (!med) continue;
          const payload = {
            kind: 'caregiver-miss',
            title: `${cg.owner_name || 'Tu paciente'} no ha tomado su ${med.name}`,
            body: `Toma de las ${dose.time}`,
            tag: `cgmiss-${dose.id}`,
            patientId: userId,
            doseId: dose.id as string,
            actionUrl: `${SUPABASE_URL}/functions/v1/caregiver-action`,
          };
          for (const s of cgSubs) {
            const st = await webpushSend(s, JSON.stringify({ ...payload, endpoint: s.endpoint, secret: s.action_secret }));
            if (st === 404 || st === 410) {
              await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
            } else if (st === 0) {
              pushes++;
            }
          }
          await sb.from('doses').update({ caregiver_alerted_at: now.toISOString() }).eq('id', dose.id);
        }
      }
    }
```

- [ ] **Step 4: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde (no cambia nada de `src/`; los `_shared` se lintan).

- [ ] **Step 5: Redeploy `send-reminders` vía MCP**

`deploy_edge_function` con `name = "send-reminders"`, `verify_jwt = false`, `files` = `index.ts` (nuevo) + `../_shared/edge.ts` (el de Task 3) + `../_shared/schedule.ts` + `../_shared/reminders.ts` (el de Task 2) + `../_shared/types.ts`. Expected: `status: ACTIVE`, versión incrementada.

- [ ] **Step 6: Smoke test**

```
curl -s -w "\n%{http_code}\n" -X POST -H "X-Cron-Secret: <CRON_SECRET del dashboard>" https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/send-reminders
# -> 200 {"users":N,"pushes":M}   (sin errores; el paso del cuidador no rompe el bucle)
```
Luego `query_logs` (`source='function_logs'`, últimos minutos): sin `[send-reminders]` de error nuevos.

- [ ] **Step 7: Commit**

```
git add supabase/functions/send-reminders/index.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(edge): send-reminders avisa al cuidador de las tomas olvidadas

Paso 2.5 en el bucle por paciente: si tiene cuidador activo con notify_on_miss
y una toma cae en la 2ª hora sin marcar (caregiverMissDue), push kind
caregiver-miss a las suscripciones del cuidador y caregiver_alerted_at = now().

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Phase 2 — Cliente

### Task 6: `export` de `rowToMed` + test de paridad

**Files:**
- Modify: `src/data/sync.ts`
- Create: `src/lib/sync.rowToMed.test.ts`

**Interfaces:**
- Produces: `rowToMed` exportada desde `src/data/sync.ts` (misma firma: `(r: Record<string, unknown>) => Medicine`).

- [ ] **Step 1: Editar `src/data/sync.ts`**

Cambiar `function rowToMed(` por `export function rowToMed(` (línea ~14). Nada más.

- [ ] **Step 2: Escribir `src/lib/sync.rowToMed.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { rowToMed as browserRowToMed } from '../data/sync';
import { rowToMed as sharedRowToMed } from '../../supabase/functions/_shared/types.ts';

const cases: Record<string, unknown>[] = [
  {
    id: 'm1', name: 'Sintrom', dose: '1 mg', form: 'pill', color: 'coral',
    schedule: { freq: 'interval', times: ['06:00'], intervalHours: 8 },
    duration: { kind: 'days', days: 10, startedOn: '2026-08-20' },
    stock: 30, expiry: '2027-01-01', notes: 'con comida', paused: false,
  },
  { id: 'm2' }, // fila mínima → defaults
  { id: 'm3', paused: 'yes' }, // paused no-booleano → false
];

describe('rowToMed: paridad sync.ts ↔ _shared/types.ts', () => {
  for (const [i, row] of cases.entries()) {
    it(`caso ${i}`, () => {
      const a = browserRowToMed(row);
      const b = sharedRowToMed(row);
      // color: el navegador tipa PillColorKey, _shared lo deja string — comparar por valor
      expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    });
  }

  it('fila mínima: defaults esperados', () => {
    const m = browserRowToMed({ id: 'x' });
    expect(m.name).toBe('');
    expect(m.form).toBe('pill');
    expect(m.color).toBe('coral');
    expect(m.schedule).toEqual({ freq: 'daily', times: ['08:00'], weekdays: undefined, intervalHours: undefined });
    expect(m.duration.kind).toBe('ongoing');
    expect(m.duration.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.stock).toBe(0);
    expect(m.paused).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutar — debe pasar (o revelar deriva real)**

Run: `npx vitest run src/lib/sync.rowToMed.test.ts`
Expected: PASS. Si falla por deriva real entre las dos copias → alinear la de `_shared/types.ts` con la de `sync.ts` (la de `sync.ts` es la de referencia) y volver a correr.

- [ ] **Step 4: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```
git add src/data/sync.ts src/lib/sync.rowToMed.test.ts
git commit -F <tmpfile>
```
Mensaje:
```
refactor(sync): exporta rowToMed + test de paridad con _shared/types.ts

CaregiverScreen reusa rowToMed para "Hoy de Ana". El test cierra el Minor
pendiente de la revisión de Pieza B (las dos copias sin cobertura de paridad).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 7: `CaregiverRow` + `src/lib/caregiver.ts`

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/lib/caregiver.ts`
- Create: `src/lib/caregiver.test.ts`

**Interfaces:**
- Consumes: `supabase` de `./supabase`.
- Produces:
  - `CaregiverRow` (en `types.ts`): `{ id: string; ownerUserId: string; caregiverUserId: string | null; name: string | null; ownerName: string | null; pairCode: string | null; pairCodeExpiresAt: string | null }`
  - `PatientDose` (en `caregiver.ts`): `{ id: string; medId: string; time: string; totalMin: number; status: string; caregiverAlertedAt: string | null; nudgedAt: string | null }`
  - `genCode(): string` — 6 chars de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  - `myCaregiverRow(): Promise<CaregiverRow | null>`
  - `createPairCode(ownerName: string): Promise<string>`
  - `regeneratePairCode(): Promise<string>`
  - `cancelCaregiver(): Promise<void>`
  - `acceptCode(code: string, name: string): Promise<{ patientId: string; ownerName: string | null } | { error: 'bad-code' | 'self' | 'no-push' | 'network' }>`
  - `listPatients(): Promise<{ relationId: string; patientId: string; ownerName: string | null }[]>`
  - `patientToday(patientId: string): Promise<{ ownerName: string | null; today: string; patientNowMin: number; medicines: Record<string, unknown>[]; doses: PatientDose[] }>`
  - `markDoseForPatient(patientId: string, doseId: string): Promise<void>`
  - `nudgePatient(patientId: string, doseId: string): Promise<'sent' | 'cooldown' | 'skipped'>`
  - `stopCaring(relationId: string): Promise<void>`

- [ ] **Step 1: Añadir `CaregiverRow` a `src/data/types.ts`**

Al final del archivo:
```ts
export interface CaregiverRow {
  id: string;
  ownerUserId: string;
  caregiverUserId: string | null;
  name: string | null;          // nombre del cuidador (null hasta aceptar)
  ownerName: string | null;     // nombre del paciente
  pairCode: string | null;
  pairCodeExpiresAt: string | null;
}
```

- [ ] **Step 2: Escribir `src/lib/caregiver.test.ts`** (solo el helper puro se testea en Node)

```ts
import { describe, it, expect } from 'vitest';
import { genCode } from './caregiver';

describe('genCode', () => {
  it('6 chars del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 200; i++) {
      const c = genCode();
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
  it('varía entre llamadas', () => {
    const set = new Set(Array.from({ length: 50 }, () => genCode()));
    expect(set.size).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 3: Ejecutar — debe fallar**

Run: `npx vitest run src/lib/caregiver.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 4: Crear `src/lib/caregiver.ts`**

```ts
import { supabase } from './supabase';
import type { CaregiverRow } from '../data/types';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function genCode(): string {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export interface PatientDose {
  id: string;
  medId: string;
  time: string;
  totalMin: number;
  status: string;
  caregiverAlertedAt: string | null;
  nudgedAt: string | null;
}

function toRow(r: Record<string, unknown>): CaregiverRow {
  return {
    id: String(r.id),
    ownerUserId: String(r.owner_user_id),
    caregiverUserId: (r.caregiver_user_id as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    ownerName: (r.owner_name as string | null) ?? null,
    pairCode: (r.pair_code as string | null) ?? null,
    pairCodeExpiresAt: (r.pair_code_expires_at as string | null) ?? null,
  };
}

// ─── Lado paciente (consultas normales con RLS caregivers_owner) ──────────────

export async function myCaregiverRow(): Promise<CaregiverRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('caregivers').select('*').eq('owner_user_id', user.id).maybeSingle();
  return data ? toRow(data as Record<string, unknown>) : null;
}

async function upsertCode(ownerName: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('no session');
  const code = genCode();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const existing = await supabase
    .from('caregivers').select('id').eq('owner_user_id', user.id).maybeSingle();
  if (existing.data) {
    await supabase.from('caregivers')
      .update({ pair_code: code, pair_code_expires_at: expires, owner_name: ownerName || null })
      .eq('id', existing.data.id);
  } else {
    await supabase.from('caregivers').insert({
      id: crypto.randomUUID(),
      owner_user_id: user.id,
      owner_name: ownerName || null,
      pair_code: code,
      pair_code_expires_at: expires,
    });
  }
  return code;
}

export const createPairCode = (ownerName: string) => upsertCode(ownerName);
export const regeneratePairCode = () => upsertCode('');
// regeneratePairCode conserva owner_name previo si se pasa '' -> corrección:

export async function cancelCaregiver(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('caregivers').delete().eq('owner_user_id', user.id).is('caregiver_user_id', null);
}

// ─── Lado cuidador (vía Edge Function) ───────────────────────────────────────

async function pushCreds(): Promise<{ endpoint: string; secret: string } | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    const { data } = await supabase
      .from('push_subscriptions').select('action_secret').eq('endpoint', sub.endpoint).maybeSingle();
    if (!data) return null;
    return { endpoint: sub.endpoint, secret: data.action_secret as string };
  } catch { return null; }
}

async function call<T>(body: Record<string, unknown>): Promise<T | { error: string }> {
  const creds = await pushCreds();
  if (!creds) return { error: 'no-push' };
  try {
    const { data, error } = await supabase.functions.invoke('caregiver-action', {
      body: { ...creds, ...body },
    });
    if (error) return { error: 'network' };
    return data as T;
  } catch { return { error: 'network' }; }
}

export async function acceptCode(
  code: string, name: string,
): Promise<{ patientId: string; ownerName: string | null } | { error: 'bad-code' | 'self' | 'no-push' | 'network' }> {
  const r = await call<{ ok: boolean; patientId: string; ownerName: string | null; error?: string }>({
    action: 'accept', code, caregiverName: name,
  });
  if ('error' in r) {
    const e = r.error;
    return { error: e === 'bad-code' || e === 'self' || e === 'no-push' ? e : 'network' };
  }
  return { patientId: r.patientId, ownerName: r.ownerName ?? null };
}

export async function listPatients(): Promise<{ relationId: string; patientId: string; ownerName: string | null }[]> {
  const r = await call<{ ok: boolean; patients: { relationId: string; patientId: string; ownerName: string | null }[] }>({
    action: 'list-patients',
  });
  return 'error' in r ? [] : r.patients;
}

export async function patientToday(patientId: string): Promise<{
  ownerName: string | null; today: string; patientNowMin: number;
  medicines: Record<string, unknown>[]; doses: PatientDose[];
} | { error: 'not-your-patient' | 'no-push' | 'network' }> {
  const r = await call<{
    ok: boolean; ownerName: string | null; today: string; patientNowMin: number;
    medicines: Record<string, unknown>[]; doses: Record<string, unknown>[]; error?: string;
  }>({ action: 'patient-today', patientId });
  if ('error' in r) {
    return { error: r.error === 'not-your-patient' || r.error === 'no-push' ? r.error : 'network' };
  }
  return {
    ownerName: r.ownerName ?? null,
    today: r.today,
    patientNowMin: r.patientNowMin,
    medicines: r.medicines,
    doses: r.doses.map((d) => ({
      id: String(d.id), medId: String(d.med_id), time: String(d.time),
      totalMin: Number(d.total_min), status: String(d.status),
      caregiverAlertedAt: (d.caregiver_alerted_at as string | null) ?? null,
      nudgedAt: (d.nudged_at as string | null) ?? null,
    })),
  };
}

export async function markDoseForPatient(patientId: string, doseId: string): Promise<void> {
  await call({ action: 'mark', patientId, doseId });
}

export async function nudgePatient(patientId: string, doseId: string): Promise<'sent' | 'cooldown' | 'skipped'> {
  const r = await call<{ ok: boolean; cooldown?: boolean; skipped?: boolean }>({
    action: 'nudge', patientId, doseId,
  });
  if ('error' in r) return 'sent'; // el error de red se traga; el cuidador puede reintentar
  if (r.cooldown) return 'cooldown';
  if (r.skipped) return 'skipped';
  return 'sent';
}

export async function stopCaring(relationId: string): Promise<void> {
  await call({ action: 'stop-caring', relationId });
}
```

> **Corrección al escribir (self-review del plan):** `regeneratePairCode` no debe borrar `owner_name`. Implementar `upsertCode` para que, en la rama `update`, **solo** toque `pair_code`/`pair_code_expires_at` cuando `ownerName === ''` (regenerar), y también `owner_name` cuando `ownerName` viene con valor (crear). Es decir:
> ```ts
> const patch: Record<string, unknown> = { pair_code: code, pair_code_expires_at: expires };
> if (ownerName) patch.owner_name = ownerName;
> await supabase.from('caregivers').update(patch).eq('id', existing.data.id);
> ```

- [ ] **Step 5: Ejecutar el test del helper — debe pasar**

Run: `npx vitest run src/lib/caregiver.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. Vigilar `verbatimModuleSyntax` (`import type { CaregiverRow }`), `noUnusedLocals`.

- [ ] **Step 7: Commit**

```
git add src/data/types.ts src/lib/caregiver.ts src/lib/caregiver.test.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(caregiver): src/lib/caregiver.ts — emparejamiento + acciones del cuidador

Lado paciente por consulta normal (RLS); lado cuidador vía supabase.functions
.invoke('caregiver-action') autenticado con pushCreds() (endpoint + action_secret
propios). genCode 6 chars sin ambigüedades, testeado.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 8: `CaregiverSheet.tsx`

**Files:**
- Create: `src/screens/CaregiverSheet.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `Btn` de `../components/Btn`, `I` de `../icons`.
- Produces: `export default function CaregiverSheet(props)`:
  ```ts
  interface CaregiverSheetProps {
    theme: Theme;
    t: (key: string, vars?: Record<string, string | number>) => string;
    mode: 'show' | 'enter';
    code?: string;                 // mode 'show'
    expiresAt?: string | null;     // mode 'show' — ISO
    onClose: () => void;
    onRegenerate?: () => void;     // mode 'show'
    onCancelCode?: () => void;     // mode 'show'
    onSubmitCode?: (code: string) => Promise<'ok' | 'bad-code' | 'self' | 'no-push' | 'network'>;  // mode 'enter'
  }
  ```

- [ ] **Step 1: Strings en `src/i18n/strings.ts` — bloque `es` (junto a las `push*`) y `en`**

`es`:
```ts
  cgShareTitle: 'Comparte este código',
  cgShareBody: 'Pásale el código a tu familiar. Cuando lo introduzca en su Dosi, recibirá un aviso si te saltas una toma.',
  cgShareBtn: 'Compartir',
  cgCopyBtn: 'Copiar',
  cgCopied: 'Código copiado',
  cgRegen: 'Generar otro',
  cgCancelCode: 'Cancelar',
  cgExpiresIn: 'Caduca en {h} h',
  cgExpired: 'Código caducado',
  cgEnterTitle: 'Introduce el código',
  cgEnterBody: 'Pídele a la persona que quieres cuidar el código de su Dosi (Perfil › Cuidador).',
  cgEnterPlaceholder: 'Ej. 4K9P7R',
  cgAccept: 'Aceptar',
  cgErrBadCode: 'Código incorrecto o caducado',
  cgErrSelf: 'Ese es tu propio código',
  cgErrNoPush: 'Activa las notificaciones primero',
  cgErrNetwork: 'Sin conexión. Inténtalo de nuevo.',
```
`en`:
```ts
  cgShareTitle: 'Share this code',
  cgShareBody: 'Give the code to your family member. Once they enter it in their Dosi, they will be alerted if you miss a dose.',
  cgShareBtn: 'Share',
  cgCopyBtn: 'Copy',
  cgCopied: 'Code copied',
  cgRegen: 'Generate another',
  cgCancelCode: 'Cancel',
  cgExpiresIn: 'Expires in {h} h',
  cgExpired: 'Code expired',
  cgEnterTitle: 'Enter the code',
  cgEnterBody: 'Ask the person you want to look after for the code from their Dosi (Profile › Caregiver).',
  cgEnterPlaceholder: 'e.g. 4K9P7R',
  cgAccept: 'Accept',
  cgErrBadCode: 'Wrong or expired code',
  cgErrSelf: "That's your own code",
  cgErrNoPush: 'Turn on notifications first',
  cgErrNetwork: 'No connection. Try again.',
```

- [ ] **Step 2: Crear `src/screens/CaregiverSheet.tsx`**

```tsx
import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';

type SubmitResult = 'ok' | 'bad-code' | 'self' | 'no-push' | 'network';

interface CaregiverSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  mode: 'show' | 'enter';
  code?: string;
  expiresAt?: string | null;
  onClose: () => void;
  onRegenerate?: () => void;
  onCancelCode?: () => void;
  onSubmitCode?: (code: string) => Promise<SubmitResult>;
}

export default function CaregiverSheet({
  theme, t, mode, code, expiresAt, onClose, onRegenerate, onCancelCode, onSubmitCode,
}: CaregiverSheetProps) {
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const hoursLeft = expiresAt
    ? Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000))
    : 0;
  const expired = Boolean(expiresAt) && hoursLeft <= 0;

  const share = async () => {
    if (!code) return;
    try {
      if (navigator.share) { await navigator.share({ title: 'Dosi', text: code }); return; }
    } catch { /* cancelado */ }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* nada */ }
  };

  const submit = async () => {
    if (!onSubmitCode) return;
    setErr('');
    const c = entry.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 6) { setErr(t('cgErrBadCode')); return; }
    setBusy(true);
    try {
      const r = await onSubmitCode(c);
      if (r === 'ok') { onClose(); return; }
      setErr(t(r === 'self' ? 'cgErrSelf' : r === 'no-push' ? 'cgErrNoPush' : r === 'network' ? 'cgErrNetwork' : 'cgErrBadCode'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end', animation: 'dosi-fade .2s',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.text,
        borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%', overflowY: 'auto',
        animation: 'dosi-sheet .35s cubic-bezier(.2,.9,.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.borderStrong }} />
        </div>
        <div style={{ padding: '4px 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 8 }}>
            <div style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 28, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.1,
            }}>
              {mode === 'show' ? t('cgShareTitle') : t('cgEnterTitle')}
            </div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>
            {mode === 'show' ? t('cgShareBody') : t('cgEnterBody')}
          </div>

          {mode === 'show' ? (
            <>
              <div style={{
                textAlign: 'center', fontSize: 34, fontWeight: 800, letterSpacing: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: expired ? theme.textSoft : theme.text, padding: '12px 0 6px',
              }}>
                {code}
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: expired ? theme.danger : theme.textDim, marginBottom: 18 }}>
                {expired ? t('cgExpired') : t('cgExpiresIn', { h: hoursLeft })}
              </div>
              <Btn theme={theme} kind="primary" size="md" full onClick={share}>
                {copied ? t('cgCopied') : t('cgShareBtn')}
              </Btn>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={onRegenerate} style={secBtn(theme)}>{t('cgRegen')}</button>
                <button onClick={onCancelCode} style={{ ...secBtn(theme), color: theme.danger }}>{t('cgCancelCode')}</button>
              </div>
            </>
          ) : (
            <>
              <input
                autoFocus inputMode="text" autoCapitalize="characters" maxLength={8}
                value={entry}
                onChange={e => setEntry(e.target.value.toUpperCase())}
                placeholder={t('cgEnterPlaceholder')}
                style={{
                  width: '100%', height: 52, background: theme.surface, color: theme.text,
                  border: `1px solid ${theme.borderStrong}`, borderRadius: 14, padding: '0 16px',
                  fontSize: 20, fontWeight: 700, letterSpacing: 4, textAlign: 'center',
                  fontFamily: 'ui-monospace, monospace', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy || entry.replace(/[^A-Za-z0-9]/g, '').length < 6} onClick={submit}>
                {t('cgAccept')}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function secBtn(theme: Theme): React.CSSProperties {
  return {
    flex: 1, background: 'transparent', border: `1px solid ${theme.border}`,
    color: theme.text, borderRadius: 12, padding: '10px 0',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
}
```

- [ ] **Step 3: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. `react/only-export-components` — el archivo exporta el componente por defecto y `secBtn` (función no-componente): si oxlint lo marca como `warning`, aceptable; si molesta, mover `secBtn` a una constante `const secBtn = (theme: Theme): React.CSSProperties => ({...})` **dentro** del componente o inline los estilos. Preferir inline si hay duda.

- [ ] **Step 4: Commit**

```
git add src/screens/CaregiverSheet.tsx src/i18n/strings.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(caregiver): CaregiverSheet — mostrar código / introducir código

Hoja inferior (patrón PushSheet), modo 'show' (código grande + Compartir/
Generar otro/Cancelar) y modo 'enter' (campo + Aceptar con errores mapeados).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 9: `CaregiverScreen.tsx`

**Files:**
- Create: `src/screens/CaregiverScreen.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `listPatients`, `patientToday`, `markDoseForPatient`, `nudgePatient`, `stopCaring` de `../lib/caregiver`; `rowToMed` de `../data/sync`; `PILL_COLORS` / `Theme` de `../theme/tokens`; `TopBar`, `Card`, `ConfirmDialog`, `PillGlyph`, `I`.
- Produces: `export default function CaregiverScreen(props)`:
  ```ts
  interface CaregiverScreenProps {
    theme: Theme;
    t: (key: string, vars?: Record<string, string | number>) => string;
    lang: Lang;
    onBack: () => void;
    onEnablePush: () => void;   // por si pushCreds() devuelve null
  }
  ```

- [ ] **Step 1: Strings — `es` y `en`**

`es`:
```ts
  cgPatientsTitle: 'Personas que cuido',
  cgTodayTitle: 'Hoy de {name}',
  cgStTaken: 'Tomada',
  cgStSkipped: 'Saltada',
  cgStMissed: 'Perdida',
  cgStPending: 'Pendiente',
  cgMarkForHer: 'Ya la tomó',
  cgRemind: 'Recordarle',
  cgReminded: 'Enviado',
  cgRemindCooldown: 'Ya se le recordó hace un momento',
  cgNoDoses: '{name} no tiene tomas hoy',
  cgGone: 'Ya no cuidas a esta persona',
  cgNeedPush: 'Activa las notificaciones para usar esto',
  cgActivate: 'Activar',
  cgRefresh: 'Actualizar',
  cgStopTitle: '¿Dejar de cuidar a {name}?',
  cgStopMsg: 'Dejarás de recibir avisos si se salta una toma.',
  cgStop: 'Dejar de cuidar',
```
`en`:
```ts
  cgPatientsTitle: 'People I look after',
  cgTodayTitle: "{name}'s day",
  cgStTaken: 'Taken',
  cgStSkipped: 'Skipped',
  cgStMissed: 'Missed',
  cgStPending: 'Pending',
  cgMarkForHer: 'She took it',
  cgRemind: 'Remind',
  cgReminded: 'Sent',
  cgRemindCooldown: 'Already reminded a moment ago',
  cgNoDoses: '{name} has no doses today',
  cgGone: 'You no longer look after this person',
  cgNeedPush: 'Turn on notifications to use this',
  cgActivate: 'Turn on',
  cgRefresh: 'Refresh',
  cgStopTitle: 'Stop looking after {name}?',
  cgStopMsg: "You'll stop getting alerts if they miss a dose.",
  cgStop: 'Stop caring',
```

- [ ] **Step 2: Crear `src/screens/CaregiverScreen.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import type { Theme, PillColorKey } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { PILL_COLORS } from '../theme/tokens';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import PillGlyph from '../components/PillGlyph';
import { rowToMed } from '../data/sync';
import type { Medicine } from '../data/types';
import {
  listPatients, patientToday, markDoseForPatient, nudgePatient, stopCaring,
  type PatientDose,
} from '../lib/caregiver';

interface CaregiverScreenProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  onBack: () => void;
  onEnablePush: () => void;
}

type Patient = { relationId: string; patientId: string; ownerName: string | null };
type Today = { ownerName: string | null; patientNowMin: number; meds: Medicine[]; doses: PatientDose[] };

function deriveStatus(d: PatientDose, nowMin: number): 'taken' | 'skipped' | 'missed' | 'pending' {
  if (d.status === 'taken') return 'taken';
  if (d.status === 'skipped') return 'skipped';
  if (d.caregiverAlertedAt != null || d.totalMin < nowMin - 60) return 'missed';
  return 'pending';
}

export default function CaregiverScreen({ theme, t, lang, onBack, onEnablePush }: CaregiverScreenProps) {
  void lang;
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [sel, setSel] = useState<Patient | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<'gone' | 'no-push' | 'network' | ''>('');
  const [sentFor, setSentFor] = useState<Set<string>>(new Set());
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    listPatients().then((ps) => {
      setPatients(ps);
      if (ps.length === 1) setSel(ps[0]);
    });
  }, []);

  const load = useCallback(async (p: Patient) => {
    setLoading(true); setErr('');
    const r = await patientToday(p.patientId);
    setLoading(false);
    if ('error' in r) {
      if (r.error === 'not-your-patient') {
        setErr('gone');
        setPatients((prev) => (prev ?? []).filter((x) => x.relationId !== p.relationId));
        setSel(null);
      } else setErr(r.error);
      return;
    }
    setToday({
      ownerName: r.ownerName,
      patientNowMin: r.patientNowMin,
      meds: r.medicines.map((m) => rowToMed(m)),
      doses: [...r.doses].sort((a, b) => a.totalMin - b.totalMin),
    });
  }, []);

  useEffect(() => { if (sel) load(sel); }, [sel, load]);

  const name = today?.ownerName || sel?.ownerName || '';

  // ── lista de pacientes (más de uno) ──
  if (!sel) {
    return (
      <div style={{ paddingTop: 8, paddingBottom: 120 }}>
        <TopBar theme={theme} title={t('cgPatientsTitle')} left={<BackBtn theme={theme} onBack={onBack} />} />
        {err === 'gone' && <Banner theme={theme} text={t('cgGone')} />}
        <div style={{ padding: '0 16px' }}>
          {(patients ?? []).map((p) => (
            <div key={p.relationId} onClick={() => setSel(p)} style={rowStyle(theme)}>
              <div style={{ flex: 1, fontWeight: 600 }}>{p.ownerName || '—'}</div>
              {I.chev(16, theme.textSoft)}
            </div>
          ))}
          {patients != null && patients.length === 0 && (
            <div style={{ color: theme.textDim, fontSize: 14, padding: '24px 4px', textAlign: 'center' }}>
              {t('cgGone')}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── "Hoy de X" ──
  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar
        theme={theme}
        title={t('cgTodayTitle', { name })}
        left={<BackBtn theme={theme} onBack={() => { setSel(null); setToday(null); }} />}
        right={
          <button onClick={() => sel && load(sel)} aria-label={t('cgRefresh')} style={{
            width: 36, height: 36, borderRadius: 12, background: theme.surface2, border: 0,
            color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{I.clock(18, theme.text)}</button>
        }
      />

      {err === 'no-push' && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: theme.warnSoft, color: theme.warn, borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>
            {t('cgNeedPush')}{' '}
            <button onClick={onEnablePush} style={{ background: 'transparent', border: 0, color: theme.accent, fontWeight: 700, cursor: 'pointer' }}>
              {t('cgActivate')}
            </button>
          </div>
        </div>
      )}
      {err === 'network' && <Banner theme={theme} text={t('cgErrNetwork')} />}

      {loading && !today && (
        <div style={{ color: theme.textDim, textAlign: 'center', padding: 32 }}>…</div>
      )}

      {today && today.doses.length === 0 && (
        <div style={{ color: theme.textDim, fontSize: 14, padding: '24px 16px', textAlign: 'center' }}>
          {t('cgNoDoses', { name })}
        </div>
      )}

      {today && today.doses.map((d) => {
        const med = today.meds.find((m) => m.id === d.medId);
        const st = deriveStatus(d, today.patientNowMin);
        const done = st === 'taken' || st === 'skipped';
        const stLabel = { taken: 'cgStTaken', skipped: 'cgStSkipped', missed: 'cgStMissed', pending: 'cgStPending' }[st];
        const stColor = { taken: theme.success, skipped: theme.textSoft, missed: theme.danger, pending: theme.textDim }[st];
        return (
          <div key={d.id} style={{ padding: '0 16px 10px' }}>
            <div style={{
              background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 18,
              padding: '12px 14px', opacity: done ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PillGlyph color={(med?.color ?? 'coral') as PillColorKey} size={40} form={med?.form ?? 'pill'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{med?.name ?? '—'}</div>
                  <div style={{ fontSize: 12.5, color: theme.textDim }}>{med?.dose ?? ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.time}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: stColor, textTransform: 'uppercase' }}>{t(stLabel)}</div>
                </div>
              </div>
              {!done && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={async () => { if (sel) { await markDoseForPatient(sel.patientId, d.id); load(sel); } }}
                    style={actBtn(theme, true)}>
                    {I.check(15, theme.accentText)} {t('cgMarkForHer')}
                  </button>
                  <button
                    disabled={sentFor.has(d.id)}
                    onClick={async () => {
                      if (!sel) return;
                      const r = await nudgePatient(sel.patientId, d.id);
                      if (r === 'skipped') { load(sel); return; }
                      setSentFor((s) => new Set(s).add(d.id));
                      setTimeout(() => setSentFor((s) => { const n = new Set(s); n.delete(d.id); return n; }), 60_000);
                    }}
                    style={actBtn(theme, false)}>
                    {sentFor.has(d.id) ? t('cgReminded') : t('cgRemind')}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {today && (
        <div style={{ padding: '16px 24px', textAlign: 'center' }}>
          <button onClick={() => setConfirmStop(true)} style={{
            background: 'transparent', border: `1px solid ${theme.border}`, color: theme.danger,
            padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          }}>{t('cgStop')}</button>
        </div>
      )}

      {confirmStop && sel && (
        <ConfirmDialog
          theme={theme}
          title={t('cgStopTitle', { name })}
          message={t('cgStopMsg')}
          confirmLabel={t('cgStop')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmStop(false)}
          onConfirm={async () => { await stopCaring(sel.relationId); setConfirmStop(false); onBack(); }}
        />
      )}
    </div>
  );
}

function BackBtn({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  return (
    <button onClick={onBack} style={{
      width: 36, height: 36, borderRadius: 12, background: theme.surface2, border: 0,
      color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{I.back(18, theme.text)}</button>
  );
}
function Banner({ theme, text }: { theme: Theme; text: string }) {
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ background: theme.warnSoft, color: theme.warn, borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>{text}</div>
    </div>
  );
}
function rowStyle(theme: Theme): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 14px',
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16,
    marginBottom: 10, cursor: 'pointer',
  };
}
function actBtn(theme: Theme, primary: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 40, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    background: primary ? theme.accent : theme.surface2,
    color: primary ? theme.accentText : theme.text,
    border: primary ? 0 : `1px solid ${theme.borderStrong}`,
  };
}
```

> **Antes de escribir:** comprobar la firma real de `TopBar` (`grep -n "interface\|Props" src/components/TopBar.tsx`) — si no acepta `left`/`right`, usar las props que tenga (`HomeScreen` le pasa `right`; `DetailScreen` un `onBack`). Ajustar `BackBtn`/refresh al patrón real. Comprobar también `ConfirmDialog` (`confirmKind`, `confirmIcon`) contra su uso en `App.tsx` (ya se usa allí con esas props).

- [ ] **Step 3: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. Vigilar: helpers no-componente (`BackBtn`/`Banner` SÍ son componentes → ok; `rowStyle`/`actBtn` funciones → `react/only-export-components` puede dar `warning`, aceptable, o moverlas a un `.ts` aparte si molesta). `void lang;` para el `noUnusedParameters` (o quitar `lang` de las props si de verdad no se usa — está por si algún string necesita variante; dejar `void lang;`).

- [ ] **Step 4: Commit**

```
git add src/screens/CaregiverScreen.tsx src/i18n/strings.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(caregiver): CaregiverScreen — "Hoy de Ana" (solo lectura)

Lista de pacientes (si >1) → tomas de hoy con estado derivado y botones
"Ya la tomó" / "Recordarle" (60 s de bloqueo tras enviar). "Dejar de cuidar"
con confirmación. Errores 403/no-push/red manejados.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 10: Sección "Cuidador" en `ProfileScreen`

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/App.tsx` (placeholder mínimo — ver Cross-task coupling)

**Interfaces:**
- Consumes: `CaregiverRow` de `../data/types`.
- Produces (props nuevas de `ProfileScreen`):
  ```ts
  caregiver: CaregiverRow | null;
  caredForCount: number;
  onAddCaregiver: () => void;      // abre CaregiverSheet 'show' (genera código si no hay)
  onManageCaregiver: () => void;   // abre CaregiverSheet 'show' con el código actual
  onRemoveCaregiver: () => void;   // confirma + cancelCaregiver
  onBecomeCaregiver: () => void;   // comprueba push + abre CaregiverSheet 'enter'
  onOpenCaredFor: () => void;      // setScreen('caregiver')
  ```

### Cross-task coupling (hacer exactamente esto)

`src/App.tsx` ya renderiza `<ProfileScreen …/>`. Añadir props requeridas rompe el build. Igual que en Pieza B (Tasks 8/9): añadir un **placeholder mínimo** a la llamada de `<ProfileScreen>` en `App.tsx` para que compile, y una línea `// TODO Task 12: cablear caregiver` encima:
```tsx
          caregiver={null}
          caredForCount={0}
          onAddCaregiver={() => {}}
          onManageCaregiver={() => {}}
          onRemoveCaregiver={() => {}}
          onBecomeCaregiver={() => {}}
          onOpenCaredFor={() => {}}
```
Task 12 lo reemplaza con lógica real. NO implementar la lógica aquí.

- [ ] **Step 1: Strings — `es` y `en`**

`es`:
```ts
  cgSection: 'Cuidador',
  cgAddRow: 'Añadir un cuidador',
  cgPendingRow: 'Código {code} · caduca en {h} h',
  cgExpiredRow: 'Código caducado — genera otro',
  cgActiveRow: 'Tu cuidador: {name}',
  cgBecomeRow: 'Cuidar de alguien',
  cgCaredForRow: 'Personas que cuido ({n})',
  cgRemoveTitle: '¿Quitar a tu cuidador?',
  cgRemoveMsg: 'Dejará de recibir avisos si te saltas una toma.',
  cgRemoveConfirm: 'Quitar',
```
`en`:
```ts
  cgSection: 'Caregiver',
  cgAddRow: 'Add a caregiver',
  cgPendingRow: 'Code {code} · expires in {h} h',
  cgExpiredRow: 'Code expired — generate a new one',
  cgActiveRow: 'Your caregiver: {name}',
  cgBecomeRow: 'Look after someone',
  cgCaredForRow: 'People I look after ({n})',
  cgRemoveTitle: 'Remove your caregiver?',
  cgRemoveMsg: "They'll stop getting alerts if you miss a dose.",
  cgRemoveConfirm: 'Remove',
```

- [ ] **Step 2: Ampliar `Props` y la firma de `ProfileScreen`**

Añadir a `interface Props` (tras `onDisablePush`):
```ts
  caregiver: import('../data/types').CaregiverRow | null;
  caredForCount: number;
  onAddCaregiver: () => void;
  onManageCaregiver: () => void;
  onRemoveCaregiver: () => void;
  onBecomeCaregiver: () => void;
  onOpenCaredFor: () => void;
```
> Mejor: `import type { CaregiverRow } from '../data/types';` arriba y usar `caregiver: CaregiverRow | null;`.

Añadir al destructure de la firma: `caregiver, caredForCount, onAddCaregiver, onManageCaregiver, onRemoveCaregiver, onBecomeCaregiver, onOpenCaredFor,`.

- [ ] **Step 3: Insertar la sección entre "Reminders" y "Accessibility"**

Justo después del `</div>` que cierra el bloque `{/* Reminders */}`:

```tsx
      {/* Caregiver */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('cgSection')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {(() => {
            const cg = caregiver;
            const pending = cg && !cg.caregiverUserId && cg.pairCode;
            const expired = pending && cg.pairCodeExpiresAt != null && Date.parse(cg.pairCodeExpiresAt) <= Date.now();
            const hours = pending && cg.pairCodeExpiresAt
              ? Math.max(0, Math.round((Date.parse(cg.pairCodeExpiresAt) - Date.now()) / 3_600_000))
              : 0;
            if (!cg) return <Row theme={theme} icon={I.heart} label={t('cgAddRow')} onPress={onAddCaregiver} first />;
            if (cg.caregiverUserId) return <Row theme={theme} icon={I.heart} label={t('cgActiveRow', { name: cg.name || '—' })} onPress={onRemoveCaregiver} first />;
            if (expired) return <Row theme={theme} icon={I.heart} label={t('cgExpiredRow')} onPress={onManageCaregiver} first />;
            return <Row theme={theme} icon={I.heart} label={t('cgPendingRow', { code: cg.pairCode || '', h: hours })} onPress={onManageCaregiver} first />;
          })()}
          <Row theme={theme} icon={I.share} label={t('cgBecomeRow')} onPress={onBecomeCaregiver} />
          {caredForCount > 0 && (
            <Row theme={theme} icon={I.user} label={t('cgCaredForRow', { n: caredForCount })} onPress={onOpenCaredFor} />
          )}
        </Card>
      </div>
```

- [ ] **Step 4: Placeholder en `App.tsx`** (ver Cross-task coupling arriba). Añadir las 7 props placeholder + comentario `// TODO Task 12`.

- [ ] **Step 5: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. `react/only-export-components`: la IIFE `(() => {...})()` inline no exporta nada, ok.

- [ ] **Step 6: Commit**

```
git add src/screens/ProfileScreen.tsx src/i18n/strings.ts src/App.tsx
git commit -F <tmpfile>
```
Mensaje:
```
feat(caregiver): sección "Cuidador" en Perfil

Lado paciente (añadir/pendiente/caducado/activo) + lado cuidador ("Cuidar de
alguien", "Personas que cuido (N)"). App.tsx con placeholders temporales
(Task 12 cablea la lógica real).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 11: Service worker — kinds `caregiver-miss` / `caregiver-nudge`

**Files:**
- Modify: `public/push-sw.js`

**Interfaces:**
- Consumes: payload `caregiver-miss` (`{ patientId, doseId, endpoint, secret, actionUrl }`) y `caregiver-nudge` (`{ doseId, endpoint, secret, actionUrl }`).
- Produces: notificaciones con acciones correctas y `notificationclick` que rutea a `caregiver-action` / `dose-action`.

- [ ] **Step 1: Editar el cálculo de `actions` en el handler `push`**

Reemplazar:
```js
  const actions = d.kind === 'dose'
    ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
    : [];
```
por:
```js
  const actions =
    d.kind === 'dose' || d.kind === 'caregiver-nudge'
      ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
      : d.kind === 'caregiver-miss'
        ? [{ action: 'cg-mark', title: 'Ya la tomó' }, { action: 'cg-nudge', title: 'Recordárselo' }]
        : [];
```

- [ ] **Step 2: Editar `notificationclick`**

Después de la rama `if (event.action === 'take' || event.action === 'snooze') { … return; }`, añadir **antes** del bloque final de foco:
```js
  if (event.action === 'cg-mark' || event.action === 'cg-nudge') {
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
```

- [ ] **Step 3: Verificar el build copia el archivo**

Run: `npm run build && grep -c "cg-mark" dist/push-sw.js`
Expected: build verde, `grep` ≥ 1.

- [ ] **Step 4: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```
git add public/push-sw.js
git commit -F <tmpfile>
```
Mensaje:
```
feat(pwa): service worker maneja caregiver-miss y caregiver-nudge

caregiver-miss → botones "Ya la tomó"/"Recordárselo" → POST a caregiver-action.
caregiver-nudge → botones Tomar/Posponer → dose-action (rama existente).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 12: Cableado en `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/i18n/strings.ts` (toasts)

**Interfaces:**
- Consumes: todo `../lib/caregiver`; `CaregiverSheet`, `CaregiverScreen`; `pushSupported`/`pushPermission` de `./lib/push`.
- Produces: `ScreenId` gana `'caregiver'`; `<ProfileScreen>` recibe props reales; `<CaregiverSheet>`/`<CaregiverScreen>` renderizados; `handleSignOut` borra las filas `caregivers`.

- [ ] **Step 1: Strings — toasts, `es` y `en`**

`es`: `cgAcceptedToast: 'Ahora cuidas a {name}'`, `cgRemovedToast: 'Cuidador quitado'`, `cgMarkedToast: 'Toma marcada'`, `cgNudgeToast: 'Recordatorio enviado'`.
`en`: `cgAcceptedToast: "You now look after {name}"`, `cgRemovedToast: 'Caregiver removed'`, `cgMarkedToast: 'Dose marked'`, `cgNudgeToast: 'Reminder sent'`.

- [ ] **Step 2: Imports en `App.tsx`**

```tsx
import CaregiverSheet from './screens/CaregiverSheet';
import CaregiverScreen from './screens/CaregiverScreen';
import { myCaregiverRow, createPairCode, regeneratePairCode, cancelCaregiver, acceptCode, listPatients } from './lib/caregiver';
import type { CaregiverRow } from './data/types';
```

- [ ] **Step 3: `ScreenId`**

Línea 31: `export type ScreenId = 'onboarding' | 'main' | 'addMed' | 'detail' | 'caregiver';`

- [ ] **Step 4: Estado nuevo** (junto a `pushSheet` etc.)

```tsx
  const [caregiver, setCaregiver] = useState<CaregiverRow | null>(null);
  const [caredForCount, setCaredForCount] = useState(0);
  const [cgSheet, setCgSheet] = useState<'show' | 'enter' | null>(null);
  const [confirmRemoveCg, setConfirmRemoveCg] = useState(false);

  const refreshCaregiver = () => {
    myCaregiverRow().then(setCaregiver);
    listPatients().then((p) => setCaredForCount(p.length));
  };
```

- [ ] **Step 5: Cargar al arranque y tras sign-in**

En el `useEffect` de arranque de Supabase, tras `setAccount(await getAccount());`:
```tsx
      refreshCaregiver();
```
En el `onSuccess` de `AuthSheet` (rama `newUid && newUid !== userId.current`), tras `setAccount(await getAccount());` (o donde recargue el resto): `refreshCaregiver();`.

- [ ] **Step 6: Handlers** (junto a `dismissPushBanner` etc.)

```tsx
  const handleAddCaregiver = async () => {
    if (!caregiver || (!caregiver.caregiverUserId && !caregiver.pairCode)) {
      await createPairCode(userName);
      refreshCaregiver();
    }
    setCgSheet('show');
  };
  const handleRegenCode = async () => { await regeneratePairCode(); refreshCaregiver(); };
  const handleCancelCode = async () => { await cancelCaregiver(); refreshCaregiver(); setCgSheet(null); };
  const handleBecomeCaregiver = () => {
    if (!pushSupported() || pushPermission() !== 'granted') { setPushSheet(true); return; }
    setCgSheet('enter');
  };
  const submitCaregiverCode = async (code: string): Promise<'ok' | 'bad-code' | 'self' | 'no-push' | 'network'> => {
    const r = await acceptCode(code, userName);
    if ('error' in r) return r.error;
    refreshCaregiver();
    setToast({ message: t('cgAcceptedToast', { name: r.ownerName || '—' }), kind: 'success', icon: I.check(16, '#fff') });
    return 'ok';
  };
```

- [ ] **Step 7: `handleSignOut` — borrar filas `caregivers`**

En `handleSignOut`, tras `await disablePush().catch(() => {});` y **antes** de `const uid = await signOutToAnon();`:
```tsx
    const prevUid = userId.current;
    if (prevUid) {
      await supabase.from('caregivers').delete()
        .or(`owner_user_id.eq.${prevUid},caregiver_user_id.eq.${prevUid}`)
        .then(() => {}, () => {});
    }
    setCaregiver(null); setCaredForCount(0);
```
(Importar `supabase` de `./lib/supabase` si no está ya importado en `App.tsx` — comprobar; `ensureSession`/`getAccount` vienen de ahí pero puede que `supabase` no. Si no, `import { supabase } from './lib/supabase';`.)

- [ ] **Step 8: Reemplazar el placeholder de `<ProfileScreen>`**

Quitar el `// TODO Task 12` y las 7 props placeholder; poner:
```tsx
          caregiver={caregiver}
          caredForCount={caredForCount}
          onAddCaregiver={handleAddCaregiver}
          onManageCaregiver={() => setCgSheet('show')}
          onRemoveCaregiver={() => setConfirmRemoveCg(true)}
          onBecomeCaregiver={handleBecomeCaregiver}
          onOpenCaredFor={() => setScreen('caregiver')}
```

- [ ] **Step 9: Ruta a `CaregiverScreen`**

Donde se resuelve `body` por `screen` (tras la rama `screen === 'detail'`), añadir:
```tsx
  } else if (screen === 'caregiver') {
    body = (
      <CaregiverScreen
        theme={theme} t={t} lang={lang}
        onBack={() => { setScreen('main'); setTab('profile'); }}
        onEnablePush={() => { doEnablePush(); }}
      />
    );
```

- [ ] **Step 10: Renderizar `<CaregiverSheet>` y el `ConfirmDialog` de quitar** (junto a `{pushSheet && (…)}`)

```tsx
      {cgSheet === 'show' && (
        <CaregiverSheet
          theme={theme} t={t} mode="show"
          code={caregiver?.pairCode ?? undefined}
          expiresAt={caregiver?.pairCodeExpiresAt ?? null}
          onClose={() => setCgSheet(null)}
          onRegenerate={handleRegenCode}
          onCancelCode={handleCancelCode}
        />
      )}
      {cgSheet === 'enter' && (
        <CaregiverSheet
          theme={theme} t={t} mode="enter"
          onClose={() => setCgSheet(null)}
          onSubmitCode={submitCaregiverCode}
        />
      )}
      {confirmRemoveCg && (
        <ConfirmDialog
          theme={theme}
          title={t('cgRemoveTitle')}
          message={t('cgRemoveMsg')}
          confirmLabel={t('cgRemoveConfirm')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmRemoveCg(false)}
          onConfirm={async () => {
            await cancelCaregiver();          // borra pendiente
            if (caregiver?.caregiverUserId) {
              await supabase.from('caregivers').delete().eq('id', caregiver.id).then(() => {}, () => {});
            }
            setConfirmRemoveCg(false);
            refreshCaregiver();
            setToast({ message: t('cgRemovedToast'), kind: 'neutral' });
          }}
        />
      )}
```
> `cancelCaregiver` solo borra la fila si `caregiver_user_id IS NULL`. Para una relación **activa**, el borrado va por `.eq('id', …)` (RLS `caregivers_owner` lo permite). El bloque de arriba cubre ambos.

- [ ] **Step 11: `showTabs` / `showFab`**

`showTabs` y `showFab` se calculan con `screen === 'main'`; `'caregiver'` no es `'main'` → no salen tabs ni FAB en esa pantalla. Correcto, no tocar.

- [ ] **Step 12: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. Grep de limpieza: `grep -n "TODO Task 12" src/App.tsx` → sin resultados.

- [ ] **Step 13: Verificación en navegador (dev server)**

- `preview_start` `{ name: "dosi-dev" }` (launch.json ya existe de Pieza B).
- `read_console_messages`: sin errores.
- Perfil → sección "Cuidador" visible con "Añadir un cuidador" y "Cuidar de alguien".
- "Añadir un cuidador" → `read_page` muestra la hoja con un código de 6 chars.
- "Cuidar de alguien" sin push → abre `PushSheet` (o la fila de push si el navegador de preview no soporta). Con push concedido en el navegador de preview → abre la hoja de introducir código.
- Meter un código inválido → "Código incorrecto o caducado".
- `screenshot` de la sección y de la hoja.

> El flujo E2E real (dos cuentas, aviso de olvido) es Task 13.

- [ ] **Step 14: Commit**

```
git add src/App.tsx src/i18n/strings.ts
git commit -F <tmpfile>
```
Mensaje:
```
feat(caregiver): cableado en App.tsx — sección Perfil, hojas, pantalla, corte al cerrar sesión

refreshCaregiver en arranque y tras login; ScreenId 'caregiver'; CaregiverSheet
show/enter; handleSignOut borra las filas caregivers de ambos lados. Reemplaza
los placeholders de Task 10.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Phase 3 — Puesta en marcha

### Task 13: E2E con dos cuentas + merge

**Files:**
- Merge `feat/web-pieza-c` → `main`.

- [ ] **Step 1: Cold gate + merge**

```
git checkout main && git pull
rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build
git merge --no-ff feat/web-pieza-c -F <tmpfile>
git push origin main
```
Mensaje de merge: resumen de la Pieza C. Esperar el deploy de Vercel (`list_deployments` / `get_deployment` con `projectId prj_QPRx0nCRhxBSsi7OOrTXx3zF53PQ`, `teamId team_ANFvyQ05uHa2dnjgRUbDTVpx`, estado `READY`).

- [ ] **Step 2: 👤 USUARIO — checklist E2E (dos dispositivos / dos cuentas)**

Guiar paso a paso; que confirme cada punto. **Cuenta A = paciente, Cuenta B = cuidador** (dos navegadores, o dos móviles; en iPhone ambos deben instalar la PWA).

1. **A (paciente):** Perfil › Cuidador › "Añadir un cuidador" → aparece un código de 6 caracteres.
2. **B (cuidador):** con notificaciones ya activadas → Perfil › Cuidador › "Cuidar de alguien" → introduce el código → *"Ahora cuidas a {nombre}"*. Aparece "Personas que cuido (1)".
3. **A:** Perfil muestra *"Tu cuidador: {nombre de B}"*.
4. **B:** "Personas que cuido" → "Hoy de {A}" → se ven las tomas de hoy de A con su estado.
5. **A:** crea una medicina con una toma ~2 min en el futuro, stock alto. **No la marques.**
6. Espera: a los ~0 y ~15 min A recibe sus avisos (Pieza B). A la **1 h** de la hora de la toma (o adelanta el reloj / usa una toma que ya venció hace 1 h), en el siguiente tick del cron → **B recibe** *"{A} no ha tomado su {medicina} — Toma de las HH:MM"* con botones **Ya la tomó** / **Recordárselo**.
7. **B pulsa "Recordárselo"** → **A recibe** *"{B} te recuerda tu {medicina}"* con botones **Tomar** / **Posponer**.
8. **B pulsa "Ya la tomó"** (o desde "Hoy de A" el botón) → en "Hoy de A" la toma pasa a **Tomada**; en A el stock baja 1.
9. **B:** "Hoy de A" → "Dejar de cuidar a {A}" → confirma. **A:** Perfil vuelve a "Añadir un cuidador".
10. (iPhone) Repetir 1–3 con B en Safari sin instalar → "Cuidar de alguien" guía a instalar la PWA primero.

- [ ] **Step 3: Si algo falla**

`query_logs` (`source='function_logs'` / `'function_edge_logs'`) para `caregiver-action` y `send-reminders`. `read_network_requests` en el navegador para el `functions.invoke`. Fallos típicos:
- `caregiver-action` 401 → `pushCreds()` devolvió mal el secreto, o la suscripción del cuidador se re-creó (secreto rotado) — recargar la app del cuidador.
- CORS en local → confirmar que el origen (`localhost:5173`) está en `CORS_ALLOW` (Task 3).
- El aviso de olvido no llega → revisar en `caregivers` que la fila tiene `caregiver_user_id` y `notify_on_miss = true`; que la dosis tiene `reminded_count ≥ 1` y `caregiver_alerted_at IS NULL`; que `nowMin` está en la ventana `[due+60, due+120)`.

- [ ] **Step 4: Actualizar memoria y cerrar**

- `memory/project_dosi.md`: sección "Web — Pieza C — MERGED & DEPLOYED" + E2E.
- `memory/MEMORY.md`: línea del índice.
- `superpowers:finishing-a-development-branch` para borrar la rama.

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**

| Sección del spec | Task |
|---|---|
| Migración (`caregivers` cols, índice, política, `doses` cols) | 1 |
| Relajar NOT NULL del legado | 1 (Global Constraints lo exige; migración lo hace) |
| `caregiverMissDue` núcleo puro + tests | 2 |
| `markDoseTaken` compartido + `dose-action` lo usa | 3 |
| CORS por origen (permite local) | 3 |
| `caregiver-action` (6 acciones) | 4 |
| `config.toml` `verify_jwt=false` | 4 |
| `send-reminders` paso de olvido | 5 |
| `export rowToMed` + test paridad (Minor Pieza B) | 6 |
| `CaregiverRow` / `PatientDose` / `caregiver.ts` | 7 |
| `genCode` alfabeto sin ambigüedades + test | 7 |
| `pushCreds` (lee el propio `action_secret`) | 7 |
| Persistencia de cuenta del cuidador (aviso reusado) | — (usa el `persistWarning` que ya existe, sin cambios) |
| `CaregiverSheet` show/enter + Compartir | 8 |
| `CaregiverScreen` "Hoy de X" + lista + `deriveStatus` | 9 |
| Botones "Ya la tomó" / "Recordarle" + cooldown 60 s cliente | 9 |
| "Dejar de cuidar" con confirmación | 9 |
| Sección "Cuidador" en Perfil (5 estados paciente + 2 cuidador) | 10 |
| SW `caregiver-miss` / `caregiver-nudge` | 11 |
| `App.tsx` estado/ruta/handlers | 12 |
| `handleSignOut` borra filas `caregivers` (ambos lados) | 12 |
| Casos límite (código caducado, 403, sin push, iOS, tz) | 4, 9, 12, 13 |
| E2E dos cuentas | 13 |

**Sin placeholders:** todo el código va completo. Los pasos sin código son infra (migración/deploy vía MCP) y E2E, con comandos/valores exactos. Las dos "Correcciones al escribir" (regeneratePairCode no borra owner_name; comprobar firma de TopBar) son instrucciones concretas, no huecos.

**Consistencia de tipos:**
- `CaregiverRow` (camelCase: `caregiverUserId`, `ownerName`, `pairCode`, `pairCodeExpiresAt`) definido en Task 7, consumido igual en Tasks 10 y 12.
- `PatientDose` (camelCase: `medId`, `totalMin`, `caregiverAlertedAt`, `nudgedAt`) definido en Task 7, consumido en Task 9 (`deriveStatus`, render).
- `acceptCode` devuelve `{ patientId, ownerName } | { error }` (Task 7) — `submitCaregiverCode` en Task 12 y `onSubmitCode` en Task 8 esperan `'ok' | 'bad-code' | 'self' | 'no-push' | 'network'`: Task 8 `onSubmitCode` recibe ese literal; Task 12 `submitCaregiverCode` traduce `{error}` → literal y devuelve `'ok'`. Consistente.
- `caregiver-action` acción `mark` → `markDoseForPatient` (Task 7, `Promise<void>`), consumido en Task 9.
- Migración crea `caregiver_alerted_at` / `nudged_at`; `send-reminders` (Task 5) escribe `caregiver_alerted_at`; `caregiver-action` (Task 4) lee/escribe `nudged_at`; `caregiver.ts` (Task 7) mapea ambos a camelCase; `CaregiverScreen` (Task 9) usa `caregiverAlertedAt`.
- `corsHeaders(req)` (Task 3) reemplaza `CORS_HEADERS`; `dose-action` (Task 3) y `caregiver-action` (Task 4) lo usan con la firma `json(req, …)` / `json(body, status)` respectivamente — **ojo:** `dose-action` pasa `req` al helper; `caregiver-action` define `json` como closure dentro de `Deno.serve` con `req` en scope. Ambos coherentes internamente.

**Ambigüedad resuelta:** `regeneratePairCode` conserva `owner_name` (corrección inline en Task 7). El placeholder de `App.tsx` en Task 10 + su reemplazo en Task 12 replica el patrón validado de Pieza B.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-29-web-pieza-c.md`. Dos opciones de ejecución:

1. **Subagente por task (recomendado)** — despacho un subagente nuevo por cada task, reviso entre tasks, iteración rápida.
2. **Ejecución inline** — con `executing-plans`, por lotes con checkpoints.

¿Cuál prefieres?
