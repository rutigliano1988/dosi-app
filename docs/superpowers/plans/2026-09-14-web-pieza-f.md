# Pieza F — Cadencia "cada N días" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una medicina pueda programarse con una cadencia "cada N días" (p. ej. una inyección cada 10 días), con ancla fija desde el inicio del tratamiento, heredando automáticamente calendario, adherencia, PDF y avisos push.

**Architecture:** Nuevo valor de `FreqKind` (`'everyNDays'`) + campo `intervalDays?: number` en `MedSchedule`, con una única rama nueva en `isActiveOn()` (cliente y su espejo en la Edge Function). El resto del sistema (`expectedDosesOn`, `buildAdherence`, calendario, PDF, `send-reminders`) ya deriva todo de `isActiveOn`/`expandTimes` y no necesita cambios.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, Deno (Edge Functions), Supabase (columna `schedule` es `jsonb`, sin migración).

## Global Constraints

- **Ancla fija:** el día de una toma "cada N días" es activo si `daysBetween(startedOn, day) % intervalDays === 0` y `daysBetween(...) >= 0`. Nunca depende del historial de dosis reales.
- **Sin migración de base de datos.** `medicines.schedule` es `jsonb`; un valor de `freq` nuevo y una clave opcional no piden tocar el esquema.
- **TypeScript estricto** (`tsconfig.app.json`): `verbatimModuleSyntax: true` → imports de solo tipo con `import type`. `noUnusedLocals`/`noUnusedParameters`. `erasableSyntaxOnly` (sin enums/namespaces). `jsx: react-jsx` → **nunca** `import React`.
- **Fechas siempre en hora local.** `isoDate`/`daysBetween` de `schedule.ts`. Nunca `toISOString()` para derivar un día.
- **`supabase/functions/_shared/types.ts` y `_shared/schedule.ts` son gemelos a mano** de `src/data/types.ts` y `src/lib/schedule.ts` — Deno no puede importar de `src/`. Cualquier cambio de lógica se replica byte-a-byte en los dos lados; la paridad se prueba en `src/lib/schedule.shared.test.ts`.
- **Verification gate (cada task):**
  ```
  rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build
  ```
  `npm run lint` = oxlint (warnings no fallan; errors sí). `npm run test` = `vitest run`. `npm run build` = `tsc -b && vite build`. Suite actual: **133 tests verdes** (tras la rama `fix/push-notification-affordance`, ya en `main` o pendiente de merge — confirmar el número exacto con `npm run test` antes de empezar).
- **Commits** en español, terminando con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- **Rama:** `feat/web-pieza-f` desde `main`. No commitear en `main`.

## Acciones del controlador (no las hace un subagente)

- **Tras la Task 2:** `deploy_edge_function` para **`send-reminders`** y **`caregiver-action`** — ambas importan `buildTodayDoses` de `_shared/schedule.ts`, que internamente llama a `isActiveOn`. Bundlear cada una con su `index.ts` + todos los `_shared/*.ts` que importe (`edge.ts`, `cors.ts`, `schedule.ts`, `reminders.ts`, `types.ts`). `push-resub` y `dose-action` no llaman a `isActiveOn`/`buildTodayDoses` en ningún camino de código — no hace falta redesplegarlas.

---

## File Structure

**Modificar:**
- `src/data/types.ts` — `FreqKind` gana `'everyNDays'`; `MedSchedule` gana `intervalDays?: number`.
- `src/lib/schedule.ts` — `isActiveOn` gana la rama `everyNDays`.
- `src/lib/schedule.test.ts` — casos nuevos de `isActiveOn`.
- `supabase/functions/_shared/types.ts` — mismo cambio de tipos, lado Deno.
- `supabase/functions/_shared/schedule.ts` — misma rama en `isActiveOn`.
- `src/lib/schedule.shared.test.ts` — caso de paridad nuevo.
- `src/screens/AddMedScreen.tsx` — `FormData.intervalDays`, valor por defecto, 4º botón de frecuencia, campo `Stepper` condicional.
- `src/App.tsx` — `buildSchedule()` gana la rama `everyNDays`.
- `src/i18n/strings.ts` — claves `freqEveryNDays`, `everyNDaysLabel` en `es` y `en`.

---

## Task 1: Motor de horarios — cliente (`isActiveOn` + tipos)

**Files:**
- Modify: `src/data/types.ts:5` (tipo `FreqKind`), `src/data/types.ts:8-14` (interfaz `MedSchedule`)
- Modify: `src/lib/schedule.ts:72-78` (función `isActiveOn`)
- Test: `src/lib/schedule.test.ts` (dentro del bloque `describe('isActiveOn', ...)`, líneas 85-103)

**Interfaces:**
- Consumes: nada nuevo — usa `daysBetween` ya exportado en el mismo fichero.
- Produces:
  ```ts
  // MedSchedule gana:
  intervalDays?: number; // 'everyNDays': cada cuántos días. Ancla: duration.startedOn.
  ```
  Task 3 (pantalla de Añadir medicina) y Task 2 (espejo Edge Function) dependen de que el campo se llame exactamente `intervalDays` y de que `isActiveOn` calcule `elapsed >= 0 && elapsed % n === 0` con `n = med.schedule.intervalDays ?? 1`.

- [ ] **Step 1: Escribir los tests que fallan**

Abre `src/lib/schedule.test.ts`. Dentro del bloque `describe('isActiveOn', () => { ... })` (empieza en la línea 85), justo antes de la llave de cierre `});` que cierra ese `describe` (línea 103), añade:

```ts
  it('everyNDays: activo el día de inicio y cada N días después', () => {
    const m = med({
      schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
      duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    });
    expect(isActiveOn(m, new Date(2026, 7, 1))).toBe(true);   // día 0
    expect(isActiveOn(m, new Date(2026, 7, 11))).toBe(true);  // día 10
    expect(isActiveOn(m, new Date(2026, 7, 21))).toBe(true);  // día 20
  });
  it('everyNDays: inactivo los días intermedios', () => {
    const m = med({
      schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
      duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    });
    expect(isActiveOn(m, new Date(2026, 7, 5))).toBe(false);
    expect(isActiveOn(m, new Date(2026, 7, 10))).toBe(false);
    expect(isActiveOn(m, new Date(2026, 7, 12))).toBe(false);
  });
  it('everyNDays: inactivo antes del inicio del tratamiento', () => {
    const m = med({
      schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
      duration: { kind: 'ongoing', startedOn: '2026-08-15' },
    });
    expect(isActiveOn(m, new Date(2026, 7, 5))).toBe(false);
  });
  it('everyNDays: intervalDays ausente no revienta (por defecto 1, activo cada día)', () => {
    const m = med({
      schedule: { freq: 'everyNDays', times: ['09:00'] },
      duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    });
    expect(isActiveOn(m, new Date(2026, 7, 1))).toBe(true);
    expect(isActiveOn(m, new Date(2026, 7, 2))).toBe(true);
  });
```

El fixture `med(over)` (línea 8 del mismo fichero) ya acepta `schedule`/`duration` completos vía `over` — no hace falta tocarlo.

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- schedule.test`
Expected: FAIL — TypeScript se queja de que `'everyNDays'` no es un `FreqKind` válido y de que `intervalDays` no existe en `MedSchedule` (o, si TS no bloquea la ejecución de Vitest, los `expect` fallan porque `isActiveOn` no reconoce `'everyNDays'` y cae al `return true` genérico, dando resultados incorrectos en el segundo test).

- [ ] **Step 3: Tipos — `src/data/types.ts`**

Línea 5, cambiar:
```ts
export type FreqKind = 'daily' | 'weekdays' | 'interval';
```
por:
```ts
export type FreqKind = 'daily' | 'weekdays' | 'interval' | 'everyNDays';
```

Líneas 8-14, cambiar:
```ts
export interface MedSchedule {
  freq: FreqKind;
  times: string[];               // 'daily'/'weekdays': tomas explícitas ordenadas
                                 // 'interval': un solo elemento = hora de la 1ª toma
  weekdays?: number[];           // 'weekdays': 1=lunes … 7=domingo
  intervalHours?: 6 | 8 | 12;    // 'interval'
}
```
por:
```ts
export interface MedSchedule {
  freq: FreqKind;
  times: string[];               // 'daily'/'weekdays'/'everyNDays': tomas explícitas ordenadas
                                 // 'interval': un solo elemento = hora de la 1ª toma
  weekdays?: number[];           // 'weekdays': 1=lunes … 7=domingo
  intervalHours?: 6 | 8 | 12;    // 'interval'
  intervalDays?: number;         // 'everyNDays': cada cuántos días. Ancla: duration.startedOn.
}
```

- [ ] **Step 4: Implementar en `src/lib/schedule.ts`**

Líneas 72-78, cambiar:
```ts
export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  return true;
}
```
por:
```ts
export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  if (med.schedule.freq === 'everyNDays') {
    const n = med.schedule.intervalDays ?? 1;
    if (n < 1) return false;
    const elapsed = daysBetween(med.duration.startedOn, day);
    return elapsed >= 0 && elapsed % n === 0;
  }
  return true;
}
```

- [ ] **Step 5: Ejecutar para verlo pasar**

Run: `npm run test -- schedule.test`
Expected: PASS — todos los `isActiveOn` verdes, incluidos los 4 nuevos.

- [ ] **Step 6: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: lint sin errores, build OK, tests verdes (número base + 4).

```bash
git add src/data/types.ts src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-f): cadencia "cada N dias" en el motor de horarios (cliente)

Nuevo FreqKind 'everyNDays' + MedSchedule.intervalDays. isActiveOn calcula
elapsed % n === 0 desde duration.startedOn (ancla fija, no depende del
historial de tomas reales).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Motor de horarios — espejo Edge Function + paridad

**Files:**
- Modify: `supabase/functions/_shared/types.ts` (tipo `FreqKind`, interfaz `MedSchedule` — mismas líneas que Task 1, lado Deno)
- Modify: `supabase/functions/_shared/schedule.ts` (función `isActiveOn` — misma rama que Task 1)
- Test: `src/lib/schedule.shared.test.ts` (dentro del bloque `describe('paridad browser ↔ _shared', ...)`, tras el `it('isActiveOn: weekdays', ...)` que termina en la línea 63)

**Interfaces:**
- Consumes: `intervalDays` (Task 1) — mismo nombre de campo, mismo cálculo.
- Produces: nada para otras tasks. `send-reminders`/`caregiver-action` en producción quedan desactualizadas hasta que el controlador las redespliegue (ver "Acciones del controlador" arriba).

- [ ] **Step 1: Escribir el test de paridad que falla**

Abre `src/lib/schedule.shared.test.ts`. Justo después del bloque `it('isActiveOn: weekdays', ...)` (termina en la línea 63) y antes de `it('buildTodayDoses: ids con fecha local y orden', ...)` (línea 65), añade:

```ts
  it('isActiveOn: everyNDays — paridad exacta con el motor del navegador', () => {
    const m = med({
      schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
      duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    });
    const dias = [
      new Date(2026, 7, 1), new Date(2026, 7, 5), new Date(2026, 7, 11),
      new Date(2026, 7, 15), new Date(2026, 7, 21),
    ];
    for (const d of dias) {
      expect(shared.isActiveOn(m, d)).toBe(browser.isActiveOn(m, d));
    }
    expect(shared.isActiveOn(m, new Date(2026, 7, 1))).toBe(true);
    expect(shared.isActiveOn(m, new Date(2026, 7, 5))).toBe(false);
    expect(shared.isActiveOn(m, new Date(2026, 7, 11))).toBe(true);
  });
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run: `npm run test -- schedule.shared`
Expected: FAIL — `shared.isActiveOn` (el de `_shared/schedule.ts`) no reconoce `'everyNDays'` todavía, así que el bucle de paridad falla o los `expect` de `false`/`true` no coinciden.

- [ ] **Step 3: Tipos — `supabase/functions/_shared/types.ts`**

Cambiar:
```ts
export type FreqKind = 'daily' | 'weekdays' | 'interval';
```
por:
```ts
export type FreqKind = 'daily' | 'weekdays' | 'interval' | 'everyNDays';
```

Y en la interfaz `MedSchedule`:
```ts
export interface MedSchedule {
  freq: FreqKind;
  times: string[];
  weekdays?: number[];
  intervalHours?: 6 | 8 | 12;
}
```
por:
```ts
export interface MedSchedule {
  freq: FreqKind;
  times: string[];
  weekdays?: number[];
  intervalHours?: 6 | 8 | 12;
  intervalDays?: number;
}
```

- [ ] **Step 4: Implementar en `supabase/functions/_shared/schedule.ts`**

Misma función, mismo cambio que Task 1 Step 4:
```ts
export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  return true;
}
```
por:
```ts
export function isActiveOn(med: Medicine, day: Date): boolean {
  if (medState(med, day) !== 'active') return false;
  if (med.schedule.freq === 'weekdays') {
    return (med.schedule.weekdays ?? []).includes(isoWeekday(day));
  }
  if (med.schedule.freq === 'everyNDays') {
    const n = med.schedule.intervalDays ?? 1;
    if (n < 1) return false;
    const elapsed = daysBetween(med.duration.startedOn, day);
    return elapsed >= 0 && elapsed % n === 0;
  }
  return true;
}
```

- [ ] **Step 5: Ejecutar para verlo pasar**

Run: `npm run test -- schedule.shared`
Expected: PASS.

- [ ] **Step 6: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, tests = base de Task 1 + 1.

```bash
git add supabase/functions/_shared/types.ts supabase/functions/_shared/schedule.ts src/lib/schedule.shared.test.ts
git commit -m "$(cat <<'EOF'
feat(pieza-f): cadencia "cada N dias" en el motor compartido (Edge Function)

Espejo exacto del cambio de Task 1 en _shared/types.ts y _shared/schedule.ts.
Test de paridad linea a linea entre isActiveOn del navegador y el de la
Edge Function.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **Controlador:** tras esta task, redespliega **`send-reminders`** y **`caregiver-action`** (ver "Acciones del controlador" al principio del plan).

---

## Task 3: Pantalla "Añadir/editar medicina" + guardado

**Files:**
- Modify: `src/screens/AddMedScreen.tsx` (interfaz `FormData` líneas 11-26; valores por defecto líneas 368-383; selector de frecuencia líneas 208-214; bloque condicional nuevo entre las líneas 235 y 237)
- Modify: `src/App.tsx` (`buildSchedule()`, líneas 386-391)
- Modify: `src/i18n/strings.ts` (bloques `es` líneas 48-62 y `en` líneas 287-301)

**Interfaces:**
- Consumes: `FreqKind` con `'everyNDays'` y `MedSchedule.intervalDays` (Task 1).
- Produces: nada para otras tasks — es la última.

- [ ] **Step 1: i18n — `src/i18n/strings.ts`**

Bloque `es`, línea 53 (`freqInterval: 'Cada X horas',`), añadir justo después:
```ts
  freqEveryNDays: 'Cada N días',
```
Y en la misma zona (junto a `daysCount: 'Número de días',`, línea 62), añadir:
```ts
  everyNDaysLabel: 'Cada cuántos días',
```

Bloque `en`, línea 292 (`freqInterval: 'Every X hours',`), añadir justo después:
```ts
  freqEveryNDays: 'Every N days',
```
Y junto a `daysCount: 'Number of days',` (línea 301), añadir:
```ts
  everyNDaysLabel: 'Every how many days',
```

- [ ] **Step 2: `FormData` — `src/screens/AddMedScreen.tsx`**

Líneas 11-26, en la interfaz `FormData`, cambiar:
```ts
  intervalHours: 6 | 8 | 12;
  duration: DurationKind;
```
por:
```ts
  intervalHours: 6 | 8 | 12;
  intervalDays: number;
  duration: DurationKind;
```

- [ ] **Step 3: Valor por defecto**

Líneas 368-383, en el `useState<FormData>({...})`, cambiar:
```ts
    intervalHours: initialData?.schedule?.intervalHours ?? 8,
    duration:      initialData?.duration?.kind ?? 'ongoing',
```
por:
```ts
    intervalHours: initialData?.schedule?.intervalHours ?? 8,
    intervalDays:  initialData?.schedule?.intervalDays ?? 10,
    duration:      initialData?.duration?.kind ?? 'ongoing',
```

- [ ] **Step 4: Selector de frecuencia**

Líneas 208-214, cambiar:
```ts
      <Field theme={theme} label={t('frequency')}>
        <SegmentedRow theme={theme} value={data.freq} onChange={v => upd('freq', v)} options={[
          { id: 'daily',    label: t('freqDaily') },
          { id: 'weekdays', label: t('freqWeekdays') },
          { id: 'interval', label: t('freqInterval') },
        ]} />
      </Field>
```
por:
```ts
      <Field theme={theme} label={t('frequency')}>
        <SegmentedRow theme={theme} value={data.freq} onChange={v => upd('freq', v)} options={[
          { id: 'daily',      label: t('freqDaily') },
          { id: 'weekdays',   label: t('freqWeekdays') },
          { id: 'interval',   label: t('freqInterval') },
          { id: 'everyNDays', label: t('freqEveryNDays') },
        ]} />
      </Field>
```

- [ ] **Step 5: Campo "cada cuántos días"**

Justo después del bloque `{data.freq === 'weekdays' && ( ... )}` que termina en la línea 235 (`)}`) y antes de `{data.freq === 'interval' ? (` (línea 237), inserta:

```tsx
      {data.freq === 'everyNDays' && (
        <Field theme={theme} label={t('everyNDaysLabel')}>
          <Stepper theme={theme} value={data.intervalDays} min={2}
            onChange={v => upd('intervalDays', v)} />
        </Field>
      )}
```

El editor de horas de abajo (`{data.freq === 'interval' ? <intervalUI/> : <TimesEditor .../>}`, línea 237) no necesita ningún cambio: `'everyNDays'` cae en la rama `else` igual que `'daily'`/`'weekdays'` y muestra el editor normal de horas.

No hace falta añadir nada a la validación de "Guardar" (líneas 455-458): el `Stepper` ya clampa con `Math.max(min, value - 1)`, así que `intervalDays` nunca puede bajar de 2 a través de la UI — a diferencia de `weekdays`, que empieza vacío y sí necesita su propia guarda.

- [ ] **Step 6: Mapeo a `Medicine.schedule` — `src/App.tsx`**

Líneas 386-391, cambiar:
```ts
          const buildSchedule = (): Medicine['schedule'] =>
            d.freq === 'interval'
              ? { freq: 'interval', times: [d.times[0] ?? '08:00'], intervalHours: d.intervalHours }
              : d.freq === 'weekdays'
              ? { freq: 'weekdays', times: cleanTimes, weekdays: d.weekdays }
              : { freq: 'daily', times: cleanTimes };
```
por:
```ts
          const buildSchedule = (): Medicine['schedule'] =>
            d.freq === 'interval'
              ? { freq: 'interval', times: [d.times[0] ?? '08:00'], intervalHours: d.intervalHours }
              : d.freq === 'weekdays'
              ? { freq: 'weekdays', times: cleanTimes, weekdays: d.weekdays }
              : d.freq === 'everyNDays'
              ? { freq: 'everyNDays', times: cleanTimes, intervalDays: d.intervalDays }
              : { freq: 'daily', times: cleanTimes };
```

- [ ] **Step 7: Verification gate + commit**

Run: `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build`
Expected: verde, mismo número de tests que al final de Task 2 (esta task no añade tests — no hay tests de UI para `AddMedScreen`, consistente con `weekdays`/`interval`, que tampoco los tienen).

```bash
git add src/screens/AddMedScreen.tsx src/App.tsx src/i18n/strings.ts
git commit -m "$(cat <<'EOF'
feat(pieza-f): pantalla de Anadir medicina soporta "cada N dias"

4o boton de frecuencia + Stepper "cada cuantos dias" (reutiliza el mismo
componente que "duracion del tratamiento"). El editor de horas y el mapeo
a Medicine.schedule en App.tsx quedan cableados.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verificación manual**

`npm run dev` → Añadir medicina → elegir "Cada N días" → poner intervalo (p. ej. 10) y una hora → guardar. Comprobar:
- La medicina aparece en "Hoy" el día que se crea.
- En el calendario (Mes), solo aparecen puntos/dosis los días que tocan (hoy, hoy+10, hoy+20…), no en los intermedios.
- Editarla y cambiar el intervalo conserva el resto de campos.
- Editar una medicina `daily`/`weekdays`/`interval` existente sigue funcionando (no hay regresión al añadir la 4ª rama al selector).

---

## Verificación final de la rama (antes de la revisión de rama completa)

- [ ] `rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — verde.
- [ ] `send-reminders` y `caregiver-action` redesplegadas (controlador, tras Task 2) — smoke test `curl` OPTIONS/POST como en Piezas anteriores.
- [ ] `git log --oneline main..feat/web-pieza-f` — 3 commits limpios.

## Checklist E2E para el usuario (tras la revisión, antes del merge)

1. **Añadir una medicina "cada 10 días"** (p. ej. una inyección) con hora de hoy. Confirmar que sale en "Hoy".
2. **Calendario → Mes:** el Mes solo pinta puntos de adherencia ya registrada (días pasados/hoy), nunca el horario futuro — así que esto solo se ve retroactivamente, según pasen los días 1, 11, 21… No es un fallo si los días futuros salen en gris neutro.
3. **Marcar la toma como tomada** el día que toca; confirmar que el detalle de la medicina (30 días) la cuenta.
4. **Editar** la medicina y cambiar el número de días — se actualiza el patrón.
5. **Medicinas existentes** (diaria, días de la semana, intervalo de horas) — sin regresión al usarlas o editarlas.
6. Los recordatorios push de una medicina "cada N días" llegan el día que toca (requiere esperar a la fecha real o simular `startedOn` en el pasado al crearla).

---

## Self-Review (hecho por el planificador)

**1. Cobertura del spec:**
- Tipos (`FreqKind`, `intervalDays`) → Task 1 (cliente) + Task 2 (Edge Function). ✅
- `isActiveOn` con ancla fija → Task 1 + Task 2, código idéntico en ambos lados. ✅
- Herencia gratuita en calendario/adherencia/PDF/avisos → no requiere tasks propias (así lo especifica el spec); confirmado que ningún fichero de Pieza D o de `send-reminders`/`caregiver-action` necesita cambios de lógica, solo redeploy (Task 2, acción del controlador) para que el bundle recoja el `_shared/schedule.ts` nuevo.
- UI de "Añadir medicina" (selector + Stepper + editor de horas heredado) → Task 3. ✅
- Mapeo `FormData` → `Medicine.schedule` → Task 3 Step 6 (encontrado en `App.tsx`, no estaba explícito en el spec con ubicación exacta — añadido aquí). ✅
- i18n `freqEveryNDays`/`everyNDaysLabel` es+en → Task 3 Step 1. ✅
- Sin migración de BD → confirmado, ningún task toca `supabase/migrations/`. ✅
- Tests (motor cliente + paridad compartida) → Task 1 Step 1, Task 2 Step 1. ✅

**2. Placeholders:** ninguno — todo el código de cada step está completo y es el literal a escribir.

**3. Consistencia de tipos:**
- `intervalDays?: number` — mismo nombre y tipo en `src/data/types.ts` (Task 1) y `supabase/functions/_shared/types.ts` (Task 2). ✅
- `isActiveOn` — misma firma `(med: Medicine, day: Date): boolean` sin cambios; la rama nueva usa `daysBetween`, ya exportado en ambos ficheros. ✅
- `FormData.intervalDays: number` (Task 3) alimenta `Medicine['schedule'].intervalDays` (Task 1) a través de `buildSchedule()` en `App.tsx` — incluye el valor solo cuando `freq === 'everyNDays'`, igual que `intervalHours` solo se incluye para `'interval'`. ✅
- `SegmentedRow` option `{ id: 'everyNDays', ... }` — el `id` coincide exactamente con el valor de `FreqKind` que espera `isActiveOn`. ✅

**Desviación respecto al spec, corregida en el propio plan:** el spec mencionaba añadir una guarda de validación a "Guardar" para `intervalDays < 2`; revisando el componente `Stepper` real, su botón `−` ya clampa en `Math.max(min, value - 1)` y el valor inicial es 10, así que `intervalDays` no puede bajar de `min={2}` a través de la UI — añadir la guarda sería código muerto. Documentado en Task 3 Step 5 en vez de en el spec para no reabrir la revisión del usuario por un detalle de implementación.
