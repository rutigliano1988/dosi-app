# Pieza F — Cadencia "cada N días" — Design

## Contexto

Primer feedback real de usuarios (2026-09-14) tras repartir el enlace de la PWA. Dos temas; este documento cubre el segundo (el primero, afinar la vibración/persistencia de los avisos push, ya se resolvió aparte en la rama `fix/push-notification-affordance`).

Un usuario necesita registrar una medicina que se toma **cada N días** (el caso concreto: una inyección cada 10 días), no a diario. Hoy `Medicine.schedule.freq` solo admite `'daily' | 'weekdays' | 'interval'` — ninguno modela una cadencia de varios días. `interval` ya está ocupado por "cada N horas dentro del mismo día" (6/8/12h), un concepto distinto.

**Alcance acordado con el usuario:** solo "cada N días" con ancla fija desde el inicio del tratamiento. Fuera de alcance: cadencias en semanas, patrones de "día X e Y del mes", y cualquier variante donde la siguiente toma se recalcule a partir de cuándo se tomó realmente la anterior (ancla deslizante).

## Decisión de producto: ancla fija

Cuando el paciente se retrasa en ponerse la inyección, la **siguiente toma prevista no se mueve** — se sigue calculando desde `duration.startedOn` (`elapsed % N === 0`), igual que hoy funciona `weekdays` o cualquier otro horario. Si el patrón real se desvía mucho, la solución es manual: pausar/reanudar el tratamiento o editar la medicina.

Se eligió así porque:
- Es coherente con el resto de la arquitectura: el horario de cualquier día es siempre una función pura de `Medicine` + esa fecha, nunca depende del historial de dosis (`buildAdherence`, `expectedDosesOn`, `send-reminders`, etc. dependen de esta propiedad).
- Una ancla deslizante exigiría rastrear "fecha de la última toma real" y recalcular el horario futuro a partir de eso — un cambio de arquitectura mucho mayor, no justificado por el caso de uso.
- Es el comportamiento de la mayoría de apps de recordatorio simples.

## Enfoque elegido

Nuevo valor de `FreqKind`: **`'everyNDays'`**, con un campo nuevo `intervalDays?: number` en `MedSchedule`. Sigue el mismo patrón que ya usan `weekdays` (`freq` + campo `weekdays[]`) e `interval` (`freq` + campo `intervalHours`). `times: string[]` se reutiliza sin cambios — una medicina `everyNDays` puede llevar una o varias horas el día que toca, igual que `daily`/`weekdays`.

### Alternativas descartadas

- **Generalizar a un descriptor de cadencia tipo cron** (semanas, días concretos del mes, combinaciones): explícitamente fuera de alcance — más superficie de bugs para casos que no se van a usar. YAGNI.
- **Modelarlo dentro de `duration`** (que ya tiene `kind: 'days'`): `duration.days` significa "el tratamiento dura N días en total"; reutilizar el mismo campo para "se repite cada N días" mezclaría dos conceptos independientes (cuánto dura vs. cada cuánto se repite) y sería una fuente de bugs.

## Cambios por capa

### 1. Tipos (`src/data/types.ts` y su espejo `supabase/functions/_shared/types.ts`)

```ts
export type FreqKind = 'daily' | 'weekdays' | 'interval' | 'everyNDays';

export interface MedSchedule {
  freq: FreqKind;
  times: string[];
  weekdays?: number[];
  intervalHours?: 6 | 8 | 12;
  intervalDays?: number;         // 'everyNDays': cada cuántos días (mínimo 2 en el formulario)
}
```

Ambos ficheros deben quedar idénticos en este punto (ya son gemelos mantenidos a mano — Deno no puede importar de `src/`).

**Sin migración de base de datos.** `medicines.schedule` es una columna `jsonb`; un valor de `freq` nuevo y una clave opcional más no piden tocar el esquema. `rowToMed` (ambos lados) ya pasa `schedule` tal cual sin validarlo campo a campo.

### 2. Motor de horarios (`src/lib/schedule.ts` y `supabase/functions/_shared/schedule.ts`)

Única función que cambia: `isActiveOn`. Se añade una rama, simétrica a la de `weekdays`:

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

`elapsed >= 0` hace la función correcta en aislamiento (aunque hoy el único llamador, `expectedDosesOn`, ya filtra los días anteriores a `startedOn` antes de llamarla). Día 0 (el propio `startedOn`) cuenta como toma.

`expandTimes` **no cambia**: ya trata cualquier `freq` distinto de `'interval'` igual (usa `times` tal cual). `medState`, `treatmentDay`, `daysBetween` tampoco cambian — son ortogonales a la frecuencia.

### 3. Lo que se hereda sin tocar

`expectedDosesOn`, `buildTodayDoses` (cliente), `buildAdherence` (Pieza D), el calendario mensual/semanal, el PDF para el médico, y los tres bucles de `send-reminders` (aviso de toma, cuidador, stock/caducidad) — ninguno cambia una línea. Todos derivan "¿toca esta medicina hoy?" a través de `isActiveOn`/`expandTimes`, así que heredan la cadencia nueva automáticamente. En los días que no tocan, la medicina simplemente no aparece prevista (no cuenta como "olvidada" en la adherencia, que es el comportamiento correcto).

### 4. Pantalla "Añadir/editar medicina" (`src/screens/AddMedScreen.tsx`)

- **Selector de frecuencia**: un 4º botón junto a Diaria / Días de la semana / Intervalo:
  ```ts
  { id: 'everyNDays', label: t('freqEveryNDays') }
  ```
- **Campo nuevo**, visible solo si `data.freq === 'everyNDays'`, colocado junto al bloque de `weekdays` (mismo patrón condicional): un `Field` con el componente `Stepper` ya existente (el que se usa hoy para "cuántos días dura el tratamiento"), sobre `data.intervalDays`, con `min={2}` (evita un "cada 1 día" redundante con Diaria).
- **Editor de horas**: no requiere cambio. La condición actual es `{data.freq === 'interval' ? <intervalUI/> : <TimesEditor/>}` — `everyNDays` cae en el `else` y muestra el editor normal de horas (una o varias), igual que Diaria/Días de la semana.
- **`FormData`** gana `intervalDays: number` (default `10` al crear, para que el ejemplo típico —una inyección— salga con un valor sensato de fábrica); el `onSave`/mapeo a `Medicine.schedule` pasa `intervalDays` solo cuando `freq === 'everyNDays'` (igual que `intervalHours` solo se manda para `'interval'`).
- **Validación de guardado**: añadir `(data.freq === 'everyNDays' && (!data.intervalDays || data.intervalDays < 2))` a la condición existente que deshabilita "Guardar" (junto a la de `weekdays.length === 0`).

### 5. i18n (`src/i18n/strings.ts`)

Claves nuevas, en `es` y `en`:
- `freqEveryNDays`: `'Cada N días'` / `'Every N days'`
- `everyNDaysLabel`: `'Cada cuántos días'` / `'Every how many days'`

### 6. Tests

`src/lib/schedule.test.ts` y su espejo `src/lib/schedule.shared.test.ts` (paridad cliente ↔ Edge Function) ganan casos para `isActiveOn` con `freq: 'everyNDays'`:
- día 0 (`startedOn`) → activo
- día `N` tras el inicio → activo; días `1..N-1` → inactivo
- antes de `startedOn` → inactivo
- `intervalDays` ausente/0 → no revienta, no cuenta como activo salvo el propio día 0 con el valor por defecto (`?? 1`, documentar el caso límite en el test aunque el formulario nunca lo produzca por el `min={2}`)

No se añaden tests de UI para `AddMedScreen` — no existen hoy para `weekdays`/`interval` tampoco; es consistente no romper ese patrón.

## Verification gate

`rm -f node_modules/.tmp/*.tsbuildinfo && npm run lint && npm run test && npm run build` — verde, con los tests nuevos de `isActiveOn` sumados a los 133 actuales.

## Fuera de alcance (explícito)

- Cadencias en semanas o meses.
- Patrones de días concretos del mes.
- Ancla deslizante basada en la última toma real.
- Copy de recordatorio distinta para medicinas inyectables (`form: 'injection'` ya existe para el icono; el texto del aviso —"Hora de tu X"— no cambia).
- Cualquier cambio a `send-reminders`, `dose-action`, `caregiver-action` o al motor de adherencia — no hace falta, ver sección 3.
