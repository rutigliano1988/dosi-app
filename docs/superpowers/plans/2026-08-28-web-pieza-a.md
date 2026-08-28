# Dosi Web — Pieza A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la web de Dosi de prototipo-demo a app usable por un paciente real: sin datos falsos, con motor de horarios de verdad (frecuencias y duración) y con cuentas por email OTP, todo desplegado en `https://dosi-app.vercel.app`.

**Architecture:** Un módulo puro y testeado (`src/lib/schedule.ts`) concentra toda la lógica de horarios/estado de medicinas. El resto son cambios de cableado en `App.tsx`, reescritura de pantallas y ampliación de `src/lib/supabase.ts` para auth anónima + vinculación de email. Sin migración de base de datos (columnas `schedule`/`duration` ya son `jsonb`).

**Tech Stack:** React 19 + TypeScript + Vite 8, Supabase JS v2 (auth anónima + email OTP), vite-plugin-pwa, Vitest (nuevo, solo para `schedule.ts`).

**Spec:** `docs/superpowers/specs/2026-08-28-web-pieza-a-design.md`

## Global Constraints

- **TypeScript estricto:** `tsconfig.app.json` tiene `noUnusedLocals: true` y `noUnusedParameters: true`. Ningún import ni parámetro sin usar. Con `"jsx": "react-jsx"` **nunca** añadir `import React from 'react'` salvo que se use `React.` explícitamente (varios componentes lo hacen para `React.ReactNode` / `React.CSSProperties` — seguir el patrón del archivo que se edita).
- **`verbatimModuleSyntax: true`:** los imports solo-de-tipo deben ser `import type { ... }`.
- **Build de verificación:** `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — todo verde antes de cada commit que toque código.
- **PowerShell:** mensajes de commit multilínea con here-string `@'...'@`, nunca `$(cat <<'EOF')`.
- **Fechas:** siempre en hora local (`d.getFullYear()/getMonth()/getDate()`), nunca `toISOString()` para fechas de calendario (desfasa un día). Formato ISO `YYYY-MM-DD`.
- **Idiomas:** cada string nueva se añade en `es` **y** `en` en `src/i18n/strings.ts`.
- **Estilo visual:** todos los estilos son inline con tokens de `theme` (no CSS Modules, no Tailwind). Copiar el patrón del archivo vecino.
- **Commits temáticos y frecuentes**, uno por task (o por sub-bloque lógico dentro de un task grande).
- **`persistKey` de la app:** `"dosi:web"`.
- **Supabase Site URL:** `https://dosi-app.vercel.app`. Proyecto `uwcktxqrfuelmscmkhbs`.
- **Semana ISO:** 1 = lunes … 7 = domingo.

---

## Phase 1 — Modelo de datos y lectura tolerante

### Task 1: Nuevo modelo `Medicine` en `types.ts`

**Files:**
- Modify: `src/data/types.ts`

**Interfaces:**
- Produces: `Medicine`, `FreqKind`, `DurationKind`, `MedForm`, `DoseStatus`, `Dose` (formas nuevas, ver abajo).

- [ ] **Step 1: Reescribir `types.ts`**

```ts
import type { PillColorKey } from '../theme/tokens';

export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped';
export type FreqKind = 'daily' | 'weekdays' | 'interval';
export type DurationKind = 'ongoing' | 'days' | 'until';

export interface MedSchedule {
  freq: FreqKind;
  times: string[];               // 'daily'/'weekdays': tomas explícitas ordenadas
                                 // 'interval': un solo elemento = hora de la 1ª toma
  weekdays?: number[];           // 'weekdays': 1=lunes … 7=domingo
  intervalHours?: 6 | 8 | 12;    // 'interval'
}

export interface MedDuration {
  kind: DurationKind;
  days?: number;                 // 'days' (mín. 1)
  until?: string;                // 'until': fecha ISO 'YYYY-MM-DD'
  startedOn: string;             // fecha ISO en que se creó o reanudó — obligatorio
}

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: PillColorKey;
  schedule: MedSchedule;
  duration: MedDuration;
  stock: number;
  expiry?: string;               // opcional ahora; fecha ISO
  notes?: string;
  paused?: boolean;
}

export interface Dose {
  id: string;                    // `${medId}-${time}`
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string;                 // ISO — presente en dosis históricas de Supabase
}
```

El tipo `Caregiver` y `Permission` se **eliminan** (ya no se usan tras borrar `mock.ts` y las hojas de cuidadores en Phase 4/5).

- [ ] **Step 2: Verificar que compila lo que ya usa estos tipos fallará (esperado)**

Run: `npm run build`
Expected: FALLA en `src/data/mock.ts`, `src/data/buildTodayDoses.ts`, `src/App.tsx`, `src/screens/*` por el cambio de forma y la eliminación de `Caregiver`. Es esperado; se arregla en los tasks siguientes. No commitear todavía si el árbol no compila — este task se **agrupa en el commit del Task 2** (lectura tolerante) para no dejar `main` roto. Alternativa: seguir hasta Task 4 y hacer un único commit de Phase 1.

> **Nota de ejecución:** Phase 1 completa (Tasks 1-3) deja el árbol sin compilar hasta que Phase 2 reescribe `buildTodayDoses`. Hacer **un solo commit al final de Phase 2** que incluya Tasks 1-3 + el motor. Los tests de Vitest (Phase 2) sí corren aislados antes de eso.

---

### Task 2: Lectura tolerante en `sync.ts`

**Files:**
- Modify: `src/data/sync.ts`

**Interfaces:**
- Consumes: `Medicine`, `MedSchedule`, `MedDuration` de Task 1.
- Produces: `pullAll(userId)` y `pullHistory(userId, days)` devuelven `Medicine[]` normalizados.

- [ ] **Step 1: Añadir helper de normalización al principio de `sync.ts`** (tras los imports)

```ts
import type { Medicine, Dose, FreqKind, DurationKind } from './types';

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Normaliza una fila de Supabase (schedule/duration son jsonb, pueden venir en formato viejo)
function rowToMed(r: Record<string, unknown>): Medicine {
  const sched = (r.schedule ?? {}) as Record<string, unknown>;
  const dur = (r.duration ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    dose: String(r.dose ?? ''),
    form: (r.form ?? 'pill') as Medicine['form'],
    color: (r.color ?? 'coral') as Medicine['color'],
    schedule: {
      freq: (sched.freq ?? 'daily') as FreqKind,
      times: Array.isArray(sched.times) && sched.times.length ? (sched.times as string[]) : ['08:00'],
      weekdays: Array.isArray(sched.weekdays) ? (sched.weekdays as number[]) : undefined,
      intervalHours: sched.intervalHours as (6 | 8 | 12 | undefined),
    },
    duration: {
      kind: (dur.kind ?? 'ongoing') as DurationKind,
      days: typeof dur.days === 'number' ? dur.days : undefined,
      until: typeof dur.until === 'string' ? dur.until : undefined,
      startedOn: typeof dur.startedOn === 'string' ? dur.startedOn : isoToday(),
    },
    stock: typeof r.stock === 'number' ? r.stock : 0,
    expiry: typeof r.expiry === 'string' ? r.expiry : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    paused: r.paused === true,
  };
}
```

- [ ] **Step 2: Usar `rowToMed` en `pullAll`**

Reemplazar el bloque `const meds: Medicine[] = medsRes.data.map(r => ({ ... }));` por:

```ts
  const meds: Medicine[] = medsRes.data.map(r => rowToMed(r as Record<string, unknown>));
```

- [ ] **Step 3: Ajustar `pushMed` / `pushMeds` al nuevo shape**

En el objeto que se envía a `upsert`, cambiar `expiry: med.expiry ?? null` (ya está) y asegurarse de que `schedule` y `duration` se serializan tal cual (ya lo hacen: `schedule: med.schedule, duration: med.duration`). No hace falta cambio si ya pasan el objeto entero. Verificar que **no** referencian `med.duration.startedDay` en ningún sitio (buscar `startedDay` en todo `src/` y eliminar usos).

Run: `grep -rn "startedDay" src/`
Expected: 0 resultados tras este task (había 1 en `types.ts` ya eliminado, revisar `DetailScreen.tsx` — se arregla en Phase 5).

- [ ] **Step 4: Commit diferido** — este task entra en el commit único de Phase 2.

---

### Task 3: Lectura tolerante en `store.ts`

**Files:**
- Modify: `src/data/store.ts`

- [ ] **Step 1: Normalizar al leer de localStorage**

El `read()` actual hace `JSON.parse` directo. Añadir normalización de medicinas para tolerar cachés viejas:

```ts
import type { Medicine, Dose } from './types';

interface StoredState {
  meds: Medicine[];
  doses: Dose[];
  date: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normMed(m: Partial<Medicine>): Medicine {
  return {
    id: m.id ?? crypto.randomUUID(),
    name: m.name ?? '',
    dose: m.dose ?? '',
    form: m.form ?? 'pill',
    color: m.color ?? 'coral',
    schedule: {
      freq: m.schedule?.freq ?? 'daily',
      times: m.schedule?.times?.length ? m.schedule.times : ['08:00'],
      weekdays: m.schedule?.weekdays,
      intervalHours: m.schedule?.intervalHours,
    },
    duration: {
      kind: m.duration?.kind ?? 'ongoing',
      days: m.duration?.days,
      until: m.duration?.until,
      startedOn: m.duration?.startedOn ?? todayStr(),
    },
    stock: m.stock ?? 0,
    expiry: m.expiry,
    notes: m.notes,
    paused: m.paused,
  };
}

export const dosiStore = {
  todayStr,
  read(key: string): StoredState | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredState;
      return { ...parsed, meds: (parsed.meds ?? []).map(normMed) };
    } catch {
      return null;
    }
  },
  write(key: string, value: StoredState): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  clear(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
```

- [ ] **Step 2: Commit diferido** — entra en el commit único de Phase 2.

---

## Phase 2 — Motor de horarios (`src/lib/schedule.ts`)

### Task 4: Configurar Vitest

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/lib/schedule.test.ts` (esqueleto)

- [ ] **Step 1: Instalar Vitest**

Run: `npm install -D vitest`
Expected: se añade a `devDependencies`, sin errores de peer deps (Vitest 3+ soporta Vite 8).

- [ ] **Step 2: Añadir script de test a `package.json`**

En `"scripts"`, tras `"lint": "oxlint"`:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Configurar el bloque `test` en `vite.config.ts`**

Cambiar el import de la primera línea:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
```

Y añadir, dentro del objeto de `defineConfig({ ... })`, tras `plugins: [...]`:

```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
```

- [ ] **Step 4: Crear el esqueleto de test**

`src/lib/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('schedule', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: Ejecutar**

Run: `npm run test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/lib/schedule.test.ts
git commit -m "chore: add vitest for schedule engine tests"
```

---

### Task 5: Helpers de fecha en `schedule.ts`

**Files:**
- Create: `src/lib/schedule.ts`
- Modify: `src/lib/schedule.test.ts`

**Interfaces:**
- Produces: `isoDate(d: Date): string`, `daysBetween(isoStart: string, end: Date): number`, `isoWeekday(d: Date): number` (1=lun..7=dom).

- [ ] **Step 1: Escribir tests que fallan**

Añadir a `schedule.test.ts` (reemplazando el placeholder):

```ts
import { describe, it, expect } from 'vitest';
import { isoDate, daysBetween, isoWeekday } from './schedule';

describe('isoDate', () => {
  it('formatea en hora local, no UTC', () => {
    expect(isoDate(new Date(2026, 7, 28))).toBe('2026-08-28'); // mes 7 = agosto
  });
});

describe('daysBetween', () => {
  it('cuenta días completos entre una fecha ISO y un Date', () => {
    expect(daysBetween('2026-08-25', new Date(2026, 7, 28))).toBe(3);
    expect(daysBetween('2026-08-28', new Date(2026, 7, 28))).toBe(0);
  });
});

describe('isoWeekday', () => {
  it('lunes = 1, domingo = 7', () => {
    expect(isoWeekday(new Date(2026, 7, 31))).toBe(1); // 31-ago-2026 es lunes
    expect(isoWeekday(new Date(2026, 7, 30))).toBe(7); // 30-ago-2026 es domingo
  });
});
```

- [ ] **Step 2: Run — falla por módulo inexistente**

Run: `npm run test`
Expected: FAIL — `Cannot find module './schedule'`.

- [ ] **Step 3: Crear `src/lib/schedule.ts` con los helpers**

```ts
import type { Medicine, Dose } from '../data/types';

// ─── Helpers de fecha (siempre hora local) ───────────────────────────────────

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(isoStart: string, end: Date): number {
  const [y, m, d] = isoStart.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.round((endMid - start) / 86_400_000);
}

export function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0=domingo
  return js === 0 ? 7 : js;
}

function minToStr(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function strToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 4: Run — pasa**

Run: `npm run test`
Expected: PASS (helpers). `minToStr`/`strToMin` marcarán `noUnusedLocals` en `npm run build` hasta que se usen en Task 7 — no correr `build` todavía, solo `test`.

- [ ] **Step 5: Commit diferido** — Phase 2 se commitea entera al final (Task 10).

---

### Task 6: `medState`

**Files:**
- Modify: `src/lib/schedule.ts`, `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `daysBetween`, `isoDate`.
- Produces: `medState(med: Medicine, today: Date): 'active' | 'paused' | 'finished'`.

- [ ] **Step 1: Tests que fallan**

```ts
import { medState } from './schedule';
import type { Medicine } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 10,
    ...over,
  };
}

describe('medState', () => {
  const today = new Date(2026, 7, 28); // 28-ago-2026

  it('ongoing sin pausa → active', () => {
    expect(medState(med(), today)).toBe('active');
  });
  it('paused gana sobre todo', () => {
    expect(medState(med({ paused: true, duration: { kind: 'days', days: 3, startedOn: '2026-08-01' } }), today)).toBe('paused');
  });
  it('days: aún dentro → active', () => {
    expect(medState(med({ duration: { kind: 'days', days: 10, startedOn: '2026-08-25' } }), today)).toBe('active');
  });
  it('days: alcanzado el total → finished', () => {
    expect(medState(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-25' } }), today)).toBe('finished');
  });
  it('until: fecha pasada → finished', () => {
    expect(medState(med({ duration: { kind: 'until', until: '2026-08-27', startedOn: '2026-08-01' } }), today)).toBe('finished');
  });
  it('until: hoy → active (incluye el día final)', () => {
    expect(medState(med({ duration: { kind: 'until', until: '2026-08-28', startedOn: '2026-08-01' } }), today)).toBe('active');
  });
});
```

- [ ] **Step 2: Run — falla** (`medState` no exportado).

- [ ] **Step 3: Implementar en `schedule.ts`**

```ts
export function medState(med: Medicine, today: Date): 'active' | 'paused' | 'finished' {
  if (med.paused) return 'paused';
  const dur = med.duration;
  if (dur.kind === 'days' && dur.days != null && daysBetween(dur.startedOn, today) >= dur.days) {
    return 'finished';
  }
  if (dur.kind === 'until' && dur.until && isoDate(today) > dur.until) {
    return 'finished';
  }
  return 'active';
}
```

- [ ] **Step 4: Run — pasa.**

---

### Task 7: `expandTimes` + `isActiveOn`

**Files:**
- Modify: `src/lib/schedule.ts`, `src/lib/schedule.test.ts`

**Interfaces:**
- Produces:
  - `expandTimes(med: Medicine): string[]` — horas del día ordenadas asc.
  - `isActiveOn(med: Medicine, day: Date): boolean`

- [ ] **Step 1: Tests que fallan**

```ts
import { expandTimes, isActiveOn } from './schedule';

describe('expandTimes', () => {
  it('daily devuelve times ordenado', () => {
    expect(expandTimes(med({ schedule: { freq: 'daily', times: ['20:00', '08:00'] } }))).toEqual(['08:00', '20:00']);
  });
  it('interval 8h desde 08:00 → 3 tomas', () => {
    expect(expandTimes(med({ schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } })))
      .toEqual(['00:00', '08:00', '16:00']);
  });
  it('interval 6h desde 22:00 → 4 tomas', () => {
    expect(expandTimes(med({ schedule: { freq: 'interval', times: ['22:00'], intervalHours: 6 } })))
      .toEqual(['04:00', '10:00', '16:00', '22:00']);
  });
  it('weekdays usa times tal cual', () => {
    expect(expandTimes(med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } }))).toEqual(['09:00']);
  });
});

describe('isActiveOn', () => {
  const lunes = new Date(2026, 7, 31);
  const martes = new Date(2026, 8, 1);
  it('daily activo cualquier día', () => {
    expect(isActiveOn(med(), lunes)).toBe(true);
  });
  it('weekdays solo los días marcados', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(isActiveOn(m, lunes)).toBe(true);
    expect(isActiveOn(m, martes)).toBe(false);
  });
  it('finished nunca activo', () => {
    const m = med({ duration: { kind: 'days', days: 1, startedOn: '2026-08-01' } });
    expect(isActiveOn(m, lunes)).toBe(false);
  });
  it('paused nunca activo', () => {
    expect(isActiveOn(med({ paused: true }), lunes)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — falla.**

- [ ] **Step 3: Implementar en `schedule.ts`**

```ts
export function expandTimes(med: Medicine): string[] {
  const s = med.schedule;
  if (s.freq === 'interval' && s.intervalHours && s.times[0]) {
    const anchor = strToMin(s.times[0]);
    const n = Math.floor(24 / s.intervalHours);
    const out: string[] = [];
    for (let k = 0; k < n; k++) {
      out.push(minToStr(anchor + k * s.intervalHours * 60));
    }
    return out.sort();
  }
  return [...s.times].sort();
}

export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  return true;
}
```

- [ ] **Step 4: Run — pasa.**

---

### Task 8: `treatmentDay`

**Files:**
- Modify: `src/lib/schedule.ts`, `src/lib/schedule.test.ts`

**Interfaces:**
- Produces: `treatmentDay(med: Medicine, today: Date): { current: number; total: number } | null`

- [ ] **Step 1: Tests que fallan**

```ts
import { treatmentDay } from './schedule';

describe('treatmentDay', () => {
  const today = new Date(2026, 7, 28);
  it('null si la duración no es "days"', () => {
    expect(treatmentDay(med(), today)).toBeNull();
  });
  it('día actual = días transcurridos + 1', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 10, startedOn: '2026-08-25' } }), today))
      .toEqual({ current: 4, total: 10 });
  });
  it('nunca pasa del total', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-01' } }), today))
      .toEqual({ current: 3, total: 3 });
  });
  it('nunca baja de 1', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 5, startedOn: '2026-09-10' } }), today))
      .toEqual({ current: 1, total: 5 });
  });
});
```

- [ ] **Step 2: Run — falla.**

- [ ] **Step 3: Implementar**

```ts
export function treatmentDay(med: Medicine, today: Date): { current: number; total: number } | null {
  const dur = med.duration;
  if (dur.kind !== 'days' || dur.days == null) return null;
  const elapsed = daysBetween(dur.startedOn, today);
  const current = Math.min(Math.max(elapsed + 1, 1), dur.days);
  return { current, total: dur.days };
}
```

- [ ] **Step 4: Run — pasa.**

---

### Task 9: `buildTodayDoses` + `shiftTime` (mover desde `buildTodayDoses.ts`)

**Files:**
- Modify: `src/lib/schedule.ts`, `src/lib/schedule.test.ts`
- Delete: `src/data/buildTodayDoses.ts`

**Interfaces:**
- Consumes: `isActiveOn`, `expandTimes`.
- Produces:
  - `buildTodayDoses(meds: Medicine[], now: Date): Dose[]`
  - `shiftTime(time: string, mins: number): string`

- [ ] **Step 1: Tests que fallan**

```ts
import { buildTodayDoses, shiftTime } from './schedule';

describe('buildTodayDoses', () => {
  const now = new Date(2026, 7, 28, 8, 5); // 08:05

  it('genera una dosis por cada hora de cada medicina activa, ordenadas', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const doses = buildTodayDoses(meds, now);
    expect(doses.map(d => d.time)).toEqual(['08:00', '12:00', '20:00']);
    expect(doses.map(d => d.id)).toEqual(['a-08:00', 'b-12:00', 'a-20:00']);
  });

  it('marca "now" las dosis dentro de ±30 min y "upcoming" el resto', () => {
    const doses = buildTodayDoses([med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', '12:00'] } })], now);
    expect(doses.find(d => d.time === '08:00')!.status).toBe('now');
    expect(doses.find(d => d.time === '12:00')!.status).toBe('upcoming');
  });

  it('excluye medicinas pausadas o finalizadas', () => {
    const meds = [
      med({ id: 'a' }),
      med({ id: 'b', paused: true }),
      med({ id: 'c', duration: { kind: 'days', days: 1, startedOn: '2026-08-01' } }),
    ];
    expect(buildTodayDoses(meds, now).map(d => d.medId)).toEqual(['a']);
  });

  it('excluye medicinas de "días concretos" que no tocan hoy', () => {
    // 28-ago-2026 es viernes (isoWeekday 5)
    const soloLunes = med({ id: 'x', schedule: { freq: 'weekdays', times: ['08:00'], weekdays: [1] } });
    expect(buildTodayDoses([soloLunes], now)).toHaveLength(0);
  });
});

describe('shiftTime', () => {
  it('suma minutos con wrap de 24h', () => {
    expect(shiftTime('08:00', 10)).toBe('08:10');
    expect(shiftTime('23:55', 10)).toBe('00:05');
  });
});
```

- [ ] **Step 2: Run — falla.**

- [ ] **Step 3: Implementar en `schedule.ts`** (usa el `strToMin` privado ya definido)

```ts
export function buildTodayDoses(meds: Medicine[], now: Date): Dose[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const doses: Dose[] = [];
  for (const m of meds) {
    if (!isActiveOn(m, now)) continue;
    for (const t of expandTimes(m)) {
      const totalMin = strToMin(t);
      const status: Dose['status'] =
        totalMin >= nowMin - 30 && totalMin < nowMin + 30 ? 'now' : 'upcoming';
      doses.push({ id: `${m.id}-${t}`, medId: m.id, time: t, totalMin, status });
    }
  }
  return doses.sort((a, b) => a.totalMin - b.totalMin);
}

export function shiftTime(time: string, mins: number): string {
  return minToStr(strToMin(time) + mins);
}
```

- [ ] **Step 4: Run — pasa.**

- [ ] **Step 5: Borrar el archivo viejo**

Run: `rm src/data/buildTodayDoses.ts`

(Los imports rotos en `App.tsx` se arreglan en Phase 4.)

---

### Task 10: Cerrar Phase 1 + 2 con un commit

- [ ] **Step 1: Verificar tests**

Run: `npm run test`
Expected: PASS — todas las suites de `schedule.test.ts`.

- [ ] **Step 2: `build` seguirá fallando** en `App.tsx` / `mock.ts` / screens (esperado, Phase 4-5 lo cierra). Confirmar que **solo** falla ahí:

Run: `npm run build 2>&1 | grep -E "error TS" | grep -v "App.tsx\|mock.ts\|OnboardingScreen\|ProfileScreen\|DetailScreen\|InventoryScreen\|HomeScreen\|CalendarScreen"`
Expected: sin resultados (ningún error fuera de los archivos que se tocan después).

- [ ] **Step 3: Commit**

```bash
git add src/data/types.ts src/data/sync.ts src/data/store.ts src/lib/schedule.ts src/lib/schedule.test.ts
git rm src/data/buildTodayDoses.ts
git commit -m @'
feat: motor de horarios puro (schedule.ts) + modelo de datos nuevo

- Medicine: schedule.freq daily/weekdays/interval, duration ongoing/days/until,
  startedOn sustituye a startedDay
- schedule.ts: medState, isActiveOn, expandTimes, treatmentDay, buildTodayDoses
- lectura tolerante a datos viejos en sync.ts y store.ts
- tests unitarios con vitest

El arbol no compila hasta Phase 4 (App.tsx pendiente de recableado).
'@
```

---

## Phase 3 — Settings y Auth

### Task 11: Módulo de settings

**Files:**
- Create: `src/data/settings.ts`

**Interfaces:**
- Produces:
  - `readSettings(): AppSettings`
  - `writeSettings(patch: Partial<AppSettings>): void`
  - `type AppSettings = { themeName: ThemeName; lang: Lang; userName: string }`

- [ ] **Step 1: Crear `src/data/settings.ts`**

```ts
import type { ThemeName } from '../theme/tokens';
import type { Lang } from '../i18n/strings';

export interface AppSettings {
  themeName: ThemeName;
  lang: Lang;
  userName: string;
}

const KEY = 'dosi-settings';
const DEFAULTS: AppSettings = { themeName: 'light', lang: 'es', userName: '' };

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function writeSettings(patch: Partial<AppSettings>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch { /* ignore */ }
}
```

- [ ] **Step 2: Verificar typecheck aislado**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep settings.ts`
Expected: sin resultados (compila; el resto del árbol aún falla, se ignora).

- [ ] **Step 3: Commit**

```bash
git add src/data/settings.ts
git commit -m "feat: modulo settings (themeName, lang, userName)"
```

---

### Task 12: Ampliar `src/lib/supabase.ts` con auth de email

**Files:**
- Modify: `src/lib/supabase.ts`

**Interfaces:**
- Produces:
  - `ensureSession(): Promise<string | null>` (sin cambios de firma)
  - `getAccount(): Promise<{ userId: string | null; email: string | null; isAnonymous: boolean }>`
  - `linkEmail(email: string): Promise<void>`
  - `confirmEmailChange(email: string, token: string): Promise<void>`
  - `signInWithEmail(email: string): Promise<void>`
  - `confirmSignIn(email: string, token: string): Promise<string>`
  - `signOutToAnon(): Promise<string | null>`

**Referencia obligatoria antes de implementar:**
- `https://supabase.com/docs/guides/auth/auth-anonymous` (sección "Convert an anonymous user to a permanent user")
- `https://supabase.com/docs/reference/javascript/auth-verifyotp`
- Confirmar el `type` del `verifyOtp` para el cambio de email: la doc actual indica `type: 'email_change'` tras `updateUser({ email })`. Si con OTP activado Supabase usa `type: 'email'`, ajustar y anotar en un comentario.

- [ ] **Step 1: Reescribir `supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

export const supabase = createClient(url, key);

export async function ensureSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { console.error('[dosi] auth error:', error.message); return null; }
  return data.user?.id ?? null;
}

export async function getAccount(): Promise<{ userId: string | null; email: string | null; isAnonymous: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null, isAnonymous: true };
  return {
    userId: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous ?? !user.email,
  };
}

// ─── Vincular email a la cuenta anónima actual (conserva user_id y datos) ─────

export async function linkEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function confirmEmailChange(email: string, token: string): Promise<void> {
  // type 'email_change' según la doc de Supabase para updateUser({ email }).
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
  if (error) throw new Error(error.message);
}

// ─── Iniciar sesión con un email ya existente (otro dispositivo) ──────────────

export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(error.message);
}

export async function confirmSignIn(email: string, token: string): Promise<string> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
  const uid = data.user?.id;
  if (!uid) throw new Error('sin usuario tras verificar');
  return uid;
}

// ─── Cerrar sesión → volver a anónimo ────────────────────────────────────────

export async function signOutToAnon(): Promise<string | null> {
  await supabase.auth.signOut();
  return ensureSession();
}
```

- [ ] **Step 2: Typecheck aislado**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep supabase.ts`
Expected: sin resultados.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: auth de email OTP (linkEmail, signInWithEmail, verify, signOutToAnon)"
```

---

### Task 13: `AuthSheet.tsx`

**Files:**
- Create: `src/screens/AuthSheet.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `linkEmail`, `confirmEmailChange`, `signInWithEmail`, `confirmSignIn` de Task 12.
- Produces:
  ```ts
  interface AuthSheetProps {
    theme: Theme;
    t: (key: string, vars?: Record<string, string | number>) => string;
    mode: 'link' | 'signin';
    onClose: () => void;
    onSuccess: (result: { userId?: string }) => void; // signin pasa userId; link no
  }
  export default function AuthSheet(props: AuthSheetProps): React.ReactElement;
  ```

- [ ] **Step 1: Añadir strings (es y en) a `strings.ts`**

En `es`:
```ts
  authLinkTitle: 'Guardar mi cuenta',
  authLinkSub: 'Escribe tu email y te enviamos un código. Así no pierdes tus datos si cambias de dispositivo.',
  authSigninTitle: 'Iniciar sesión',
  authSigninSub: 'Escribe el email de tu cuenta y te enviamos un código para entrar.',
  authEmailLabel: 'Email',
  authEmailPlaceholder: 'tucorreo@ejemplo.com',
  authSendCode: 'Enviar código',
  authCodeLabel: 'Código de 6 dígitos',
  authConfirm: 'Confirmar',
  authResend: 'Reenviar código',
  authResendIn: 'Reenviar en {n}s',
  authErrInvalidEmail: 'Ese email no parece válido.',
  authErrCode: 'Código incorrecto o caducado.',
  authErrExists: 'Ese email ya tiene una cuenta. Usa "Iniciar sesión".',
  authErrNoAccount: 'No hay ninguna cuenta con ese email. Usa "Guardar mi cuenta".',
  authErrRate: 'Demasiados intentos. Prueba de nuevo en unos minutos.',
  authErrNetwork: 'Sin conexión. Revisa tu internet e inténtalo otra vez.',
  authLinkedToast: 'Cuenta guardada',
  authSignedInToast: 'Sesión iniciada',
```
En `en` (mismas claves):
```ts
  authLinkTitle: 'Save my account',
  authLinkSub: "Enter your email and we'll send a code. This keeps your data if you switch devices.",
  authSigninTitle: 'Sign in',
  authSigninSub: "Enter your account email and we'll send a code to sign in.",
  authEmailLabel: 'Email',
  authEmailPlaceholder: 'you@example.com',
  authSendCode: 'Send code',
  authCodeLabel: '6-digit code',
  authConfirm: 'Confirm',
  authResend: 'Resend code',
  authResendIn: 'Resend in {n}s',
  authErrInvalidEmail: "That email doesn't look valid.",
  authErrCode: 'Wrong or expired code.',
  authErrExists: 'That email already has an account. Use "Sign in".',
  authErrNoAccount: 'No account with that email. Use "Save my account".',
  authErrRate: 'Too many attempts. Try again in a few minutes.',
  authErrNetwork: 'No connection. Check your internet and try again.',
  authLinkedToast: 'Account saved',
  authSignedInToast: 'Signed in',
```

- [ ] **Step 2: Crear `AuthSheet.tsx`**

Patrón visual: hoja inferior idéntica a la que tenía `InviteCaregiverSheet` (overlay `rgba(0,0,0,0.45)`, `align-items: flex-end`, `borderTopLeftRadius/RightRadius: 32`, animación `dosi-sheet`). Reusar `Btn` y el input de `AddMedScreen` (`TextInput`-style inline).

```tsx
import { useState, useEffect } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';
import { linkEmail, confirmEmailChange, signInWithEmail, confirmSignIn } from '../lib/supabase';

interface AuthSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  mode: 'link' | 'signin';
  onClose: () => void;
  onSuccess: (result: { userId?: string }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapError(msg: string, t: AuthSheetProps['t']): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('exists')) return t('authErrExists');
  if (m.includes('otp') || m.includes('token') || m.includes('expired') || m.includes('invalid')) return t('authErrCode');
  if (m.includes('rate') || m.includes('429') || m.includes('too many')) return t('authErrRate');
  if (m.includes('signups not allowed') || m.includes('not found') || m.includes('user not found')) return t('authErrNoAccount');
  if (m.includes('network') || m.includes('fetch')) return t('authErrNetwork');
  return t('authErrCode');
}

export default function AuthSheet({ theme, t, mode, onClose, onSuccess }: AuthSheetProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const title = mode === 'link' ? t('authLinkTitle') : t('authSigninTitle');
  const sub = mode === 'link' ? t('authLinkSub') : t('authSigninSub');

  async function sendCode() {
    setErr('');
    if (!EMAIL_RE.test(email.trim())) { setErr(t('authErrInvalidEmail')); return; }
    setBusy(true);
    try {
      if (mode === 'link') await linkEmail(email.trim());
      else await signInWithEmail(email.trim());
      setStep('code');
      setCooldown(60);
    } catch (e) {
      setErr(mapError((e as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setErr('');
    if (code.trim().length < 6) { setErr(t('authErrCode')); return; }
    setBusy(true);
    try {
      if (mode === 'link') {
        await confirmEmailChange(email.trim(), code.trim());
        onSuccess({});
      } else {
        const userId = await confirmSignIn(email.trim(), code.trim());
        onSuccess({ userId });
      }
    } catch (e) {
      setErr(mapError((e as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 52, background: theme.surface, color: theme.text,
    border: `1px solid ${theme.borderStrong}`, borderRadius: 14, padding: '0 16px',
    fontSize: 16, fontWeight: 500, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
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
            }}>{title}</div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>{sub}</div>

          {step === 'email' ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textDim, marginBottom: 8 }}>{t('authEmailLabel')}</div>
              <input
                type="email" inputMode="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('authEmailPlaceholder')} style={inputStyle}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={sendCode}>
                {t('authSendCode')}
              </Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textDim, marginBottom: 8 }}>{t('authCodeLabel')}</div>
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={confirm}>
                {t('authConfirm')}
              </Btn>
              <button
                disabled={cooldown > 0 || busy}
                onClick={sendCode}
                style={{
                  marginTop: 12, width: '100%', background: 'transparent', border: 0,
                  color: cooldown > 0 ? theme.textSoft : theme.accent, fontFamily: 'inherit',
                  fontSize: 13.5, fontWeight: 600, cursor: cooldown > 0 ? 'default' : 'pointer',
                }}
              >
                {cooldown > 0 ? t('authResendIn', { n: cooldown }) : t('authResend')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck aislado**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep AuthSheet`
Expected: sin resultados.

- [ ] **Step 4: Commit**

```bash
git add src/screens/AuthSheet.tsx src/i18n/strings.ts
git commit -m "feat: AuthSheet (email + codigo OTP) para vincular cuenta e iniciar sesion"
```

---

## Phase 4 — Recableado de `App.tsx` y limpieza

### Task 14: Borrar archivos muertos y arreglar imports rotos

**Files:**
- Delete: `src/data/mock.ts`, `src/screens/InviteCaregiverSheet.tsx`, `src/screens/ManageCaregiverSheet.tsx`
- Modify: `src/App.tsx` (imports + siembra + estado)

**Interfaces:**
- Consumes: `buildTodayDoses` y `shiftTime` ahora desde `../lib/schedule`; `readSettings`/`writeSettings` desde `../data/settings`; `getAccount`, `signOutToAnon`, `confirmSignIn` desde `../lib/supabase`.

- [ ] **Step 1: Borrar archivos**

```bash
git rm src/data/mock.ts src/screens/InviteCaregiverSheet.tsx src/screens/ManageCaregiverSheet.tsx
```

- [ ] **Step 2: `main.tsx` — activar persistencia**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App persistKey="dosi:web" />
  </StrictMode>,
)
```

- [ ] **Step 3: `App.tsx` — imports**

Quitar:
```ts
import { INITIAL_MEDS, PATIENT_CAREGIVERS } from './data/mock';
import { buildTodayDoses, shiftTime } from './data/buildTodayDoses';
import InviteCaregiverSheet from './screens/InviteCaregiverSheet';
import ManageCaregiverSheet from './screens/ManageCaregiverSheet';
import type { Medicine, Dose, Caregiver } from './data/types';
```
Poner:
```ts
import { buildTodayDoses, shiftTime, medState } from './lib/schedule';
import { readSettings, writeSettings } from './data/settings';
import { getAccount, signOutToAnon } from './lib/supabase';
import type { Medicine, Dose } from './data/types';
import AuthSheet from './screens/AuthSheet';
```
(`ensureSession`, `pullAll`, `pullHistory`, `pushMed`, `pushMeds`, `deleteMed`, `pushDose`, `pushDoses` siguen importándose de `./data/sync` / `./lib/supabase` como ahora — `ensureSession` de `./lib/supabase`.)

- [ ] **Step 4: `App.tsx` — settings y estado inicial**

Reemplazar la función local `readSettings` y `SETTINGS_KEY` por el import. El `useState` de tema/lang pasa a:
```ts
  const saved = readSettings();
  const [themeName, setThemeNameState] = useState<ThemeName>(saved.themeName ?? initialTheme);
  const [lang, setLangState] = useState<Lang>(saved.lang ?? initialLang);
  const [userName, setUserName] = useState<string>(saved.userName ?? '');
```
El `useEffect` de persistencia de settings:
```ts
  useEffect(() => {
    writeSettings({ themeName, lang, userName });
  }, [themeName, lang, userName]);
```

- [ ] **Step 5: `App.tsx` — fin de la siembra**

```ts
  const startMeds = stored?.meds ?? [];
  const startDoses = (stored?.doses && stored.date === todayStr)
    ? stored.doses
    : buildTodayDoses(startMeds, new Date());
```
En el `useEffect` de Supabase, la rama `else` que sembraba se elimina:
```ts
      if (remote) {
        setMeds(remote.meds);
        if (remote.doses.length > 0) {
          setDoses(remote.doses);
        } else {
          const fresh = buildTodayDoses(remote.meds, new Date());
          setDoses(fresh);
          pushDoses(fresh, uid);
        }
      }
      // sin else: remoto vacío → el usuario empieza vacío; el primer pushMed
      // ocurre cuando crea su primera medicina
```

- [ ] **Step 6: `App.tsx` — quitar estado de cuidadores + demo, añadir estado de cuenta**

Quitar: `const [inviteOpen, setInviteOpen] = useState(false);`, `const [manageCg, setManageCg] = useState<Caregiver | null>(null);`.
Añadir:
```ts
  const [account, setAccount] = useState<{ userId: string | null; email: string | null; isAnonymous: boolean }>(
    { userId: null, email: null, isAnonymous: true }
  );
  const [authSheet, setAuthSheet] = useState<'link' | 'signin' | null>(null);
```
En el `useEffect` de Supabase, tras `userId.current = uid;`:
```ts
      setAccount(await getAccount());
```

- [ ] **Step 7: `App.tsx` — el efecto que reacciona a cambios de `meds`**

`buildTodayDoses(meds, new Date().getHours(), { autoMarkTaken: !persistKey })` pasa a `buildTodayDoses(meds, new Date())` (2 usos: el de arranque ya cubierto en Step 5, y el `useEffect` de `prevMedsCount`). Eliminar toda referencia a `autoMarkTaken`.

- [ ] **Step 8: `App.tsx` — `ProfileScreen` props** (el JSX completo se define en Task 16; por ahora, para compilar)

Sustituir el bloque `<ProfileScreen ... />` actual por uno con las props nuevas (ver Task 16). Quitar `caregivers`, `onInviteCaregiver`, `onManageCaregiver`, `onLoadDemo`. Añadir `userName`, `onUserNameChange={setUserName}`, `account`, `onLinkAccount={() => setAuthSheet('link')}`, `onSignIn={() => setAuthSheet('signin')}`, `onSignOut={handleSignOut}`.

Añadir el handler:
```ts
  const handleSignOut = async () => {
    if (persistKey) dosiStore.clear(persistKey);
    const uid = await signOutToAnon();
    userId.current = uid;
    setMeds([]); setDoses([]); setHistoryDoses([]);
    setAccount(await getAccount());
    setTab('home'); setScreen('main');
    setToast({ message: t('signedOutToast'), kind: 'neutral' });
  };
```
(`signedOutToast` string nueva: es `'Sesión cerrada'`, en `'Signed out'`.)

- [ ] **Step 9: `App.tsx` — render de las hojas**

Quitar los bloques `{inviteOpen && <InviteCaregiverSheet .../>}` y `{manageCg && <ManageCaregiverSheet .../>}`. Añadir:
```tsx
      {authSheet && (
        <AuthSheet
          theme={theme} t={t}
          mode={authSheet}
          onClose={() => setAuthSheet(null)}
          onSuccess={async ({ userId: newUid }) => {
            setAuthSheet(null);
            if (newUid && newUid !== userId.current) {
              userId.current = newUid;
              const [remote, history] = await Promise.all([pullAll(newUid), pullHistory(newUid, 7)]);
              setMeds(remote?.meds ?? []);
              setDoses(remote?.doses ?? buildTodayDoses(remote?.meds ?? [], new Date()));
              setHistoryDoses(history);
              setToast({ message: t('authSignedInToast'), kind: 'success', icon: I.check(16, '#fff') });
            } else {
              setToast({ message: t('authLinkedToast'), kind: 'success', icon: I.check(16, '#fff') });
            }
            setAccount(await getAccount());
          }}
        />
      )}
```

- [ ] **Step 10: Verificar**

Run: `npm run test && npm run build`
Expected: `test` PASS. `build` puede seguir fallando **solo** en `ProfileScreen.tsx`, `OnboardingScreen.tsx`, `DetailScreen.tsx`, `InventoryScreen.tsx`, `HomeScreen.tsx` (Phase 5). Confirmar que `App.tsx` ya **no** aparece en los errores.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m @'
feat: recablear App.tsx — fin de datos demo, persistencia real, estado de cuenta

- main.tsx pasa persistKey="dosi:web"
- se elimina la siembra de INITIAL_MEDS: usuario nuevo empieza vacio
- buildTodayDoses(meds, new Date()); fuera autoMarkTaken
- estado account + AuthSheet cableado (link / signin / signout)
- borrados mock.ts, InviteCaregiverSheet, ManageCaregiverSheet
'@
```

---

## Phase 5 — Pantallas

### Task 15: `OnboardingScreen` — slide 3 nuevo + paso de nombre

**Files:**
- Modify: `src/screens/OnboardingScreen.tsx`, `src/i18n/strings.ts`

**Interfaces:**
- Produces: `<OnboardingScreen theme t lang onDone={(name: string) => void} />` — `onDone` ahora recibe el nombre (string vacío si se salta).

- [ ] **Step 1: Strings**

En `es`, reemplazar `ob3Title`/`ob3Sub` y añadir el paso 4:
```ts
  ob3Title: 'Mira tu progreso',
  ob3Sub: 'El calendario te muestra tu adherencia semana a semana, sin esfuerzo.',
  ob4Title: '¿Cómo te llamas?',
  ob4Sub: 'Solo para saludarte. Puedes dejarlo en blanco.',
  ob4Placeholder: 'Tu nombre',
  obStart: 'Empezar',
```
En `en`:
```ts
  ob3Title: 'See your progress',
  ob3Sub: 'The calendar shows your week-by-week adherence, effortlessly.',
  ob4Title: "What's your name?",
  ob4Sub: 'Just so we can greet you. You can leave it blank.',
  ob4Placeholder: 'Your name',
  obStart: 'Get started',
```

- [ ] **Step 2: `OnboardingScreen.tsx` — cambios**

- Props: `onDone: (name: string) => void`.
- Sustituir `ArtHeart` por `ArtProgress` (una ilustración simple con un anillo de progreso: reusar `ProgressRing` con `value={0.72}` dentro de un círculo `theme.accentSoft`, sin los chips "M"/"J"). Ejemplo mínimo:
```tsx
import ProgressRing from '../components/ProgressRing';

function ArtProgress({ theme }: { theme: Theme }) {
  return (
    <div style={{ width: 220, height: 220, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: theme.accentSoft }} />
      <ProgressRing theme={theme} value={0.72} size={128} />
    </div>
  );
}
```
  (Verificar la firma real de `ProgressRing` en `src/components/ProgressRing.tsx` y ajustar props: `theme`, `value`, `size`, opcional `stroke`/`color`.)
- `slides` array: el 3º usa `art: 'progress'`.
- Añadir un 4º "slide" especial que en vez de ilustración+CTA muestra un `<input>` de nombre. Estado local `const [name, setName] = useState('')`. En el último paso el botón dice `t('obStart')` y llama `onDone(name.trim())`. El botón "Saltar" de los pasos 1-3 llama `onDone('')`. Si el usuario está en el paso 4 y pulsa Empezar con el campo vacío → `onDone('')`.
- El input reusa el estilo de `TextInput` de `AddMedScreen` (inline, `height: 52`, borde `borderStrong`).

- [ ] **Step 3: `App.tsx` — recibir el nombre**

```tsx
    body = <OnboardingScreen theme={theme} t={t} lang={lang} onDone={(name) => {
      if (name) setUserName(name);
      setScreen('main');
    }} />;
```

- [ ] **Step 4: Verificar**

Run: `npm run build 2>&1 | grep OnboardingScreen`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/screens/OnboardingScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "feat: onboarding — slide de progreso + paso opcional de nombre"
```

---

### Task 16: `ProfileScreen` — reescritura

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`, `src/App.tsx`, `src/i18n/strings.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Props {
    theme: Theme;
    t: (key: string, vars?: Record<string, string | number>) => string;
    lang: Lang;
    themeName: ThemeName;
    userName: string;
    account: { userId: string | null; email: string | null; isAnonymous: boolean };
    onUserNameChange: (name: string) => void;
    onThemeChange: (t: ThemeName) => void;
    onLangChange: (l: Lang) => void;
    onLinkAccount: () => void;
    onSignIn: () => void;
    onSignOut: () => void;
    onResetData: () => void;
  }
  ```

- [ ] **Step 1: Strings** (es / en)

```ts
  // es
  accountSection: 'Cuenta',
  accountAnon: 'Sin cuenta guardada',
  accountSaveCta: 'Guardar mi cuenta',
  accountSignInCta: 'Iniciar sesión en otra cuenta',
  accountSignOut: 'Cerrar sesión',
  persistWarning: 'Tus datos se guardan solo en este navegador. Guarda tu cuenta con un email para no perderlos si cambias de dispositivo.',
  editName: 'Editar nombre',
  namePlaceholderShort: 'Tu nombre',
  aboutVersion: 'v1.0',
  privacyLink: 'Política de privacidad',
```
```ts
  // en
  accountSection: 'Account',
  accountAnon: 'No account saved',
  accountSaveCta: 'Save my account',
  accountSignInCta: 'Sign in to another account',
  accountSignOut: 'Sign out',
  persistWarning: 'Your data is saved only in this browser. Save your account with an email so you don\u2019t lose it if you switch devices.',
  editName: 'Edit name',
  namePlaceholderShort: 'Your name',
  aboutVersion: 'v1.0',
  privacyLink: 'Privacy policy',
```

- [ ] **Step 2: Reescribir `ProfileScreen.tsx`**

Estructura (mantener el look: `TopBar`, `Card`, secciones con título en mayúsculas, filas con icono en cuadro `surface2`):

1. **Tarjeta de usuario:** avatar con `userName.charAt(0).toUpperCase()` o `I.user` si vacío. Nombre: si no se está editando, texto + botón lápiz (`I.edit`) que activa `editing`; si `editing`, `<input>` inline + botón check que llama `onUserNameChange(draft.trim())` y cierra. Bajo el nombre: `account.email ?? t('accountAnon')`.
2. **Aviso de persistencia:** solo si `!account.email` — banda `theme.warnSoft` / `theme.warn`, texto `t('persistWarning')`, `fontSize: 12.5`, `borderRadius: 14`, margen lateral 16.
3. **Sección "Cuenta":** `Card` con filas:
   - si `!account.email`: fila `t('accountSaveCta')` → `onLinkAccount`; fila `t('accountSignInCta')` → `onSignIn`.
   - si `account.email`: fila que muestra el email (sin acción); fila `t('accountSignOut')` en `theme.danger` → `onSignOut`.
4. **Sección "Accesibilidad":** dos filas — Tema (`I.sun`/`I.moon`, valor `themeLabel`, `onPress` alterna) e Idioma (`I.globe`, valor `langLabel`, `onPress` alterna). **Sin** fila de tamaño de texto.
5. **Sección "General":** fila "Sobre Dosi" (`I.user`, valor `t('aboutVersion')`, sin acción); fila `t('privacyLink')` (`I.share`) → `window.open('/privacy.html', '_blank')`.
6. **Zona de peligro:** botón pill `t('resetData')` en `theme.danger` → `onResetData` (igual que ahora).

Eliminar por completo: `Avatar` de cuidadores, `ToggleSwitch`, `settingsGroups` con notificaciones/health, botón "Cargar demo", botón suelto "Cerrar sesión", el `caregivers` map.

- [ ] **Step 3: `App.tsx` — JSX de `ProfileScreen`**

```tsx
    } else if (tab === 'profile') {
      body = (
        <ProfileScreen
          theme={theme} t={t} lang={lang}
          themeName={themeName}
          userName={userName}
          account={account}
          onUserNameChange={setUserName}
          onThemeChange={setThemeName}
          onLangChange={setLang}
          onLinkAccount={() => setAuthSheet('link')}
          onSignIn={() => setAuthSheet('signin')}
          onSignOut={handleSignOut}
          onResetData={() => setConfirmReset(true)}
        />
      );
    }
```

- [ ] **Step 4: Verificar**

Run: `npm run build 2>&1 | grep ProfileScreen`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ProfileScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "feat: reescribir Perfil — cuenta por email, sin cuidadores ni toggles muertos"
```

---

### Task 17: `AddMedScreen` — frecuencia y duración reales

**Files:**
- Modify: `src/screens/AddMedScreen.tsx`, `src/App.tsx`, `src/i18n/strings.ts`

**Interfaces:**
- Produces: `FormData` ampliado:
  ```ts
  interface FormData {
    name: string; dose: string; form: MedForm; color: PillColorKey;
    freq: FreqKind;                    // 'daily' | 'weekdays' | 'interval'
    times: string[];                   // daily/weekdays: lista; interval: [primera toma]
    weekdays: number[];                // 1..7
    intervalHours: 6 | 8 | 12;
    duration: DurationKind;            // 'ongoing' | 'days' | 'until'
    days: number;
    until: string;                     // ISO date
    stock: number; expiry: string; notes: string;
  }
  ```

- [ ] **Step 1: Strings** (es / en)

```ts
  // es
  freqDaily: 'Todos los días',
  freqWeekdays: 'Días concretos',
  freqInterval: 'Cada X horas',
  weekdayPick: 'Días de la semana',
  intervalEvery: 'Cada',
  intervalHoursUnit: '{n} h',
  firstDoseAt: 'Primera toma',
  computedTimes: 'Tomas: {list}',
  durOngoing: 'Continuo',
  durDays: 'Durante N días',
  durUntil: 'Hasta fecha',
  daysCount: 'Número de días',
  untilWhen: 'Fecha final',
  weekdayShortMon: 'L', weekdayShortTue: 'M', weekdayShortWed: 'X',
  weekdayShortThu: 'J', weekdayShortFri: 'V', weekdayShortSat: 'S', weekdayShortSun: 'D',
```
```ts
  // en
  freqDaily: 'Every day',
  freqWeekdays: 'Specific days',
  freqInterval: 'Every X hours',
  weekdayPick: 'Days of the week',
  intervalEvery: 'Every',
  intervalHoursUnit: '{n} h',
  firstDoseAt: 'First dose',
  computedTimes: 'Doses: {list}',
  durOngoing: 'Ongoing',
  durDays: 'For N days',
  durUntil: 'Until date',
  daysCount: 'Number of days',
  untilWhen: 'End date',
  weekdayShortMon: 'M', weekdayShortTue: 'T', weekdayShortWed: 'W',
  weekdayShortThu: 'T', weekdayShortFri: 'F', weekdayShortSat: 'S', weekdayShortSun: 'S',
```

- [ ] **Step 2: `AddMedScreen.tsx` — `FormData` + estado inicial**

```ts
const [data, setData] = useState<FormData>({
  name: initialData?.name ?? '',
  dose: initialData?.dose ?? '',
  form: initialData?.form ?? 'capsule',
  color: initialData?.color ?? 'coral',
  freq: initialData?.schedule?.freq ?? 'daily',
  times: initialData?.schedule?.times ?? ['08:00'],
  weekdays: initialData?.schedule?.weekdays ?? [1, 2, 3, 4, 5],
  intervalHours: initialData?.schedule?.intervalHours ?? 8,
  duration: initialData?.duration?.kind ?? 'ongoing',
  days: initialData?.duration?.days ?? 7,
  until: initialData?.duration?.until ?? '',
  stock: initialData?.stock ?? 0,
  expiry: initialData?.expiry ?? '',
  notes: initialData?.notes ?? '',
});
```

- [ ] **Step 3: `StepSchedule` — nueva UI**

- Segmentado de frecuencia con `t('freqDaily') | t('freqWeekdays') | t('freqInterval')` → `upd('freq', id)`.
- Si `freq === 'weekdays'`: fila de 7 chips (botones redondos ~40px). Cada uno alterna su número en `data.weekdays`. Orden L(1)…D(7). Debajo, la lista de horarios como ahora.
- Si `freq === 'interval'`: segmentado 6/8/12 (`t('intervalHoursUnit', { n })`) → `upd('intervalHours', n)`; **un solo** campo "Primera toma" (`data.times[0]`, editando `upd('times', [v])`); línea de previsualización `t('computedTimes', { list: previewInterval(data.times[0], data.intervalHours).join(' · ') })`.
  ```ts
  function previewInterval(first: string, every: number): string[] {
    const [h, m] = first.split(':').map(Number);
    const anchor = h * 60 + m;
    const n = Math.floor(24 / every);
    return Array.from({ length: n }, (_, k) => {
      const t = (anchor + k * every * 60) % 1440;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }).sort();
  }
  ```
- Si `freq === 'daily'`: lista de horarios (como ahora).
- Segmentado de duración: `t('durOngoing') | t('durDays') | t('durUntil')` → `upd('duration', id)`.
  - `duration === 'days'`: stepper numérico (−/+, mín 1) sobre `data.days` (reusar el patrón del stepper de stock).
  - `duration === 'until'`: `<input type="date">` con `min` = mañana (`isoDate(tomorrow)`), valor `data.until`.

- [ ] **Step 4: `StepStock` — caducidad a `type="date"`**

Sustituir el `TextInput` de `expiry` por:
```tsx
<input type="date" value={data.expiry} onChange={e => upd('expiry', e.target.value)}
  style={{ /* mismo estilo que TextInput: height 50, borde borderStrong, etc. */ }} />
```

- [ ] **Step 5: `App.tsx` — `onSave` construye el nuevo shape**

En la rama `add`:
```ts
const today = new Date();
const isoToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const schedule = d.freq === 'interval'
  ? { freq: 'interval' as const, times: [d.times[0]], intervalHours: d.intervalHours }
  : d.freq === 'weekdays'
  ? { freq: 'weekdays' as const, times: d.times, weekdays: d.weekdays }
  : { freq: 'daily' as const, times: d.times };
const duration =
  d.duration === 'days'  ? { kind: 'days'  as const, days: d.days, startedOn: isoToday }
  : d.duration === 'until' ? { kind: 'until' as const, until: d.until, startedOn: isoToday }
  : { kind: 'ongoing' as const, startedOn: isoToday };
const newMed: Medicine = {
  id: crypto.randomUUID(),
  name: d.name || t('addMed'),
  dose: d.dose, form: d.form, color: d.color,
  schedule, duration,
  stock: d.stock,
  expiry: d.expiry || undefined,
  notes: d.notes || undefined,
};
```
En la rama `edit`: igual pero conservando `editing.id` y `editing.duration.startedOn` (salvo que se venga de "reanudar/extender" — ver Task 18, que pasará un flag). Reconstruir `schedule` y `duration` con los mismos helpers; `startedOn: editing.duration.startedOn`.

- [ ] **Step 6: Verificar**

Run: `npm run build 2>&1 | grep -E "AddMedScreen|App.tsx"`
Expected: sin resultados.

- [ ] **Step 7: Commit**

```bash
git add src/screens/AddMedScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "feat: alta de medicina — frecuencias (dias/intervalo) y duracion (N dias/fecha) reales"
```

---

### Task 18: `DetailScreen` — historial real + estado "Finalizada"

**Files:**
- Modify: `src/screens/DetailScreen.tsx`, `src/App.tsx`, `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `medState`, `treatmentDay` de `schedule.ts`; `historyDoses: Dose[]` (nueva prop, ya en el estado de `App.tsx`).
- Produces: `<DetailScreen ... historyDoses onResumeExtend={() => void} />` — `onResumeExtend` abre el editor en modo "reanudar" (fija `startedOn = hoy` al guardar).

- [ ] **Step 1: Strings** (es / en)

```ts
  // es
  medFinished: 'Finalizada',
  resumeExtend: 'Reanudar / extender',
  resumeConfirmTitle: '¿Reanudar {name}?',
  resumeConfirmMsg: 'El tratamiento vuelve a empezar hoy con la misma duración.',
  noHistoryYet: 'Sin historial todavía',
  historyToday: 'Hoy', historyYesterday: 'Ayer',
```
```ts
  // en
  medFinished: 'Finished',
  resumeExtend: 'Resume / extend',
  resumeConfirmTitle: 'Resume {name}?',
  resumeConfirmMsg: 'The treatment starts again today with the same duration.',
  noHistoryYet: 'No history yet',
  historyToday: 'Today', historyYesterday: 'Yesterday',
```

- [ ] **Step 2: `DetailScreen.tsx` — cambios**

- Nueva prop `historyDoses: Dose[]` y `onResumeExtend: () => void`.
- Borrar `mockHistory`. La tarjeta "Historial" mapea `historyDoses` (ya vienen filtradas por med desde `App.tsx`), ordenadas por `date` desc + `totalMin` desc, máx 10. Etiqueta de día: si `d.date === isoToday` → `t('historyToday')`; si ayer → `t('historyYesterday')`; si no, `d.date`. Estado: `taken`→check verde, `skipped`→cruz roja, resto→punto neutro. Vacío → texto centrado `t('noHistoryYet')`.
- Quitar el botón `I.more` del hero (el `<button>` de arriba a la derecha que no hace nada).
- Barra de duración: usar `treatmentDay(med, new Date())`; si devuelve `{current,total}`, mostrar "`{current} / {total}`" y la barra `current/total`.
- Si `medState(med, new Date()) === 'finished'`: en el hero, junto al nombre, `<Badge kind="neutral">{t('medFinished')}</Badge>`; y en la zona de acciones, sustituir el botón "Pausar" por `<Btn kind="primary" onClick={onResumeExtend}>{t('resumeExtend')}</Btn>` (el botón "Eliminar" se queda).

- [ ] **Step 3: `App.tsx` — pasar historial filtrado y cablear reanudar**

```tsx
  } else if (screen === 'detail') {
    const med = meds.find(m => m.id === selMedId);
    const medHistory = historyDoses.filter(h => h.medId === selMedId);
    body = (
      <DetailScreen
        theme={theme} t={t} lang={lang}
        med={med ?? null}
        historyDoses={medHistory}
        onBack={() => setScreen('main')}
        onShowStockAlert={() => med && setStockAlertMed(med)}
        onEdit={() => { if (med) { setEditing(med); setResumeMode(false); setScreen('addMed'); } }}
        onResumeExtend={() => { if (med) { setEditing(med); setResumeMode(true); setScreen('addMed'); } }}
        onPauseToggle={() => { /* igual que ahora */ }}
        onDelete={() => med && setConfirmDelete(med)}
      />
    );
  }
```
Añadir estado `const [resumeMode, setResumeMode] = useState(false);`. En `onSave` (rama edit), si `resumeMode` → `startedOn = isoToday` y `paused: false`; si no → conserva `editing.duration.startedOn`. Resetear `setResumeMode(false)` en `onCancel` y tras guardar.

- [ ] **Step 4: Verificar**

Run: `npm run build 2>&1 | grep -E "DetailScreen|App.tsx"`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DetailScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "feat: detalle — historial real desde Supabase + estado Finalizada y reanudar"
```

---

### Task 19: `InventoryScreen` + `HomeScreen` — estados y saludo

**Files:**
- Modify: `src/screens/InventoryScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/App.tsx`, `src/i18n/strings.ts`

- [ ] **Step 1: Strings** (es / en)

```ts
  // es
  greetingMorningPlain: 'Buenos días',
  greetingDayPlain: 'Buenas tardes',
  greetingEveningPlain: 'Buenas noches',
  emptyHomeTitleNew: 'Empecemos',
  invSectionActive: 'Activas',
  invSectionFinished: 'Finalizadas',
```
```ts
  // en
  greetingMorningPlain: 'Good morning',
  greetingDayPlain: 'Good afternoon',
  greetingEveningPlain: 'Good evening',
  emptyHomeTitleNew: "Let's begin",
  invSectionActive: 'Active',
  invSectionFinished: 'Finished',
```
Mantener las claves `greetingMorning`/`greetingDay`/`greetingEvening` existentes (llevan la coma: "Buen día,") para el caso con nombre. Eliminar `greetingName` de `es` y `en`.

- [ ] **Step 2: `HomeScreen.tsx` — saludo con nombre**

Nueva prop `userName: string`. El saludo:
```ts
const base = hour < 12 ? 'Morning' : hour < 19 ? 'Day' : 'Evening';
const greet = userName
  ? `${t('greeting' + base)} ${userName}`         // "Buenas tardes, María" (la clave ya trae la coma)
  : t('greeting' + base + 'Plain');               // "Buenas tardes"
```
Sustituir los dos usos de `t('greetingName')` (el `title` del `TopBar`, en el estado vacío y en el normal) por:
- estado vacío: `title={userName || t('appName')}` y el `emptyHomeTitle` pasa a `t('emptyHomeTitleNew')`.
- estado normal: dejar el `subtitle={greet}` y `title={userName || t('appName')}`.

- [ ] **Step 3: `strings.ts` — `emptyHomeTitle`**

Reemplazar el valor de `emptyHomeTitle` (`'¡Hola, María!'` / `'Hi, María!'`) por `'¡Hola!'` / `'Hi!'`, o simplemente usar `emptyHomeTitleNew` en `HomeScreen` y borrar `emptyHomeTitle`. Elegir una y ser consistente (recomendado: usar `emptyHomeTitleNew`, borrar `emptyHomeTitle`).

- [ ] **Step 4: `InventoryScreen.tsx` — sección "Finalizadas" + badge**

- Importar `medState` de `../lib/schedule`.
- Tras `filtered`, partir en:
  ```ts
  const now = new Date();
  const active = filtered.filter(m => medState(m, now) !== 'finished');
  const finished = filtered.filter(m => medState(m, now) === 'finished');
  ```
- Mantener las secciones actuales (stock bajo / normal) **solo sobre `active`**. Añadir al final, si `finished.length`, una `SectionList` con `title={t('invSectionFinished')}` cuyas filas usan `onOpenMed(m.id)` y muestran `<Badge kind="neutral">{t('medFinished')}</Badge>`.
- En `InventoryRow`, el cálculo `expSoon` con `new Date(med.expiry)` peta si `med.expiry` es `undefined` → guardar: `const expSoon = med.expiry ? (new Date(med.expiry).getTime() - Date.now() < 90*24*60*60*1000) : false;`. Igual en `DetailScreen` (`{med.expiry}` ya es condicional pero revisar el cálculo `daysLeft`/expiry).

- [ ] **Step 5: `App.tsx` — pasar `userName` a `HomeScreen`**

```tsx
        <HomeScreen
          theme={theme} t={t} lang={lang}
          userName={userName}
          meds={meds} doses={doses}
          /* ...resto igual... */
        />
```

- [ ] **Step 6: Verificar**

Run: `npm run build`
Expected: **verde** (ya no debería quedar ningún error — es el primer build limpio desde Phase 1). Si falla, arreglar los `grep` de archivos que aparezcan.

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/InventoryScreen.tsx src/screens/HomeScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "feat: inventario con seccion Finalizadas + saludo de Home con nombre real"
```

---

## Phase 6 — PWA, copy final, verificación y despliegue

### Task 20: Iconos PWA

**Files:**
- Create: `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/pwa-512x512-maskable.png`, `public/apple-touch-icon-180.png`
- Modify: `vite.config.ts`, `index.html`

- [ ] **Step 1: Generar los PNG desde el icono de marca del móvil**

Fuente: `../dosi-mobile/store/assets/icon-512.png` (cápsula naranja/blanca sobre crema).
Si hay ImageMagick (`magick` o `convert`):
```bash
cd C:/Users/FGamerTech/Documents/Claude/Medicine_app/dosi
SRC=../dosi-mobile/store/assets/icon-512.png
magick "$SRC" -resize 512x512 public/pwa-512x512.png
magick "$SRC" -resize 192x192 public/pwa-192x192.png
magick "$SRC" -resize 180x180 public/apple-touch-icon-180.png
# maskable: el mismo arte con ~10% de padding sobre fondo crema #f4efe6
magick "$SRC" -resize 410x410 -background "#f4efe6" -gravity center -extent 512x512 public/pwa-512x512-maskable.png
```
Si no hay ImageMagick: usar el script GDI+ de PowerShell que ya se usó en `dosi-mobile` (ver `ESTADO.md` notas técnicas) o pedir al usuario los 4 PNG. **No** inventar los binarios.

- [ ] **Step 2: `vite.config.ts` — manifest.icons**

```ts
      includeAssets: ['favicon.svg', 'apple-touch-icon-180.png'],
      manifest: {
        // ...name, short_name, description, theme_color, background_color, display, orientation, scope, start_url iguales...
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
```
En `workbox.globPatterns` añadir `png`: `['**/*.{js,css,html,svg,png}']`.

- [ ] **Step 3: `index.html`**

```html
    <link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
```
(sustituye la línea que apunta a `/favicon.svg`).

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: verde; en la salida de PWA, `precache` incluye los `.png`.

- [ ] **Step 5: Commit**

```bash
git add public/pwa-192x192.png public/pwa-512x512.png public/pwa-512x512-maskable.png public/apple-touch-icon-180.png vite.config.ts index.html
git commit -m "feat: iconos PWA de marca Dosi (192/512/maskable/apple-touch)"
```

---

### Task 21: Barrido de copys y textos huérfanos

**Files:**
- Modify: `src/i18n/strings.ts`, y cualquier pantalla con string hardcoded encontrada

- [ ] **Step 1: Buscar textos hardcoded de la demo**

Run: `grep -rn "María\|maria\|Juan\|Sofía\|greetingName" src/`
Expected: 0 resultados. Si aparece alguno (p. ej. en `OnboardingScreen` art, o en `strings.ts`), eliminarlo.

- [ ] **Step 2: `testStorageHint`**

En `es`: `'Tus datos se guardan solo en este navegador.'` — en `en`: `'Your data is saved only in this browser.'` Verificar dónde se usa (`grep -rn testStorageHint src/`) y que el contexto siga teniendo sentido; si no se usa en ningún sitio, borrarla.

- [ ] **Step 3: Revisar strings de cuidadores en `strings.ts`**

Todas las claves `cg*` (`cgInviteTitle`, `cgPermView`, `cgRoleWife`, …) ya no se usan. Run `grep -rn "t('cg" src/` → 0 resultados esperado. Borrar el bloque de claves `cg*` de `es` y `en`, y `caregivers`/`healthSync` si quedaron sin uso.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm run test && npm run build`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/strings.ts src/screens/
git commit -m "chore: barrido de copys — fuera nombres demo y strings de cuidadores"
```

---

### Task 22: Configuración de Supabase (manual) + prueba end-to-end

**Files:** ninguno (config en dashboard + verificación funcional)

- [ ] **Step 1: Dashboard de Supabase** (proyecto `uwcktxqrfuelmscmkhbs`)

1. **Authentication → Providers → Email:** Enable = ON. "Confirm email" = ON. Buscar la opción de OTP / "Email OTP" y activarla (para que la confirmación sea un código de 6 dígitos y no un magic link). Revisar "Secure email change" — si está ON, el cambio de email pide confirmación en el email viejo y el nuevo; para cuentas anónimas (sin email viejo) debería bastar con el nuevo, pero si da problemas, desactivarlo.
2. **Authentication → URL Configuration → Site URL:** `https://dosi-app.vercel.app`. Añadir `http://localhost:5173` a "Redirect URLs" para pruebas locales.
3. **Authentication → Providers → Anonymous:** confirmar que sigue ON (lo estaba desde julio).
4. (Opcional) **Authentication → Email Templates:** traducir asunto/cuerpo de "Magic Link" / "Confirm signup" / "Change email address" al español.
5. Anotar en el spec / memoria: remitente por defecto limita a ~4 emails/hora; para más volumen, configurar SMTP propio (fuera de alcance).

- [ ] **Step 2: Arrancar dev server y correr el checklist manual**

Run: `npm run dev` → abrir `http://localhost:5173`

Checklist (marcar cada uno):
1. [ ] Primer arranque (borrar localStorage + cerrar sesión en Supabase, o ventana incógnito) → onboarding 4 pasos → con nombre y sin nombre → la app arranca **vacía**, sin medicinas falsas. Verificar en Supabase table editor que `medicines` no tiene filas nuevas para ese `user_id`.
2. [ ] Alta "Todos los días", 2 horarios (08:00, 20:00) → aparece en Hoy y en Inventario; en Supabase `medicines` tiene la fila con `schedule.freq='daily'`.
3. [ ] Alta "Días concretos" L-X-V → si hoy es uno de esos días aparece en Hoy, si no, no. Cambiar la hora del sistema o los `weekdays` para verificar ambos casos.
4. [ ] Alta "Cada 8 h", primera toma 08:00 → previsualización muestra `00:00 · 08:00 · 16:00`; en Hoy aparecen esas 3 dosis.
5. [ ] Alta "Durante 3 días" → en Supabase, editar `duration.startedOn` de esa fila a hace 5 días → recargar → la medicina aparece en Inventario → "Finalizadas", ya no genera dosis en Hoy, y en el detalle el botón "Reanudar / extender" la reactiva con `startedOn` = hoy.
6. [ ] Marcar una dosis como tomada / posponer / saltar → se refleja en Calendario y en Supabase `doses` (`status`).
7. [ ] Perfil → "Guardar mi cuenta" → email real → llega el código → confirmar → el email aparece en Perfil, el aviso de persistencia desaparece, las medicinas siguen ahí. En Supabase, el `user` pasó de anónimo a tener email, **mismo `id`**.
8. [ ] En otra ventana incógnito → Perfil → "Iniciar sesión en otra cuenta" → mismo email → código → entra y ve las mismas medicinas.
9. [ ] "Cerrar sesión" → vuelve a una cuenta anónima vacía, la app sigue usable.
10. [ ] "Borrar mis datos" → Hoy e Inventario quedan vacíos; en Supabase las filas de ese `user_id` se borraron.
11. [ ] En Supabase, quitar la clave `freq` de una fila de `medicines` → recargar la app → carga sin romperse (esa medicina se trata como `daily`).
12. [ ] DevTools → Application → Manifest → los iconos 192/512 cargan. Lighthouse PWA installable = sí.

- [ ] **Step 3: Anotar cualquier fallo y volver al task correspondiente.** No continuar a Task 23 hasta que los 12 pasen.

- [ ] **Step 4: Commit** (si hubo fixes)

```bash
git add -A
git commit -m "fix: ajustes tras prueba end-to-end de la Pieza A"
```

---

### Task 23: Verificación final y despliegue

**Files:** `memory/project_dosi.md` (fuera del repo — en `C:\Users\FGamerTech\.claude\projects\...`)

- [ ] **Step 1: Verificación limpia**

```bash
cd C:/Users/FGamerTech/Documents/Claude/Medicine_app/dosi
rm -f node_modules/.tmp/*.tsbuildinfo
npm run lint && npm run test && npm run build
```
Expected: los tres verdes. Anotar el output de `test` (N passed) y `build` (built in ...).

- [ ] **Step 2: Revisar el diff completo de la rama**

```bash
git log --oneline b427415..HEAD
git diff b427415..HEAD --stat
```
Confirmar que no quedan `console.log` de depuración, archivos temporales, ni `mock`/`caregiver` sin borrar (`grep -rn "mock\|[Cc]aregiver\|INITIAL_MEDS" src/` → 0).

- [ ] **Step 3: Push**

```bash
git push origin main
```
Vercel despliega solo. Seguir el build en `https://vercel.com/rutigliano1988s-projects/dosi-app`.

- [ ] **Step 4: Verificación en producción** (`https://dosi-app.vercel.app`, ventana incógnito)

Checklist reducido: arranque vacío (sin medicinas falsas) · alta en cada modo de frecuencia · "Durante N días" · Guardar mi cuenta (email OTP real) · Iniciar sesión desde otro navegador · instalar PWA con icono correcto.

- [ ] **Step 5: Actualizar la memoria del proyecto**

Editar `C:\Users\FGamerTech\.claude\projects\C--Users-FGamerTech-Documents-Claude-Medicine-app\memory\project_dosi.md`: añadir una sección "Web — Pieza A (2026-08-28) COMPLETA" resumiendo: fin de datos demo, motor de horarios `schedule.ts` con tests, cuentas por email OTP con vinculación anónima, iconos PWA. Nota de que la **Pieza B (Web Push)** es el siguiente proyecto y tiene su propio spec pendiente de escribir.

- [ ] **Step 6: Commit final de docs** (si se toca algo en el repo)

```bash
git add docs/
git commit -m "docs: cerrar Pieza A" && git push origin main
```

---

## Self-Review (rellenado por el autor del plan)

**1. Cobertura del spec:**

| Sección del spec | Task(s) |
|---|---|
| Modelo de datos (`Medicine` nuevo, `startedOn`) | Task 1 |
| Lectura tolerante con defaults | Task 2, 3 |
| Motor `schedule.ts` (`medState`, `isActiveOn`, `expandTimes`, `treatmentDay`, `buildTodayDoses`) | Task 5-9 |
| Tests unitarios + Vitest | Task 4-9 |
| `supabase.ts` API de auth (link/signin/verify/signout) | Task 12 |
| `AuthSheet.tsx` | Task 13 |
| `App.tsx` (persistKey, fin de siembra, estado account, buildTodayDoses(Date)) | Task 14 |
| Borrar `mock.ts`, hojas de cuidadores | Task 14 |
| `settings.ts` | Task 11 |
| Onboarding (slide 3, paso 4 nombre) | Task 15 |
| Perfil (reescritura, cuenta, sin toggles muertos/cuidadores/health/demo/signout suelto) | Task 16 |
| AddMed (frecuencias + duración reales, `type=date`) | Task 17 |
| Detail (historial real, estado Finalizada, reanudar/extender) | Task 18 |
| Inventory (badges por `medState`), Home (saludo con nombre) | Task 19 |
| PWA iconos + `index.html` + `vite.config` | Task 20 |
| Copys (`greetingName`, "este navegador", `emptyHomeTitle`) | Task 19, 21 |
| Config de Supabase (email OTP, Site URL) | Task 22 |
| Plan de pruebas (12 pasos) + verificación de build | Task 22, 23 |
| Despliegue + memoria | Task 23 |
| Fuera de alcance (Web Push, vista mensual, SMTP, cuidadores, iOS) | no implementado (correcto) |

Sin huecos.

**2. Placeholders:** El plan referencia doc externa de Supabase para el `type` exacto del `verifyOtp` de cambio de email — es una verificación real acotada, no un placeholder de diseño. Los binarios PNG (Task 20) se generan con comando explícito o se piden al usuario. Sin "TODO"/"TBD" en pasos de código.

**3. Consistencia de tipos:** `Medicine.schedule` = `MedSchedule` con `freq: 'daily'|'weekdays'|'interval'` en Task 1, usado igual en Tasks 2, 7, 9, 17. `duration.startedOn` obligatorio en Task 1, escrito en Tasks 3 (default), 17 (alta/edit), 18 (reanudar). `buildTodayDoses(meds, now: Date)` firma única en Tasks 9, 14. `getAccount()` devuelve `{ userId, email, isAnonymous }` en Tasks 12, 14, 16. `AuthSheet` props idénticas en Tasks 13 y 14.

Correcciones aplicadas durante el self-review: ninguna adicional (los tipos ya cuadran entre tasks).
