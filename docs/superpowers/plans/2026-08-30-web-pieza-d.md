# Pieza D — Historial y adherencia · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al paciente/familia una vista real de la adherencia en el tiempo — calendario mensual, % por medicina y global, e informe PDF para la consulta.

**Architecture:** Todo en el cliente. `schedule.ts` gana `expectedDosesOn(meds, date)` (motor determinista). `sync.ts` gana `backfillHistory` que al abrir la app materializa filas `doses` faltantes de 90 días. Un módulo puro nuevo `adherence.ts` cruza el horario esperado con las filas reales (unión: cuenta también filas que ya no están "esperadas") y produce estadísticas. `report.ts` arma la estructura del informe; `ReportScreen` la renderiza y genera un PDF con jsPDF (import dinámico). `CalendarScreen` y `DetailScreen` muestran las nuevas vistas.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, `@supabase/supabase-js`, **`jspdf`** (dependencia nueva).

## Global Constraints

- **Idioma de la UI:** todo string visible va por `src/i18n/strings.ts` con clave en `es` **y** `en`. Nada de texto hardcodeado en JSX salvo lo que ya exista en un patrón local (algunas pantallas usan `lang === 'es' ? … : …` inline — es aceptable seguir ese patrón donde ya está).
- **Sin migración de base de datos.** La tabla `doses` no se altera. `status` en BD solo admite `upcoming|now|taken|skipped` (CHECK `doses_status_check`). "Olvidada" (`missed`) es siempre derivado en memoria.
- **No se toca `send-reminders`, `dose-action`, `caregiver-action` ni `supabase/functions/_shared/*`.** La guarda `startedOn` vive solo en `expectedDosesOn` (cliente), no en `isActiveOn`.
- **TypeScript estricto** (`tsconfig.app.json`): `verbatimModuleSyntax: true` → imports de solo tipo con `import type`. `noUnusedLocals` / `noUnusedParameters` → nada sin usar. `erasableSyntaxOnly` → sin enums ni namespaces ni parámetros-propiedad. `jsx: react-jsx` → **nunca** `import React from 'react'` salvo que se use `React.` en posición de valor; `React.CSSProperties` como anotación de tipo va bien. `allowImportingTsExtensions` → los imports a `../../supabase/functions/_shared/*` llevan `.ts`; los imports dentro de `src/` **no** llevan extensión.
- **Fechas siempre en hora local.** Usar `isoDate(d)` de `src/lib/schedule.ts`. Nunca `toISOString()` para derivar un día.
- **Dose id** = `` `${medId}-${YYYY-MM-DD}-${HH:MM}` `` (fecha local). Ya es así en todo el código.
- **Métrica de adherencia:** el titular es `tomadas / (tomadas + olvidadas)`. Las **omitidas** (skipped) **no** entran en ese ratio; se muestran siempre como cifra cruda al lado. `rate` es `null` cuando `(tomadas + olvidadas) === 0`. `pending` (esperada pero su hora aún no pasó) nunca entra en ningún denominador.
- **Ventana de historial:** 90 días. `pullHistory` default = 90. El calendario navega hasta 3 meses atrás. El informe cubre 30 o 90 días.
- **jsPDF con import dinámico:** `const { jsPDF } = await import('jspdf')` dentro del handler del botón, nunca en el top-level de un módulo — no debe entrar en el chunk inicial.
- **Verification gate (cada task):**
  ```
  rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build
  ```
  `npm run lint` (oxlint) — los *warnings* no fallan; los *errors* sí. `npm run test` (Vitest, `vitest run`). `npm run build` = `tsc -b && vite build`.
- **Commits frecuentes**, mensaje en español, terminando con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- **Rama:** `feat/web-pieza-d` desde `main`. No commitear en `main`.
- Suite actual: **81 tests verdes**. No debe bajar.

## Deviaciones respecto al spec (decididas al planificar)

1. **La guarda `startedOn` va en `expectedDosesOn`, no en `isActiveOn`.** El spec decía "también dentro de `isActiveOn`"; hacerlo ahí obligaría a cambiar `supabase/functions/_shared/schedule.ts` para mantener la paridad y a redesplegar `send-reminders`, que está fuera de alcance. Como `buildTodayDoses` pasa a delegar en `expectedDosesOn`, hereda la guarda igual. Efecto neto idéntico al que pedía el spec.
2. **`buildAdherence` cuenta la unión de "esperado ∪ filas reales"**, no solo lo esperado. Así una toma `taken`/`skipped` registrada sigue contando aunque hoy la medicina esté pausada, finalizada o su horario haya cambiado — el historial real nunca se pierde. El spec implicaba solo-esperado; esto es más correcto y no cambia ningún contrato visible.

---

## File Structure

**Crear:**
- `src/lib/adherence.ts` — motor puro de adherencia (tipos, `outcomeFor`, `buildAdherence`, `adherenceLabel`).
- `src/lib/adherence.test.ts` — Vitest de lo anterior.
- `src/lib/report.ts` — `buildReport`, `reportFileName`, `scheduleText` (puro).
- `src/lib/report.test.ts` — Vitest de lo anterior.
- `src/screens/ReportScreen.tsx` — pantalla del informe + generación de PDF.
- `src/components/DayTimeline.tsx` — timeline de un día (extraído de `CalendarScreen`), usado por semana y mes.

**Modificar:**
- `src/lib/schedule.ts` — añadir `expectedDosesOn`; refactor de `buildTodayDoses` para delegar en ella.
- `src/lib/schedule.test.ts` — tests de `expectedDosesOn` + regresión de `buildTodayDoses`.
- `src/data/sync.ts` — `backfillHistory`; `pullHistory` default 7 → 90.
- `src/App.tsx` — llamar `backfillHistory` tras `pullAll`; `pullHistory(…, 90)`; `ScreenId 'report'`; `skipDose` refresca `historyDoses`; cablear `ReportScreen`.
- `src/screens/CalendarScreen.tsx` — vista mensual real; usar `DayTimeline`.
- `src/screens/DetailScreen.tsx` — bloque de adherencia 30 días + tira.
- `src/screens/ProfileScreen.tsx` — fila "Informe para el médico".
- `src/i18n/strings.ts` — claves nuevas (`es` + `en`).
- `package.json` / `package-lock.json` — `jspdf`.

---

## Task 1: `expectedDosesOn` + refactor de `buildTodayDoses`

**Files:**
- Modify: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: nada nuevo. Usa las funciones ya presentes en `schedule.ts` (`isActiveOn`, `expandTimes`, `daysBetween`, `isoDate`, y las privadas `strToMin`).
- Produces:
  ```ts
  export function expectedDosesOn(
    meds: Medicine[],
    date: Date,
  ): { medId: string; time: string; totalMin: number }[]
  ```
  Lista ordenada por `totalMin` ascendente (orden estable: mismo `totalMin` conserva el orden de `meds` y luego el de `expandTimes`). Excluye medicinas cuyo `duration.startedOn` es posterior a `date`. `buildTodayDoses(meds, now)` mantiene su firma y comportamiento observable actuales.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/schedule.test.ts` (usa el helper `med()` que ya existe en ese fichero; si no existiera, míralo en `schedule.shared.test.ts` y cópialo):

```ts
describe('expectedDosesOn', () => {
  it('daily: todas las horas expandidas, ordenadas', () => {
    const m = med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([
      { medId: 'a', time: '08:00', totalMin: 480 },
      { medId: 'a', time: '20:00', totalMin: 1200 },
    ]);
  });

  it('weekdays: vacío si el día no está en la lista', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(expectedDosesOn([m], new Date(2026, 8, 1))).toEqual([]);  // martes
    expect(expectedDosesOn([m], new Date(2026, 7, 31)).length).toBe(1); // lunes
  });

  it('interval: hereda la expansión de expandTimes', () => {
    const m = med({ id: 'x', schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28)).map(d => d.time))
      .toEqual(['00:00', '08:00', '16:00']);
  });

  it('excluye una medicina cuyo tratamiento aún no ha empezado', () => {
    const m = med({ duration: { kind: 'ongoing', startedOn: '2026-09-01' } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([]);
    expect(expectedDosesOn([m], new Date(2026, 8, 1)).length).toBe(1);
  });

  it('excluye una medicina finalizada (duración en días)', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] },
      duration: { kind: 'days', days: 3, startedOn: '2026-08-20' } });
    expect(expectedDosesOn([m], new Date(2026, 7, 25))).toEqual([]); // día 5 > 3
    expect(expectedDosesOn([m], new Date(2026, 7, 21)).length).toBe(1); // día 1
  });

  it('excluye una medicina pausada', () => {
    const m = med({ paused: true });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([]);
  });

  it('varias medicinas: mezcla ordenada por hora', () => {
    const a = med({ id: 'a', schedule: { freq: 'daily', times: ['12:00'] } });
    const b = med({ id: 'b', schedule: { freq: 'daily', times: ['08:00'] } });
    expect(expectedDosesOn([a, b], new Date(2026, 7, 28)).map(d => `${d.medId}@${d.time}`))
      .toEqual(['b@08:00', 'a@12:00']);
  });
});

describe('buildTodayDoses tras el refactor (regresión)', () => {
  it('produce exactamente lo mismo que antes para el vector estándar', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const now = new Date(2026, 7, 28, 13, 0);
    expect(buildTodayDoses(meds, now)).toEqual([
      { id: 'a-2026-08-28-08:00', medId: 'a', time: '08:00', totalMin: 480, status: 'missed' },
      { id: 'b-2026-08-28-12:00', medId: 'b', time: '12:00', totalMin: 720, status: 'now' },
      { id: 'a-2026-08-28-20:00', medId: 'a', time: '20:00', totalMin: 1200, status: 'upcoming' },
    ]);
  });

  it('no genera dosis de una medicina no iniciada', () => {
    const m = med({ id: 'z', duration: { kind: 'ongoing', startedOn: '2026-09-01' } });
    expect(buildTodayDoses([m], new Date(2026, 7, 28, 9, 0))).toEqual([]);
  });
});
```

Asegúrate de que `expectedDosesOn` y `buildTodayDoses` están importadas en la cabecera del test (`import { …, expectedDosesOn, buildTodayDoses } from './schedule';`).

- [ ] **Step 2: Ejecutar los tests para verlos fallar**

Run: `npm run test -- schedule`
Expected: FAIL — `expectedDosesOn is not a function` (los de `expectedDosesOn`) y los de regresión pasan o fallan según el estado actual (deben quedar verdes al final).

- [ ] **Step 3: Implementar `expectedDosesOn` y refactorizar `buildTodayDoses`**

En `src/lib/schedule.ts`, reemplazar la función `buildTodayDoses` (líneas ~92-108) por:

```ts
// ─── Horario esperado de un día cualquiera ───────────────────────────────────

/**
 * Las tomas que TOCABAN el día `date` según la definición actual de cada
 * medicina. Sin estado temporal (eso es cosa de buildTodayDoses). Excluye
 * medicinas cuyo tratamiento aún no había empezado en esa fecha.
 */
export function expectedDosesOn(
  meds: Medicine[],
  date: Date,
): { medId: string; time: string; totalMin: number }[] {
  const out: { medId: string; time: string; totalMin: number }[] = [];
  for (const m of meds) {
    if (daysBetween(m.duration.startedOn, date) < 0) continue; // aún no empezado
    if (!isActiveOn(m, date)) continue;
    for (const t of expandTimes(m)) {
      const totalMin = strToMin(t);
      if (Number.isNaN(totalMin)) continue;
      out.push({ medId: m.id, time: t, totalMin });
    }
  }
  // sort estable → mismo totalMin conserva orden de `meds` y de expandTimes
  return out.sort((a, b) => a.totalMin - b.totalMin);
}

// ─── Dosis de hoy ────────────────────────────────────────────────────────────

export function buildTodayDoses(meds: Medicine[], now: Date): Dose[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = isoDate(now);
  return expectedDosesOn(meds, now).map(({ medId, time, totalMin }) => {
    const status: Dose['status'] =
      totalMin < nowMin - 30 ? 'missed'
      : totalMin < nowMin + 30 ? 'now'
      : 'upcoming';
    return { id: `${medId}-${today}-${time}`, medId, time, totalMin, status };
  });
}
```

(No cambies `isActiveOn`, `medState`, `expandTimes` ni ninguna otra función. `strToMin` ya está definida como función privada en el fichero — `expectedDosesOn` la usa igual que hacía `buildTodayDoses`.)

- [ ] **Step 4: Ejecutar los tests para verlos pasar**

Run: `npm run test -- schedule`
Expected: PASS — todos, incluidos `schedule.shared.test.ts` (la paridad con `_shared` se mantiene: los vectores no usan medicinas con `startedOn` futuro).

- [ ] **Step 5: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: lint sin errores, **81 + 9 = 90 tests** verdes, build OK.

```bash
git add src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): expectedDosesOn y refactor de buildTodayDoses

Motor determinista del horario esperado de cualquier fecha, con guarda
de 'tratamiento no iniciado'. buildTodayDoses delega en el.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Motor de adherencia — `src/lib/adherence.ts`

**Files:**
- Create: `src/lib/adherence.ts`
- Test: `src/lib/adherence.test.ts`

**Interfaces:**
- Consumes: `expectedDosesOn` de `./schedule` (Task 1), `isoDate` de `./schedule`, tipos `Medicine`/`Dose` de `../data/types`, `Lang` de `../i18n/strings`.
- Produces:
  ```ts
  export type DoseOutcome = 'taken' | 'skipped' | 'missed' | 'pending';

  export interface DayAdherence {
    date: string;      // YYYY-MM-DD
    taken: number; skipped: number; missed: number; pending: number;
    scheduled: number; // taken + skipped + missed + pending
  }
  export interface MedAdherence {
    medId: string;
    taken: number; skipped: number; missed: number;
    rate: number | null;   // taken / (taken + missed); null si denominador 0
  }
  export interface AdherenceSummary {
    from: string; to: string;
    taken: number; skipped: number; missed: number;
    rate: number | null;
    perMed: MedAdherence[];
    perDay: DayAdherence[];  // una entrada por CADA día de [from,to], orden asc
  }

  export function outcomeFor(
    row: { status: string } | undefined,
    dayISO: string, time: string, now: Date,
  ): DoseOutcome;

  export function buildAdherence(
    meds: Medicine[], rows: Dose[],
    fromISO: string, toISO: string, now: Date,
  ): AdherenceSummary;

  export function adherenceLabel(rate: number | null, lang: Lang): string;
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/adherence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { outcomeFor, buildAdherence, adherenceLabel } from './adherence';
import type { Medicine, Dose } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 30, ...over,
  };
}
function row(over: Partial<Dose> & { date: string }): Dose {
  return {
    id: `${over.medId ?? 'm1'}-${over.date}-${over.time ?? '08:00'}`,
    medId: 'm1', time: '08:00', totalMin: 480, status: 'upcoming', ...over,
  };
}

describe('outcomeFor', () => {
  const now = new Date(2026, 7, 28, 10, 0);
  it('taken / skipped directos', () => {
    expect(outcomeFor({ status: 'taken' }, '2026-08-28', '08:00', now)).toBe('taken');
    expect(outcomeFor({ status: 'skipped' }, '2026-08-28', '08:00', now)).toBe('skipped');
  });
  it('sin fila y hora ya pasada → missed', () => {
    expect(outcomeFor(undefined, '2026-08-28', '08:00', now)).toBe('missed');
  });
  it('sin fila y hora futura → pending', () => {
    expect(outcomeFor(undefined, '2026-08-28', '11:00', now)).toBe('pending');
  });
  it('fila upcoming/now se resuelve por la hora', () => {
    expect(outcomeFor({ status: 'upcoming' }, '2026-08-28', '08:00', now)).toBe('missed');
    expect(outcomeFor({ status: 'now' }, '2026-08-28', '12:00', now)).toBe('pending');
  });
  it('frontera: exactamente ahora cuenta como pending', () => {
    expect(outcomeFor(undefined, '2026-08-28', '10:00', now)).toBe('pending');
    expect(outcomeFor(undefined, '2026-08-28', '09:59', now)).toBe('missed');
  });
});

describe('buildAdherence', () => {
  const now = new Date(2026, 7, 28, 23, 59);

  it('rango de un día, todo tomado → rate 1', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } });
    const rows = [
      row({ date: '2026-08-28', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '20:00', status: 'taken' }),
    ];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 2, skipped: 0, missed: 0, rate: 1 });
    expect(a.perDay).toHaveLength(1);
    expect(a.perDay[0]).toMatchObject({ date: '2026-08-28', taken: 2, scheduled: 2 });
    expect(a.perMed[0]).toMatchObject({ medId: 'm1', taken: 2, rate: 1 });
  });

  it('día hueco (sin filas) en el pasado cuenta como olvidos', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] } });
    const a = buildAdherence([m], [], '2026-08-26', '2026-08-28', now);
    expect(a.missed).toBe(3);
    expect(a.rate).toBe(0);
    expect(a.perDay.map(d => d.date)).toEqual(['2026-08-26', '2026-08-27', '2026-08-28']);
  });

  it('omitidas fuera del ratio pero contadas', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } });
    const rows = [
      row({ date: '2026-08-28', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '20:00', status: 'skipped' }),
    ];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 1, skipped: 1, missed: 0, rate: 1 }); // 1/(1+0)
  });

  it('rate null cuando no hay ninguna toma debida (solo pending)', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] } });
    const future = new Date(2026, 7, 28, 6, 0);
    const a = buildAdherence([m], [], '2026-08-28', '2026-08-28', future);
    expect(a.rate).toBeNull();
    expect(a.perDay[0]).toMatchObject({ pending: 1, scheduled: 1 });
  });

  it('cuenta una fila taken aunque la medicina esté ahora pausada', () => {
    const m = med({ paused: true });
    const rows = [row({ date: '2026-08-28', time: '08:00', status: 'taken' })];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 1, rate: 1 });
  });

  it('ignora filas de una medicina que ya no existe', () => {
    const rows = [row({ date: '2026-08-28', medId: 'zombie', time: '08:00', status: 'taken' })];
    const a = buildAdherence([med()], rows, '2026-08-28', '2026-08-28', now);
    expect(a.taken).toBe(1); // la esperada de m1 (missed) + ... — comprobar:
    // m1 esperaba 08:00, sin fila → missed. zombie no cuenta.
    expect(a).toMatchObject({ taken: 0, missed: 1 });
  });

  it('medicina que empieza a mitad del rango', () => {
    const m = med({ duration: { kind: 'ongoing', startedOn: '2026-08-27' } });
    const a = buildAdherence([m], [], '2026-08-25', '2026-08-28', now);
    // solo 27 y 28 esperan dosis → 2 olvidos
    expect(a.missed).toBe(2);
    expect(a.perDay.filter(d => d.scheduled > 0).map(d => d.date))
      .toEqual(['2026-08-27', '2026-08-28']);
  });

  it('perMed en el orden de `meds`, solo con dosis esperadas', () => {
    const a = med({ id: 'a', schedule: { freq: 'weekdays', times: ['08:00'], weekdays: [1] } });
    const b = med({ id: 'b' });
    // 2026-08-28 es viernes → 'a' no espera nada
    const res = buildAdherence([a, b], [], '2026-08-28', '2026-08-28', now);
    expect(res.perMed.map(p => p.medId)).toEqual(['b']);
  });
});

describe('adherenceLabel', () => {
  it('umbrales', () => {
    expect(adherenceLabel(null, 'es')).toBe('—');
    expect(adherenceLabel(0.95, 'es')).toBe('Excelente');
    expect(adherenceLabel(0.8, 'es')).toBe('Buena');
    expect(adherenceLabel(0.5, 'es')).toBe('Irregular');
    expect(adherenceLabel(0.95, 'en')).toBe('Excellent');
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verlos fallar**

Run: `npm run test -- adherence`
Expected: FAIL — `Failed to resolve import "./adherence"`.

- [ ] **Step 3: Implementar `src/lib/adherence.ts`**

```ts
import type { Medicine, Dose } from '../data/types';
import type { Lang } from '../i18n/strings';
import { expectedDosesOn, isoDate } from './schedule';

export type DoseOutcome = 'taken' | 'skipped' | 'missed' | 'pending';

export interface DayAdherence {
  date: string;
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  scheduled: number;
}

export interface MedAdherence {
  medId: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
}

export interface AdherenceSummary {
  from: string;
  to: string;
  taken: number;
  skipped: number;
  missed: number;
  rate: number | null;
  perMed: MedAdherence[];
  perDay: DayAdherence[];
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function* eachDayISO(fromISO: string, toISO: string): Generator<string> {
  const end = isoToLocalDate(toISO).getTime();
  let cur = isoToLocalDate(fromISO);
  while (cur.getTime() <= end) {
    yield isoDate(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
}

function ratio(taken: number, missed: number): number | null {
  const denom = taken + missed;
  return denom === 0 ? null : taken / denom;
}

/** Estado de una toma: de la fila si existe y es definitiva; si no, por la hora. */
export function outcomeFor(
  row: { status: string } | undefined,
  dayISO: string,
  time: string,
  now: Date,
): DoseOutcome {
  if (row?.status === 'taken') return 'taken';
  if (row?.status === 'skipped') return 'skipped';
  const [h, m] = time.split(':').map(Number);
  const dt = isoToLocalDate(dayISO);
  dt.setHours(h, m, 0, 0);
  return dt.getTime() < now.getTime() ? 'missed' : 'pending';
}

/**
 * Adherencia en [fromISO, toISO] (inclusive). Cruza el horario esperado de cada
 * día con las filas `rows`. Cuenta también filas reales que ya no están
 * "esperadas" (medicina pausada/finalizada/horario cambiado) para no perder
 * historial — siempre que su medicina siga existiendo en `meds`.
 */
export function buildAdherence(
  meds: Medicine[],
  rows: Dose[],
  fromISO: string,
  toISO: string,
  now: Date,
): AdherenceSummary {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const rowsByDate = new Map<string, Dose[]>();
  for (const r of rows) {
    if (!r.date) continue;
    const list = rowsByDate.get(r.date);
    if (list) list.push(r);
    else rowsByDate.set(r.date, [r]);
  }
  const medIds = new Set(meds.map((m) => m.id));

  const perDay: DayAdherence[] = [];
  const medAcc = new Map<string, { taken: number; skipped: number; missed: number }>();
  let taken = 0;
  let skipped = 0;
  let missed = 0;

  for (const dayISO of eachDayISO(fromISO, toISO)) {
    const day = isoToLocalDate(dayISO);
    const seen = new Set<string>();
    const items: { medId: string; time: string; id: string }[] = [];

    for (const e of expectedDosesOn(meds, day)) {
      const id = `${e.medId}-${dayISO}-${e.time}`;
      seen.add(id);
      items.push({ medId: e.medId, time: e.time, id });
    }
    for (const r of rowsByDate.get(dayISO) ?? []) {
      if (seen.has(r.id) || !medIds.has(r.medId)) continue;
      seen.add(r.id);
      items.push({ medId: r.medId, time: r.time, id: r.id });
    }

    let dTaken = 0;
    let dSkipped = 0;
    let dMissed = 0;
    let dPending = 0;
    for (const it of items) {
      const oc = outcomeFor(rowById.get(it.id), dayISO, it.time, now);
      const acc = medAcc.get(it.medId) ?? { taken: 0, skipped: 0, missed: 0 };
      if (oc === 'taken') { dTaken++; acc.taken++; }
      else if (oc === 'skipped') { dSkipped++; acc.skipped++; }
      else if (oc === 'missed') { dMissed++; acc.missed++; }
      else dPending++;
      medAcc.set(it.medId, acc);
    }

    taken += dTaken;
    skipped += dSkipped;
    missed += dMissed;
    perDay.push({
      date: dayISO,
      taken: dTaken,
      skipped: dSkipped,
      missed: dMissed,
      pending: dPending,
      scheduled: dTaken + dSkipped + dMissed + dPending,
    });
  }

  const perMed: MedAdherence[] = meds
    .filter((m) => medAcc.has(m.id))
    .map((m) => {
      const a = medAcc.get(m.id)!;
      return { medId: m.id, taken: a.taken, skipped: a.skipped, missed: a.missed, rate: ratio(a.taken, a.missed) };
    });

  return { from: fromISO, to: toISO, taken, skipped, missed, rate: ratio(taken, missed), perMed, perDay };
}

export function adherenceLabel(rate: number | null, lang: Lang): string {
  if (rate === null) return '—';
  if (rate >= 0.9) return lang === 'es' ? 'Excelente' : 'Excellent';
  if (rate >= 0.7) return lang === 'es' ? 'Buena' : 'Good';
  return lang === 'es' ? 'Irregular' : 'Irregular';
}
```

- [ ] **Step 4: Ejecutar los tests para verlos pasar**

Run: `npm run test -- adherence`
Expected: PASS — los ~18 casos.

- [ ] **Step 5: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. **~108 tests**.

```bash
git add src/lib/adherence.ts src/lib/adherence.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): motor puro de adherencia

buildAdherence cruza el horario esperado con las filas reales (union
esperado + registrado), titular tomadas/(tomadas+olvidadas), omitidas
aparte, perDay con entrada por cada dia del rango.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `backfillHistory` + `pullHistory` 90 días + wiring en App

**Files:**
- Modify: `src/data/sync.ts`
- Modify: `src/App.tsx`
- Test: `src/lib/sync.backfill.test.ts` (crear)

**Interfaces:**
- Consumes: `expectedDosesOn` de `../lib/schedule` (Task 1). `supabase` de `../lib/supabase`. `isoDate` de `../lib/schedule`.
- Produces:
  ```ts
  export async function backfillHistory(
    uid: string, meds: Medicine[], days?: number,   // default 90
  ): Promise<number>   // nº de filas insertadas
  export async function pullHistory(userId: string, days?: number): Promise<Dose[]>  // default 90
  ```
  `backfillHistory` calcula los ids que deberían existir para los últimos `days` días (excluyendo hoy), resta los que ya están, e inserta el resto como `status: 'upcoming'` con un `upsert` batch `ignoreDuplicates`.

- [ ] **Step 1: Escribir el test que falla (lógica pura de selección de candidatos)**

`backfillHistory` habla con Supabase, así que el test cubre la **función pura de candidatos** que hay que extraer. Crear `src/lib/sync.backfill.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { backfillCandidates } from '../data/sync';
import type { Medicine } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-01-01' },
    stock: 30, ...over,
  };
}

describe('backfillCandidates', () => {
  const now = new Date(2026, 7, 28, 12, 0); // vie 28 ago

  it('genera una fila por día y hora esperada, excluyendo hoy', () => {
    const rows = backfillCandidates('u1', [med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } })], 3, new Set(), now);
    // días 25, 26, 27 (no el 28) × 2 tomas = 6
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      user_id: 'u1', med_id: 'm1', date: '2026-08-25', time: '08:00',
      total_min: 480, status: 'upcoming', id: 'm1-2026-08-25-08:00',
    });
    expect(rows.every(r => r.date !== '2026-08-28')).toBe(true);
  });

  it('no repite filas que ya existen', () => {
    const existing = new Set(['m1-2026-08-27-08:00']);
    const rows = backfillCandidates('u1', [med()], 3, existing, now);
    expect(rows.map(r => r.date)).toEqual(['2026-08-25', '2026-08-26']);
  });

  it('respeta startedOn: nada antes de que empiece el tratamiento', () => {
    const rows = backfillCandidates('u1', [med({ duration: { kind: 'ongoing', startedOn: '2026-08-27' } })], 5, new Set(), now);
    expect(rows.map(r => r.date)).toEqual(['2026-08-27']);
  });

  it('meds vacías → sin candidatos', () => {
    expect(backfillCandidates('u1', [], 90, new Set(), now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- backfill`
Expected: FAIL — `backfillCandidates` no exportada.

- [ ] **Step 3: Implementar en `src/data/sync.ts`**

Añadir el import de `expectedDosesOn` a la línea de import de `../lib/schedule`:

```ts
import { isoDate, expectedDosesOn } from '../lib/schedule';
```

Añadir, en la sección `History` (tras `pullHistory`):

```ts
interface DoseInsert {
  id: string;
  user_id: string;
  med_id: string;
  date: string;
  time: string;
  total_min: number;
  status: 'upcoming';
}

/**
 * Filas `doses` que DEBERÍAN existir para los últimos `days` días (sin contar
 * hoy) y aún no están en `existing`. Pura y testeable — `backfillHistory` la usa.
 */
export function backfillCandidates(
  uid: string,
  meds: Medicine[],
  days: number,
  existing: Set<string>,
  now: Date,
): DoseInsert[] {
  const out: DoseInsert[] = [];
  for (let i = 1; i <= days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = isoDate(day);
    for (const { medId, time, totalMin } of expectedDosesOn(meds, day)) {
      const id = `${medId}-${dateStr}-${time}`;
      if (existing.has(id)) continue;
      out.push({ id, user_id: uid, med_id: medId, date: dateStr, time, total_min: totalMin, status: 'upcoming' });
    }
  }
  return out;
}

/**
 * Al abrir la app: materializa las filas `doses` que faltan de los últimos
 * `days` días para que el historial y la adherencia sean estables. Nunca pisa
 * filas existentes (`ignoreDuplicates`). Devuelve cuántas insertó.
 */
export async function backfillHistory(uid: string, meds: Medicine[], days = 90): Promise<number> {
  if (!uid || meds.length === 0) return 0;
  const existing = new Set((await pullHistory(uid, days)).map((d) => d.id));
  const toInsert = backfillCandidates(uid, meds, days, existing, new Date());
  if (toInsert.length === 0) return 0;
  const { error } = await supabase.from('doses').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true });
  if (error) { console.error('[dosi] backfillHistory error:', error.message); return 0; }
  return toInsert.length;
}
```

Cambiar la firma de `pullHistory` (línea ~133): `days = 7` → `days = 90`.

Asegúrate de que `Medicine` está importado en `sync.ts` (ya lo está: `import type { Medicine, Dose, FreqKind, DurationKind } from './types';`).

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `npm run test -- backfill`
Expected: PASS.

- [ ] **Step 5: Cablear en `src/App.tsx`**

(a) Import: añadir `backfillHistory` a la línea de import de `./data/sync`:
```ts
import { pullAll, pullHistory, backfillHistory, pushMed, deleteMed, pushDose, pushDoses } from './data/sync';
```

(b) En el `useEffect` de arranque (línea ~172-177), cambiar a 90 y añadir el backfill sin bloquear el render:
```ts
      const [remote, history] = await Promise.all([
        pullAll(uid),
        pullHistory(uid, 90),
      ]);

      setHistoryDoses(history);

      if (remote) {
        setMeds(remote.meds);
        if (remote.doses.length > 0) {
          setDoses(remote.doses);
        } else {
          const fresh = buildTodayDoses(remote.meds, new Date());
          setDoses(fresh);
          pushDoses(fresh, uid);
        }
        // Rellena huecos del historial sin bloquear; refresca si insertó algo.
        backfillHistory(uid, remote.meds, 90)
          .then((n) => { if (n > 0) pullHistory(uid, 90).then(setHistoryDoses); })
          .catch(() => {});
      }
```

(c) En el cambio de cuenta (línea ~634-641), subir a 90 y añadir backfill:
```ts
              const [remote, history] = await Promise.all([pullAll(newUid), pullHistory(newUid, 90)]);
```
y tras `setHistoryDoses(history);` en ese bloque:
```ts
              if (remote) {
                backfillHistory(newUid, remote.meds, 90)
                  .then((n) => { if (n > 0) pullHistory(newUid, 90).then(setHistoryDoses); })
                  .catch(() => {});
              }
```
(Adapta a la forma exacta del bloque; si `remote` no está en scope ahí, usa `meds` del estado tras `setMeds`.)

(d) `skipDose` (línea ~347-354): que refresque `historyDoses` como hace `takeDose`. Tras `setDoses(ds => ds.map(...))`:
```ts
    setHistoryDoses(hs => hs.map(h => h.id === doseId ? { ...h, status: 'skipped' as const } : h));
```

- [ ] **Step 6: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. **~112 tests**.

```bash
git add src/data/sync.ts src/App.tsx src/lib/sync.backfill.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): backfillHistory y ventana de 90 dias

Al abrir la app materializa las filas doses que faltan de los ultimos 90
dias (ignoreDuplicates). pullHistory pasa a 90 dias. skipDose refresca
historyDoses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Vista mensual del calendario

**Files:**
- Create: `src/components/DayTimeline.tsx`
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `buildAdherence` de `../lib/adherence` (Task 2). `isoDate` de `../lib/schedule`. `Medicine`/`Dose` de `../data/types`. Componentes existentes: `Card`, `ProgressRing`, `SectionList`, `Badge`, `PillGlyph`, `SegmentedRow`, `TopBar`.
- Produces: `DayTimeline` reutilizable:
  ```ts
  interface DayTimelineProps {
    theme: Theme; t: (k: string) => string; lang: Lang;
    meds: Medicine[]; doses: Dose[]; // doses YA filtradas a ese día
    emptyText: string;
  }
  export default function DayTimeline(props: DayTimelineProps): JSX.Element
  ```

- [ ] **Step 1: Extraer `DayTimeline` (sin cambio de comportamiento)**

Crear `src/components/DayTimeline.tsx` con el bloque que hoy vive en `CalendarScreen.tsx` líneas ~176-211 (el `selectedDoses.map(...)` que pinta cada dosis con hora + `PillGlyph` + nombre + `Badge`). Firma según arriba. El `emptyText` sustituye al literal `'Sin dosis registradas' / 'No doses recorded'`.

```tsx
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import Badge from './Badge';
import PillGlyph from './PillGlyph';

interface DayTimelineProps {
  theme: Theme;
  t: (k: string) => string;
  lang: Lang;
  meds: Medicine[];
  doses: Dose[];
  emptyText: string;
}

export default function DayTimeline({ theme, t, lang, meds, doses, emptyText }: DayTimelineProps) {
  if (doses.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.textDim, fontSize: 14 }}>
        {emptyText}
      </div>
    );
  }
  return (
    <>
      {doses.map((dose, i) => {
        const med = meds.find((m) => m.id === dose.medId);
        if (!med) return null;
        const stKind = dose.status === 'taken' ? 'success'
          : dose.status === 'skipped' ? 'danger'
          : dose.status === 'missed' ? 'danger'
          : 'neutral';
        const stLabel = dose.status === 'taken' ? t('legendDone')
          : dose.status === 'skipped' ? (lang === 'es' ? 'Omitida' : 'Skipped')
          : dose.status === 'missed' ? (lang === 'es' ? 'Perdida' : 'Missed')
          : t('legendPending');
        return (
          <div key={i} style={{
            background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 50, fontSize: 13, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>
              {dose.time}
            </div>
            <PillGlyph color={med.color} size={36} form={med.form} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.text }}>{med.name}</div>
              <div style={{ fontSize: 12.5, color: theme.textDim }}>{med.dose}</div>
            </div>
            <Badge theme={theme} kind={stKind as 'success' | 'neutral' | 'danger'}>{stLabel}</Badge>
          </div>
        );
      })}
    </>
  );
}
```

En `CalendarScreen.tsx`, en la vista semana, sustituir el `SectionList` que hoy mapea `selectedDoses` por:
```tsx
<SectionList theme={theme} title={dayLabel(week[selected])}>
  <DayTimeline theme={theme} t={t} lang={lang} meds={meds}
    doses={dosesForDate(selectedDateStr)}
    emptyText={lang === 'es' ? 'Sin dosis registradas' : 'No doses recorded'} />
</SectionList>
```

- [ ] **Step 2: Verificar que la vista semana sigue igual**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde (no hay test unitario de estas pantallas; el gate es tipos + build). Comprobación manual en Step 6.

- [ ] **Step 3: Añadir claves i18n**

En `src/i18n/strings.ts`, bloque `es` (junto a `calendarTitle`/`week`/`month`, línea ~72):
```ts
  monthPrev: 'Mes anterior', monthNext: 'Mes siguiente',
  dosesThisMonth: 'dosis · este mes',
  noDosesDay: 'Sin dosis ese día',
  takenCountLabel: 'tomadas', missedCountLabel: 'olvidadas', skippedCountLabel: 'omitidas',
```
Bloque `en` (posición equivalente, línea ~285):
```ts
  monthPrev: 'Previous month', monthNext: 'Next month',
  dosesThisMonth: 'doses · this month',
  noDosesDay: 'No doses that day',
  takenCountLabel: 'taken', missedCountLabel: 'missed', skippedCountLabel: 'skipped',
```

- [ ] **Step 4: Implementar la vista mensual en `CalendarScreen.tsx`**

Reemplazar el bloque `else` del stub (líneas ~214-227) por una vista mensual real. Añadir estado y helpers al principio del componente:

```tsx
const [monthOffset, setMonthOffset] = useState(0); // 0 = mes actual, hasta -3

const monthView = useMemo(() => {
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDayISO = isoDate(new Date(Math.min(
    new Date(year, month, daysInMonth).getTime(),
    new Date().setHours(0, 0, 0, 0),
  )));
  const fromISO = isoDate(first);
  const summary = buildAdherence(meds, historyDoses, fromISO, lastDayISO, new Date());
  const perDay = new Map(summary.perDay.map(d => [d.date, d]));
  // rejilla: hueco inicial = (isoWeekday(first) - 1), luego 1..daysInMonth
  const lead = ((first.getDay() + 6) % 7);
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  return { year, month, cells, perDay, summary, monthLabel: `${monthNames[month]} ${year}` };
}, [monthOffset, meds, historyDoses]); // eslint-disable-line react-hooks/exhaustive-deps

const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
```

Render del `else` (vista mes):
```tsx
<>
  {/* Navegación de mes */}
  <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <button aria-label={t('monthPrev')} disabled={monthOffset <= -3}
      onClick={() => { setMonthOffset(o => Math.max(-3, o - 1)); setSelectedMonthDay(null); }}
      style={{ /* botón redondo como los de DetailScreen; opacity 0.35 si disabled */ }}>
      {I.back(18, theme.text)}
    </button>
    <div style={{ fontWeight: 700, fontSize: 15, color: theme.text, textTransform: 'capitalize' }}>
      {monthView.monthLabel}
    </div>
    <button aria-label={t('monthNext')} disabled={monthOffset >= 0}
      onClick={() => { setMonthOffset(o => Math.min(0, o + 1)); setSelectedMonthDay(null); }}
      style={{ /* espejo del anterior */ }}>
      {/* chevron derecha: I.back rotado 180 o el icono que exista */}
    </button>
  </div>

  {/* Cabecera de días L..D */}
  <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
    {tArr(lang, 'daysShort').map((d, i) => (
      <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: theme.textDim }}>{d}</div>
    ))}
  </div>

  {/* Rejilla */}
  <div style={{ padding: '6px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
    {monthView.cells.map((cell, i) => {
      if (!cell) return <div key={i} />;
      const dISO = isoDate(cell);
      const isFuture = cell.setHours(0,0,0,0) > new Date().setHours(0,0,0,0);
      const da = monthView.perDay.get(dISO);
      const due = da ? da.taken + da.missed + da.skipped : 0;
      const sel = selectedMonthDay === dISO;
      let dot: JSX.Element;
      if (isFuture || !da || due === 0) {
        dot = <div style={{ width: 7, height: 7, borderRadius: 4, background: theme.border }} />;
      } else if (da.missed + da.skipped === 0) {
        dot = <div style={{ width: 9, height: 9, borderRadius: 5, background: theme.success }} />;
      } else {
        dot = <ProgressRing theme={theme} value={da.taken / due} size={18} stroke={3} color={theme.success} />;
      }
      return (
        <button key={i} onClick={() => setSelectedMonthDay(sel ? null : dISO)} style={{
          aspectRatio: '1', borderRadius: 12, border: 0, cursor: 'pointer', fontFamily: 'inherit',
          background: sel ? theme.accent : 'transparent',
          color: sel ? theme.accentText : theme.text,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cell.getDate()}</span>
          {dot}
        </button>
      );
    })}
  </div>

  {/* Resumen del mes visible */}
  <div style={{ padding: '0 16px 16px' }}>
    <Card theme={theme} style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ProgressRing theme={theme} value={monthView.summary.rate ?? 0} size={64} color={theme.success} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif' }}>
            {monthView.summary.rate === null ? '—' : Math.round(monthView.summary.rate * 100) + '%'}
          </div>
          <div style={{ fontSize: 12.5, color: theme.textDim }}>
            {monthView.summary.skipped} {t('skippedCountLabel')} · {monthView.summary.missed} {t('missedCountLabel')} · {monthView.summary.taken + monthView.summary.missed} {t('dosesThisMonth')}
          </div>
        </div>
      </div>
    </Card>
  </div>

  {/* Timeline del día seleccionado */}
  {selectedMonthDay && (
    <SectionList theme={theme} title={selectedMonthDay}>
      <DayTimeline theme={theme} t={t} lang={lang} meds={meds}
        doses={dosesForDate(selectedMonthDay)}
        emptyText={t('noDosesDay')} />
    </SectionList>
  )}
</>
```

Notas de implementación:
- `dosesForDate` ya existe en el componente; sirve para cualquier fecha dentro de `historyDoses` (90 días).
- Import nuevos en `CalendarScreen.tsx`: `buildAdherence` de `../lib/adherence`, `DayTimeline` de `../components/DayTimeline`, `I` de `../icons` (si no está ya), y `tArr` ya está.
- El botón "mes siguiente" necesita un chevron a la derecha: si `../icons` no tiene uno, usa `I.back` con `style={{ transform: 'rotate(180deg)' }}`.
- Reutiliza `monthNames` que ya está definido en el componente (línea ~68).
- **Nunca** llames a `buildAdherence` dentro del `.map` de celdas — se llama una vez en el `useMemo` y las celdas leen del `Map`.

- [ ] **Step 5: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 6: Verificación manual (dev server)**

Arrancar `npm run dev`, abrir el calendario, alternar a "Mes":
- Rejilla del mes actual con días alineados a L..D.
- Puntos: verde lleno en días 100% tomados, anillo parcial en días mixtos, gris en días sin dosis o futuros.
- ‹ retrocede hasta 3 meses (botón se deshabilita); › no pasa del mes actual.
- Tap en un día → timeline debajo; tap de nuevo → se cierra.
- Tarjeta resumen con % del mes visible.

- [ ] **Step 7: Commit**

```bash
git add src/components/DayTimeline.tsx src/screens/CalendarScreen.tsx src/i18n/strings.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): vista mensual del calendario

Rejilla del mes con color por dia segun adherencia, navegacion hasta 3
meses atras, tap -> timeline del dia. DayTimeline extraido y compartido
con la vista semana.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Adherencia por medicina en `DetailScreen`

**Files:**
- Modify: `src/screens/DetailScreen.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `buildAdherence` de `../lib/adherence` (Task 2). `isoDate` de `../lib/schedule` (ya importado en el fichero). `historyDoses` (prop ya existente, filtrada a esta medicina en `App.tsx`).
- Produces: nada nuevo para otras tasks.

- [ ] **Step 1: Añadir claves i18n**

`es` (junto a `adherence`, línea ~74):
```ts
  adherence30: 'Adherencia 30 días',
```
`en` (línea ~286):
```ts
  adherence30: 'Adherence · 30 days',
```
(`takenCountLabel`/`missedCountLabel`/`skippedCountLabel` ya se añadieron en Task 4.)

- [ ] **Step 2: Implementar el bloque en `DetailScreen.tsx`**

Import nuevo: `import { buildAdherence } from '../lib/adherence';`

Dentro del componente, tras el cálculo de `history` (línea ~60), añadir:

```tsx
const from30 = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
const adh = buildAdherence([med], historyDoses, from30, isoToday, now);
const am = adh.perMed[0] ?? null;
const hasAdh = am !== null && (am.taken + am.missed + am.skipped) > 0;
```

En la tarjeta "History" (línea ~210), justo debajo del título `{t('history')}` y antes del `history.length === 0 ? …`:

```tsx
{hasAdh && (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, color: theme.textDim }}>{t('adherence30')}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif' }}>
        {am!.rate === null ? '—' : Math.round(am!.rate * 100) + '%'}
      </span>
    </div>
    {(am!.skipped > 0 || am!.missed > 0) && (
      <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>
        {am!.skipped} {t('skippedCountLabel')} · {am!.missed} {t('missedCountLabel')}
      </div>
    )}
    {/* tira de 30 días */}
    <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
      {adh.perDay.map((d, i) => {
        const due = d.taken + d.missed + d.skipped;
        const bg = due === 0 ? theme.border
          : d.missed + d.skipped === 0 ? theme.success
          : d.taken === 0 ? theme.danger
          : theme.warn;
        const isToday = i === adh.perDay.length - 1;
        return (
          <div key={d.date} title={d.date} style={{
            flex: 1, height: 22, borderRadius: 3, background: bg,
            outline: isToday ? `2px solid ${theme.text}` : 'none', outlineOffset: 1,
          }} />
        );
      })}
    </div>
  </div>
)}
```

Notas:
- `adh.perDay` tiene exactamente 30 entradas (rango de 30 días inclusive) en orden ascendente → alinea con la tira sin comprobaciones.
- `theme.warn` para el estado "mixto" (parte tomada, parte no) — existe en `src/theme/tokens.ts`.
- `now` ya está definido en el componente (línea ~47: `const now = new Date();`). `isoToday` también (línea ~58).

- [ ] **Step 3: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 4: Verificación manual**

`npm run dev` → abrir el detalle de una medicina con historial: aparece "Adherencia 30 días · N%", las cifras de omitidas/olvidadas si las hay, y la tira de 30 celdas con la de hoy resaltada. Una medicina recién creada sin tomas debidas: no aparece el bloque, solo la lista.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DetailScreen.tsx src/i18n/strings.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): adherencia de 30 dias en el detalle de la medicina

% + desglose omitidas/olvidadas + tira de 30 dias sobre la tarjeta de
historial.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `src/lib/report.ts`

**Files:**
- Create: `src/lib/report.ts`
- Test: `src/lib/report.test.ts`

**Interfaces:**
- Consumes: `buildAdherence`/`AdherenceSummary` de `./adherence` (Task 2). `expandTimes` de `./schedule`. `Medicine`/`Dose` de `../data/types`.
- Produces:
  ```ts
  export interface ReportIncident { dateISO: string; time: string; medName: string; kind: 'missed' | 'skipped'; }
  export interface ReportMedLine { name: string; scheduleText: string; taken: number; missed: number; skipped: number; rate: number | null; }
  export interface ReportData {
    userName: string; fromISO: string; toISO: string; generatedISO: string;
    summary: AdherenceSummary; medLines: ReportMedLine[];
    incidents: ReportIncident[]; activeMedCount: number;
  }
  export function buildReport(meds: Medicine[], rows: Dose[], fromISO: string, toISO: string, now: Date, userName: string): ReportData;
  export function reportFileName(userName: string, fromISO: string, toISO: string): string;
  export function scheduleText(med: Medicine): string;
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReport, reportFileName, scheduleText } from './report';
import type { Medicine, Dose } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'Sintrom', dose: '4 mg', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-01-01' },
    stock: 30, ...over,
  };
}
function row(o: Partial<Dose> & { date: string }): Dose {
  return { id: `m1-${o.date}-${o.time ?? '08:00'}`, medId: 'm1', time: '08:00', totalMin: 480, status: 'upcoming', ...o };
}

describe('scheduleText', () => {
  it('daily → horas', () => {
    expect(scheduleText(med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } }))).toBe('08:00, 20:00');
  });
  it('weekdays → prefijo de días', () => {
    expect(scheduleText(med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } })))
      .toBe('L, X, V · 09:00');
  });
});

describe('reportFileName', () => {
  it('sanea nombre con acentos y espacios', () => {
    expect(reportFileName('Ana Pérez', '2026-06-01', '2026-08-30'))
      .toBe('dosi-informe-ana-perez-2026-06-01-2026-08-30.pdf');
  });
  it('nombre vacío → paciente', () => {
    expect(reportFileName('', '2026-06-01', '2026-08-30')).toBe('dosi-informe-paciente-2026-06-01-2026-08-30.pdf');
  });
});

describe('buildReport', () => {
  const now = new Date(2026, 7, 28, 23, 59);

  it('estructura básica', () => {
    const rows = [
      row({ date: '2026-08-27', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '08:00', status: 'skipped' }),
    ];
    const r = buildReport([med()], rows, '2026-08-26', '2026-08-28', now, 'Ana');
    expect(r.userName).toBe('Ana');
    expect(r.activeMedCount).toBe(1);
    expect(r.medLines[0]).toMatchObject({ name: 'Sintrom', taken: 1, skipped: 1, missed: 1 });
    // incidencias: 26 olvidada + 28 omitida, ordenadas asc
    expect(r.incidents.map(i => `${i.dateISO}/${i.kind}`)).toEqual(['2026-08-26/missed', '2026-08-28/skipped']);
  });

  it('rango sin dosis debidas → summary.rate null, sin incidencias', () => {
    const future = new Date(2026, 7, 28, 6, 0);
    const r = buildReport([med()], [], '2026-08-28', '2026-08-28', future, 'Ana');
    expect(r.summary.rate).toBeNull();
    expect(r.incidents).toEqual([]);
  });

  it('meds vacías o rango invertido no lanzan', () => {
    expect(() => buildReport([], [], '2026-08-28', '2026-08-01', now, 'Ana')).not.toThrow();
    const r = buildReport([], [], '2026-08-28', '2026-08-01', now, 'Ana');
    expect(r.medLines).toEqual([]);
    expect(r.summary.rate).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- report`
Expected: FAIL — no se resuelve `./report`.

- [ ] **Step 3: Implementar `src/lib/report.ts`**

```ts
import type { Medicine, Dose } from '../data/types';
import { buildAdherence, type AdherenceSummary } from './adherence';
import { expandTimes, expectedDosesOn } from './schedule';

export interface ReportIncident {
  dateISO: string;
  time: string;
  medName: string;
  kind: 'missed' | 'skipped';
}

export interface ReportMedLine {
  name: string;
  scheduleText: string;
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
  incidents: ReportIncident[];
  activeMedCount: number;
}

const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function scheduleText(med: Medicine): string {
  const times = expandTimes(med).join(', ');
  if (med.schedule.freq === 'weekdays' && med.schedule.weekdays?.length) {
    const days = [...med.schedule.weekdays].sort((a, b) => a - b).map((d) => WD[d - 1]).join(', ');
    return `${days} · ${times}`;
  }
  return times;
}

export function reportFileName(userName: string, fromISO: string, toISO: string): string {
  const slug = userName
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita diacríticos
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'paciente';
  return `dosi-informe-${slug}-${fromISO}-${toISO}.pdf`;
}

export function buildReport(
  meds: Medicine[],
  rows: Dose[],
  fromISO: string,
  toISO: string,
  now: Date,
  userName: string,
): ReportData {
  const summary = buildAdherence(meds, rows, fromISO, toISO, now);
  const nameById = new Map(meds.map((m) => [m.id, m.name]));

  const medLines: ReportMedLine[] = summary.perMed.map((pm) => {
    const med = meds.find((m) => m.id === pm.medId)!;
    return {
      name: med.name,
      scheduleText: scheduleText(med),
      taken: pm.taken,
      missed: pm.missed,
      skipped: pm.skipped,
      rate: pm.rate,
    };
  });

  // Incidencias: recorrer día a día el horario esperado y clasificar cada
  // toma no-tomada. (perDay da conteos, no fecha·hora exacta — por eso se
  // recorre aquí en vez de derivarlo del summary.)
  const incidents: ReportIncident[] = [];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const end = isoToLocal(toISO).getTime();
  for (let d = isoToLocal(fromISO); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dISO = localToISO(d);
    for (const { medId, time } of expectedDosesOn(meds, d)) {
      const row = rowById.get(`${medId}-${dISO}-${time}`);
      if (row?.status === 'taken') continue;
      const medName = nameById.get(medId) ?? '';
      if (row?.status === 'skipped') {
        incidents.push({ dateISO: dISO, time, medName, kind: 'skipped' });
        continue;
      }
      const [h, m] = time.split(':').map(Number);
      const dt = isoToLocal(dISO);
      dt.setHours(h, m, 0, 0);
      if (dt.getTime() < now.getTime()) {
        incidents.push({ dateISO: dISO, time, medName, kind: 'missed' });
      }
    }
  }
  incidents.sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time));

  return {
    userName,
    fromISO,
    toISO,
    generatedISO: localToISO(now),
    summary,
    medLines,
    incidents,
    activeMedCount: summary.perMed.length,
  };
}

function isoToLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function localToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Ejecutar para verlo pasar**

Run: `npm run test -- report`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. **~123 tests**.

```bash
git add src/lib/report.ts src/lib/report.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): buildReport (estructura del informe medico)

Resumen de adherencia, linea por medicina con pauta legible, y lista
cronologica de olvidos/omisiones. reportFileName sanea el nombre.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ReportScreen` + PDF + entrada en Perfil + wiring

**Files:**
- Modify: `package.json` (+ `package-lock.json` por `npm install`)
- Create: `src/screens/ReportScreen.tsx`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `buildReport`/`reportFileName`/`ReportData` de `../lib/report` (Task 6). `isoDate` de `../lib/schedule`. `jspdf` (nuevo). `meds` + `historyDoses` + `userName` desde `App.tsx`.
- Produces: `ScreenId` gana `'report'`.

- [ ] **Step 1: Instalar jsPDF**

Run: `npm install jspdf@^3`
Expected: `jspdf` en `dependencies` de `package.json`, `package-lock.json` actualizado. jsPDF trae sus propios tipos.

Verificar que **no** rompe el build: `npm run build` → OK.

- [ ] **Step 2: Añadir claves i18n**

`es`:
```ts
  reportForDoctor: 'Informe para el médico',
  reportTitle: 'Informe de adherencia',
  reportPeriod: 'Periodo', reportPeriod30: '30 días', reportPeriod90: '90 días',
  reportSavePdf: 'Guardar PDF', reportGenerating: 'Generando…',
  reportError: 'No se pudo generar el PDF',
  reportShareTitle: 'Informe de adherencia · Dosi',
  reportGeneratedOn: 'Generado el {date}',
  reportSummaryHeading: 'Resumen',
  reportMedTableHeading: 'Por medicina',
  reportIncidentsHeading: 'Olvidos y omisiones',
  reportNoIncidents: 'Sin olvidos ni omisiones en el periodo',
  reportNoData: 'Sin dosis registradas en el periodo',
  reportFooter: 'Generado por Dosi · los datos los introduce el paciente o su familia · no sustituye el registro clínico.',
  reportColMed: 'Medicina', reportColSchedule: 'Pauta', reportColTaken: 'Tom.',
  reportColMissed: 'Olv.', reportColSkipped: 'Omit.', reportColRate: '%',
  reportSummaryLine: '{taken} tomadas · {missed} olvidadas · {skipped} omitidas · {meds} medicinas',
  historySectionTitle: 'Historial',
```
`en`:
```ts
  reportForDoctor: 'Report for the doctor',
  reportTitle: 'Adherence report',
  reportPeriod: 'Period', reportPeriod30: '30 days', reportPeriod90: '90 days',
  reportSavePdf: 'Save PDF', reportGenerating: 'Generating…',
  reportError: 'Could not generate the PDF',
  reportShareTitle: 'Adherence report · Dosi',
  reportGeneratedOn: 'Generated on {date}',
  reportSummaryHeading: 'Summary',
  reportMedTableHeading: 'By medication',
  reportIncidentsHeading: 'Missed and skipped doses',
  reportNoIncidents: 'No missed or skipped doses in the period',
  reportNoData: 'No doses recorded in the period',
  reportFooter: 'Generated by Dosi · data entered by the patient or family · not a substitute for clinical records.',
  reportColMed: 'Medication', reportColSchedule: 'Schedule', reportColTaken: 'Taken',
  reportColMissed: 'Missed', reportColSkipped: 'Skipped', reportColRate: '%',
  reportSummaryLine: '{taken} taken · {missed} missed · {skipped} skipped · {meds} medications',
  historySectionTitle: 'History',
```

- [ ] **Step 3: Crear `src/screens/ReportScreen.tsx`**

Patrón: pantalla completa con botón atrás standalone arriba-izquierda (como `DetailScreen`/`CaregiverScreen`). `SegmentedRow` 30/90. Vista previa. Botón "Guardar PDF" con import dinámico.

```tsx
import { useMemo, useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import { isoDate } from '../lib/schedule';
import { buildReport, reportFileName } from '../lib/report';
import { I } from '../icons';
import Card from '../components/Card';
import SegmentedRow from '../components/SegmentedRow';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  meds: Medicine[];
  historyDoses: Dose[];
  userName: string;
  onBack: () => void;
}

export default function ReportScreen({ theme, t, lang, meds, historyDoses, userName, onBack }: Props) {
  const [days, setDays] = useState<'30' | '90'>('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => {
    const n = days === '30' ? 30 : 90;
    const from = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1)));
    return buildReport(meds, historyDoses, from, isoDate(now), now, userName || (lang === 'es' ? 'Paciente' : 'Patient'));
  }, [days, meds, historyDoses, now, userName, lang]);

  async function savePdf() {
    setBusy(true); setErr(false);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      renderPdf(doc, data, t, lang);
      const blob = doc.output('blob');
      const file = new File([blob], reportFileName(data.userName, data.fromISO, data.toISO), { type: 'application/pdf' });
      // navigator.canShare / share con archivos (móvil/PWA); si no, descarga
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: t('reportShareTitle') });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      console.error('[dosi] report pdf', e);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  const pct = data.summary.rate === null ? '—' : Math.round(data.summary.rate * 100) + '%';

  return (
    <div style={{ padding: '8px 16px 120px' }}>
      <button onClick={onBack} style={{
        width: 42, height: 42, borderRadius: 14, background: theme.surface,
        border: `1px solid ${theme.border}`, color: theme.text, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {I.back(20, theme.text)}
      </button>

      <h1 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, fontWeight: 500, color: theme.text, margin: '14px 0 4px' }}>
        {t('reportForDoctor')}
      </h1>

      <div style={{ margin: '12px 0' }}>
        <SegmentedRow theme={theme} value={days} onChange={(v) => setDays(v as '30' | '90')}
          options={[{ id: '30', label: t('reportPeriod30') }, { id: '90', label: t('reportPeriod90') }]} />
      </div>

      {/* Vista previa */}
      <Card theme={theme} style={{ padding: 18 }}>
        <div style={{ fontSize: 12.5, color: theme.textDim }}>
          {data.userName} · {data.fromISO} – {data.toISO}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif', lineHeight: 1.1, marginTop: 6 }}>
          {pct}
        </div>
        <div style={{ fontSize: 13, color: theme.textDim }}>
          {t('reportSummaryLine', { taken: data.summary.taken, missed: data.summary.missed, skipped: data.summary.skipped, meds: data.activeMedCount })}
        </div>
      </Card>

      {data.medLines.length > 0 && (
        <Card theme={theme} style={{ padding: 18, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            {t('reportMedTableHeading')}
          </div>
          {data.medLines.map((ml) => (
            <div key={ml.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, fontSize: 13.5 }}>
              <span style={{ color: theme.text }}>{ml.name}</span>
              <span style={{ color: theme.textDim }}>
                {ml.taken}/{ml.taken + ml.missed} · {ml.rate === null ? '—' : Math.round(ml.rate * 100) + '%'}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card theme={theme} style={{ padding: 18, marginTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          {t('reportIncidentsHeading')}
        </div>
        {data.incidents.length === 0 ? (
          <div style={{ fontSize: 13.5, color: theme.textDim }}>{t('reportNoIncidents')}</div>
        ) : data.incidents.slice(0, 40).map((inc, i) => (
          <div key={i} style={{ fontSize: 13, color: theme.text, padding: '3px 0' }}>
            {inc.dateISO} {inc.time} · {inc.medName} · {inc.kind === 'missed' ? t('missedCountLabel') : t('skippedCountLabel')}
          </div>
        ))}
      </Card>

      {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 12 }}>{t('reportError')}</div>}

      <Btn theme={theme} kind="primary" size="md" style={{ width: '100%', marginTop: 16 }} onClick={savePdf} disabled={busy}>
        {busy ? t('reportGenerating') : t('reportSavePdf')}
      </Btn>
    </div>
  );
}

// ─── Dibujo del PDF ──────────────────────────────────────────────────────────
function renderPdf(
  doc: import('jspdf').jsPDF,
  data: import('../lib/report').ReportData,
  t: (k: string, v?: Record<string, string | number>) => string,
  lang: Lang,
) {
  const M = 48;
  let y = 64;
  const line = (txt: string, size = 11, gap = 16) => { doc.setFontSize(size); doc.text(txt, M, y); y += gap; };

  doc.setFont('helvetica', 'bold'); line(`${t('reportTitle')} — ${data.userName}`, 16, 22);
  doc.setFont('helvetica', 'normal');
  line(`${data.fromISO}  –  ${data.toISO}`, 11, 14);
  line(t('reportGeneratedOn', { date: data.generatedISO }), 10, 22);

  const pct = data.summary.rate === null ? '—' : Math.round(data.summary.rate * 100) + '%';
  doc.setFont('helvetica', 'bold'); line(t('reportSummaryHeading'), 12, 16);
  doc.setFont('helvetica', 'normal');
  line(`${t('adherence')}: ${pct}`, 11, 14);
  line(t('reportSummaryLine', { taken: data.summary.taken, missed: data.summary.missed, skipped: data.summary.skipped, meds: data.activeMedCount }), 11, 22);

  if (data.medLines.length === 0) {
    line(t('reportNoData'), 11, 20);
  } else {
    doc.setFont('helvetica', 'bold'); line(t('reportMedTableHeading'), 12, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text([t('reportColMed'), t('reportColSchedule'), t('reportColTaken'), t('reportColMissed'), t('reportColSkipped'), t('reportColRate')].join('   |   '), M, y);
    y += 14;
    for (const ml of data.medLines) {
      const rate = ml.rate === null ? '—' : Math.round(ml.rate * 100) + '%';
      doc.text(`${ml.name}  |  ${ml.scheduleText}  |  ${ml.taken}  |  ${ml.missed}  |  ${ml.skipped}  |  ${rate}`, M, y);
      y += 13;
      if (y > 760) { doc.addPage(); y = 64; }
    }
    y += 10;
  }

  doc.setFont('helvetica', 'bold'); line(t('reportIncidentsHeading'), 12, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  if (data.incidents.length === 0) {
    line(t('reportNoIncidents'), 10, 16);
  } else {
    for (const inc of data.incidents) {
      const kind = inc.kind === 'missed' ? t('missedCountLabel') : t('skippedCountLabel');
      doc.text(`${inc.dateISO} ${inc.time} · ${inc.medName} · ${kind}`, M, y);
      y += 12;
      if (y > 780) { doc.addPage(); y = 64; }
    }
  }

  doc.setFontSize(8);
  doc.text(t('reportFooter'), M, 812, { maxWidth: 500 });
  void lang;
}
```

Notas:
- `void lang;` evita el `noUnusedParameters` si al final no se usa `lang` en `renderPdf` — mejor: quitar el parámetro `lang` de `renderPdf` y su argumento si de verdad no se usa. Ajustar según quede.
- Comprobar la firma real de `SegmentedRow` (`value`/`onChange`/`options` con `{id,label}`) en `src/components/SegmentedRow.tsx` y la de `Btn` (`kind`, `size`, `disabled`) en `src/components/Btn.tsx` — adaptar props si difieren.
- Comprobar que `I.back` existe en `src/icons` (lo usan `DetailScreen`/`CaregiverScreen`, así que sí).

- [ ] **Step 4: Entrada en `ProfileScreen.tsx`**

Añadir prop `onOpenReport: () => void` a la interfaz de props. Añadir una fila en una sección "Historial" (nueva `SectionList`/`Card` con título `t('historySectionTitle')`), o como fila suelta junto a la sección de cuenta, siguiendo el patrón visual de las filas existentes (icono + label + chevron). Solo renderizarla si hay datos — el gate lo pone `App.tsx` al pasar la prop (ver Step 5), pero por robustez añadir también:
```tsx
{onOpenReport && (
  <button onClick={onOpenReport} style={{ /* mismo estilo que las otras filas de Perfil */ }}>
    {I.doc?.(18, theme.text) ?? I.share(18, theme.text)} {t('reportForDoctor')}
  </button>
)}
```
Usar el icono que exista (`I.share` es seguro; si hay uno de documento, mejor). Copiar el estilo exacto de una fila vecina (p. ej. la de "Recordatorios" o "Sobre Dosi").

- [ ] **Step 5: Wiring en `src/App.tsx`**

(a) `ScreenId` (línea 35): añadir `'report'`:
```ts
export type ScreenId = 'onboarding' | 'main' | 'addMed' | 'detail' | 'caregiver' | 'report';
```

(b) Import: `import ReportScreen from './screens/ReportScreen';`

(c) Rama de render — junto a `else if (screen === 'caregiver')` (línea ~456):
```tsx
  } else if (screen === 'report') {
    return (
      <ReportScreen
        theme={theme} t={t} lang={lang}
        meds={meds}
        historyDoses={historyDoses}
        userName={userName}
        onBack={() => { setScreen('main'); setTab('profile'); }}
      />
    );
```

(d) `ProfileScreen` (línea ~501): pasar la prop, condicionada a que haya datos:
```tsx
          onOpenReport={meds.length > 0 ? () => setScreen('report') : undefined}
```
(ajustar el tipo de la prop en `ProfileScreen` a `onOpenReport?: () => void`).

- [ ] **Step 6: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. Verificar en el output de `vite build` que **`jspdf` sale en un chunk aparte** (algo como `dist/assets/jspdf-*.js`), no dentro del bundle principal — confirma el import dinámico.

- [ ] **Step 7: Verificación manual**

`npm run dev`:
- Perfil → "Informe para el médico" (solo si hay medicinas) → abre `ReportScreen`.
- Alternar 30/90 días cambia la vista previa.
- "Guardar PDF": en escritorio descarga `dosi-informe-....pdf`; abrir el PDF y comprobar cabecera, resumen, tabla por medicina, lista de incidencias, pie.
- Botón "atrás" vuelve a Perfil.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/screens/ReportScreen.tsx src/screens/ProfileScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "$(cat <<'EOF'
feat(pieza-d): pantalla de informe y PDF para el medico

ReportScreen con periodo 30/90 dias, vista previa y generacion de PDF
con jsPDF (import dinamico). Entrada en Perfil. navigator.share con
fallback a descarga.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Retoques finales de i18n y limpieza

**Files:**
- Modify: `src/i18n/strings.ts` (si falta alguna clave)
- Modify: cualquier pantalla con un literal que se coló

**Interfaces:** ninguna.

- [ ] **Step 1: Barrido de literales**

Buscar strings visibles hardcodeados introducidos en esta pieza que no sean el patrón `lang === 'es' ? … : …` ya aceptado:
```
grep -rn "'[A-ZÁÉÍÓÚ][a-záéíóú].*'" src/screens/ReportScreen.tsx src/components/DayTimeline.tsx
```
Mover a `strings.ts` los que sean texto de UI fijo.

- [ ] **Step 2: Verificar paridad es/en**

Comprobar a ojo que toda clave nueva en el bloque `es` existe también en `en`. (No hay test automático de esto en el repo.)

- [ ] **Step 3: Gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(pieza-d): barrido de i18n

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
(Si no hay cambios, saltar el commit.)

---

## Verificación final de la rama (antes de la revisión de rama completa)

- [ ] `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — verde, ~123+ tests.
- [ ] `npm run dev` y recorrer el checklist E2E del usuario (abajo).
- [ ] `git log --oneline main..feat/web-pieza-d` — 7-8 commits limpios.

## Checklist E2E para el usuario (tras la revisión, antes del merge)

1. Abrir la app con una cuenta que tenga varios días de historial (o crear medicinas y dejar pasar tomas / usar el SQL Editor de Supabase para insertar filas `doses` de prueba en días pasados — Claude no puede escribir en la BD).
2. **Calendario → Mes:** rejilla del mes actual, colores por día, ‹ › navega 3 meses, tap en día abre el timeline.
3. **Calendario → Semana:** sigue funcionando igual que antes (regresión).
4. **Detalle de una medicina:** "Adherencia 30 días · N%", cifras de omitidas/olvidadas, tira de 30 días.
5. **Perfil → Informe para el médico:** cambia 30/90, "Guardar PDF" → se comparte (móvil) o descarga (escritorio); el PDF tiene cabecera, resumen, tabla y lista de incidencias.
6. Cerrar y reabrir la app: el backfill no duplica nada; el historial es estable.
7. Cuenta anónima recién creada sin medicinas: no aparece "Informe para el médico"; el mes se ve vacío sin errores.

---

## Self-Review (hecho por el planificador)

**1. Cobertura del spec:**
- `expectedDosesOn` + guarda startedOn → Task 1. ✅
- `backfillHistory` → Task 3. ✅
- `adherence.ts` (outcomeFor, buildAdherence, adherenceLabel, tipos) → Task 2. ✅
- Vista mensual (rejilla, navegación 3 meses, tap→timeline, tarjeta resumen, una sola llamada a buildAdherence) → Task 4. ✅
- `DayTimeline` compartido semana/mes → Task 4. ✅
- DetailScreen 30 días + tira → Task 5. ✅
- `pullHistory` 7→90 → Task 3. ✅
- `report.ts` (buildReport, reportFileName, scheduleText) → Task 6. ✅
- `ReportScreen` + jsPDF dinámico + share/fallback + Profile entry + ScreenId 'report' → Task 7. ✅
- i18n es/en → Tasks 4,5,7,8. ✅
- Casos límite del spec (backfill offline, horario editado, med borrada, med reciente, navigator.share ausente, rango vacío, anónimo, jsPDF en bundle, cambio de cuenta) → cubiertos en el código de las tasks + tests de `adherence`/`report` + checklist E2E. ✅
- Fuera de alcance respetado: no se toca el cuidador, ni `_shared`, ni `send-reminders`, sin migración, sin purga. ✅

**2. Placeholders:** todos los bloques de lógica (Tasks 1, 2, 3, 6) son código completo y ejecutable. Los `/* estilo … */` en Tasks 4 y 7 remiten a un patrón concreto y existente del mismo fichero (filas de Perfil, botones redondos de DetailScreen) — aceptable para pasos de UI, no son lógica. El PDF (`renderPdf`) está completo salvo el ajuste anotado sobre el parámetro `lang`.

**3. Consistencia de tipos:**
- `expectedDosesOn(meds, date) → {medId, time, totalMin}[]` — misma firma en Tasks 1, 2, 3, 6. ✅
- `AdherenceSummary` / `MedAdherence` / `DayAdherence` — definidos en Task 2, consumidos con los mismos nombres de campo (`rate`, `perDay`, `perMed`, `taken`, `missed`, `skipped`, `pending`, `scheduled`) en Tasks 4, 5, 6, 7. ✅
- `buildAdherence(meds, rows, fromISO, toISO, now)` — mismo orden de args en todas las llamadas. ✅
- `ReportData` — definido en Task 6, consumido en Task 7. ✅
- `backfillHistory(uid, meds, days)` / `backfillCandidates(uid, meds, days, existing, now)` — firmas estables entre Task 3 Steps. ✅
- `DayTimeline` props — definido y consumido en Task 4. ✅

**Gaps detectados y corregidos inline:** (a) Task 6 Step 3 tenía helpers fantasma (`expectedOn`/`expectedDosesOnRef`); reescrito con `expectedDosesOn` importado de `./schedule` y el bucle de incidencias completo. (b) Task 7 `renderPdf` podía dejar `lang` sin usar (violaría `noUnusedParameters`); se anota quitar el parámetro si al final no se usa.

Verificado contra el código real: `theme.warn`/`theme.accentText`/`theme.success` existen en `tokens.ts`; `daysShort` es `['L','M','M','J','V','S','D']` (7 elementos, lunes primero) → la alineación de la rejilla con `lead = (first.getDay()+6)%7` es correcta.
