# Dosi Web — Pieza C: Aviso a un cuidador cuando el paciente se salta una toma

- **Fecha:** 2026-08-29
- **Repo:** `dosi-app` (web), rama `main`
- **Depende de:** Pieza B (Web Push en producción — `push_subscriptions`, `send-reminders`, `dose-action`, `src/lib/push.ts`, service worker).
- **Objetivo:** cuando el paciente no marca una toma dentro de la hora siguiente a su hora, avisar por push a **un** familiar/cuidador. El cuidador puede, desde el propio aviso o desde una pantalla "Hoy de Ana", **marcar la toma por ella** o **enviarle un recordatorio**.

## Contexto

La tabla `public.caregivers` ya existe en Supabase (creada en su día para la app móvil, nunca usada desde la web — los tipos `Caregiver`/`Permission` se borraron en Pieza A). Columnas actuales:
`id text PK, owner_user_id uuid, caregiver_user_id uuid (nullable), name text, relation_key text, color text, permission text check('view','edit') default 'view', added_date text, notify_on_miss bool default true, show_inventory bool default true, created_at timestamptz`.
RLS: `caregivers_owner` (ALL, `auth.uid() = owner_user_id`), `caregivers_self_view` (SELECT, `auth.uid() = caregiver_user_id`). 0 filas.

**Estado relevante del proyecto:**
- `send-reminders` (Edge Function, Deno) corre cada minuto vía cron-job.org; ya carga por usuario sus `medicines` y las `doses` de hoy, y ya envía Web Push.
- `dose-action` (Edge Function) marca/pospone una dosis autenticándose con `{endpoint, action_secret}` de `push_subscriptions` (sin JWT de usuario).
- Motor de horarios puro en `src/lib/schedule.ts` (navegador) y copia en `supabase/functions/_shared/schedule.ts` (Deno) con test anti-deriva. `_shared/reminders.ts` = núcleo puro de decisiones (`dueReminder`, `stock/expiryAlertDecision`), cubierto por Vitest.
- `src/data/sync.ts` tiene un `rowToMed` **privado** (normaliza filas `medicines`); `_shared/types.ts` tiene su copia.
- `verify_jwt = false` en todas las Edge Functions de la Pieza B (`supabase/config.toml`).

## Decisiones tomadas (brainstorming 2026-08-29)

| Tema | Decisión |
|---|---|
| Canal del aviso al cuidador | **Push** — el cuidador instala Dosi (PWA) y activa notificaciones. Sin email. |
| Emparejamiento | **Código que comparte el paciente** (6 chars, alfabeto sin ambigüedades). El paciente lo genera y lo pasa por su canal habitual; el cuidador lo introduce en su Dosi. El paciente siempre inicia y controla. |
| Cardinalidad | **Un cuidador por paciente**; un cuidador puede vigilar a **varios** pacientes. |
| Umbral de olvido | **60 min** tras la hora de la toma, sin marcar, con el paciente ya avisado ≥1 vez. Un aviso por toma. |
| Acciones del cuidador | Aviso con botones **"Ya la tomó"** (marca por el paciente) y **"Recordárselo"** (push al paciente). Mismos botones en la pantalla "Hoy de X". |
| Vista del cuidador | Pantalla **"Hoy de Ana"** (solo lectura) con las tomas de hoy y su estado, más los dos botones por toma. Sub-pantalla de Perfil, sin pestaña. |
| Acceso a los datos del paciente | **Edge Function `caregiver-action`** (Opción A). Un único punto que verifica la relación `caregivers` en cada llamada; **no se tocan las políticas RLS de `medicines`/`doses`**. Se autentica con el secreto de la suscripción push del cuidador (igual que `dose-action`). |

## Arquitectura

```
Cliente (paciente)                      Cliente (cuidador)
├── Perfil › "Cuidador"                  ├── Perfil › "Cuidador" › "Cuidar de alguien"
│   añadir/cancelar código               │   introducir código
│   ver cuidador / quitar                ├── Perfil › "Personas que cuido (N)"
└── recibe push kind:caregiver-nudge     └── CaregiverScreen "Hoy de Ana"
    (botones Tomar/Posponer → dose-action)    · recibe push kind:caregiver-miss
                                              · botones Ya la tomó / Recordarle

Supabase
├── migración        caregivers +pair_code +pair_code_expires_at +owner_name +índice único
│                     doses      +caregiver_alerted_at +nudged_at
├── send-reminders   (ampliada) paso nuevo: detecta olvido → push al cuidador
├── caregiver-action (nueva, verify_jwt=false) accept · list-patients · stop-caring ·
│                     patient-today · mark · nudge
└── dose-action      sin cambios (el push caregiver-nudge lo reusa)

Externo
└── cron-job.org     sin cambios (sigue pegando a send-reminders)
```

**Flujo de un olvido:**
1. Paciente no marca la toma de las 08:00. A las 08:00 y 08:15 recibe sus avisos (Pieza B).
2. Entre las 09:00 y las 10:00, en un tick del cron, `send-reminders` ve la dosis sin marcar, con `reminded_count ≥ 1`, `caregiver_alerted_at` NULL, y que el paciente tiene cuidador activo con `notify_on_miss`.
3. Push al cuidador: *"Ana no ha tomado su Sintrom — Toma de las 08:00"* con botones **Ya la tomó** / **Recordárselo**. `doses.caregiver_alerted_at = now()`.
4. El cuidador pulsa **Recordárselo** → SW → `POST /caregiver-action {action:'nudge'}` → push al paciente *"Marcos te recuerda tu Sintrom — Toma de las 08:00"* con botones **Tomar** / **Posponer** (→ `dose-action`).
5. O pulsa **Ya la tomó** → `POST /caregiver-action {action:'mark'}` → `doses.status='taken'` + stock −1.

## Modelo de datos

### Migración

```sql
-- caregivers: emparejamiento por código + nombre del paciente
alter table public.caregivers add column if not exists pair_code            text;
alter table public.caregivers add column if not exists pair_code_expires_at timestamptz;
alter table public.caregivers add column if not exists owner_name           text;

-- un cuidador por paciente (una fila por owner, pendiente o activa)
create unique index if not exists caregivers_one_per_owner
  on public.caregivers (owner_user_id);

-- doses: marca de "cuidador ya avisado" y "recordatorio ya enviado"
alter table public.doses add column if not exists caregiver_alerted_at timestamptz;
alter table public.doses add column if not exists nudged_at            timestamptz;

-- el cuidador puede borrar su propia relación (para el corte al cerrar sesión y stop-caring)
drop policy if exists "caregiver can leave" on public.caregivers;
create policy "caregiver can leave" on public.caregivers
  for delete using (auth.uid() = caregiver_user_id);
```

Aparte de esa política de `delete`, no se crean ni modifican políticas RLS. Las existentes (`caregivers_owner` ALL — cubre crear/ver/editar/borrar como paciente; `caregivers_self_view` SELECT) más la nueva bastan para el lado del paciente y para el corte al cerrar sesión. Todo lo demás del lado del cuidador (leer el día del paciente, marcar, recordar) pasa por la Edge Function con service role.

### Estados de una fila `caregivers`

| Estado | Condición |
|---|---|
| **pendiente** | `caregiver_user_id IS NULL` y `pair_code_expires_at > now()` |
| **caducada** | `caregiver_user_id IS NULL` y `pair_code_expires_at <= now()` |
| **activa** | `caregiver_user_id` puesto, `pair_code` NULL |

Campos usados: `owner_user_id` (paciente), `caregiver_user_id` (cuidador, NULL hasta aceptar), `owner_name` (nombre del paciente — `userName` vive en localStorage, no en la BD), `name` (nombre del cuidador, se fija al aceptar), `notify_on_miss` (default true, el paciente puede silenciar — sin UI en v1, reservado). `relation_key`, `color`, `permission`, `show_inventory`, `added_date` quedan sin uso (legado móvil).

### Columnas nuevas en `doses`

- `caregiver_alerted_at timestamptz` — NULL = no se avisó al cuidador de esta toma. Se fija una vez.
- `nudged_at timestamptz` — última vez que el cuidador envió un recordatorio de esta toma (cooldown de 5 min).

`add column … timestamptz` (nullable) es instantáneo en Postgres 17.

### Al cerrar sesión

En `handleSignOut` de `App.tsx`, junto al `disablePush()` que ya hace: `delete from caregivers where owner_user_id = <yo> or caregiver_user_id = <yo>`. Corte limpio — la cuenta anónima nueva no hereda relaciones (mismo criterio que Pieza B con las suscripciones).

## Emparejamiento

**Requisito previo (ambos lados):** app instalada + notificaciones activadas. El cuidador las necesita para recibir avisos y como identidad ante `caregiver-action` (usa el secreto de su suscripción push). El flujo "cuidar de alguien" comprueba `pushSupported()` + suscripción; si falta, abre la hoja de Pieza B (`PushSheet`, con la guía iOS de "añade a pantalla de inicio").

### El paciente genera el código

Perfil › "Cuidador", sin cuidador aún → botón **"Añadir un cuidador"** → `createPairCode(userName)`:
- Si no hay fila: `insert into caregivers (id, owner_user_id, owner_name, pair_code, pair_code_expires_at) values (crypto.randomUUID(), auth.uid(), :userName, :code, now() + interval '24 hours')`.
- Si ya hay fila pendiente: `update … set pair_code = :code, pair_code_expires_at = now() + interval '24 hours'` ("Generar otro").
- El índice único `caregivers_one_per_owner` garantiza una sola fila por paciente.

**Código:** `genCode()` — 6 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin `0 O 1 I L`). Se muestra en `CaregiverSheet` modo `show`: código grande, **Compartir** (`navigator.share` si existe, si no "Copiar"), *"caduca en 23 h"*, **Generar otro**, **Cancelar** (`cancelCaregiver` → `delete` la fila).

Perfil mientras está pendiente: fila *"Código 4K9P7R · caduca en 23 h"* (tocar → reabre la hoja). Caducada: *"Código caducado — genera uno nuevo"*.

### El cuidador introduce el código

Perfil › "Cuidador" › **"Cuidar de alguien"** → `CaregiverSheet` modo `enter` → campo de texto → `acceptCode(code, userName)`:
```
POST /caregiver-action { endpoint, secret, action:'accept', code:'4K9P7R', caregiverName:<userName> }
```
La función: verifica `{endpoint, secret}` → `cuidadorId`. Normaliza el código (`toUpperCase`, quita lo no alfanumérico). Busca `caregivers` con `upper(pair_code) = norm`, `caregiver_user_id IS NULL`, `pair_code_expires_at > now()`:
- no hay → `404 { error:'bad-code' }`
- `owner_user_id == cuidadorId` → `400 { error:'self' }`
- OK → `update … set caregiver_user_id = cuidadorId, name = :caregiverName, pair_code = null, pair_code_expires_at = null` → `200 { patientId, ownerName }`.

El cuidador puede ya cuidar a otras personas (varias filas con el mismo `caregiver_user_id`).

Perfil del paciente pasa a: *"Tu cuidador: Marcos"* (tocar → confirmar "Quitar cuidador" → `cancelCaregiver`).

### Persistencia de la cuenta del cuidador

Si el cuidador es anónimo y cambia de dispositivo o limpia el navegador, pierde el rol (nuevo `user_id`, la fila queda huérfana). Se le muestra el aviso que ya existe en Perfil ("guarda tu cuenta con un email"). Recomendación, no bloqueo.

### Revocar

- **Paciente** → "Quitar" → `delete from caregivers where owner_user_id = auth.uid()` (RLS `caregivers_owner`).
- **Cuidador** → desde la ficha del paciente, "Dejar de cuidar" → `POST /caregiver-action {action:'stop-caring', relationId}` → la función verifica `caregiver_user_id = cuidadorId` en esa fila → `delete`.
- Sin notificación a la otra parte en v1. Una entrada obsoleta en la lista del cuidador falla al abrirse (`403`) y se quita de la lista.

## Detección de olvido + aviso al cuidador (ampliación de `send-reminders`)

**Una consulta más al arranque**, junto a la de `push_subscriptions`:
```
select * from caregivers where caregiver_user_id is not null
```
→ `caregiverPorPaciente: Map<owner_user_id, row>`. Las suscripciones del cuidador ya están en el `byUser` que la función construye desde `push_subscriptions` (un cuidador con notificaciones activadas tiene su fila).

**Paso nuevo en el bucle por paciente**, después de los avisos de toma del propio paciente y antes de las alertas de stock/caducidad:

```
cg = caregiverPorPaciente.get(pacienteId)
si cg && cg.notify_on_miss !== false:
  cgSubs = byUser.get(cg.caregiver_user_id) ?? []
  si cgSubs.length === 0 -> saltar   // cuidador sin suscripción activa
  para cada dose de dosesHoy:
    si dose.status ∈ ('taken','skipped')      -> continue
    si dose.caregiver_alerted_at              -> continue
    si !caregiverMissDue(dose, now)           -> continue
    med = meds.find(m => m.id === dose.med_id)
    si !med                                   -> continue
    payload = { kind:'caregiver-miss',
                title:`${cg.owner_name || 'Tu paciente'} no ha tomado su ${med.name}`,
                body:`Toma de las ${dose.time}`,
                tag:`cgmiss-${dose.id}`,
                patientId: pacienteId, doseId: dose.id,
                actionUrl:`${SUPABASE_URL}/functions/v1/caregiver-action` }
    para cada sub de cgSubs:
      status = webpushSend(sub, JSON.stringify({ ...payload, endpoint: sub.endpoint, secret: sub.action_secret }))
      si status ∈ (404,410) -> delete push_subscriptions where endpoint = sub.endpoint
    update doses set caregiver_alerted_at = now.toISOString() where id = dose.id
```

### `caregiverMissDue` (núcleo puro, `_shared/reminders.ts`)

```ts
export function caregiverMissDue(dose: DoseRow, now: Date): boolean {
  if (dose.status === 'taken' || dose.status === 'skipped') return false;
  if (dose.reminded_count < 1) return false;              // el paciente ni recibió sus avisos
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dueMin = strToMin(dose.time);
  return nowMin >= dueMin + 60 && nowMin < dueMin + 120;  // 2ª hora tras la toma
}
```
Usa el mismo `DoseRow` que `dueReminder` (`{ time, status, reminded_count, reminded_at }`), sin campos nuevos. Tests Vitest con los vectores de frontera: 59 min → false, 60 → true, 119 → true, 120 → false; `reminded_count 0` → false; `status taken` → false.

**Reparto temporal, sin solapes:** avisos al paciente en `[dueMin, dueMin+60)`; aviso al cuidador en `[dueMin+60, dueMin+120)`; después la toma queda "perdida" y no se avisa a nadie más (igual criterio que Pieza B con el cron caído).

**Limitación conocida (v1):** si el paciente marca la toma a los 70 min (tras el aviso al cuidador a los 65), no se envía un "ya la tomó" de vuelta al cuidador. El `tag` hace que un aviso posterior de la misma toma reemplace al anterior, pero no hay seguimiento de "resuelto".

## Edge Function `caregiver-action`

`verify_jwt = false`. CORS: `Access-Control-Allow-Origin: https://dosi-app.vercel.app` + responder `OPTIONS` (reusa `CORS_HEADERS` / `corsPreflight` de `_shared/edge.ts`). Cuerpo JSON, helper `json(body, status)` como en `dose-action`.

**Prólogo común (toda acción):**
```
sub = sb.from('push_subscriptions').select('user_id, action_secret').eq('endpoint', endpoint).maybeSingle()
si !sub || sub.action_secret !== secret  -> 401 { error:'unauthorized' }
cuidadorId = sub.user_id
```

**Verificación de relación (acciones sobre un paciente):**
```
// por patientId:
rel = sb.from('caregivers').select('*').eq('caregiver_user_id', cuidadorId).eq('owner_user_id', patientId).maybeSingle()
// por relationId:
rel = sb.from('caregivers').select('*').eq('caregiver_user_id', cuidadorId).eq('id', relationId).maybeSingle()
si !rel  -> 403 { error:'not-your-patient' }
```

| acción | entrada | comportamiento | respuesta |
|---|---|---|---|
| `accept` | `code, caregiverName` | ver §Emparejamiento | `200 {patientId, ownerName}` · `404 bad-code` · `400 self` |
| `list-patients` | — | `select id, owner_user_id, owner_name from caregivers where caregiver_user_id = cuidadorId` | `200 { patients: [{relationId, patientId, ownerName}] }` |
| `stop-caring` | `relationId` | verifica rel → `delete` la fila | `200 {ok:true}` · `403` |
| `patient-today` | `patientId` | verifica rel. `tz` = zona de la suscripción del paciente con `last_seen_at` más reciente (fallback `'Europe/Madrid'`). `now = nowInTz(tz)`, `today = isoDate(now)`. Materializa: `buildTodayDoses(meds.map(rowToMed), now)` → `upsert(doses, {onConflict:'id', ignoreDuplicates:true})` (idéntico a `send-reminders`). Luego `select * from doses where user_id = patientId and date = today` y `select * from medicines where user_id = patientId`. | `200 { ownerName, today, patientNowMin: now.getHours()*60+now.getMinutes(), medicines:[filas], doses:[filas] }` · `403` |
| `mark` | `patientId, doseId` | verifica rel. `markDoseTaken(sb, doseId, patientId)` — helper compartido extraído a `_shared/edge.ts`: `dose = select * from doses where id=doseId and user_id=patientId`; si `!dose` → `404`; si `dose.status !== 'taken'`: `update doses set status='taken'` + `med = select stock from medicines where id=dose.med_id and user_id=patientId`; `update medicines set stock = greatest(0, med.stock-1)`. Idempotente. `dose-action` pasa a usar este mismo helper. | `200 {ok:true}` · `404` · `403` |
| `nudge` | `patientId, doseId` | verifica rel. `dose = select …`; si `!dose` → `404`; si `dose.status ∈ (taken,skipped)` → `200 {ok:true, skipped:true}`; si `dose.nudged_at && now - nudged_at < 5 min` → `200 {ok:true, cooldown:true}`. Si no: `med = select name from medicines where id=dose.med_id and user_id=patientId`; `patientSubs = select * from push_subscriptions where user_id = patientId`; por cada una `webpushSend({ kind:'caregiver-nudge', title:`${rel.name || 'Tu cuidador'} te recuerda tu ${med.name}`, body:`Toma de las ${dose.time}`, tag:`nudge-${doseId}`, doseId, actionUrl:`${SUPABASE_URL}/functions/v1/dose-action`, endpoint, secret })`; 404/410 → borra esa sub. `update doses set nudged_at = now.toISOString()`. | `200 {ok:true}` / `{ok:true, skipped:true}` / `{ok:true, cooldown:true}` · `404` · `403` |

**Imports Deno con `.ts` explícito** (`../_shared/edge.ts`, `../_shared/schedule.ts`, `../_shared/types.ts`). El bundle va por `deploy_edge_function` (MCP) con los `_shared/*.ts`.

## Cliente

### `src/lib/caregiver.ts`

`pushCreds(): Promise<{endpoint, secret} | null>` — `reg.pushManager.getSubscription()` → `endpoint`; `supabase.from('push_subscriptions').select('action_secret').eq('endpoint', endpoint).maybeSingle()` → `secret` (RLS deja leer la propia fila). `null` si no hay suscripción.

```
// lado paciente — consultas normales (RLS caregivers_owner)
myCaregiverRow(): Promise<CaregiverRow | null>
createPairCode(ownerName: string): Promise<string>
regeneratePairCode(): Promise<string>
cancelCaregiver(): Promise<void>

// lado cuidador — vía POST a /caregiver-action con pushCreds()
acceptCode(code: string, name: string): Promise<{ patientId: string; ownerName: string | null } | { error: 'bad-code' | 'self' | 'no-push' | 'network' }>
listPatients(): Promise<{ relationId: string; patientId: string; ownerName: string | null }[]>
patientToday(patientId: string): Promise<{ ownerName: string | null; today: string; patientNowMin: number; medicines: Record<string, unknown>[]; doses: PatientDose[] }>
markDoseForPatient(patientId: string, doseId: string): Promise<void>
nudgePatient(patientId: string, doseId: string): Promise<'sent' | 'cooldown' | 'skipped'>
stopCaring(relationId: string): Promise<void>
```

`genCode()`: 6 chars de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` vía `crypto.getRandomValues`.

`CaregiverRow` (nuevo tipo en `src/data/types.ts`): `{ id, ownerUserId, caregiverUserId: string | null, name: string | null, ownerName: string | null, pairCode: string | null, pairCodeExpiresAt: string | null }`.

`PatientDose` (tipo de las filas `doses` que devuelve `patient-today`, en `src/lib/caregiver.ts`): `{ id: string; medId: string; time: string; totalMin: number; status: string; caregiverAlertedAt: string | null; nudgedAt: string | null }` (la función devuelve las columnas crudas; `caregiver.ts` las normaliza a camelCase).

### Perfil — sección "Cuidador"

`ProfileScreen.tsx`, entre "Recordatorios" y "Accesibilidad". Props nuevas: `caregiver: CaregiverRow | null`, `caredForCount: number`, `onAddCaregiver`, `onManageCaregiver` (abre hoja `show`), `onRemoveCaregiver`, `onBecomeCaregiver` (abre hoja `enter`), `onOpenCaredFor` (→ `CaregiverScreen`). La decisión de qué fila mostrar la toma `App.tsx`.

- **Lado paciente:** `!caregiver` → Row "Añadir un cuidador" (`onAddCaregiver`). `caregiver` pendiente → Row "Código {code} · caduca en {h} h" (`onManageCaregiver`). Pendiente caducada → Row "Código caducado — genera otro" (`onManageCaregiver`). `caregiver` activa → Row "Tu cuidador: {name}" (`onRemoveCaregiver` → `ConfirmDialog`).
- **Lado cuidador:** Row "Cuidar de alguien" (`onBecomeCaregiver`) siempre visible. Si `caredForCount > 0` → Row "Personas que cuido ({n})" (`onOpenCaredFor`).

### `CaregiverSheet.tsx`

Hoja inferior (patrón `PushSheet` — overlay `rgba(0,0,0,0.45)`, panel redondeado, `dosi-fade`/`dosi-sheet`). Prop `mode: 'show' | 'enter'`.
- `show`: `props.code`, `props.expiresAt`. Código grande centrado (`letterSpacing`, monoespaciado), botón primario **Compartir** (`navigator.share({ title:'Código de cuidador Dosi', text:code })`; fallback: copia al portapapeles + toast), texto "caduca en {h} h", botones secundarios **Generar otro** / **Cancelar**.
- `enter`: campo `<input inputMode="text" autoCapitalize="characters" maxLength={8}>`, botón **Aceptar** (`disabled` si `< 6` chars), errores mapeados: `bad-code` → "Código incorrecto o caducado", `self` → "Ese es tu propio código", `no-push` → "Activa las notificaciones primero", `network` → "Sin conexión".

### `CaregiverScreen.tsx`

Nuevo `ScreenId 'caregiver'`. Sub-pantalla de Perfil (sin pestaña en `BottomNav`). Estado interno: `patients` (de `listPatients`), `selected` (relationId o null), `today` (de `patientToday`), `loading`, `err`.

- Al montar: `listPatients()`. Si `length === 1` → auto-selecciona y carga `patientToday`. Si `> 1` → lista (nombre + chevron) → tocar selecciona.
- **"Hoy de {ownerName}":** `TopBar` con back + nombre + botón recargar. Lista de `doses` (orden por `total_min`):
  - por dosis: glifo de la medicina + `med.name` + `med.dose`, hora, **pill de estado** (`deriveStatus(dose, patientNowMin)`):
    - `status === 'taken'` → "Tomada" (verde)
    - `status === 'skipped'` → "Saltada" (gris)
    - `caregiverAlertedAt != null` **o** `totalMin < patientNowMin - 60` → "Perdida" (rojo)
    - resto → "Pendiente" (neutro)
  - si "Pendiente" o "Perdida": botones **"Ya la tomó"** (`markDoseForPatient` → recarga) y **"Recordarle"** (`nudgePatient`; el botón pasa a "Enviado ✓" 60 s; `'cooldown'` → toast "ya se le recordó hace un momento"; `'skipped'` → recarga).
  - "Tomada"/"Saltada": atenuada, sin botones.
- Empty: `doses.length === 0` → "{ownerName} no tiene tomas hoy".
- Error `403` en cualquier llamada → "Ya no cuidas a esta persona", se quita de `patients`, vuelve a la lista o sale.
- `pushCreds()` devuelve `null` → "Activa las notificaciones para usar esto" + botón que llama a `enablePush` (App lo inyecta).
- Abajo: **"Dejar de cuidar a {ownerName}"** → `ConfirmDialog` → `stopCaring(relationId)` → sale de la pantalla.

### `public/push-sw.js`

```js
const actions =
  d.kind === 'dose' || d.kind === 'caregiver-nudge'
    ? [{ action: 'take', title: 'Tomar' }, { action: 'snooze', title: 'Posponer' }]
  : d.kind === 'caregiver-miss'
    ? [{ action: 'cg-mark', title: 'Ya la tomó' }, { action: 'cg-nudge', title: 'Recordárselo' }]
  : [];
```

`notificationclick`:
- `take` / `snooze` → `POST d.actionUrl` (`dose-action`) con `{ endpoint, secret, doseId, action }` — **sin cambios**.
- `cg-mark` / `cg-nudge` → `POST d.actionUrl` (`caregiver-action`) con `{ endpoint, secret, patientId: d.patientId, doseId: d.doseId, action: event.action === 'cg-mark' ? 'mark' : 'nudge' }`. `.then(r => { if (!r.ok) return self.clients.openWindow('/'); }).catch(() => self.clients.openWindow('/'))`.
- El resto (tap en el cuerpo) → foco/abre como ahora.

### `src/App.tsx`

- Estado: `caregiver` (`CaregiverRow | null`), `caredForCount` (number). Se cargan en el `useEffect` de arranque de Supabase tras `setAccount` (`myCaregiverRow()` + `listPatients().then(p => p.length)`), y tras `confirmSignIn` con el nuevo uid.
- `screen === 'caregiver'` → `<CaregiverScreen … onEnablePush={doEnablePush} />`. Entrada desde `ProfileScreen` `onOpenCaredFor` → `setScreen('caregiver')`. Back → `setScreen('main'); setTab('profile')`.
- Handlers para las props nuevas de `ProfileScreen` (crear/gestionar/quitar código, abrir hojas).
- `handleSignOut`: junto a `await disablePush().catch(()=>{})` y **antes** de `signOutToAnon()` (mientras aún se es ese usuario, para que RLS lo permita), una sola sentencia:
  `await supabase.from('caregivers').delete().or(\`owner_user_id.eq.${uidActual},caregiver_user_id.eq.${uidActual}\`).catch(()=>{})`.
  El borrado como `owner_user_id` lo cubre `caregivers_owner`; el borrado como `caregiver_user_id` lo cubre la política nueva `"caregiver can leave"` (§Migración). `stopCaring` del cuidador se mantiene en la Edge Function (aunque la política lo permitiría) para validar `relationId` y unificar el manejo de errores.

### `src/data/sync.ts`

`export function rowToMed(...)` (hoy privada). Se añade `src/lib/sync.rowToMed.test.ts` (Vitest) que compara la salida de `sync.ts` `rowToMed` con la de `_shared/types.ts` `rowToMed` para los mismos vectores (fila completa nueva, fila `{id}` mínima, `paused` no-booleano). Cierra el Minor pendiente de la revisión de Pieza B.

### Strings

Nuevas en `es` y `en` para: sección Perfil (`cgSection`, `cgAdd`, `cgPending`, `cgExpired`, `cgActive`, `cgBecome`, `cgCaredFor`, `cgRemoveTitle`, `cgRemoveMsg`), hoja (`cgShareTitle`, `cgShareBody`, `cgShareBtn`, `cgRegen`, `cgCancel`, `cgExpiresIn`, `cgEnterTitle`, `cgEnterBody`, `cgEnterPlaceholder`, `cgAccept`, `cgErrBadCode`, `cgErrSelf`, `cgErrNoPush`, `cgErrNetwork`), pantalla (`cgTodayTitle`, `cgStTaken`, `cgStSkipped`, `cgStMissed`, `cgStPending`, `cgMarkForHer`, `cgRemind`, `cgReminded`, `cgRemindCooldown`, `cgNoDoses`, `cgGone`, `cgNeedPush`, `cgStopTitle`, `cgStopMsg`, `cgPatientsTitle`), toasts (`cgAcceptedToast`, `cgRemovedToast`, `cgMarkedToast`).

## Casos límite

| Situación | Comportamiento |
|---|---|
| Cuidador sin suscripción push (GC'd) | `send-reminders` no le puede avisar (no hay `cgSubs`). En la app, `pushCreds()` → null → la pantalla pide activar notificaciones. `syncPush` (Pieza B) la re-crea en el siguiente arranque. |
| Paciente marca la toma justo después del aviso al cuidador | El cuidador ya recibió el push; no hay "resuelto" en v1. Si pulsa "Ya la tomó" → `mark` es idempotente (no re-descuenta). Si pulsa "Recordarle" → `nudge` ve `status='taken'` → `{skipped:true}`, no molesta al paciente. |
| Código caducado | `accept` → `404 bad-code`. Perfil del paciente muestra "genera otro". |
| Paciente cambia de dispositivo (sign-in en otro navegador) | `confirmSignIn` da uid distinto; `App.tsx` recarga `caregiver`/`caredForCount` con el nuevo uid. La fila `caregivers` sigue con el `owner_user_id` viejo → el paciente "pierde" el cuidador en el dispositivo nuevo hasta que regenere. (Igual clase de problema que Pieza A/B con datos ligados al uid anónimo; aceptado.) |
| Cuidador cuida a alguien que borra su cuenta / cierra sesión | `handleSignOut` del paciente borra la fila. La lista del cuidador deja de mostrarlo tras `listPatients`; una `patient-today` sobre esa relación → `403` → se quita de la lista. |
| Dos pacientes con el mismo cuidador, ambos se saltan una toma | Dos push independientes al cuidador (tags distintos: `cgmiss-<doseId>`). |
| `nudge` en bucle desde la pantalla | Cooldown de 5 min en `caregiver-action` (`doses.nudged_at`) + botón deshabilitado 60 s en el cliente. |
| Cuidador en iPhone | Misma fricción que Pieza B: `needsInstallFirst()` → hoja que guía a instalar la PWA antes de aceptar un código. |
| Zona horaria paciente ≠ cuidador | `patient-today` calcula "hoy" y `patientNowMin` en la zona del **paciente**. La pantalla muestra las horas tal cual (strings de reloj de pared). |
| `send-reminders` cron caído 3 h | El paciente no recibió sus avisos → `reminded_count = 0` → `caregiverMissDue` es `false` → no se avisa al cuidador de tomas viejas. |

## Pruebas

- **Núcleo puro** — `src/lib/reminders.shared.test.ts`: `caregiverMissDue` con vectores de frontera (59/60/119/120 min, `reminded_count 0`, `status taken/skipped`).
- **Paridad `rowToMed`** — `src/lib/sync.rowToMed.test.ts`: `sync.ts` vs `_shared/types.ts` para 3 filas representativas.
- **`caregiver-action`** — manual (no hay `deno test` en el gate, igual que Pieza B): secreto correcto/incorrecto → 200/401; `accept` con código bueno/malo/caducado/propio; `patient-today` de un paciente ajeno → 403; `mark` idempotente (doble → no re-descuenta stock); `nudge` con cooldown; preflight `OPTIONS` → 200.
- **`send-reminders`** — verificar en logs (`query_logs`) que el paso del cuidador no rompe el bucle y que `caregiver_alerted_at` se fija una sola vez.
- **E2E manual** (checklist en el plan) con dos dispositivos / dos cuentas: paciente genera código → cuidador lo acepta → paciente se salta una toma → cuidador recibe el push a la hora → "Recordarle" llega al paciente con botones Tomar/Posponer → "Ya la tomó" marca la dosis → pantalla "Hoy de X" refleja el estado → "Dejar de cuidar" corta la relación.
- **Gate del repo:** `npm run lint && npm run test && npm run build` verde (los nuevos tests Vitest incluidos).

## Puesta en marcha (orden)

1. `apply_migration` — columnas en `caregivers` y `doses` + índice único + política `caregivers` delete-as-caregiver.
2. Deploy de `caregiver-action` (`verify_jwt = false`) + redeploy de `send-reminders` (paso del cuidador) y `dose-action` (usa el helper `markDoseTaken` compartido) vía MCP.
3. Merge del cliente → deploy Vercel.
4. E2E con dos cuentas / dos dispositivos.
5. Cerrar Pieza C.

## Fuera de alcance

- Aviso al cuidador por email o SMS (solo push).
- Más de un cuidador por paciente.
- El cuidador ve el inventario / el calendario / el historial del paciente (solo "Hoy").
- Resumen diario al cuidador ("Ana se dejó 2 tomas hoy").
- Notificar a la otra parte al revocar la relación.
- Permisos graduales (`permission` view/edit) — en v1 el cuidador siempre puede marcar y recordar.
- "Ya la tomó" de vuelta al cuidador cuando el paciente marca tarde.
- Que el cuidador edite medicinas / horarios del paciente.

## Riesgos / notas

- **Superficie de privacidad:** un `caregiver-action` con un `{endpoint, secret}` válido puede leer y mutar las tomas de cualquier paciente que ese cuidador cuide. El secreto solo lo conocen el servidor y el dispositivo del cuidador (ya se le envía en cada payload push). La relación `caregivers` se verifica en cada llamada. Si el dispositivo del cuidador se ve comprometido, el atacante ve/marca las tomas de sus pacientes — mismo modelo de amenaza que `dose-action` para el propio paciente.
- **`caregivers` sin migración en el repo:** la tabla se creó fuera de control de versiones (sesión móvil). La migración de Pieza C es la primera que la toca desde el repo; usa `add column if not exists` y `drop policy if exists` para ser reejecutable sobre el estado actual.
- **`doses` acumula columnas** (`reminded_count`, `reminded_at`, `caregiver_alerted_at`, `nudged_at`). Todas nullable/con default, coste de escritura despreciable. Si crece más, plantear una tabla `dose_events`.
- **Coste:** una consulta extra por tick del cron (`select from caregivers`), más los push al cuidador. Dentro del plan gratis.
