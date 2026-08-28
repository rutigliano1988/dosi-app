# Dosi Web — Pieza B: Recordatorios Web Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar al usuario a la hora de cada toma (y de stock bajo / caducidad) **aunque la app esté cerrada**, con botones "Tomar" / "Posponer" en la notificación, mediante Web Push + un backend en Supabase Edge Functions disparado por un cron externo cada minuto.

**Architecture:** Un motor de horarios compartido (`supabase/functions/_shared/schedule.ts`, copia verificada de `src/lib/schedule.ts` + `nowInTz`) y un núcleo puro de decisiones (`_shared/reminders.ts`) concentran toda la lógica, y se testean desde Vitest (Node) para que el gate del repo detecte cualquier deriva. Encima, dos Edge Functions Deno finas: `send-reminders` (cron cada minuto: materializa `doses` en la tz del usuario, decide qué toca, envía push, incrementa contador) y `dose-action` (la llama el service worker para Tomar/Posponer). En el cliente: un `public/push-sw.js` que Workbox importa, un módulo `src/lib/push.ts` para permiso/suscripción, y UI de activación en 3 sitios (hoja tras la 1ª medicina, banner en Hoy, fila en Perfil).

**Tech Stack:** React 19 + TypeScript + Vite 8, `vite-plugin-pwa` (modo `generateSW`/Workbox), Supabase JS v2, Supabase Edge Functions (Deno, `npm:web-push@3`), Vitest, cron-job.org.

**Spec:** `docs/superpowers/specs/2026-08-28-web-pieza-b-design.md`

## Global Constraints

- **TypeScript estricto** (`tsconfig.app.json`): `noUnusedLocals` y `noUnusedParameters` = true. Ningún import ni parámetro sin usar (prefijar `_` si hace falta). `verbatimModuleSyntax: true` → imports solo-de-tipo con `import type`. `erasableSyntaxOnly: true` → nada de `enum`/`namespace`/parámetros con modificador de acceso. Con `"jsx": "react-jsx"` **nunca** `import React from 'react'` salvo que se use `React.` en posición de valor (seguir el patrón del archivo que se edita).
- **Build de verificación:** `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — todo verde antes de cada commit que toque código. `npm run lint` = `oxlint`; los `warning` no rompen el gate pero no se dejan warnings nuevos evitables.
- **Fechas:** siempre hora local (`d.getFullYear()/getMonth()/getDate()`), nunca `toISOString()` para fechas de calendario. Formato ISO `YYYY-MM-DD`.
- **Idiomas:** cada string nueva se añade en `es` **y** en `en` en `src/i18n/strings.ts` (dos bloques, `const es` empieza ~línea 5, `const en` ~línea 150). Buscar una key vecina y añadir al lado en ambos.
- **Estilo visual:** estilos inline con tokens de `theme` (no CSS Modules, no Tailwind). Copiar el patrón del archivo vecino (`AuthSheet.tsx` para hojas, `ProfileScreen.tsx` `Row` para filas).
- **Commits temáticos y frecuentes**, uno por task. Mensajes multilínea en PowerShell con here-string `@'...'@` (el `'@` de cierre pegado a la izquierda, columna 0). Terminar cada mensaje con:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **Rama:** trabajar en `feat/web-pieza-b` desde `main`. Merge a `main` al final (auto-deploy Vercel).
- **Supabase:** proyecto `uwcktxqrfuelmscmkhbs` (`https://uwcktxqrfuelmscmkhbs.supabase.co`). Free tier — **se pausa tras ~7 días sin actividad de API**; si `get_project` devuelve `INACTIVE`, el usuario debe restaurarlo desde el dashboard antes de seguir (la acción `restore_project` la bloquea el clasificador).
- **Acciones que hace el usuario, no el agente** (marcadas `👤 USUARIO` en el plan): restaurar el proyecto Supabase, poner env var en Vercel, poner secretos de Edge Functions, crear el job en cron-job.org, E2E en un Android real. El agente prepara todo y da instrucciones exactas.
- **Semana ISO:** 1 = lunes … 7 = domingo.
- **`doses.id`:** `text`, formato `${medId}-${YYYY-MM-DD}-${HH:MM}`. `UNIQUE(user_id,med_id,date,time)`. Cascade con la medicina.
- **Motor duplicado:** `_shared/schedule.ts` es copia literal de las funciones puras de `src/lib/schedule.ts`. Cualquier cambio en una debe replicarse en la otra; el test anti-deriva (Task 1) es la red de seguridad.

---

## Phase 1 — Motor compartido y modelo de datos

### Task 1: Motor compartido `_shared/schedule.ts` + `_shared/types.ts` + test anti-deriva

**Files:**
- Create: `supabase/functions/_shared/types.ts`
- Create: `supabase/functions/_shared/schedule.ts`
- Create: `src/lib/schedule.shared.test.ts`
- Modify: `.oxlintrc.json` (ignorar los entrypoints Deno)

**Interfaces:**
- Produces (`_shared/schedule.ts`): `isoDate(d: Date): string`, `daysBetween(isoStart: string, end: Date): number`, `isoWeekday(d: Date): number`, `minToStr(total: number): string` **(exportada)**, `strToMin(hhmm: string): number` **(exportada)**, `isValidHHMM(t: string): boolean` **(exportada)**, `medState(med, today): 'active'|'paused'|'finished'`, `expandTimes(med): string[]`, `isActiveOn(med, day): boolean`, `treatmentDay(med, today): {current,total}|null`, `buildTodayDoses(meds, now: Date): Dose[]`, `shiftTime(time: string, mins: number): string`, `nowInTz(tz: string, base?: Date): Date`.
- Produces (`_shared/types.ts`): `Medicine`, `Dose`, `MedForm`, `DoseStatus`, `FreqKind`, `DurationKind`, `MedSchedule`, `MedDuration`, `rowToMed(r: Record<string, unknown>): Medicine`.
- Consumes: nada (módulos puros, sin imports de `src/` ni de Deno).

- [ ] **Step 1: Crear `supabase/functions/_shared/types.ts`**

```ts
// Tipos mínimos que necesita el motor compartido y las Edge Functions.
// NO importa de src/ (Deno no ve ese árbol). Debe seguir la forma de
// src/data/types.ts — si esa cambia, actualizar aquí también.

export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped' | 'missed';
export type FreqKind = 'daily' | 'weekdays' | 'interval';
export type DurationKind = 'ongoing' | 'days' | 'until';

export interface MedSchedule {
  freq: FreqKind;
  times: string[];
  weekdays?: number[];
  intervalHours?: 6 | 8 | 12;
}

export interface MedDuration {
  kind: DurationKind;
  days?: number;
  until?: string;
  startedOn: string;
}

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: string;
  schedule: MedSchedule;
  duration: MedDuration;
  stock: number;
  expiry?: string;
  notes?: string;
  paused?: boolean;
}

export interface Dose {
  id: string;
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string;
}

import { isoDate } from './schedule';

// Normaliza una fila `medicines` de Supabase (schedule/duration son jsonb y
// pueden venir en formato viejo). Equivalente a rowToMed de src/data/sync.ts.
export function rowToMed(r: Record<string, unknown>): Medicine {
  const sched = (r.schedule ?? {}) as Record<string, unknown>;
  const dur = (r.duration ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    dose: String(r.dose ?? ''),
    form: (r.form ?? 'pill') as MedForm,
    color: String(r.color ?? 'coral'),
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
      startedOn: typeof dur.startedOn === 'string' ? dur.startedOn : isoDate(new Date()),
    },
    stock: typeof r.stock === 'number' ? r.stock : 0,
    expiry: typeof r.expiry === 'string' ? r.expiry : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    paused: r.paused === true,
  };
}
```

- [ ] **Step 2: Crear `supabase/functions/_shared/schedule.ts`**

Copia **literal** de `src/lib/schedule.ts` con estos 4 cambios: (a) el import de tipos apunta a `./types`; (b) `minToStr`, `strToMin`, `isValidHHMM` llevan `export`; (c) se añade `nowInTz` al final; (d) nada más.

```ts
import type { Medicine, Dose } from './types';

// ─── Helpers de fecha (siempre hora local del Date que se pasa) ───────────────

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
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function minToStr(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function strToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isValidHHMM(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

// ─── Estado de un tratamiento ────────────────────────────────────────────────

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

// ─── Expansión de horas / actividad por día ──────────────────────────────────

export function expandTimes(med: Medicine): string[] {
  const s = med.schedule;
  let list: string[];
  if (s.freq === 'interval' && s.intervalHours && s.times[0]) {
    const anchor = strToMin(s.times[0]);
    const n = Math.floor(24 / s.intervalHours);
    list = [];
    for (let k = 0; k < n; k++) {
      list.push(minToStr(anchor + k * s.intervalHours * 60));
    }
  } else {
    list = [...s.times];
  }
  return [...new Set(list.filter(isValidHHMM))].sort();
}

export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  return true;
}

// ─── Día de tratamiento (solo duración 'days') ───────────────────────────────

export function treatmentDay(med: Medicine, today: Date): { current: number; total: number } | null {
  const dur = med.duration;
  if (dur.kind !== 'days' || dur.days == null) return null;
  const elapsed = daysBetween(dur.startedOn, today);
  const current = Math.min(Math.max(elapsed + 1, 1), dur.days);
  return { current, total: dur.days };
}

// ─── Dosis de hoy ────────────────────────────────────────────────────────────

export function buildTodayDoses(meds: Medicine[], now: Date): Dose[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const doses: Dose[] = [];
  for (const m of meds) {
    if (!isActiveOn(m, now)) continue;
    for (const t of expandTimes(m)) {
      const totalMin = strToMin(t);
      if (Number.isNaN(totalMin)) continue;
      const status: Dose['status'] =
        totalMin < nowMin - 30 ? 'missed'
        : totalMin < nowMin + 30 ? 'now'
        : 'upcoming';
      doses.push({ id: `${m.id}-${isoDate(now)}-${t}`, medId: m.id, time: t, totalMin, status });
    }
  }
  return doses.sort((a, b) => a.totalMin - b.totalMin);
}

export function shiftTime(time: string, mins: number): string {
  return minToStr(strToMin(time) + mins);
}

// ─── Reloj de pared en una zona horaria (solo _shared) ───────────────────────

/**
 * Devuelve un Date cuyos getters LOCALES (getFullYear/Month/Date/Hours/Minutes/Day)
 * reflejan el reloj de pared en `tz`. Se construye parseando el string 'en-CA'
 * ("2026-08-28, 19:00:39"). Si `tz` es inválida o el parseo falla, devuelve `base`.
 * Caveat DST: durante la hora del cambio de horario puede desfasar ±1 h (2 veces/año).
 */
export function nowInTz(tz: string, base: Date = new Date()): Date {
  try {
    const s = base.toLocaleString('en-CA', { timeZone: tz, hour12: false });
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return base;
    let hh = Number(m[4]);
    if (hh === 24) hh = 0; // algunos runtimes escriben "24:00" para medianoche
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, Number(m[5]), Number(m[6]));
  } catch {
    return base;
  }
}
```

- [ ] **Step 3: Escribir el test anti-deriva `src/lib/schedule.shared.test.ts` (debe fallar: el archivo compartido aún no lo cubre `include` pero el import resuelve; el test valida paridad y `nowInTz`)**

```ts
import { describe, it, expect } from 'vitest';
import * as browser from './schedule';
import * as shared from '../../supabase/functions/_shared/schedule';
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

// Vectores idénticos a schedule.test.ts — si el motor compartido diverge, falla aquí.
describe('paridad browser ↔ _shared', () => {
  const now = new Date(2026, 7, 28, 8, 5);
  const today = new Date(2026, 7, 28);

  it('isoDate', () => {
    expect(shared.isoDate(new Date(2026, 7, 28))).toBe(browser.isoDate(new Date(2026, 7, 28)));
    expect(shared.isoDate(new Date(2026, 7, 28))).toBe('2026-08-28');
  });

  it('daysBetween', () => {
    expect(shared.daysBetween('2026-08-25', new Date(2026, 7, 28))).toBe(3);
    expect(shared.daysBetween('2026-08-25', new Date(2026, 7, 28)))
      .toBe(browser.daysBetween('2026-08-25', new Date(2026, 7, 28)));
  });

  it('isoWeekday', () => {
    expect(shared.isoWeekday(new Date(2026, 7, 31))).toBe(1);
    expect(shared.isoWeekday(new Date(2026, 7, 30))).toBe(7);
  });

  it('medState', () => {
    expect(shared.medState(med(), today)).toBe('active');
    expect(shared.medState(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-25' } }), today)).toBe('finished');
    expect(shared.medState(med({ paused: true }), today)).toBe('paused');
  });

  it('expandTimes: interval 8h desde 08:00', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } })))
      .toEqual(['00:00', '08:00', '16:00']);
  });

  it('expandTimes: interval 6h desde 22:00', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'interval', times: ['22:00'], intervalHours: 6 } })))
      .toEqual(['04:00', '10:00', '16:00', '22:00']);
  });

  it('expandTimes: descarta formato inválido y de-duplica', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'daily', times: ['08:00', '08:00', '25:00', 'xx'] } })))
      .toEqual(['08:00']);
  });

  it('isActiveOn: weekdays', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(shared.isActiveOn(m, new Date(2026, 7, 31))).toBe(true);  // lunes
    expect(shared.isActiveOn(m, new Date(2026, 8, 1))).toBe(false);  // martes
  });

  it('buildTodayDoses: ids con fecha local y orden', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const doses = shared.buildTodayDoses(meds, now);
    expect(doses.map(d => d.id)).toEqual(['a-2026-08-28-08:00', 'b-2026-08-28-12:00', 'a-2026-08-28-20:00']);
  });

  it('buildTodayDoses: paridad exacta de estados con el motor del navegador', () => {
    const meds = [med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', '22:15', '23:30'] } })];
    const noche = new Date(2026, 7, 28, 22, 0);
    expect(shared.buildTodayDoses(meds, noche)).toEqual(browser.buildTodayDoses(meds, noche));
  });

  it('shiftTime', () => {
    expect(shared.shiftTime('23:55', 10)).toBe('00:05');
  });

  it('strToMin / minToStr exportadas', () => {
    expect(shared.strToMin('08:30')).toBe(510);
    expect(shared.minToStr(510)).toBe('08:30');
    expect(shared.minToStr(-10)).toBe('23:50');
  });
});

describe('nowInTz', () => {
  it('convierte un instante UTC al reloj de pared de la zona', () => {
    const d = shared.nowInTz('America/New_York', new Date('2026-01-15T12:00:00Z'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(7); // EST = UTC-5
  });

  it('cruza el cambio de día', () => {
    const d = shared.nowInTz('Asia/Tokyo', new Date('2026-01-15T20:00:00Z'));
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(5); // JST = UTC+9
  });

  it('tz inválida → devuelve base', () => {
    const base = new Date('2026-01-15T20:00:00Z');
    expect(shared.nowInTz('Not/AZone', base).getTime()).toBe(base.getTime());
  });
});
```

- [ ] **Step 4: Ejecutar el test — debe fallar**

Run: `npx vitest run src/lib/schedule.shared.test.ts`
Expected: FAIL — `Cannot find module '../../supabase/functions/_shared/schedule'` o, si los archivos ya existen de Step 1-2, PASA. Si Step 1-2 se hicieron antes, este step confirma verde.

- [ ] **Step 5: Ejecutar el test — debe pasar**

Run: `npx vitest run src/lib/schedule.shared.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 6: Ignorar los entrypoints Deno en oxlint**

`.oxlintrc.json` — añadir `ignorePatterns` (los `_shared/*.ts` SÍ se lintan; solo se ignoran los `index.ts` de las funciones, que usan globals de Deno e imports `npm:`):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "ignorePatterns": ["dist", "dev-dist", "supabase/functions/*/index.ts"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

- [ ] **Step 7: Gate completo**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: todo verde. `npm run test` ahora corre `schedule.test.ts` + `schedule.shared.test.ts`.

- [ ] **Step 8: Commit**

```powershell
git add supabase/functions/_shared/types.ts supabase/functions/_shared/schedule.ts src/lib/schedule.shared.test.ts .oxlintrc.json
git commit -m @'
feat(shared): motor de horarios compartido para Edge Functions + nowInTz

Copia verificada de src/lib/schedule.ts en supabase/functions/_shared/ con
strToMin/minToStr exportadas y nowInTz(tz). Test anti-deriva en Vitest
(schedule.shared.test.ts) con los mismos vectores que schedule.test.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 2: Núcleo puro de decisiones `_shared/reminders.ts`

**Files:**
- Create: `supabase/functions/_shared/reminders.ts`
- Create: `src/lib/reminders.shared.test.ts`

**Interfaces:**
- Consumes: `expandTimes`, `strToMin`, `daysBetween`, `isoDate` de `./schedule`; `Medicine` de `./types`.
- Produces:
  - `type DoseRow = { time: string; status: string; reminded_count: number; reminded_at: string | null }`
  - `dueReminder(dose: DoseRow, now: Date): boolean` — true si toca enviar aviso (1º o 2º) ahora.
  - `daysLeft(med: Medicine): number` — `floor(stock / max(1, nº tomas/día))`.
  - `type AlertDecision = 'send' | 'clear' | 'none'`
  - `stockAlertDecision(med: Medicine, alreadySent: boolean): AlertDecision`
  - `expiryAlertDecision(med: Medicine, today: Date, alreadySent: boolean): AlertDecision`

- [ ] **Step 1: Escribir el test `src/lib/reminders.shared.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  dueReminder, daysLeft, stockAlertDecision, expiryAlertDecision,
} from '../../supabase/functions/_shared/reminders';
import type { Medicine } from '../../supabase/functions/_shared/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1 pastilla', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 30,
    ...over,
  };
}

describe('dueReminder', () => {
  const at = (h: number, m: number) => new Date(2026, 7, 28, h, m);

  it('1er aviso: en punto y hasta +59 min', () => {
    expect(dueReminder({ time: '08:00', status: 'upcoming', reminded_count: 0, reminded_at: null }, at(8, 0))).toBe(true);
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 0, reminded_at: null }, at(8, 59))).toBe(true);
  });

  it('1er aviso: no antes de la hora, no pasados 60 min', () => {
    expect(dueReminder({ time: '08:00', status: 'upcoming', reminded_count: 0, reminded_at: null }, at(7, 59))).toBe(false);
    expect(dueReminder({ time: '08:00', status: 'missed', reminded_count: 0, reminded_at: null }, at(9, 0))).toBe(false);
  });

  it('no avisa dosis ya tomada o saltada', () => {
    expect(dueReminder({ time: '08:00', status: 'taken', reminded_count: 0, reminded_at: null }, at(8, 5))).toBe(false);
    expect(dueReminder({ time: '08:00', status: 'skipped', reminded_count: 0, reminded_at: null }, at(8, 5))).toBe(false);
  });

  it('2º aviso: 15 min después del 1º y dentro de la ventana de 60', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 3).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(8, 18))).toBe(true);
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(8, 17))).toBe(false);
  });

  it('2º aviso: no si ya pasaron 60 min de la hora de la toma', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 3).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(9, 1))).toBe(false);
  });

  it('no hay 3er aviso', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 20).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 2, reminded_at: remindedAt }, at(8, 40))).toBe(false);
  });
});

describe('daysLeft', () => {
  it('divide stock entre tomas por día', () => {
    expect(daysLeft(med({ stock: 30, schedule: { freq: 'daily', times: ['08:00'] } }))).toBe(30);
    expect(daysLeft(med({ stock: 30, schedule: { freq: 'daily', times: ['08:00', '20:00'] } }))).toBe(15);
    expect(daysLeft(med({ stock: 10, schedule: { freq: 'interval', times: ['06:00'], intervalHours: 8 } }))).toBe(3);
  });
});

describe('stockAlertDecision', () => {
  it('send cuando ≤3 días y no avisado', () => {
    expect(stockAlertDecision(med({ stock: 3 }), false)).toBe('send');
  });
  it('none cuando ≤3 días y ya avisado', () => {
    expect(stockAlertDecision(med({ stock: 3 }), true)).toBe('none');
  });
  it('clear cuando repuesto por encima del umbral y había aviso', () => {
    expect(stockAlertDecision(med({ stock: 20 }), true)).toBe('clear');
  });
  it('none cuando hay de sobra y nunca se avisó', () => {
    expect(stockAlertDecision(med({ stock: 20 }), false)).toBe('none');
  });
});

describe('expiryAlertDecision', () => {
  const today = new Date(2026, 7, 28);
  it('send cuando caduca dentro de 7 días y no avisado', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-09-02' }), today, false)).toBe('send');
  });
  it('none cuando ya avisado', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-09-02' }), today, true)).toBe('none');
  });
  it('clear cuando ya caducó (o se alejó) y había aviso', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-08-20' }), today, true)).toBe('clear');
    expect(expiryAlertDecision(med({ expiry: '2026-12-01' }), today, true)).toBe('clear');
  });
  it('sin expiry: none, o clear si había aviso viejo', () => {
    expect(expiryAlertDecision(med({ expiry: undefined }), today, false)).toBe('none');
    expect(expiryAlertDecision(med({ expiry: undefined }), today, true)).toBe('clear');
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `npx vitest run src/lib/reminders.shared.test.ts`
Expected: FAIL — `Cannot find module '../../supabase/functions/_shared/reminders'`.

- [ ] **Step 3: Crear `supabase/functions/_shared/reminders.ts`**

```ts
import type { Medicine } from './types';
import { expandTimes, strToMin, daysBetween, isoDate } from './schedule';

export interface DoseRow {
  time: string;
  status: string;
  reminded_count: number;
  reminded_at: string | null;
}

const WINDOW_MIN = 60;          // no se avisa una toma con más de 1 h de retraso
const SECOND_AFTER_MS = 15 * 60 * 1000;

/** true si toca enviar un aviso (1º o 2º) para esta dosis en el instante `now`. */
export function dueReminder(dose: DoseRow, now: Date): boolean {
  if (dose.status === 'taken' || dose.status === 'skipped') return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dueMin = strToMin(dose.time);
  if (nowMin >= dueMin + WINDOW_MIN) return false;
  if (dose.reminded_count === 0) return dueMin <= nowMin;
  if (dose.reminded_count === 1 && dose.reminded_at) {
    return now.getTime() - Date.parse(dose.reminded_at) >= SECOND_AFTER_MS;
  }
  return false;
}

/** Días de tratamiento que cubre el stock actual. */
export function daysLeft(med: Medicine): number {
  return Math.floor(med.stock / Math.max(1, expandTimes(med).length));
}

export type AlertDecision = 'send' | 'clear' | 'none';

export function stockAlertDecision(med: Medicine, alreadySent: boolean): AlertDecision {
  const dl = daysLeft(med);
  if (dl <= 3 && !alreadySent) return 'send';
  if (dl > 3 && alreadySent) return 'clear';
  return 'none';
}

export function expiryAlertDecision(med: Medicine, today: Date, alreadySent: boolean): AlertDecision {
  if (!med.expiry) return alreadySent ? 'clear' : 'none';
  const [y, m, d] = med.expiry.split('-').map(Number);
  const dUntil = daysBetween(isoDate(today), new Date(y, m - 1, d));
  if (dUntil > 0 && dUntil <= 7 && !alreadySent) return 'send';
  if ((dUntil <= 0 || dUntil > 7) && alreadySent) return 'clear';
  return 'none';
}
```

- [ ] **Step 4: Ejecutar — debe pasar**

Run: `npx vitest run src/lib/reminders.shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate completo**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/_shared/reminders.ts src/lib/reminders.shared.test.ts
git commit -m @'
feat(shared): núcleo puro de decisiones de recordatorio

dueReminder (ventana 1er/2º aviso, tope +60 min), daysLeft, y
stockAlertDecision / expiryAlertDecision (send | clear | none) para
"avisar una vez, re-armable". Cubierto por Vitest.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260828120000_pieza_b_push.sql` (registro en el repo; se aplica vía MCP)

**Interfaces:**
- Produces: tablas `public.push_subscriptions`, `public.sent_alerts`; columnas `public.doses.reminded_count`, `public.doses.reminded_at`.

- [ ] **Step 1: Comprobar que el proyecto Supabase está activo**

Usar el MCP: `get_project` con `id = uwcktxqrfuelmscmkhbs`.
Expected: `"status": "ACTIVE_HEALTHY"`.
Si es `INACTIVE`: **parar** y pedir al usuario que entre a
`https://supabase.com/dashboard/project/uwcktxqrfuelmscmkhbs` y pulse *Restore project*. No usar `restore_project` (lo bloquea el clasificador).

- [ ] **Step 2: Escribir el archivo de migración `supabase/migrations/20260828120000_pieza_b_push.sql`**

```sql
-- Pieza B — Web Push: suscripciones, alertas "una vez", contador de avisos por dosis.

create table if not exists public.push_subscriptions (
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

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create table if not exists public.sent_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  med_id  text not null references public.medicines(id) on delete cascade,
  kind    text not null check (kind in ('stock','expiry')),
  sent_at timestamptz not null default now(),
  primary key (user_id, med_id, kind)
);

alter table public.sent_alerts enable row level security;

create policy "own alerts" on public.sent_alerts
  for select using (auth.uid() = user_id);

alter table public.doses add column if not exists reminded_count smallint not null default 0;
alter table public.doses add column if not exists reminded_at    timestamptz;
```

- [ ] **Step 3: Aplicar la migración vía MCP**

Usar `apply_migration` con `project_id = uwcktxqrfuelmscmkhbs`, `name = "pieza_b_push"`, y el SQL de Step 2.
Expected: sin error.

- [ ] **Step 4: Verificar**

Usar `execute_sql` con:
```sql
select table_name from information_schema.tables
  where table_schema = 'public' and table_name in ('push_subscriptions','sent_alerts');
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'doses'
    and column_name in ('reminded_count','reminded_at');
```
Expected: 2 tablas + 2 columnas.

- [ ] **Step 5: Regenerar tipos (opcional pero recomendado)**

Usar `generate_typescript_types`; si el repo tuviera un archivo de tipos generados, actualizarlo. (Hoy el proyecto no lo usa — `sync.ts` accede sin tipos generados; se puede omitir.)

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260828120000_pieza_b_push.sql
git commit -m @'
feat(db): migración Pieza B — push_subscriptions, sent_alerts, doses.reminded_*

Aplicada a uwcktxqrfuelmscmkhbs vía MCP apply_migration.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

## Phase 2 — Cliente

### Task 4: Service worker de push (`public/push-sw.js`) + Workbox `importScripts`

**Files:**
- Create: `public/push-sw.js`
- Modify: `vite.config.ts` (bloque `workbox`)

**Interfaces:**
- Produces: un SW importado por el de Workbox que maneja `push` y `notificationclick`.
- Consumes: nada del bundle (el payload trae `endpoint`, `secret`, `actionUrl`).

- [ ] **Step 1: Crear `public/push-sw.js`**

```js
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
```

- [ ] **Step 2: Añadir `importScripts` en `vite.config.ts`**

Dentro del objeto `workbox`, junto a `globPatterns`:

```ts
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          // …sin cambios…
        ],
      },
```

- [ ] **Step 3: Verificar que el build copia el archivo y lo referencia**

Run: `npm run build`
Expected: verde. Luego:
Run: `grep -c "importScripts" dist/sw.js && ls dist/push-sw.js`
Expected: `importScripts` aparece ≥1 vez en `dist/sw.js` y `dist/push-sw.js` existe.

- [ ] **Step 4: Verificación en navegador (dev server + preview tools)**

- `preview_start` con `{ name: "dosi-dev" }` (crear `.claude/launch.json` si no existe: `runtimeExecutable: "npm"`, `runtimeArgs: ["run","dev"]`, `port: 5173`).
- En dev, `vite-plugin-pwa` sirve el SW solo si `devOptions.enabled`; si no está, basta con `npm run preview` sobre `dist`. Alternativa: `preview_start` apuntando a `npm run preview` (`port: 4173`).
- `read_console_messages`: no debe haber errores de registro del SW.
- `javascript_tool`: `await navigator.serviceWorker.getRegistration().then(r => r && r.active && r.active.scriptURL)` → devuelve la URL del SW.

- [ ] **Step 5: Commit**

```powershell
git add public/push-sw.js vite.config.ts
git commit -m @'
feat(pwa): service worker de Web Push (push + notificationclick)

public/push-sw.js importado por Workbox (workbox.importScripts). Muestra la
notificación con botones Tomar/Posponer y, al pulsarlos, hace POST a
dose-action sin abrir la app.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 5: `src/lib/push.ts` — soporte, permiso, suscripción

**Files:**
- Create: `src/lib/push.ts`
- Create: `src/lib/push.test.ts`

**Interfaces:**
- Consumes: `supabase` de `./supabase`.
- Produces:
  - `pushSupported(): boolean`
  - `pushPermission(): NotificationPermission` (`'default' | 'granted' | 'denied'`)
  - `isStandalone(): boolean`
  - `needsInstallFirst(): boolean`
  - `urlBase64ToUint8Array(base64: string): Uint8Array` (exportada para test)
  - `enablePush(userId: string): Promise<'ok' | 'denied' | 'unsupported' | 'needs-install'>`
  - `disablePush(): Promise<void>`
  - `syncPush(userId: string): Promise<void>`

- [ ] **Step 1: Escribir `src/lib/push.test.ts` (solo el helper puro se testea en Node; el resto usa APIs de navegador)**

```ts
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url con padding faltante', () => {
    // "hello" en base64 estándar es "aGVsbG8=" (5 bytes)
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });

  it('traduce -_ a +/ (base64url)', () => {
    // bytes [251, 255] → base64 "+/8=" → base64url "-_8"
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });

  it('una clave VAPID típica da 65 bytes', () => {
    const vapid = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    expect(urlBase64ToUint8Array(vapid).length).toBe(65);
  });
});
```

- [ ] **Step 2: Ejecutar — debe fallar**

Run: `npx vitest run src/lib/push.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Crear `src/lib/push.ts`**

```ts
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari: navigator.standalone
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && 'ontouchend' in document); // iPadOS se disfraza de Mac
}

export function needsInstallFirst(): boolean {
  return isIOS() && !isStandalone();
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function upsertSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      action_secret: crypto.randomUUID(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user_agent: navigator.userAgent.slice(0, 200),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
}

export async function enablePush(
  userId: string,
): Promise<'ok' | 'denied' | 'unsupported' | 'needs-install'> {
  if (!pushSupported()) return 'unsupported';
  if (needsInstallFirst()) return 'needs-install';

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await upsertSubscription(userId, sub);
  return 'ok';
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } finally {
    await sub.unsubscribe();
  }
}

export async function syncPush(userId: string): Promise<void> {
  if (!pushSupported() || pushPermission() !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    await enablePush(userId); // el permiso ya está concedido; re-suscribe en silencio
    return;
  }
  await upsertSubscription(userId, sub);
}
```

- [ ] **Step 4: Ejecutar — debe pasar**

Run: `npx vitest run src/lib/push.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. (`import.meta.env.VITE_VAPID_PUBLIC_KEY` no necesita d.ts — mismo patrón que `VITE_SUPABASE_URL` en `supabase.ts`.)

- [ ] **Step 6: Commit**

```powershell
git add src/lib/push.ts src/lib/push.test.ts
git commit -m @'
feat(push): src/lib/push.ts — soporte, permiso y suscripción Web Push

pushSupported/pushPermission/isStandalone/needsInstallFirst (iOS),
enablePush → ok|denied|unsupported|needs-install, disablePush, syncPush.
Upsert por endpoint en push_subscriptions con action_secret y timezone.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 6: `AppSettings` gana `pushAsked` y `pushBannerDismissed`

**Files:**
- Modify: `src/data/settings.ts`

**Interfaces:**
- Produces: `AppSettings` con `pushAsked: boolean` y `pushBannerDismissed: boolean` (por dispositivo, en `localStorage['dosi-settings']`, no van a Supabase).

- [ ] **Step 1: Editar `src/data/settings.ts`**

```ts
export interface AppSettings {
  themeName: ThemeName;
  lang: Lang;
  userName: string;
  onboarded: boolean;
  pushAsked: boolean;
  pushBannerDismissed: boolean;
}

const KEY = 'dosi-settings';
const DEFAULTS: AppSettings = {
  themeName: 'light', lang: 'es', userName: '', onboarded: false,
  pushAsked: false, pushBannerDismissed: false,
};
```

(`readSettings` ya hace `{ ...DEFAULTS, ...JSON.parse(raw) }`, así que los settings viejos sin estas keys toman el default `false`. Sin migración.)

- [ ] **Step 2: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```powershell
git add src/data/settings.ts
git commit -m @'
feat(settings): pushAsked y pushBannerDismissed en AppSettings

Ambos por dispositivo (localStorage), default false; los settings previos
los heredan por el spread de DEFAULTS.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 7: `PushSheet` — hoja de activación tras la 1ª medicina

**Files:**
- Create: `src/screens/PushSheet.tsx`
- Modify: `src/i18n/strings.ts` (bloques `es` y `en`)

**Interfaces:**
- Consumes: `enablePush`, `needsInstallFirst` de `../lib/push`.
- Produces: `export default function PushSheet(props: PushSheetProps)` con
  `PushSheetProps = { theme: Theme; t: (k: string, v?: Record<string,string|number>) => string; onClose: () => void; onEnable: () => Promise<'ok'|'denied'|'unsupported'|'needs-install'>; }`.
  La hoja NO llama a `enablePush` directamente: recibe `onEnable` de `App.tsx` (que conoce el `userId`).

- [ ] **Step 1: Añadir strings en `src/i18n/strings.ts` — en el bloque `es` (junto a `authResend`, ~línea 125) y en `en` (~línea 265)**

`es`:
```ts
  pushSheetTitle: '¿Te avisamos a la hora de cada toma?',
  pushSheetBody: 'Dosi te enviará una notificación puntual, aunque tengas la app cerrada. Podrás marcar la toma desde la propia notificación.',
  pushSheetEnable: 'Activar recordatorios',
  pushSheetLater: 'Ahora no',
  pushInstallTitle: 'Primero añade Dosi a tu pantalla de inicio',
  pushInstallBody: 'En iPhone/iPad los recordatorios necesitan que Dosi esté instalada: pulsa Compartir y luego "Añadir a pantalla de inicio". Después vuelve aquí para activarlos.',
  pushInstallGotIt: 'Entendido',
  pushDenied: 'Las notificaciones están bloqueadas en el navegador. Actívalas en los ajustes del sitio.',
  pushUnsupported: 'Este navegador no admite recordatorios.',
```

`en`:
```ts
  pushSheetTitle: 'Want a reminder at each dose time?',
  pushSheetBody: 'Dosi will send a timely notification even when the app is closed. You can mark the dose as taken right from the notification.',
  pushSheetEnable: 'Turn on reminders',
  pushSheetLater: 'Not now',
  pushInstallTitle: 'First add Dosi to your home screen',
  pushInstallBody: 'On iPhone/iPad, reminders need Dosi to be installed: tap Share, then "Add to Home Screen". Then come back here to turn them on.',
  pushInstallGotIt: 'Got it',
  pushDenied: 'Notifications are blocked in the browser. Enable them in the site settings.',
  pushUnsupported: 'This browser does not support reminders.',
```

- [ ] **Step 2: Crear `src/screens/PushSheet.tsx`** (mismo patrón de hoja que `AuthSheet.tsx`: overlay + panel inferior redondeado)

```tsx
import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';
import { needsInstallFirst } from '../lib/push';

type EnableResult = 'ok' | 'denied' | 'unsupported' | 'needs-install';

interface PushSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
  onEnable: () => Promise<EnableResult>;
}

export default function PushSheet({ theme, t, onClose, onEnable }: PushSheetProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const install = needsInstallFirst();

  const handleEnable = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await onEnable();
      if (r === 'ok') { onClose(); return; }
      if (r === 'needs-install') { setErr(t('pushInstallBody')); return; }
      if (r === 'denied') { setErr(t('pushDenied')); return; }
      setErr(t('pushUnsupported'));
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
              {install ? t('pushInstallTitle') : t('pushSheetTitle')}
            </div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>
            {install ? t('pushInstallBody') : t('pushSheetBody')}
          </div>

          {err && <div style={{ color: theme.danger, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          {install ? (
            <Btn theme={theme} kind="primary" size="md" full onClick={onClose}>
              {t('pushInstallGotIt')}
            </Btn>
          ) : (
            <>
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={handleEnable}>
                {t('pushSheetEnable')}
              </Btn>
              <button
                onClick={onClose}
                style={{
                  marginTop: 12, width: '100%', background: 'transparent', border: 0,
                  color: theme.textDim, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('pushSheetLater')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que `Btn` acepta esas props**

Run: `grep -n "kind\|size\|full\|disabled" src/components/Btn.tsx | head`
Expected: `Btn` ya usa `kind`/`size`/`full`/`disabled` (lo usa `AuthSheet`). Si alguna prop difiere, ajustar la llamada al patrón real de `Btn`.

- [ ] **Step 4: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. (Ojo `react/only-export-components`: el archivo solo exporta el componente por defecto, ok.)

- [ ] **Step 5: Commit**

```powershell
git add src/screens/PushSheet.tsx src/i18n/strings.ts
git commit -m @'
feat(push): PushSheet — hoja de activación de recordatorios

Se muestra tras guardar la 1ª medicina. Variante iOS que guía a instalar la
PWA antes de suscribir. onEnable lo inyecta App.tsx (conoce el userId).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 8: Banner "Activa los recordatorios" en `HomeScreen`

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes (nuevas props de `HomeScreen`): `showPushBanner: boolean`, `onEnablePush: () => void`, `onDismissPushBanner: () => void`.
- La lógica de *si* mostrarlo (`pushSupported() && pushPermission()==='default' && !settings.pushBannerDismissed`) vive en `App.tsx`; `HomeScreen` solo pinta cuando `showPushBanner`.

- [ ] **Step 1: Strings — `es` y `en`**

`es`:
```ts
  pushBannerTitle: 'Activa los recordatorios',
  pushBannerBody: 'Recibe un aviso a la hora de cada toma, aunque la app esté cerrada.',
  pushBannerCta: 'Activar',
```
`en`:
```ts
  pushBannerTitle: 'Turn on reminders',
  pushBannerBody: 'Get a nudge at each dose time, even when the app is closed.',
  pushBannerCta: 'Turn on',
```

- [ ] **Step 2: Ampliar `Props` y la firma de `HomeScreen`**

```tsx
interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  userName: string;
  meds: Medicine[];
  doses: Dose[];
  onMark: (doseId: string) => void;
  onSnooze: (doseId: string) => void;
  onSkip: (doseId: string) => void;
  onAddMed: () => void;
  onOpenMed: (medId: string) => void;
  onShowNotif: () => void;
  showPushBanner: boolean;
  onEnablePush: () => void;
  onDismissPushBanner: () => void;
}
```

```tsx
export default function HomeScreen({
  theme, t, userName, meds, doses, onMark, onSnooze, onAddMed, onOpenMed, onShowNotif,
  showPushBanner, onEnablePush, onDismissPushBanner,
}: Props) {
```

- [ ] **Step 3: Componente banner (añadir arriba del archivo, tras `DoseRow`)**

```tsx
function PushBanner({ theme, t, onEnable, onDismiss }: {
  theme: Theme;
  t: (key: string) => string;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{
        background: theme.accentSoft, borderRadius: 18, padding: 16,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ flexShrink: 0, marginTop: 2 }}>{I.bell(20, theme.accent)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.text }}>{t('pushBannerTitle')}</div>
          <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2, lineHeight: 1.4 }}>{t('pushBannerBody')}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onEnable} style={{
              background: theme.accent, color: theme.accentText, border: 0, borderRadius: 999,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>{t('pushBannerCta')}</button>
            <button onClick={onDismiss} style={{
              background: 'transparent', color: theme.textDim, border: 0,
              padding: '7px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{t('skip')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Renderizar el banner en los 3 returns de `HomeScreen`**

En el return "sin medicinas" y en el "nada hoy": justo después de `<TopBar .../>`. En el return principal: justo después de `<TopBar .../>` y antes de `{/* Progress card */}`. En los tres:

```tsx
      {showPushBanner && (
        <PushBanner theme={theme} t={t} onEnable={onEnablePush} onDismiss={onDismissPushBanner} />
      )}
```

- [ ] **Step 5: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 6: Verificación en navegador**

- `preview_start` (`npm run dev`), `navigate` a la Home con ≥1 medicina.
- `javascript_tool`: forzar `showPushBanner` no es trivial sin permisos; en su lugar comprobar en Task 10 con el cableado real. Aquí basta con `read_page` para confirmar que el componente compila y no rompe el layout cuando `showPushBanner` es `false` (no aparece nada).

- [ ] **Step 7: Commit**

```powershell
git add src/screens/HomeScreen.tsx src/i18n/strings.ts
git commit -m @'
feat(push): banner "Activa los recordatorios" en Hoy

Descartable por dispositivo. La decisión de mostrarlo (permiso default +
soportado + no descartado) la toma App.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 9: Fila "Recordatorios" en `ProfileScreen`

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes (nuevas props de `ProfileScreen`): `pushState: 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied'`, `onEnablePush: () => void`, `onDisablePush: () => void`.
- `App.tsx` calcula `pushState` a partir de `pushSupported()`, `needsInstallFirst()`, `pushPermission()`.

- [ ] **Step 1: Strings — `es` y `en`**

`es`:
```ts
  pushSection: 'Recordatorios',
  pushRowOn: 'Recordatorios: activados',
  pushRowOff: 'Recordatorios: desactivados',
  pushRowUnsupported: 'Este navegador no admite recordatorios',
  pushRowNeedsInstall: 'Añade Dosi a tu pantalla de inicio para activarlos',
  pushRowDenied: 'Bloqueados — actívalos en los ajustes del navegador',
```
`en`:
```ts
  pushSection: 'Reminders',
  pushRowOn: 'Reminders: on',
  pushRowOff: 'Reminders: off',
  pushRowUnsupported: 'This browser does not support reminders',
  pushRowNeedsInstall: 'Add Dosi to your home screen to enable them',
  pushRowDenied: 'Blocked — enable them in your browser settings',
```

- [ ] **Step 2: Ampliar `Props` y firma**

```tsx
interface Props {
  // …existentes…
  pushState: 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied';
  onEnablePush: () => void;
  onDisablePush: () => void;
}
```

```tsx
export default function ProfileScreen({
  theme, t, lang, themeName, userName, account,
  onUserNameChange, onThemeChange, onLangChange,
  onLinkAccount, onSignIn, onSignOut, onResetData,
  pushState, onEnablePush, onDisablePush,
  pendingSync = 0, onFlushSync,
}: Props) {
```

- [ ] **Step 3: Insertar la sección "Recordatorios" entre "Account" y "Accessibility"**

```tsx
      {/* Reminders */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('pushSection')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {pushState === 'granted' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowOn')} onPress={onDisablePush} first />
          ) : pushState === 'default' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowOff')} onPress={onEnablePush} first />
          ) : pushState === 'needs-install' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowNeedsInstall')} first />
          ) : pushState === 'denied' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowDenied')} first />
          ) : (
            <Row theme={theme} icon={I.bell} label={t('pushRowUnsupported')} first />
          )}
        </Card>
      </div>
```

- [ ] **Step 4: Confirmar que `I.bell` existe**

Run: `grep -n "bell" src/icons.tsx`
Expected: `bell:` está definido (lo usa `HomeScreen`).

- [ ] **Step 5: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde.

- [ ] **Step 6: Commit**

```powershell
git add src/screens/ProfileScreen.tsx src/i18n/strings.ts
git commit -m @'
feat(push): fila "Recordatorios" en Perfil con estado real

granted → tocar apaga; default → tocar activa; needs-install / denied /
unsupported → texto informativo.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 10: Cableado en `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `pushSupported`, `pushPermission`, `needsInstallFirst`, `enablePush`, `disablePush`, `syncPush` de `./lib/push`; `PushSheet` de `./screens/PushSheet`.
- Produces: pasa `showPushBanner`/`onEnablePush`/`onDismissPushBanner` a `HomeScreen`; `pushState`/`onEnablePush`/`onDisablePush` a `ProfileScreen`; renderiza `<PushSheet>` cuando toca.

- [ ] **Step 1: Imports**

```tsx
import { pushSupported, pushPermission, needsInstallFirst, enablePush, disablePush, syncPush } from './lib/push';
import PushSheet from './screens/PushSheet';
```

- [ ] **Step 2: Estado nuevo** (junto a los demás `useState`, tras `authSheet`)

```tsx
  const saved0 = saved; // `saved` ya existe arriba (readSettings())
  const [pushSheet, setPushSheet] = useState(false);
  const [pushAsked, setPushAsked] = useState<boolean>(saved0.pushAsked);
  const [pushBannerDismissed, setPushBannerDismissed] = useState<boolean>(saved0.pushBannerDismissed);
  // fuerza recomputar pushState tras conceder/denegar permiso
  const [pushTick, setPushTick] = useState(0);
```

> Nota: `saved` se lee al principio del componente (`const saved = readSettings();`). No volver a llamar `readSettings()`; reutilizar `saved`.

- [ ] **Step 3: Derivados** (tras `const theme = getTheme(...)`)

```tsx
  void pushTick; // dependencia para recomputar en cada requestPermission
  const pushState: 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied' =
    !pushSupported() ? 'unsupported'
    : needsInstallFirst() ? 'needs-install'
    : pushPermission() === 'granted' ? 'granted'
    : pushPermission() === 'denied' ? 'denied'
    : 'default';

  const showPushBanner =
    pushSupported() && !needsInstallFirst() && pushPermission() === 'default' && !pushBannerDismissed;
```

- [ ] **Step 4: Handlers** (junto a `handleSignOut`)

```tsx
  const doEnablePush = async () => {
    const uid = userId.current;
    if (!uid) return 'denied' as const;
    const r = await enablePush(uid);
    setPushTick(n => n + 1);
    if (r === 'ok') setToast({ message: t('pushEnabledToast'), kind: 'success', icon: I.check(16, '#fff') });
    if (r === 'denied') setToast({ message: t('pushDenied'), kind: 'neutral' });
    return r;
  };

  const doDisablePush = async () => {
    await disablePush();
    setPushTick(n => n + 1);
    setToast({ message: t('pushDisabledToast'), kind: 'neutral' });
  };

  const dismissPushBanner = () => {
    setPushBannerDismissed(true);
    writeSettings({ pushBannerDismissed: true });
  };

  const markPushAsked = () => {
    setPushAsked(true);
    writeSettings({ pushAsked: true });
  };
```

- [ ] **Step 5: Strings nuevas — `es` y `en`**

`es`: `pushEnabledToast: 'Recordatorios activados'`, `pushDisabledToast: 'Recordatorios desactivados'`
`en`: `pushEnabledToast: 'Reminders on'`, `pushDisabledToast: 'Reminders off'`
(`pushDenied` ya existe de Task 7.)

- [ ] **Step 6: `syncPush` en arranque y tras iniciar sesión**

En el `useEffect` de arranque de Supabase, tras `setAccount(await getAccount());`:
```tsx
      if (pushPermission() === 'granted') { syncPush(uid).catch(() => {}); }
```
En el `onSuccess` de `AuthSheet` (rama `if (newUid && newUid !== userId.current)`), tras `userId.current = newUid;`:
```tsx
              if (pushPermission() === 'granted') { syncPush(newUid).catch(() => {}); }
```

- [ ] **Step 7: `disablePush` al cerrar sesión**

En `handleSignOut`, antes de `const uid = await signOutToAnon();`:
```tsx
    await disablePush().catch(() => {});
```

- [ ] **Step 8: Disparar `PushSheet` al guardar la 1ª medicina**

En el `onSave` de `AddMedScreen`, rama de creación (`else { ... setMeds(ms => [...ms, newMed]); ... }`), después de `persistMed(newMed);`:
```tsx
            if (meds.length === 0 && !pushAsked && pushSupported() && pushPermission() === 'default') {
              setPushSheet(true);
            }
            markPushAsked();
```
> `meds.length === 0` se evalúa con el estado previo al `setMeds` → correcto: era la 1ª. Aun así llamar `markPushAsked()` siempre (aunque no se muestre la hoja, para no re-evaluar en cada alta).
> Corrección: solo marcar "asked" cuando de verdad se enseñó algo o el usuario ya tiene permiso resuelto. Para simplicidad y coincidir con el spec ("En cualquier caso `settings.pushAsked = true`"), se marca siempre aquí.

- [ ] **Step 9: Pasar props a `HomeScreen`**

```tsx
        <HomeScreen
          theme={theme} t={t} lang={lang}
          userName={userName}
          meds={meds} doses={doses}
          onMark={markTaken} onSnooze={snoozeDose} onSkip={skipDose}
          onAddMed={() => setScreen('addMed')}
          onOpenMed={openMed}
          onShowNotif={showNotif}
          showPushBanner={showPushBanner}
          onEnablePush={() => { doEnablePush(); }}
          onDismissPushBanner={dismissPushBanner}
        />
```

- [ ] **Step 10: Pasar props a `ProfileScreen`**

```tsx
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
          pushState={pushState}
          onEnablePush={() => { doEnablePush(); }}
          onDisablePush={() => { doDisablePush(); }}
          pendingSync={pendingSync}
          onFlushSync={flushSync}
        />
```

- [ ] **Step 11: Renderizar `<PushSheet>`** (junto a `{authSheet && (...)}`)

```tsx
      {pushSheet && (
        <PushSheet
          theme={theme} t={t}
          onClose={() => setPushSheet(false)}
          onEnable={doEnablePush}
        />
      )}
```

- [ ] **Step 12: Gate**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde. Vigilar `noUnusedLocals` (p.ej. `saved0` — si molesta, usar `saved` directamente y borrar `saved0`).

- [ ] **Step 13: Verificación en navegador (dev server)**

- `preview_start` `{ name: "dosi-dev" }`.
- `read_console_messages`: sin errores.
- `navigate` a la app, completar onboarding, añadir 1 medicina → debe aparecer `PushSheet` (`read_page` muestra el título `pushSheetTitle`).
- Pulsar "Ahora no" → la hoja se cierra; ir a Perfil → `read_page` muestra la fila "Recordatorios: desactivados" (o "no admite" según el navegador de preview).
- Home → banner "Activa los recordatorios" visible; pulsar el descarte → desaparece; recargar → sigue oculto (localStorage).
- (Conceder permiso de verdad en el navegador de preview es opcional; el E2E real es Task 14.)
- `screenshot` de la hoja y del banner para el usuario.

- [ ] **Step 14: Commit**

```powershell
git add src/App.tsx src/i18n/strings.ts
git commit -m @'
feat(push): cableado en App.tsx — hoja tras 1ª medicina, banner, Perfil, sync

syncPush en arranque y tras iniciar sesión; disablePush al cerrar sesión;
PushSheet cuando se guarda la primera medicina; pushState real a Perfil.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

## Phase 3 — Backend (Edge Functions)

> Las funciones Deno no entran en el gate de Vitest/tsc/oxlint (oxlint las ignora por
> `ignorePatterns`; `tsc -b` no las ve porque nada de `src/` las importa). Su lógica pura
> ya está testeada en `_shared/` (Tasks 1-2). Se verifican por E2E manual (Task 14) y,
> opcionalmente, con `deno test` (Step marcado "opcional").

### Task 11: `send-reminders` (Edge Function)

**Files:**
- Create: `supabase/functions/_shared/edge.ts`
- Create: `supabase/functions/send-reminders/index.ts`
- Create: `supabase/functions/send-reminders/deno.json`
- Create: `supabase/config.toml` (o ampliar si existe)

**Interfaces:**
- Consumes: `_shared/schedule.ts` (`isoDate`, `nowInTz`, `buildTodayDoses`, `strToMin`, `medState`, `expandTimes`), `_shared/reminders.ts` (`dueReminder`, `stockAlertDecision`, `expiryAlertDecision`, `daysLeft`), `_shared/types.ts` (`rowToMed`, `Medicine`).
- Produces (`_shared/edge.ts`): `sbAdmin(): SupabaseClient` (service role), `webpushSend(sub, payloadJson): Promise<number>` (devuelve HTTP status; 0 si ok), `CORS_HEADERS`, `corsPreflight(req): Response | null`.
- HTTP: `POST` con header `X-Cron-Secret: <CRON_SECRET>` → `200 { users, pushes }`; secreto inválido → `401`.

- [ ] **Step 1: Crear `supabase/functions/_shared/edge.ts`**

```ts
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:rutigliano2@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

export function sbAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

export interface PushRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  action_secret: string;
}

/** Envía una notificación. Devuelve 0 si fue bien, o el statusCode HTTP si falló. */
export async function webpushSend(sub: PushRow, payloadJson: string): Promise<number> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payloadJson,
    );
    return 0;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return typeof code === 'number' ? code : 500;
  }
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://dosi-app.vercel.app',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function corsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return null;
}
```

- [ ] **Step 2: Crear `supabase/functions/send-reminders/deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 3: Crear `supabase/functions/send-reminders/index.ts`**

```ts
import { sbAdmin, webpushSend, type PushRow } from '../_shared/edge.ts';
import {
  isoDate, nowInTz, buildTodayDoses, strToMin, medState, expandTimes,
} from '../_shared/schedule.ts';
import {
  dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft,
} from '../_shared/reminders.ts';
import { rowToMed, type Medicine } from '../_shared/types.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (req.headers.get('X-Cron-Secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const sb = sbAdmin();
  const { data: subs, error: subErr } = await sb.from('push_subscriptions').select('*');
  if (subErr) return new Response(subErr.message, { status: 500 });

  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  let pushes = 0;

  for (const [userId, userSubs] of byUser) {
    const tz = [...userSubs].sort(
      (a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at),
    )[0].timezone as string;
    const now = nowInTz(tz);
    const today = isoDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const { data: medRows } = await sb.from('medicines').select('*').eq('user_id', userId);
    const meds: Medicine[] = (medRows ?? []).map((r) => rowToMed(r as Record<string, unknown>));

    // 1) materializar las dosis de hoy (no pisa taken/skipped/pospuestas)
    const fresh = buildTodayDoses(meds, now);
    if (fresh.length > 0) {
      await sb.from('doses').upsert(
        fresh.map((d) => ({
          id: d.id, user_id: userId, med_id: d.medId, date: today,
          time: d.time, total_min: d.totalMin, status: 'upcoming',
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
    }

    // 2) avisos de toma
    const { data: dosesHoy } = await sb
      .from('doses').select('*').eq('user_id', userId).eq('date', today);

    for (const dose of dosesHoy ?? []) {
      const ok = dueReminder(
        {
          time: dose.time,
          status: dose.status,
          reminded_count: dose.reminded_count ?? 0,
          reminded_at: dose.reminded_at ?? null,
        },
        now,
      );
      if (!ok) continue;

      const med = meds.find((m) => m.id === dose.med_id);
      if (!med) continue;

      const firstNote = med.notes ? ' · ' + med.notes.split('.')[0] : '';
      const base = {
        kind: 'dose',
        title: `Hora de tu ${med.name}`,
        body: med.dose + firstNote,
        tag: dose.id,
        doseId: dose.id,
        actionUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/dose-action`,
      };

      for (const sub of userSubs as PushRow[]) {
        const status = await webpushSend(
          sub,
          JSON.stringify({ ...base, endpoint: sub.endpoint, secret: sub.action_secret }),
        );
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (status === 0) {
          pushes++;
        }
      }

      await sb.from('doses')
        .update({ reminded_count: (dose.reminded_count ?? 0) + 1, reminded_at: new Date().toISOString() })
        .eq('id', dose.id);
    }
    void nowMin; void strToMin; // usados por el motor; referencias para el linter Deno si hiciera falta

    // 3) alertas de stock / caducidad (solo medicinas activas)
    for (const med of meds) {
      if (medState(med, now) !== 'active') continue;

      const stockSent = await sb.from('sent_alerts')
        .select('med_id').eq('user_id', userId).eq('med_id', med.id).eq('kind', 'stock').maybeSingle();
      const stockDec = stockAlertDecision(med, Boolean(stockSent.data));
      if (stockDec === 'send') {
        for (const sub of userSubs as PushRow[]) {
          const st = await webpushSend(sub, JSON.stringify({
            kind: 'stock', title: `Se acaba tu ${med.name}`,
            body: `Te quedan ~${daysLeft(med)} días`, tag: `stock-${med.id}`,
            endpoint: sub.endpoint, secret: sub.action_secret,
          }));
          if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          else if (st === 0) pushes++;
        }
        await sb.from('sent_alerts').upsert(
          { user_id: userId, med_id: med.id, kind: 'stock', sent_at: new Date().toISOString() },
          { onConflict: 'user_id,med_id,kind' },
        );
      } else if (stockDec === 'clear') {
        await sb.from('sent_alerts').delete()
          .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'stock');
      }

      const expSent = await sb.from('sent_alerts')
        .select('med_id').eq('user_id', userId).eq('med_id', med.id).eq('kind', 'expiry').maybeSingle();
      const expDec = expiryAlertDecision(med, now, Boolean(expSent.data));
      if (expDec === 'send') {
        for (const sub of userSubs as PushRow[]) {
          const st = await webpushSend(sub, JSON.stringify({
            kind: 'expiry', title: `${med.name} caduca pronto`,
            body: `El ${med.expiry}`, tag: `expiry-${med.id}`,
            endpoint: sub.endpoint, secret: sub.action_secret,
          }));
          if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          else if (st === 0) pushes++;
        }
        await sb.from('sent_alerts').upsert(
          { user_id: userId, med_id: med.id, kind: 'expiry', sent_at: new Date().toISOString() },
          { onConflict: 'user_id,med_id,kind' },
        );
      } else if (expDec === 'clear') {
        await sb.from('sent_alerts').delete()
          .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'expiry');
      }
    }
    void expandTimes; // referenciado por daysLeft internamente
  }

  return new Response(JSON.stringify({ users: byUser.size, pushes }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
});
```

> Nota sobre los `void x;`: elimínalos si el linter de Deno no se queja. Están solo para dejar claro qué del motor se usa indirectamente. **No dejar imports sin usar de verdad** — si `strToMin`/`expandTimes`/`nowMin` no se referencian, quitarlos del import (el motor los usa internamente, no hace falta importarlos aquí). Revisar al escribir: los imports realmente necesarios en este archivo son `isoDate, nowInTz, buildTodayDoses, medState` de schedule y `dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft` de reminders. Ajustar el import a esos.

- [ ] **Step 4: Crear/ampliar `supabase/config.toml`**

```toml
project_id = "uwcktxqrfuelmscmkhbs"

[functions.send-reminders]
verify_jwt = false

[functions.dose-action]
verify_jwt = false
```

- [ ] **Step 5: Limpiar imports no usados en `index.ts`**

Reescribir la línea de import de `schedule.ts` para que solo traiga lo que se usa:
```ts
import { isoDate, nowInTz, buildTodayDoses, medState } from '../_shared/schedule.ts';
import { dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft } from '../_shared/reminders.ts';
```
y borrar los `void ...;`.

- [ ] **Step 6: (opcional) `deno test` del handler**

Si hay Deno instalado (`deno --version`): crear `supabase/functions/send-reminders/index.test.ts` con un cliente Supabase apuntando a una branch de pruebas y sembrar 1 usuario + 1 medicina + 1 suscripción de juguete; afirmar que a la hora de la toma `reminded_count` pasa a 1 y no vuelve a subir dentro de los 15 min. Si no hay Deno, **saltar** este step: la lógica pura ya está cubierta y el E2E de Task 14 valida el resto.

- [ ] **Step 7: Desplegar vía MCP**

Usar `deploy_edge_function` (`project_id = uwcktxqrfuelmscmkhbs`, `name = "send-reminders"`, incluyendo `_shared/*.ts` como archivos del bundle si el MCP lo pide). Confirmar en `list_edge_functions` que aparece con `verify_jwt = false`.
> Si el despliegue exige los secretos ya puestos, hacer Task 13 Steps 1-3 antes de este step.

- [ ] **Step 8: Smoke test**

`curl` (o `execute_sql` para inspeccionar). Sin secreto correcto:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/send-reminders
```
Expected: `401`.
Con secreto (sustituir `<CRON_SECRET>`):
```bash
curl -s -X POST -H "X-Cron-Secret: <CRON_SECRET>" \
  https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/send-reminders
```
Expected: `200 {"users":N,"pushes":M}` (con 0 suscripciones: `{"users":0,"pushes":0}`).

- [ ] **Step 9: Commit**

```powershell
git add supabase/functions/_shared/edge.ts supabase/functions/send-reminders supabase/config.toml
git commit -m @'
feat(edge): send-reminders — materializa doses en tz del usuario y notifica

Cron cada minuto (X-Cron-Secret). Usa el motor y el núcleo puro de _shared/.
Borra suscripciones 404/410. Alertas de stock/caducidad una vez, re-armables.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

### Task 12: `dose-action` (Edge Function)

**Files:**
- Create: `supabase/functions/dose-action/index.ts`
- Create: `supabase/functions/dose-action/deno.json` (igual que el de send-reminders)

**Interfaces:**
- Consumes: `_shared/edge.ts` (`sbAdmin`, `CORS_HEADERS`, `corsPreflight`), `_shared/schedule.ts` (`shiftTime`, `strToMin`).
- HTTP: `OPTIONS` → 200 CORS. `POST { endpoint, secret, doseId, action }`, `action ∈ ('take','snooze')`.
  - secreto inválido → `401`; dosis inexistente → `404`; ok → `200 { ok: true }`.
  - `take`: `status='taken'` + `stock = max(0, stock-1)` **solo si `dose.status !== 'taken'`**.
  - `snooze`: `time += 10`, `total_min` recalculado, `reminded_count = 0`, `reminded_at = null`.

- [ ] **Step 1: Crear `supabase/functions/dose-action/deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 2: Crear `supabase/functions/dose-action/index.ts`**

```ts
import { sbAdmin, CORS_HEADERS, corsPreflight } from '../_shared/edge.ts';
import { shiftTime, strToMin } from '../_shared/schedule.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let payload: { endpoint?: string; secret?: string; doseId?: string; action?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { endpoint, secret, doseId, action } = payload;
  if (!endpoint || !secret || !doseId || (action !== 'take' && action !== 'snooze')) {
    return json({ error: 'bad request' }, 400);
  }

  const sb = sbAdmin();

  const { data: sub } = await sb
    .from('push_subscriptions')
    .select('user_id, action_secret')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!sub || sub.action_secret !== secret) return json({ error: 'unauthorized' }, 401);

  const { data: dose } = await sb
    .from('doses')
    .select('*')
    .eq('id', doseId)
    .eq('user_id', sub.user_id)
    .maybeSingle();
  if (!dose) return json({ error: 'not found' }, 404);

  if (action === 'take') {
    if (dose.status !== 'taken') {
      await sb.from('doses').update({ status: 'taken' }).eq('id', doseId);
      const { data: med } = await sb
        .from('medicines')
        .select('stock')
        .eq('id', dose.med_id)
        .eq('user_id', sub.user_id)
        .maybeSingle();
      if (med) {
        await sb.from('medicines')
          .update({ stock: Math.max(0, (med.stock ?? 0) - 1) })
          .eq('id', dose.med_id)
          .eq('user_id', sub.user_id);
      }
    }
    return json({ ok: true });
  }

  // snooze
  const nt = shiftTime(dose.time, 10);
  await sb.from('doses')
    .update({ time: nt, total_min: strToMin(nt), reminded_count: 0, reminded_at: null })
    .eq('id', doseId);
  return json({ ok: true });
});
```

- [ ] **Step 3: Desplegar vía MCP**

`deploy_edge_function` (`name = "dose-action"`). Confirmar `verify_jwt = false` en `list_edge_functions`.

- [ ] **Step 4: Smoke test**

```bash
# preflight
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/dose-action
# → 200

# secreto inválido
curl -s -w " %{http_code}" -X POST -H "content-type: application/json" \
  -d '{"endpoint":"x","secret":"x","doseId":"x","action":"take"}' \
  https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/dose-action
# → {"error":"unauthorized"} 401
```

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/dose-action
git commit -m @'
feat(edge): dose-action — Tomar / Posponer desde la notificación

Identidad por endpoint + action_secret (verify_jwt=false). take es
idempotente y solo descuenta stock si la dosis no estaba ya tomada; snooze
mueve +10 min y resetea el contador de avisos. CORS para dosi-app.vercel.app.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
```

---

## Phase 4 — Puesta en marcha

### Task 13: VAPID, secretos, env var, cron-job.org

**Files:** ninguno (config de infraestructura). Registrar los valores públicos en memoria/spec, **nunca** las claves privadas ni el `CRON_SECRET` en el repo.

- [ ] **Step 1: Generar el par VAPID**

Run: `npx web-push generate-vapid-keys`
Guardar `Public Key` y `Private Key` de forma temporal (no commitear).

- [ ] **Step 2: 👤 USUARIO — env var en Vercel**

Pedir al usuario que en `https://vercel.com/rutigliano1988s-projects/dosi-app` → Settings → Environment Variables añada (Production):
- `VITE_VAPID_PUBLIC_KEY` = `<Public Key>` (pegar sin espacios ni saltos; el cliente hace `.trim()` pero mejor limpio).

Alternativa si el usuario prefiere CLI: `npx vercel env add VITE_VAPID_PUBLIC_KEY production` (hay `.vercel/` en el repo).

- [ ] **Step 3: 👤 USUARIO — secretos de Edge Functions en Supabase**

`https://supabase.com/dashboard/project/uwcktxqrfuelmscmkhbs/settings/functions` → Edge Functions → Secrets. Añadir:
- `VAPID_PUBLIC_KEY` = `<Public Key>`
- `VAPID_PRIVATE_KEY` = `<Private Key>`
- `VAPID_SUBJECT` = `mailto:rutigliano2@gmail.com`
- `CRON_SECRET` = cadena aleatoria de 32+ caracteres (p.ej. salida de `openssl rand -hex 24`; el agente puede generarla y dársela al usuario).

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente.)

- [ ] **Step 4: Re-desplegar las funciones si se desplegaron antes de los secretos**

Si Task 11/12 se hicieron antes de este paso, volver a `deploy_edge_function` para `send-reminders` y `dose-action` para que tomen los secretos (o confirmar que Supabase los lee en caliente — normalmente sí, sin re-deploy).

- [ ] **Step 5: Verificar `send-reminders` con el secreto real**

```bash
curl -s -X POST -H "X-Cron-Secret: <CRON_SECRET>" \
  https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/send-reminders
```
Expected: `200 {"users":0,"pushes":0}` (aún sin suscripciones).

- [ ] **Step 6: 👤 USUARIO — crear el cron en cron-job.org**

- Cuenta en `https://cron-job.org` (gratis).
- Nuevo cronjob:
  - URL: `https://uwcktxqrfuelmscmkhbs.supabase.co/functions/v1/send-reminders`
  - Método: `POST`
  - Schedule: cada 1 minuto (`* * * * *`)
  - Header personalizado: `X-Cron-Secret: <CRON_SECRET>`
  - (Opcional) notificación por email si falla N veces seguidas.
- Guardar y activar.

- [ ] **Step 7: Confirmar tráfico**

Tras 2-3 min, usar el MCP `query_logs` (`service = "edge-function"`) o el dashboard de cron-job.org: debe haber invocaciones `200` cada minuto. Esto además **mantiene el proyecto Supabase despierto**.

- [ ] **Step 8: Actualizar memoria**

Añadir a `memory/reference_external.md` una sección "Web Push (Pieza B)": ubicación de los secretos (Supabase Functions Secrets), que `VITE_VAPID_PUBLIC_KEY` está en Vercel, y que el cron vive en cron-job.org (cada 1 min, header `X-Cron-Secret`). **No** escribir las claves. Actualizar `memory/project_dosi.md` y `MEMORY.md` cuando Task 14 pase.

- [ ] **Step 9: Commit** (solo el archivo de memoria del repo si aplica; los secretos no se commitean)

No hay cambios de código en este task. Si se generó `supabase/config.toml` en Task 11, ya está commiteado. Nada que commitear aquí salvo notas.

---

### Task 14: E2E en Android real + merge

**Files:**
- Merge `feat/web-pieza-b` → `main`.

- [ ] **Step 1: Merge del cliente y deploy**

```powershell
git checkout main
git merge --no-ff feat/web-pieza-b -m @'
Merge: Pieza B — Recordatorios Web Push

Motor compartido + núcleo puro (Vitest), service worker de push, src/lib/push.ts,
UI de activación (hoja tras 1ª medicina, banner en Hoy, fila en Perfil),
Edge Functions send-reminders y dose-action, cron externo cada minuto.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
'@
git push origin main
```
Esperar el deploy de Vercel (usar MCP `list_deployments` / `get_deployment` o `curl` al bundle en `https://dosi-app.vercel.app`).

- [ ] **Step 2: 👤 USUARIO — checklist E2E en un Android real (Chrome)**

Guiar al usuario paso a paso; que confirme cada punto:

1. Abrir `https://dosi-app.vercel.app` en Chrome Android. (Opcional: "Añadir a pantalla de inicio".)
2. Completar onboarding y **crear la 1ª medicina** con una toma ~2-3 min en el futuro y stock alto → aparece la hoja *"¿Te avisamos…?"* → **Activar** → aceptar el permiso del navegador.
3. Cerrar la pestaña por completo (o bloquear el teléfono).
4. A la hora de la toma (±1 min) → **llega la notificación** "Hora de tu <medicina>" con botones **Tomar** / **Posponer**.
5. Pulsar **Posponer** → a los ~10 min vuelve a avisar.
6. En el 2º aviso pulsar **Tomar** → abrir la app → la toma aparece como *tomada* y el stock bajó 1 (sin haber abierto la app para marcarla).
7. Dejar pasar una toma sin tocar la notificación → **2º aviso a los ~15 min** → luego la app la muestra como *perdida*.
8. Editar una medicina y ponerle stock 2 (≤ 3 días) → en el siguiente minuto del cron → **push "Se acaba tu <medicina>"**. Reponer stock → no vuelve a avisar; al bajar otra vez, re-arma.
9. Perfil → **Recordatorios: activados** → tocar → *desactivados* → ya no llegan avisos.
10. (Si hay iPhone disponible) abrir en Safari sin instalar → la hoja pide *"Añade Dosi a tu pantalla de inicio"*; tras instalar y abrir como PWA → **Activar** funciona.

- [ ] **Step 3: Si algo falla**

Usar `query_logs` (`service = "edge-function"`) para ver errores de `send-reminders`/`dose-action`; `read_network_requests` en el navegador para el `POST` a `dose-action`. Diagnosticar → arreglar en `feat/web-pieza-b` → re-merge. Fallos típicos:
- No llega nada → revisar secreto VAPID (público en Vercel debe ser el MISMO par que el privado en Supabase), permiso concedido, fila en `push_subscriptions`.
- `dose-action` 401 → `action_secret` desalineado (el cliente hizo `upsert` con uno nuevo tras el último `syncPush`; el payload de la notificación lo lleva embebido, así que solo falla si la suscripción se re-creó entre el envío y el clic — aceptable, raro).
- 404/410 al enviar → suscripción vieja; se borra sola, recargar la app re-suscribe.

- [ ] **Step 4: Actualizar memoria y cerrar**

- `memory/project_dosi.md`: sección "Web — Pieza B (fecha) — MERGED & DEPLOYED" + "E2E VALIDATED" con lo que se probó.
- `memory/MEMORY.md`: actualizar la línea del índice ("Pieza B = Web Push — live & e2e-validated").
- Marcar la Pieza B como cerrada.

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**

| Sección del spec | Task |
|---|---|
| `push_subscriptions`, `sent_alerts`, columnas `doses` | Task 3 |
| `public/push-sw.js` + `workbox.importScripts` | Task 4 |
| `src/lib/push.ts` (todas las funciones) | Task 5 |
| `_shared/schedule.ts` + `nowInTz` + export `strToMin`/`minToStr` | Task 1 |
| Test anti-deriva `schedule.shared.test.ts` | Task 1 |
| `_shared` núcleo de decisiones (ventana 1er/2º aviso, stock, caducidad) | Task 2 |
| `AppSettings.pushAsked` / `pushBannerDismissed` | Task 6 |
| Hoja tras 1ª medicina (+ variante iOS install) | Task 7 + Task 10 Step 8 |
| Banner en Hoy | Task 8 + Task 10 |
| Fila "Recordatorios" en Perfil (5 estados) | Task 9 + Task 10 |
| `syncPush` en arranque/login, `disablePush` en logout | Task 10 |
| VAPID + secretos + `VITE_VAPID_PUBLIC_KEY` | Task 13 |
| `send-reminders` (materializar, avisar, contador, alertas) | Task 11 |
| `dose-action` (take idempotente + stock, snooze) | Task 12 |
| `verify_jwt = false` (`config.toml`) | Task 11 Step 4 |
| web-push en Deno (`setVapidDetails`) | Task 11 Step 1 |
| cron-job.org cada minuto con `X-Cron-Secret` | Task 13 Step 6 |
| E2E Android + casos límite | Task 14 |
| Strings `es`/`en` en 3 superficies | Tasks 7, 8, 9, 10 |

**Consistencia de tipos:** `enablePush` devuelve `'ok'|'denied'|'unsupported'|'needs-install'` en Task 5 y se consume con esa misma unión en Task 7 (`EnableResult`) y Task 10 (`doEnablePush`). `pushState` es la unión de 5 literales en Task 9 y Task 10. `DoseRow` de `_shared/reminders.ts` (Task 2) se construye a mano en `send-reminders` (Task 11) con los campos `time/status/reminded_count/reminded_at`. `rowToMed` vive en `_shared/types.ts` (Task 1) y lo usa `send-reminders` (Task 11).

**Sin placeholders:** todo el código va completo. Los únicos pasos sin código son infra (migración vía MCP, secretos, cron) y llevan comandos/valores exactos.

**Ambigüedad resuelta:** el spec dejaba abierto si testear las Edge Functions con `deno test`; este plan lo marca **opcional** y mueve toda la lógica testable a `_shared/` cubierto por Vitest (que sí es el gate del repo), dejando las funciones Deno como orquestadores finos verificados por E2E.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-28-web-pieza-b.md`. Dos opciones de ejecución:

1. **Subagente por task (recomendado)** — despacho un subagente nuevo por cada task, reviso entre tasks, iteración rápida.
2. **Ejecución inline** — ejecuto los tasks en esta sesión con `executing-plans`, por lotes con checkpoints.

¿Cuál prefieres?
