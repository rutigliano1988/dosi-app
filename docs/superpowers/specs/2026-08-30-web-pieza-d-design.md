# Dosi Web — Pieza D: Historial y adherencia

- **Fecha:** 2026-08-30
- **Repo:** `dosi-app` (web), rama `main`
- **Depende de:** Pieza A (motor `src/lib/schedule.ts`, tabla `doses` con `date`/`status`, `pullHistory`), Pieza B (materialización de dosis en `send-reminders`), Pieza C (no la toca).
- **Objetivo:** dar al paciente/familia una vista real de la adherencia a lo largo del tiempo — calendario mensual, % por medicina y global, e informe en PDF para llevar a la consulta.
- **Entrega:** un único merge a `main` tras revisión y E2E del usuario, como A/B/C.

## Contexto

La web tiene hoy una vista **semanal** en `CalendarScreen` con % de adherencia y un timeline por día, y una tarjeta de **últimas 10 tomas** en `DetailScreen`. La vista **mensual** es un stub ("próximamente") — quedó explícitamente fuera de alcance en la Pieza A. `pullHistory` trae 7 días.

El problema de fondo: las filas `doses` de días pasados solo existen si ese día se abrió la app o corrió el cron de `send-reminders` (y este último solo itera usuarios con suscripción push). En la BD de producción hoy hay 4 días con datos y huecos enormes. Sin resolver eso, cualquier % de adherencia histórico es poco fiable.

## Decisiones tomadas (brainstorming 2026-08-30)

| Tema | Decisión |
|---|---|
| Días pasados sin filas `doses` | **Backfill + reconstrucción**: al abrir la app se materializan las filas que faltan de los últimos 90 días con status `upcoming`; esto "congela" el horario tal como era. Días anteriores al primer backfill quedan como datos parciales. |
| Ventana de historial | **90 días**. El calendario navega ~3 meses atrás; el informe cubre 30 o 90 días; el backfill rellena 90 días. |
| Dónde vive el cálculo | **Cliente, módulo puro** (`src/lib/adherence.ts`), reusa el motor determinista `schedule.ts`. Sin Edge Function ni vista Postgres nuevas. |
| Forma del informe | **PDF generado en el cliente** con jsPDF (import dinámico). Se comparte con `navigator.share` o se descarga. Sin enlace web ni envío por email. |
| Métrica de adherencia | Titular = `tomadas / (tomadas + olvidadas)`. Las **omitidas** (skipped, a propósito) **no** entran en ese ratio; se muestran siempre como cifra cruda al lado, igual que los olvidos. Nunca un único % que mezcle las tres. |
| Acceso del cuidador al historial | **Fuera de alcance** (posible Pieza E). La Pieza D es solo para el paciente en su propia app. |
| Migración de BD | **Ninguna.** `doses` ya tiene `date`/`time`/`status`/`total_min`. "Olvidada" se deriva en memoria. |
| Retención / purga de filas viejas | **Fuera de alcance.** Se deja nota; 90 días × pocas medicinas es pequeño. |
| Versionado de cambios de horario | **Fuera de alcance.** Editar el horario solo afecta a días aún no materializados. |

## Alcance

### Dentro

1. **`expectedDosesOn(meds, date)`** en `src/lib/schedule.ts` — horario esperado para cualquier fecha.
2. **`backfillHistory(uid, meds, days)`** en `src/data/sync.ts` — materializa filas `doses` faltantes de los últimos 90 días al abrir la app.
3. **`src/lib/adherence.ts`** (nuevo, puro, Vitest) — estadísticas por día / por medicina / global para un rango.
4. **Vista mensual** real en `CalendarScreen` — rejilla del mes, color por día, navegación ‹ › hasta 3 meses atrás, tap → timeline del día.
5. **`DetailScreen`** — adherencia de 30 días + tira de 30 días en la tarjeta de historial.
6. **Informe PDF** — `src/lib/report.ts` + `src/screens/ReportScreen.tsx` + entrada en Perfil.
7. **`pullHistory`**: 7 → 90 días.

### Fuera (explícito)

- Acceso del cuidador (Pieza C) al historial / adherencia / informe del paciente.
- Enlace web compartible o envío del informe por email desde la app.
- Retención / purga automática de filas `doses` de más de 90 días.
- Versionado del historial de cambios de una medicina.
- Vista anual del calendario.
- Migración de esquema de base de datos.
- Cualquier cambio en el flujo del cuidador o en `caregiver-action`.

## Sin migración de base de datos

La tabla `doses` ya tiene `date date`, `time text`, `total_min int`, `status text` (CHECK `upcoming|now|taken|skipped`), PK `id` = `${medId}-${YYYY-MM-DD}-${HH:MM}`, `ON DELETE CASCADE` desde `medicines`. El estado "olvidada" (`missed`) es derivado: una fila `upcoming`/`now` cuya fecha·hora local ya pasó. Igual que hace hoy `buildTodayDoses`.

## Arquitectura

```
schedule.ts
  expectedDosesOn(meds, date) ─────────┐
                                       │  (motor determinista, puro)
sync.ts                                │
  backfillHistory(uid, meds, 90) ──────┤── usa expectedDosesOn para saber qué
    · pullHistory(uid, 90) → ids        │   filas deberían existir
    · upsert batch ignoreDuplicates     │
  pullHistory(uid, 90)  ───────────────┘
                                       │
adherence.ts (puro, Vitest)            │
  outcomeFor(row?, now)                 │── cruza expectedDosesOn × filas doses
  buildAdherence(meds, rows, from, to, now) → AdherenceSummary
                                       │
report.ts (puro, Vitest)               │
  buildReport(meds, rows, from, to, now, userName) → ReportData
  reportFileName(...)                   │
                                       ▼
CalendarScreen (mes)   DetailScreen (30 días)   ReportScreen → jsPDF (dinámico)
```

Flujo al abrir la app (en `App.tsx`, tras `pullAll` y `pullHistory`):
1. Render inmediato con lo que haya en `historyDoses`.
2. `backfillHistory(uid, meds, 90)` **sin await en el camino crítico**.
3. Si insertó > 0 filas → `setHistoryDoses(await pullHistory(uid, 90))`.

## Componentes

### `src/lib/schedule.ts` — `expectedDosesOn`

```ts
export function expectedDosesOn(
  meds: Medicine[],
  date: Date,
): { medId: string; time: string; totalMin: number }[]
```

- Para cada med: activa ese día sii `isActiveOn(med, date)` **y** `daysBetween(med.duration.startedOn, date) >= 0` (guarda nueva — hoy `isActiveOn` no comprueba que la fecha sea posterior al inicio; `medState` da `active` para fechas previas al `startedOn` porque `daysBetween` sale negativo).
- Expande horas con `expandTimes(med)` (ya existe).
- `totalMin` = minutos desde medianoche de cada hora.
- Ordena por `totalMin`, luego `medId`.
- **Refactor**: `buildTodayDoses` pasa a construir su lista a partir de `expectedDosesOn(meds, now)` y solo añade el `status` temporal (`missed`/`now`/`upcoming`) y el `id`. El comportamiento observable de `buildTodayDoses` no cambia — hay test de regresión.
- La guarda `startedOn` se aplica también dentro de `isActiveOn` (para que `buildTodayDoses` no genere dosis de una medicina cuyo tratamiento aún no ha empezado). Verificar que no rompe tests existentes; si algún test asumía lo contrario, es un bug del test.

### `src/data/sync.ts` — `backfillHistory` y `pullHistory`

```ts
export async function backfillHistory(
  uid: string,
  meds: Medicine[],
  days = 90,
): Promise<number>   // nº de filas insertadas
```

1. Si `!uid` o `meds.length === 0` → return 0.
2. `const existing = new Set((await pullHistory(uid, days)).map(d => d.id))`.
3. Para `i` de `1` a `days` (no hoy — hoy lo maneja el flujo normal):
   - `const day = ` fecha local de hace `i` días.
   - Para cada `{ medId, time }` de `expectedDosesOn(meds, day)`:
     - `const id = ${medId}-${isoDate(day)}-${time}`.
     - Si `!existing.has(id)` → push a `toInsert` `{ id, user_id: uid, med_id: medId, date: isoDate(day), time, total_min, status: 'upcoming' }`.
4. Si `toInsert.length === 0` → return 0.
5. `supabase.from('doses').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true })`. En error → `console.error`, return 0 (se reintenta el próximo arranque).
6. return `toInsert.length`.

- Nunca toca filas existentes (`ignoreDuplicates`) → no pisa `taken`/`skipped`/`now`.
- Batch único. Primera vez: ~90 días × (nº medicinas × tomas/día) filas — decenas.
- No usa `outbox` (los datos son reconstruibles; no es una acción del usuario).

`pullHistory`: el parámetro `days` por defecto pasa de `7` a `90`. En `App.tsx` las tres llamadas actuales (`pullHistory(uid, 7)`, `pullHistory(newUid, 7)`, y la de refresco) pasan a `90` o al default.

### `src/lib/adherence.ts` (nuevo)

```ts
export type DoseOutcome = 'taken' | 'skipped' | 'missed' | 'pending';

export interface DayAdherence {
  date: string;      // YYYY-MM-DD
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  scheduled: number; // taken + skipped + missed + pending
}

export interface MedAdherence {
  medId: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;   // taken / (taken + missed); null si (taken + missed) === 0
}

export interface AdherenceSummary {
  from: string;
  to: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;   // global taken / (taken + missed)
  perMed: MedAdherence[];
  perDay: DayAdherence[];
}

export function outcomeFor(
  row: { status: string; date?: string; time: string } | undefined,
  dayISO: string,
  time: string,
  now: Date,
): DoseOutcome;

export function buildAdherence(
  meds: Medicine[],
  rows: Dose[],          // filas doses con .date (de pullHistory)
  fromISO: string,
  toISO: string,
  now: Date,
): AdherenceSummary;

export function adherenceLabel(rate: number | null, lang: Lang): string;
```

- **`outcomeFor`**: `taken`/`skipped` → directo. `upcoming`/`now`/ausente → `missed` si `dayISO + time` (hora local) `< now`; si no `pending`. `now` como estado persistido se trata igual que `upcoming`.
- **`buildAdherence`**: indexa `rows` por `id`. Para cada día del rango `[from, to]` y cada `{ medId, time }` de `expectedDosesOn(meds, day)`, calcula `outcomeFor` y acumula en `perDay`, `perMed` y los totales. `scheduled` de un día = suma de los cuatro. Días fuera del rango de vida de una med simplemente no aparecen en `expectedDosesOn`.
- **Contrato de `perDay`**: contiene **una entrada por cada día** del rango `[from, to]` inclusive, en orden ascendente, aunque `scheduled === 0` (todos los contadores a 0). Las vistas dependen de esto para alinear rejilla y tira sin comprobar huecos.
- **`perMed`**: una entrada por cada med de `meds` que tenga al menos una dosis esperada en el rango. Orden = el de `meds`.
- **`adherenceLabel`**: `null → '—'`; `>= 0.9 → 'Excelente' / 'Excellent'`; `>= 0.7 → 'Buena' / 'Good'`; `< 0.7 → 'Irregular' / 'Irregular'`.
- `pending` nunca entra en ningún `rate`.

### `src/screens/CalendarScreen.tsx` — vista mensual

- El `SegmentedRow` semana/mes ya existe. Estado `mode` ya existe. Se sustituye el bloque stub del `else`.
- Estado nuevo: `monthOffset` (0 = mes actual, -1, -2, -3). No baja de -3 ni sube de 0.
- **Cabecera**: `‹  {mes} {año}  ›`. `‹` deshabilitado en -3; `›` deshabilitado en 0.
- **Una sola llamada** `buildAdherence(meds, historyDoses, {primer día visible}, {min(último día del mes, hoy)}, now)`; se indexa `summary.perDay` por `date` en un `Map` y las celdas lo consultan. Nunca `buildAdherence` por celda.
- **Rejilla**: 7 columnas (L a D, reusa `tArr(lang, 'daysShort')`), filas = semanas del mes. Celdas de días de otros meses vacías. Cada celda con día del mes lee `perDayMap.get(isoDate(cellDate))`:
  - Futuro (`cellDate > hoy`) → punto gris tenue, sin anillo.
  - sin entrada en el `Map`, o `taken + missed + skipped === 0` (nada debido) → punto gris.
  - `missed + skipped === 0` y `taken > 0` → punto verde lleno.
  - resto → `ProgressRing` como **indicador visual de "cuánto del día se completó"**, `value = taken / (taken + missed + skipped)`, `theme.success`. (No es "el % de adherencia" — ese es el titular `taken/(taken+missed)` y solo aparece en la tarjeta resumen.)
  - Día seleccionable; el seleccionado con fondo `theme.accent` (como la tira semanal).
- **Tap en un día** → `selectedDate`; debajo de la rejilla se renderiza el **timeline de ese día** (mismo componente que la vista semana — se extrae a un componente/función `DayTimeline` que toma `(dateStr, doses, meds, theme, t, lang)` y lo usan ambos modos).
- **Tarjeta resumen del mes visible**: `buildAdherence` del rango `[primer día del mes visible, min(último día del mes, hoy)]`. Muestra `ProgressRing` + `"{rate}% · {skipped} omitidas · {missed} olvidadas · {taken}/{taken+missed} dosis"`. Si `rate === null` → `"—"`.
- `historyDoses` (90 días) cubre los 4 meses visibles (actual + 3 atrás parcialmente); **no** hay fetch por mes.

### `src/screens/DetailScreen.tsx` — adherencia por medicina

- En la tarjeta "Historial", encima de la lista actual:
  - `const summary = buildAdherence([med], historyDoses, hace29dISO, hoyISO, now)` (una llamada; `hace29dISO` = hoy − 29 días, para 30 celdas contando hoy). `const a = summary.perMed[0]`.
  - Línea: `"{t('adherence30')} · {a.rate === null ? '—' : Math.round(a.rate*100)+'%'}"` + en pequeño `"{a.skipped} {t('skippedCountLabel')} · {a.missed} {t('missedCountLabel')}"` (ocultar la línea pequeña si ambos 0).
  - **Tira de 30 días**: recorre `summary.perDay` (30 entradas, de hace 29 días a hoy, orden ascendente). Color por entrada: verde si `taken>0 && missed+skipped===0`; rojo si `missed+skipped>0 && taken===0`; naranja si mezcla (`taken>0 && missed+skipped>0`); gris si `taken+missed+skipped===0`. Celda de hoy resaltada.
  - Si `a.taken + a.missed + a.skipped === 0` → ocultar % y tira, dejar solo la lista (y su "sin historial aún" si vacía).
- La lista de las últimas 10 tomas se mantiene sin cambios.

### `src/lib/report.ts` (nuevo)

```ts
export interface ReportIncident {
  dateISO: string;
  time: string;
  medName: string;
  kind: 'missed' | 'skipped';
}

export interface ReportMedLine {
  name: string;
  scheduleText: string;   // pauta legible: "1 comprimido · 08:00, 20:00" etc.
  taken: number;
  missed: number;
  skipped: number;
  rate: number | null;
}

export interface ReportData {
  userName: string;
  fromISO: string;
  toISO: string;
  generatedISO: string;
  summary: AdherenceSummary;
  medLines: ReportMedLine[];
  incidents: ReportIncident[];   // ordenadas por fecha·hora asc
  activeMedCount: number;
}

export function buildReport(
  meds: Medicine[],
  rows: Dose[],
  fromISO: string,
  toISO: string,
  now: Date,
  userName: string,
): ReportData;

export function reportFileName(userName: string, fromISO: string, toISO: string): string;
// -> "dosi-informe-<slug>-<from>-<to>.pdf"  (slug: minúsculas, sin acentos, [a-z0-9-])
```

- `buildReport` reusa `buildAdherence`. `scheduleText` con un helper de pauta legible (reusa `expandTimes` + frecuencia).
- Rango invertido (`from > to`) o `meds` vacías → `ReportData` válido con listas vacías y `summary.rate = null`. No lanza.

### `src/screens/ReportScreen.tsx` (nuevo, `ScreenId 'report'`)

- Botón "atrás" standalone arriba a la izquierda (patrón `DetailScreen`/`CaregiverScreen`).
- `SegmentedRow`: **30 días / 90 días** (default 30). Calcula `fromISO`/`toISO`.
- **Vista previa** en pantalla del `ReportData`: cabecera (nombre · rango · generado el), bloque resumen (adherencia global + cifras), tabla por medicina, lista de incidencias.
- Botón **"Guardar PDF"**:
  - `const { jsPDF } = await import('jspdf')` (import dinámico → fuera del chunk inicial).
  - Dibuja el PDF a mano (texto + líneas de tabla, sin `html2canvas`). A4, márgenes, tipografía Helvetica de jsPDF. 1-2 páginas.
  - `const blob = doc.output('blob')`.
  - Si `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file], title })`.
  - Si no → `<a href={URL.createObjectURL(blob)} download={reportFileName(...)}>` disparado por código, luego `revokeObjectURL`.
  - Estado `busy` mientras genera; error → toast/línea "no se pudo generar el PDF".
- Si el usuario es anónimo sin datos, la entrada en Perfil no aparece (ver abajo), así que la pantalla asume que hay `uid`.

**Contenido del PDF:**
1. Cabecera: `"Informe de adherencia — {nombre}"`, `"{from} – {to}"`, `"Generado el {fecha}"`.
2. Resumen: adherencia global `{rate}%` (o "—"), `{taken}` tomadas · `{missed}` olvidadas · `{skipped}` omitidas, `{activeMedCount}` medicinas.
3. Tabla por medicina: Nombre · Pauta · Tomadas · Olvidadas · Omitidas · %.
4. Incidencias: lista `"{fecha} {hora} — {medicina} — olvidada/omitida"`. Si vacía → "Sin olvidos ni omisiones en el periodo".
5. Pie: `"Generado por Dosi · los datos los introduce el paciente o su familia · no sustituye el registro clínico."`

### `src/screens/ProfileScreen.tsx` — entrada al informe

- Nueva fila **"Informe para el médico"** en un apartado "Historial" (o al final de la sección de cuenta), con `onOpenReport`.
- Solo visible si hay sesión con datos (`meds.length > 0`). Anónimo vacío no la ve.

### `src/App.tsx`

- `ScreenId` gana `'report'`.
- `pullHistory(..., 7)` → `90` en las 3 llamadas.
- Tras `pullAll` + `pullHistory` en el arranque y en el cambio de cuenta: llamar `backfillHistory(uid, meds, 90)` sin bloquear; si devuelve > 0 → refrescar `historyDoses`.
- `handleOpenReport` → `setScreen('report')`. Cablear `onOpenReport` a `ProfileScreen` y el back de `ReportScreen`.
- Pasar `meds` + `historyDoses` a `ReportScreen`.

### `src/i18n/strings.ts`

Claves nuevas en `es` y `en`: `adherence30`, `adherenceExcellent`, `adherenceGood`, `adherenceIrregular`, `monthView`, `reportTitle`, `reportForDoctor`, `reportPeriod30`, `reportPeriod90`, `reportSavePdf`, `reportGenerating`, `reportError`, `reportShareTitle`, `reportSummaryHeading`, `reportMedTableHeading`, `reportIncidentsHeading`, `reportNoIncidents`, `reportFooter`, `reportGeneratedOn`, `reportColMed`, `reportColSchedule`, `reportColTaken`, `reportColMissed`, `reportColSkipped`, `reportColRate`, `historySectionTitle`, `takenCountLabel`, `missedCountLabel`, `skippedCountLabel`, `noDosesInPeriod`, `dosesThisMonth`. (Lista final la fija el plan.)

## Errores y casos límite

| Situación | Comportamiento |
|---|---|
| Backfill sin conexión / falla el upsert | Log, return 0, se reintenta al próximo arranque. No bloquea el render. No usa `outbox`. |
| Horario editado hace poco | Los días ya materializados conservan las horas viejas; los nuevos usan las nuevas. Sin distorsión retroactiva. Documentado. |
| Medicina borrada | Sus filas `doses` caen por `ON DELETE CASCADE` → desaparece del historial y del informe. Aceptado. |
| Medicina creada hace 5 días | El backfill y `expectedDosesOn` solo cuentan desde `duration.startedOn`. Calendario: "sin dosis esperadas" antes. `perMed.rate` = `null` si `(taken+missed) === 0`. |
| `navigator.share` sin soporte de `files` | Fallback a descarga `<a download>`. iOS PWA soporta `share` con archivos; escritorio suele caer al fallback. |
| Rango del informe sin tomas debidas | PDF se genera con "Sin dosis registradas en el periodo" y `%` = "—". |
| Usuario anónimo sin datos | Perfil oculta "Informe para el médico". Calendario mensual funciona con lo que haya. |
| jsPDF en el bundle | `await import('jspdf')` solo al pulsar "Guardar PDF" → no entra en el chunk inicial. |
| Cambio de cuenta (sign-in con otro uid) | `historyDoses` se recarga con el uid nuevo (ya pasa hoy); `backfillHistory` corre para el uid nuevo. |
| Backfill con 90 días y muchas medicinas | Un solo `upsert` batch. Si Supabase pusiera límite de payload, trocear en lotes de ~500 filas (el plan lo decide si hace falta; con los volúmenes reales no aplica). |
| Dosis tipo `interval` (cada X horas) | `expandTimes` ya las expande; `expectedDosesOn` las hereda sin lógica extra. |
| Día con cambio de hora (DST) | Se ignora — el cálculo es por `HH:MM` local y `isoDate` local; un día de 23/25 h no afecta al conteo de tomas. |

## Testing

- **`src/lib/schedule.test.ts`** (amplía): `expectedDosesOn` para `daily` / `weekdays` (día dentro y fuera) / `interval` / fecha anterior a `startedOn` / med `finished` / med `paused`. Regresión: `buildTodayDoses` produce lo mismo que antes del refactor para un set fijo.
- **`src/lib/adherence.test.ts`** (nuevo, ~18 casos): `outcomeFor` en fronteras de hora (1 min antes / después de `now`), `taken`/`skipped` directos, ausencia de fila en día pasado → `missed`, en día futuro → `pending`. `buildAdherence`: mezcla de filas reales y días huecos; `rate = taken/(taken+missed)`; omitidas fuera del ratio pero contadas en `skipped`; `perMed` y `perDay` correctos; `(taken+missed) === 0` → `rate === null`; rango de un solo día; med que empieza a mitad del rango.
- **`src/lib/report.test.ts`** (nuevo, ~7 casos): `buildReport` estructura correcta; `incidents` ordenadas asc; `reportFileName` saneo (acentos, espacios, mayúsculas); `meds` vacías → `ReportData` válido; rango invertido → no lanza.
- **Sin test de jsPDF** (I/O de librería). Sí: `buildReport` no revienta con entradas degeneradas.
- Objetivo: suite verde (hoy 81) + ~30 casos nuevos.

## Riesgos / notas

- **Reconstrucción con horario cambiado:** si el usuario edita las horas de una medicina, los días ya materializados no cambian pero los aún no materializados (huecos > fecha de edición) se rellenan con las horas nuevas. Para un registro de adherencia es el comportamiento menos malo sin versionar; se asume.
- **`send-reminders` no se toca**, pero conviene saber que sigue materializando las dosis de *hoy* de los usuarios con push — el backfill del cliente y esa materialización conviven vía `ignoreDuplicates` sobre la PK `id`.
- **`doses` crece:** ~90 días de filas por usuario activo. Con las medicinas típicas (2-4, 1-3 tomas/día) son ~200-1000 filas por usuario. Sin purga en la Pieza D; si el proyecto escala, un `DELETE FROM doses WHERE date < now() - interval '100 days'` en un tick diario de `send-reminders` lo resuelve.
- **`isActiveOn` gana una guarda `startedOn`:** cambio sutil en una función que ya usa `buildTodayDoses`. El test de regresión cubre que no aparezcan dosis de tratamientos aún no iniciados (que hoy sí podrían aparecer — es un bug latente que esta pieza corrige de paso).
- **jsPDF (~350 KB, MIT):** única dependencia nueva. Import dinámico la mantiene fuera del arranque. Sin binarios nativos, compatible con Vite/Vercel.
- **Privacidad:** el PDF contiene nombre + medicación + fechas. Se genera y comparte solo por acción explícita del usuario, en su dispositivo. No sale nada a ningún servidor.
