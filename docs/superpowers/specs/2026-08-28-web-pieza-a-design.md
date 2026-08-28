# Dosi Web — Pieza A: Saneamiento + Motor de horarios + Cuentas

- **Fecha:** 2026-08-28
- **Repo:** `dosi-app` (web), rama `main`
- **Estado objetivo:** app web usable por un paciente/familiar real, desplegada en `https://dosi-app.vercel.app`
- **Entrega:** un único despliegue al final, tras pruebas (~2 sesiones de trabajo)

## Contexto

La web (`C:\Users\FGamerTech\Documents\Claude\Medicine_app\dosi`) está desplegada y compila,
pero sigue cableada como la demo de diseño: siembra 6 medicinas falsas en la cuenta de cada
usuario nuevo, el Perfil está lleno de contenido muerto, el onboarding no pide el nombre, la
función "Cuidadores" es una maqueta sin backend, el formulario de alta ofrece opciones de
frecuencia y duración que el motor ignora, el historial del detalle es fijo, y los tratamientos
de duración fija nunca terminan. El saneamiento equivalente ya se hizo en la app móvil
(`dosi-mobile`, "Fase 1", commit `701c7ec`); esto lo lleva a la web y además implementa de
verdad el motor de horarios y añade cuentas por email.

**Los recordatorios con la app cerrada (Web Push) NO entran aquí** — son la "Pieza B", con su
propio ciclo de diseño. En la Pieza A la única forma de aviso sigue siendo la campana manual /
toast con la app abierta.

## Decisiones tomadas (brainstorming 2026-08-28)

| Tema | Decisión |
|---|---|
| Cuidadores | Ocultar por completo en la v1 (borrar UI, no borrar tabla) |
| Recordatorios | Web Push completo — pero es Pieza B, no aquí |
| Primer usuario | Un paciente/familiar real → hace falta pulido de copys y quitar todo lo que confunda |
| Opciones a medias del formulario de alta | Implementarlas todas de verdad |
| Fin de tratamiento de duración fija | Estado calculado **"Finalizada"**: deja de generar dosis, aparece en Inventario con etiqueta, botón "Reanudar / extender" en el detalle, no se borra historial |
| Modelo de frecuencia | Diario / Días concretos (chips L-D) / Cada X horas (intervalo 6-8-12 h + hora de la 1ª toma). `times[]` es la base de todo |
| Persistencia | Login por email |
| Método de acceso | Código de un solo uso (OTP) de 6 dígitos |
| Flujo de arranque | Anónimo primero (sin fricción); "Guardar mi cuenta" vincula el email después y conserva los datos |
| Estructura de la Pieza A | Un pase completo, un despliegue al final |
| Datos "viejos" | Lectura tolerante con defaults (`freq ?? 'daily'`, `duration.startedOn ?? hoy`, …) |

## Alcance

### Dentro
1. **Saneamiento** — eliminar datos y UI falsos, reconstruir Perfil, onboarding con nombre,
   historial real en el detalle, iconos PWA, copys.
2. **Motor de horarios** — `src/lib/schedule.ts` puro y testeado: frecuencias reales
   (diario / días concretos / cada X horas), duración real (continuo / N días / hasta fecha),
   estado calculado `active | paused | finished`.
3. **Cuentas** — arranque anónimo + `AuthSheet` (email → OTP) para "Guardar mi cuenta"
   (vincular, conservando `user_id` y datos) y "Iniciar sesión" (otro dispositivo).

### Fuera (explícito)
Web Push / recordatorios con app cerrada (Pieza B), vista mensual del calendario, SMTP propio
para emails, función de cuidadores, app iOS.

## Sin migración de base de datos

Las columnas `schedule` y `duration` de la tabla `medicines` **ya son `jsonb`** → el nuevo
modelo cabe sin tocar el esquema. Las políticas RLS ya filtran por `user_id`. Vincular un email
a un usuario anónimo **conserva el mismo `user_id`**, así que los datos siguen accesibles.

No hay usuarios reales todavía (solo datos de prueba), pero la lectura será tolerante a datos
viejos con defaults, para no depender de un `reset` manual.

## Modelo de datos

`src/data/types.ts`:

```ts
export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped';
export type FreqKind = 'daily' | 'weekdays' | 'interval';
export type DurationKind = 'ongoing' | 'days' | 'until';

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: PillColorKey;
  schedule: {
    freq: FreqKind;
    times: string[];              // 'daily'/'weekdays': tomas explícitas
                                  // 'interval': un solo elemento = hora de la 1ª toma
    weekdays?: number[];          // 'weekdays': 1=lunes … 7=domingo (ISO-8601)
    intervalHours?: 6 | 8 | 12;   // 'interval'
  };
  duration: {
    kind: DurationKind;
    days?: number;                // 'days' (mín. 1)
    until?: string;               // 'until': fecha ISO 'YYYY-MM-DD'
    startedOn: string;            // fecha ISO en que se creó o se reanudó — obligatorio
  };
  stock: number;
  expiry?: string;                // ahora opcional; fecha ISO
  notes?: string;
  paused?: boolean;
}

export interface Dose {            // sin cambios
  id: string;                      // `${medId}-${time}`
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string;
}
```

- `startedOn` **sustituye a `startedDay`**. El "día X de N" se calcula:
  `current = daysBetween(startedOn, hoy) + 1`.
- El tipo `Caregiver` y `Permission` pueden quedarse en `types.ts` (no molestan) o borrarse
  junto con `mock.ts`; se borran para no dejar tipos huérfanos.

### Lectura tolerante

En la capa que convierte filas de Supabase / `localStorage` a `Medicine`
(`src/data/sync.ts` `pullAll`, `src/data/store.ts` `read`), normalizar:

```ts
schedule: {
  freq: row.schedule?.freq ?? 'daily',
  times: row.schedule?.times ?? ['08:00'],
  weekdays: row.schedule?.weekdays,
  intervalHours: row.schedule?.intervalHours,
},
duration: {
  kind: row.duration?.kind ?? 'ongoing',
  days: row.duration?.days,
  until: row.duration?.until,
  startedOn: row.duration?.startedOn ?? todayISO(),
},
expiry: row.expiry ?? undefined,
```

## Motor de horarios — `src/lib/schedule.ts` (nuevo)

Módulo **puro** (sin React, sin Supabase), con tests unitarios.

```ts
export function medState(med: Medicine, today: Date): 'active' | 'paused' | 'finished';
// 'paused' gana sobre 'finished'. 'finished' si:
//   kind === 'days'  && daysBetween(startedOn, today) >= days
//   kind === 'until' && todayISO(today) > until

export function isActiveOn(med: Medicine, day: Date): boolean;
// false si medState !== 'active'
// si freq === 'weekdays': day.getISODay() ∈ med.schedule.weekdays
// 'daily' / 'interval': true

export function expandTimes(med: Medicine): string[];
// 'daily' / 'weekdays' → med.schedule.times (ordenados asc.)
// 'interval' → n = floor(24 / intervalHours) tomas; toma k = (anchorMin + k*intervalHours*60) mod 1440
//   ej. 08:00 / 8h → n=3 → ['08:00', '16:00', '00:00']
//   ej. 22:00 / 6h → n=4 → sin ordenar ['22:00','04:00','10:00','16:00']
//   resultado ordenado asc. para mostrar → ['00:00','08:00','16:00'] / ['04:00','10:00','16:00','22:00']

export function treatmentDay(med: Medicine, today: Date): { current: number; total: number } | null;
// solo kind === 'days'; si no, null. current se limita a [1, total].

export function buildTodayDoses(meds: Medicine[], now: Date): Dose[];
// reescribe la firma actual (antes: nowHour + opción autoMarkTaken, ambos se eliminan)
// para cada med con isActiveOn(med, now):
//   por cada t de expandTimes(med): { id: `${med.id}-${t}`, medId, time: t,
//     totalMin, status } con status 'now' si |totalMin - nowMin| <= 30, si no 'upcoming'
// ordenadas por totalMin

export function shiftTime(time: string, mins: number): string;  // se conserva tal cual
```

Helpers privados: `daysBetween(isoA, dateB)`, `todayISO(d)`, `getISODay(d)` (1=lunes…7=domingo).

### Consumidores del motor

| Archivo | Uso |
|---|---|
| `App.tsx` | `buildTodayDoses(meds, new Date())` en arranque y al cambiar `meds` |
| `HomeScreen` | el plan de hoy ya sale filtrado (solo medicinas activas hoy) |
| `InventoryScreen` | badge según `medState`: "Finalizada" / "En pausa" / stock bajo / caduca |
| `DetailScreen` | `treatmentDay()` para la barra "día X de N"; si `finished` → "Reanudar / extender" |
| `CalendarScreen` | sin cambios (ya usa `historyDoses` reales de Supabase) |

### "Reanudar / extender"

Medicina `finished` o `paused`. Dos caminos:
- **Reanudar sin cambios:** diálogo de confirmación → `startedOn = hoy`, `paused = false`.
- **Extender / cambiar:** abre el editor (`AddMedScreen` modo `edit`) en el paso de horario con
  la duración preseleccionada; al guardar, `startedOn = hoy`.

## Cuentas — anónimo + email OTP

### `src/lib/supabase.ts` (API ampliada)

```ts
ensureSession(): Promise<string | null>;
// igual: restaura sesión o signInAnonymously()

getAccount(): { userId: string; email: string | null; isAnonymous: boolean };

linkEmail(email: string): Promise<void>;
// supabase.auth.updateUser({ email }) → Supabase envía un código de 6 dígitos

confirmEmailChange(email: string, token: string): Promise<void>;
// verifyOtp({ email, token, type: 'email_change' }) → el usuario anónimo pasa a permanente
// CONSERVANDO el mismo user_id

signInWithEmail(email: string): Promise<void>;
// signInWithOtp({ email, options: { shouldCreateUser: false } })

confirmSignIn(email: string, token: string): Promise<string>;  // devuelve el userId
// verifyOtp({ email, token, type: 'email' })

signOut(): Promise<void>;
// supabase.auth.signOut() + limpia caché local (dosiStore.clear + settings de sesión)
```

> **A confirmar en el plan contra la doc de Supabase:** el `type` exacto del `verifyOtp` para
> la vinculación anónimo→email (`'email_change'` vs `'email'`) y si `updateUser({ email })`
> requiere que "Secure email change" esté desactivado para no pedir doble confirmación. El
> flujo conceptual no cambia.

### `src/screens/AuthSheet.tsx` (nuevo)

Hoja inferior reutilizable, dos pasos:
1. Campo email + "Enviar código".
2. Campo de 6 dígitos + "Confirmar" + "Reenviar" (cooldown 60 s).

Modos: `link` (desde "Guardar mi cuenta") y `signin` (desde "Iniciar sesión").
Props: `{ theme, t, lang, mode, onClose, onSuccess }`.

### Flujos

- **Guardar mi cuenta:** Perfil → AuthSheet `link` → `linkEmail` → `confirmEmailChange` →
  `getAccount()` refresca → el email aparece en Perfil, datos intactos.
- **Iniciar sesión (otro dispositivo):** Perfil → AuthSheet `signin` → `signInWithEmail` →
  `confirmSignIn` devuelve `userId` → `App.tsx` hace `pullAll(userId)` + `pullHistory` y
  refresca `meds` / `doses` / `historyDoses`.
- **Cerrar sesión:** limpia caché local → `signInAnonymously()` (cuenta nueva vacía) → toast
  "Sesión cerrada". App usable de inmediato.

### Errores

| Caso | Mensaje |
|---|---|
| Email ya vinculado a otra cuenta (`link`) | "Ese email ya tiene una cuenta. Usa 'Iniciar sesión'." |
| Código incorrecto / expirado | inline, sin cerrar la hoja |
| Sin conexión | toast; la hoja permanece |
| 429 (límite de emails de Supabase) | "Demasiados intentos, prueba en unos minutos." |

**Riesgo conocido:** el remitente por defecto de Supabase limita a ≈ 4 emails/hora y suele caer
en spam. Suficiente para uso familiar; para más alcance haría falta SMTP propio → fuera de la
Pieza A, se documenta.

## Pantallas

### Onboarding — `OnboardingScreen.tsx`
- **Slide 3** deja de hablar de cuidadores → *"Mira tu progreso"* / *"El calendario te muestra
  tu adherencia semana a semana, sin esfuerzo."* La ilustración `ArtHeart` (chips "M"/"J") se
  sustituye por una de calendario / anillo de progreso.
- **Nuevo paso 4, opcional:** *"¿Cómo te llamas?"* — campo de texto + "Empezar" + "Saltar".
  Se guarda en `settings.userName`. Sin nombre → saludos sin nombre.
- Strings `ob3Title`, `ob3Sub`, `ob4Title`, `ob4Sub` en ES y EN.

### Perfil — `ProfileScreen.tsx` (reescritura)
- **Tarjeta de usuario:** avatar con la inicial del nombre (o icono genérico); nombre editable
  (toque en el lápiz → campo inline); debajo, el email o *"Sin cuenta guardada"*.
- **Sección "Cuenta":**
  - sin email → filas *"Guardar mi cuenta"* (`AuthSheet` `link`) e *"Iniciar sesión"* (`signin`)
  - con email → muestra el email + fila *"Cerrar sesión"*
- **Aviso de persistencia** (solo sin email): banda discreta *"Tus datos se guardan solo en
  este navegador. Guarda tu cuenta para no perderlos si cambias de dispositivo."*
- **Sección "Accesibilidad":** Tema (claro/oscuro), Idioma (ES/EN). Nada más.
- **Sección "General":** *"Sobre Dosi"* → `v1.0` + enlace a la política de privacidad publicada.
- **Zona de peligro:** *"Borrar mis datos"* (igual que ahora: borra local + remoto).
- **Se elimina:** sección Cuidadores entera, sección Notificaciones entera, "Apple Health /
  Google Fit", "Tamaño de texto", "Cargar datos de ejemplo", el botón suelto "Cerrar sesión",
  los `ToggleSwitch` decorativos.
- Props que se van: `caregivers`, `onInviteCaregiver`, `onManageCaregiver`, `onLoadDemo`.

### Alta / edición — `AddMedScreen.tsx`
- **Paso 2 — Frecuencia:** segmentado *Todos los días · Días concretos · Cada X horas*.
  - *Días concretos* → 7 chips L·M·X·J·V·S·D (multi-selección) + lista de horarios.
  - *Cada X horas* → segmentado 6/8/12 h + un campo "Primera toma" + previsualización de las
    horas calculadas (*"Tomas: 08:00 · 16:00 · 00:00"*).
  - *Todos los días* → lista de horarios (como ahora).
- **Paso 2 — Duración:** segmentado *Continuo · Durante N días · Hasta fecha*.
  - *Durante N días* → stepper numérico real (−/+ y campo, mín. 1).
  - *Hasta fecha* → `<input type="date">`, mínimo = mañana.
- **Paso 3 — Caducidad:** `<input type="date">` (antes texto libre). Opcional.
- Al guardar (`App.tsx`): construir el nuevo `schedule` / `duration`; `startedOn = hoy` en alta
  (en edición se conserva salvo "reanudar / extender").
- Defaults más neutros: dosis vacía (no "500 mg"), sin caducidad por defecto.

### Detalle — `DetailScreen.tsx`
- El historial deja de ser `mockHistory`: `App.tsx` le pasa `historyDoses` filtrado a esa
  medicina → últimas ~10 tomas reales con su estado. Vacío → *"Sin historial todavía"*.
- Se quita el botón "⋮" del hero (no hacía nada).
- Barra "día X de N" con `treatmentDay()` real. `medState === 'finished'` → etiqueta
  *"Finalizada"* + botón *"Reanudar / extender"*. `paused` → como ahora.

## `App.tsx`, PWA y configuración

### `App.tsx`
- `main.tsx` pasa `<App persistKey="dosi:web" />` → activa la persistencia local (hoy muerta) y
  elimina `autoMarkTaken`.
- `startMeds = stored?.meds ?? []` — **fin de la siembra de `INITIAL_MEDS`**. Se elimina la
  rama `else { pushMeds(startMeds); pushDoses(startDoses) }` del efecto de Supabase: remoto
  vacío → usuario vacío. El primer `pushMed` ocurre cuando el usuario crea su primera medicina.
- Se quitan imports / estado de `INITIAL_MEDS`, `PATIENT_CAREGIVERS`, `inviteOpen`, `manageCg`,
  `onLoadDemo`.
- Nuevo estado: `account` (de `getAccount()`), `authSheet: 'link' | 'signin' | null`.
- `buildTodayDoses(meds, new Date())` en arranque y en el efecto de cambio de `meds`.
- Tras `confirmSignIn` → `pullAll(nuevoUserId)` + `pullHistory` + `setMeds/setDoses/setHistoryDoses`.

### `src/data/settings.ts` (nuevo)
Encapsula `localStorage['dosi-settings']` → `{ themeName, lang, userName }`. Reemplaza el
`readSettings` inline de `App.tsx`. Getters / setters tipados.

### PWA e iconos
- Generar desde `dosi-mobile/store/assets/icon-512.png`: `pwa-192x192.png`, `pwa-512x512.png`,
  `pwa-512x512-maskable.png`, `apple-touch-icon-180.png` en `public/`.
- `vite.config.ts` → `manifest.icons` con los cuatro tamaños y `purpose` correcto;
  `includeAssets` al día.
- `index.html` → `<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">`.

### Copys — `strings.ts`
- `greetingName` se elimina como texto fijo; el saludo se compone con `settings.userName` o sin
  nombre.
- `emptyHomeTitle` → *"Empecemos"* / "Let's begin".
- `testStorageHint` → *"…solo en este navegador"*.
- Nuevos strings: auth (email, código, reenviar, errores), frecuencia (chips de días, "cada X
  horas", previsualización), estado "Finalizada", "Reanudar / extender", paso 4 de onboarding,
  sección "Cuenta" del Perfil, aviso de persistencia.
- `en` al día con todo.

### Supabase dashboard (manual — pasos exactos en el plan)
1. **Authentication → Providers → Email:** activado, "Confirm email" ON, "Enable email OTP" ON
   (código de 6 dígitos, no magic link). Revisar "Secure email change".
2. **Authentication → URL Configuration:** `Site URL = https://dosi-app.vercel.app`.
3. Anonymous sign-ins: ya activado (confirmado 2026-07-03).
4. Plantilla de email OTP: traducir asunto / cuerpo al español (opcional).
5. Documentar el límite de ≈ 4 emails/hora del remitente por defecto.

## Pruebas

### Unitarias (nuevas) — `src/lib/schedule.test.ts`
- `expandTimes`: intervalo 8 h desde 08:00 → 3 tomas, ordenado `['00:00','08:00','16:00']`;
  6 h desde 22:00 → 4 tomas `['04:00','10:00','16:00','22:00']`; diario devuelve `times`
  ordenado tal cual.
- `medState`: `days:10` con `startedOn` hace 3 días → `active`; hace 10 → `finished`; hace 15 →
  `finished`; `until` ayer → `finished`; `paused:true` sobre finished → `paused`.
- `isActiveOn`: `weekdays:[1,3,5]` un martes → `false`; un miércoles → `true`.
- `treatmentDay`: `startedOn` hace 3 días, `days:10` → `{ current: 4, total: 10 }`; nunca > total.
- Lectura tolerante: med sin `freq` / `startedOn` → defaults aplicados.

> No hay runner configurado → añadir **Vitest** (`vitest`, script `"test": "vitest run"`).
> Solo se testea `schedule.ts` en esta pieza.

### Manual en navegador (dev server) antes de desplegar
1. Primer arranque → onboarding 4 pasos (con y sin nombre) → app **vacía**, sin medicinas falsas.
2. Alta "todos los días" con 2 horarios → aparece en Hoy e Inventario.
3. Alta "días concretos" L-X-V → aparece o no según el día.
4. Alta "cada 8 h" desde 08:00 → previsualización y dosis del día correctas.
5. Alta "durante 3 días", retroceder `startedOn` en Supabase → "Finalizada" + "Reanudar" OK.
6. Marcar tomada / posponer / saltar → sincroniza (verificar en el editor de tablas de Supabase).
7. Perfil → "Guardar mi cuenta" → email OTP → confirma → email visible, datos intactos.
8. Otro navegador → "Iniciar sesión" con ese email → misma cuenta, mismos datos.
9. "Cerrar sesión" → anónimo vacío, app usable.
10. "Borrar mis datos" → limpia local y remoto.
11. Recarga con datos "viejos" (quitar `freq` a un med en Supabase) → carga sin romperse.
12. Instalar como PWA → icono correcto en la pantalla de inicio.

### Verificación de build (regla del proyecto)
`rm -f *.tsbuildinfo && npm run lint && npm run test && npm run build` — todo verde.
`tsc` con `noUnusedLocals` / `noUnusedParameters` es estricto: nada de imports ni parámetros
sin usar. Con `"jsx": "react-jsx"`, nunca añadir `import React from 'react'`.

## Despliegue

- Commits temáticos en `main` del repo `dosi-app` (PowerShell → here-strings `@'…'@` para
  mensajes multilínea).
- `git push origin main` → Vercel despliega solo.
- Verificar `https://dosi-app.vercel.app`: arranque vacío, alta en cada modo de frecuencia,
  login por email.
- Actualizar `memory/project_dosi.md` con el nuevo estado de la web.

## Archivos

**Nuevos:** `src/lib/schedule.ts`, `src/lib/schedule.test.ts`, `src/screens/AuthSheet.tsx`,
`src/data/settings.ts`, `public/pwa-192x192.png`, `public/pwa-512x512.png`,
`public/pwa-512x512-maskable.png`, `public/apple-touch-icon-180.png`.

**Se borran:** `src/data/mock.ts`, `src/screens/InviteCaregiverSheet.tsx`,
`src/screens/ManageCaregiverSheet.tsx`.

**Se modifican:** `src/main.tsx`, `src/App.tsx`, `src/data/types.ts`, `src/data/sync.ts`,
`src/data/store.ts`, `src/data/buildTodayDoses.ts` (fusión / traslado a `schedule.ts`),
`src/lib/supabase.ts`, `src/screens/OnboardingScreen.tsx`, `src/screens/ProfileScreen.tsx`,
`src/screens/AddMedScreen.tsx`, `src/screens/DetailScreen.tsx`, `src/screens/InventoryScreen.tsx`,
`src/screens/HomeScreen.tsx`, `src/i18n/strings.ts`, `src/icons/index.tsx` (si faltan iconos),
`index.html`, `vite.config.ts`, `package.json`.
