# FASE 5 — Plan corregido para terminar de partir la agenda

**Fecha:** 28 ago 2026 · **Autor:** Carlos
**Sustituye a:** `INFORME_FASE5_CONTINUACION_2026-08-28.md`, cuyas cifras de tamaño eran correctas
pero que contenía **un error de seguridad importante y dos de orden de extracción**. Ver §6.

---

## 1. Qué se está haciendo, y por qué — sin jerga

`AgendaCalendar.web.tsx` era un fichero de **25.688 líneas**: la agenda entera, con sus modales, su
rejilla, su arrastre y sus datos, todo en el mismo sitio. Hoy va por **11.826**.

El problema de un fichero así no es estético. Es que **nadie puede tener 25.000 líneas en la
cabeza**, así que:

- Un cambio en una variable del arrastre podía romper el cobro sin que nadie lo viera hasta que un
  salón lo sufría.
- La misma regla de negocio acababa escrita a mano varias veces en sitios distintos, divergiendo
  poco a poco. En este repo llegó a haber **siete copias de la regla de solape**, y varias
  permitían reservar encima de una cita existente.
- Dos personas (o dos sesiones) no pueden tocar la agenda a la vez sin pisarse. Esta misma semana
  pasó.

Partirlo **no cambia nada de lo que ve el usuario**. No es una mejora de rendimiento y no hay que
venderla como tal: es lo que hace que las mejoras siguientes se puedan hacer sin miedo.

### En qué ayuda, en concreto

| Hoy | Después de la Fase 5 |
|---|---|
| Un cambio en la rejilla obliga a abrir 11.826 líneas | Se abre `Timeline.web.tsx`, de ~2.400 |
| Un diff de agenda es irrevisable | Un diff de 100 líneas sobre un fichero de 400 se entiende |
| La rejilla solo se puede probar con Playwright (~7 min) | Se le pueden colgar pruebas de Vitest (~2 s) |
| Dos sesiones chocan en el mismo fichero | Cada una en el suyo |

---

## 2. Estado real hoy (verificado, no estimado)

`AgendaCalendar.web.tsx` = **11.826 líneas**. Ya está fuera:

| Módulo | Líneas |
|---|---|
| `modals/DetalleCitaModal.web.tsx` | 6.977 |
| `modals/NewCitaModal.web.tsx` | 4.623 |
| `views/VistasSemanaMes.web.tsx` | 1.410 |
| `ui/atomos.web.tsx` | 982 |
| `lib/agendaBloqueUi.ts` | 281 |
| `store/useAgendaStore.ts` | 53 |
| `ui/Icon.web.tsx` | 37 |

### Lo que queda dentro, con coordenadas exactas

| Bloque | Líneas del fichero | Tamaño |
|---|---|---|
| `ReposoFreeGapInteractive` | 367–495 | **129** |
| `AgendaCalendar()` (orquestador) | 496–7.272 | **6.777** |
| `StatCard`, `ProfRow`, `ViewTab` | 7.273–7.606 | **334** |
| `areCardPropsEqual` + `DayTimelineAppointmentCard` | 7.607–8.366 | **760** |
| `DayTimelineProfessionalColumn` | 8.367–9.047 | **681** |
| `DayTimelineMemo` + `DayTimeline` | 9.048–11.422 | **2.375** |
| `CitaEstadoBadge` + `DayListView` | 11.423–11.826 | **404** |

---

## 3. El orden NO es libre: el grafo de dependencias

Esto es lo que el informe anterior se saltó, y es lo que hace que una extracción salga a la primera
o cueste una tarde. Comprobado leyendo los usos reales:

```
DayTimeline  ──usa──>  ProfessionalColumn  ──usa──>  AppointmentCard  ──usa──>  ReposoFreeGapInteractive
                                                            └──usa──>  areCardPropsEqual (su comparador memo)

DayListView  ──usa──>  CitaEstadoBadge      (¡y NADIE más lo usa!)
```

**Dos correcciones al plan anterior:**

1. **`CitaEstadoBadge` NO va con los átomos.** El informe anterior lo metía en la tanda de
   "átomos sueltos". Pero su único consumidor es `DayListView` (línea 11.715). Si se separan, se
   crea un import cruzado innecesario entre dos ficheros nuevos. **Van juntos.**
2. **`ReposoFreeGapInteractive` tiene que moverse con `AppointmentCard`.** Vive al principio del
   fichero (línea 367), lejísimos, y su único consumidor es `AppointmentCard` (línea 8.069). El
   informe anterior lo listaba como bloque suelto "de riesgo medio, toca el drag". No hace falta
   tratarlo aparte: se va con quien lo usa.

Y la regla general, aprendida al extraer los modales: **lo que se usa se extrae ANTES que quien lo
usa**, y si dos ficheros nuevos se necesitarían mutuamente, lo compartido va a un tercero neutro
(así nacieron `tipos.ts` y `ui/atomos.web.tsx`).

---

## 4. Plan de extracción — cinco pasos, de menos a más riesgo

| # | Qué | De dónde | A dónde | Líneas |
|---|---|---|---|---|
| 1 | `StatCard`, `ProfRow`, `ViewTab` | 7.273–7.606 | `ui/atomosAgenda.web.tsx` | 334 |
| 2 | `CitaEstadoBadge` + `DayListView` | 11.423–11.826 | `views/VistaDiaLista.web.tsx` | 404 |
| 3 | `ReposoFreeGapInteractive` + `areCardPropsEqual` + `AppointmentCard` | 367–495 y 7.607–8.366 | `views/timeline/AppointmentCard.web.tsx` | 889 |
| 4 | `DayTimelineProfessionalColumn` | 8.367–9.047 | `views/timeline/ProfessionalColumn.web.tsx` | 681 |
| 5 | `DayTimelineMemo` + `DayTimeline` | 9.048–11.422 | `views/timeline/Timeline.web.tsx` | 2.375 |

**Total extraíble: 4.683 líneas.**

### El resultado realista: ~7.143 líneas, no 6.000

El informe anterior prometía **"6.000–6.500"**. No sale: 11.826 − 4.683 = **7.143**. El orquestador
por sí solo ya son 6.777 líneas, más los imports y utilidades de cabecera.

Bajar de ahí exige partir el orquestador —datos, realtime, física del arrastre, filtros—, y **eso
no está en esta tanda**: la física del arrastre solo se toca con más pruebas E2E que la congelen
primero. Mejor prometer 7.143 y cumplirlo que prometer 6.000 y no llegar.

---

## 5. ⚠️ PREREQUISITO: hoy no hay red bajo el trapecio

**Antes de la primera extracción, hay que arreglar esto.**

El informe anterior sostenía su modelo de riesgo en esta frase: *"el coste de equivocarse es un
push roto, no un cliente roto"*, porque *"Vercel despliega desde master solo cuando la CI pasa"*.

**Es falso, y lo comprobé:**

- `vercel.json` no tiene ninguna puerta: ni `ignoreCommand` ni configuración de checks de GitHub.
- El historial de Actions lo confirma: `5074ce024` y `4fb36abee` terminaron en **failure** y se
  desplegaron igual.
- `5074ce024` subió `NewCitaModal.web.tsx` con **26 imports ausentes** (`CITA_STATUS`,
  `validarHorarioLaboral`, `useDebounce`…). Babel no los inventa: eso es un `ReferenceError` nada
  más abrir "Nueva cita".
- **Ventana real: de 02:27 a 02:44 del 28 ago.** Diecisiete minutos con el alta de citas rota en
  producción. No hubo daño porque los salones estaban cerrados — por suerte, no por diseño.

(Comprobado también que **producción está sana ahora**: la demo carga, "Nueva cita" abre con
cliente, servicio y profesional, y cero errores de JS.)

**Qué hacer, una de las dos:**
- En `vercel.json`, un `ignoreCommand` que consulte el estado de la CI para ese commit y aborte el
  build si no está en verde; o
- en el panel de Vercel, activar que espere a los checks de GitHub antes de desplegar.

Mientras eso no exista, la Fase 5 se puede hacer igual **pero el riesgo real es otro del que dice
el informe anterior**, y conviene saberlo: cada push va directo a salones reales.

---

## 6. Erratas del informe anterior

| Dice | Realidad |
|---|---|
| "Vercel despliega solo cuando la CI pasa" | **Falso.** No hay puerta; dos commits rotos se desplegaron |
| "`solapeAlSoltar.ts` y `cadena.ts`, con sus **207 tests**" | Son **16** (8 + 8) |
| "`ReposoFreeGapInteractive` ~360 líneas" | Son **129** (367–495) |
| "Resultado: 6.000–6.500 líneas" | **~7.143** |
| `CitaEstadoBadge` en la tanda de átomos | Va con `DayListView`: es su único consumidor |

Lo demás de aquel informe —tamaños, método, líneas rojas— es correcto y se conserva aquí.

---

## 7. PROMPT PARA LA SIGUIENTE SESIÓN

Copia desde aquí:

---

Vas a continuar la **Fase 5** del refactor de Mecha: terminar de partir
`components/agenda/AgendaCalendar.web.tsx` (hoy **11.826 líneas**) en módulos.

**Lee primero:** `informes/FASE5-PLAN-CORREGIDO-2026-08-28.md` (este plan) y
`informes/PLAN-MAESTRO-RENDIMIENTO-Y-ARQUITECTURA-2026-08-27.md` (§Fase 5).

### Qué es esto y por qué importa

No es una mejora de rendimiento y no debes venderla como tal: **el usuario no notará nada**. Es
mantenibilidad. El fichero era de 25.688 líneas y eso ya produjo daño real: llegó a haber **siete
copias divergentes de la regla de solape**, varias de las cuales dejaban reservar encima de una
cita existente. Partirlo es lo que permite que los cambios siguientes sean revisables.

Es **una mudanza, no una reescritura**: el código se mueve tal cual. Si te ves "mejorando" algo de
lo movido, para: eso va en otro commit, después, y con su prueba.

### PREREQUISITO — compruébalo antes de empezar

`vercel.json` **no tiene puerta de CI**: hoy un push a `master` se despliega a salones reales
aunque la CI esté en rojo. Ya pasó el 28 ago (17 minutos con el alta de citas rota). Si nadie lo
ha arreglado todavía, **dilo al usuario antes de la primera extracción** y ofrece montarlo: un
`ignoreCommand` en `vercel.json` que aborte el build si el commit no está verde, o activar la
espera a checks en el panel de Vercel.

### Orden EXACTO (uno por commit, de menos a más riesgo)

El orden no es libre: **lo que se usa se extrae antes que quien lo usa**.

1. **`StatCard`, `ProfRow`, `ViewTab`** (líneas 7.273–7.606, 334 líneas) →
   `components/agenda/ui/atomosAgenda.web.tsx`. Son hojas, sin estado compartido. Calibra el
   proceso.
2. **`CitaEstadoBadge` + `DayListView`** (11.423–11.826, 404) → `components/agenda/views/VistaDiaLista.web.tsx`.
   **Van juntos**: `CitaEstadoBadge` no lo usa nadie más que `DayListView`.
3. **`ReposoFreeGapInteractive` + `areCardPropsEqual` + `DayTimelineAppointmentCard`**
   (367–495 **y** 7.607–8.366, 889 en total) → `components/agenda/views/timeline/AppointmentCard.web.tsx`.
   **Los tres juntos**: `ReposoFreeGapInteractive` vive al principio del fichero pero su único
   consumidor es la tarjeta (línea 8.069), y `areCardPropsEqual` es su comparador de `memo`.
4. **`DayTimelineProfessionalColumn`** (8.367–9.047, 681) → `.../timeline/ProfessionalColumn.web.tsx`.
   Importa el paso 3.
5. **`DayTimelineMemo` + `DayTimeline`** (9.048–11.422, 2.375) → `.../timeline/Timeline.web.tsx`.
   Importa el paso 4.

⚠️ Los números de línea son de HOY. **Cada extracción los desplaza**: vuelve a localizar el bloque
con `grep -n "^function DayTimeline("` antes de cada paso, no confíes en la tabla.

### Método (validado seis veces en este repo)

1. Corta el bloque tal cual y pégalo en el fichero nuevo. Añade `export`.
2. Impórtalo de vuelta en `AgendaCalendar.web.tsx`.
3. Ejecuta `npx tsc --noEmit` y **deja que cante los imports que faltan**. Resuélvelos importando
   del módulo canónico (`@/lib/constants`, `@/lib/horarios`, `@/lib/retrasos`,
   `@/lib/agendaBloqueUi`, `../ui/atomos.web`, `../ui/Icon.web`, `../tipos`…).
   **NUNCA dupliques una definición para callar al compilador.**
   Ojo: alguna ruta "obvia" está mal — `validarHorarioLaboral` vive en `lib/horarios`, no en
   `lib/horariosFranjas`.
4. Si dos ficheros nuevos se necesitarían mutuamente, lo compartido va a un tercero neutro (así
   nacieron `components/agenda/tipos.ts` y `ui/atomos.web.tsx`). **Nunca importes de
   `AgendaCalendar.web.tsx` hacia un módulo extraído: eso es un ciclo.**

### Verificación ANTES de cada commit (todo, sin saltarse nada)

```
npx tsc --noEmit
deno task test          # 466 unitarios
npx vitest run          # componentes
npx playwright test tests/agenda-demo.spec.ts --project=publico
```

Y el **checkout limpio**, que es la lección que costó dos CI rotas (el typecheck del árbol de
trabajo enmascara errores porque los `.expo` generados y los cambios ajenos tapan imports que
faltan):

```
rm -rf /tmp/hairy-checkout && mkdir -p /tmp/hairy-checkout
git archive HEAD | tar -x -C /tmp/hairy-checkout
cp -r node_modules /tmp/hairy-checkout
cd /tmp/hairy-checkout && npx tsc --noEmit --pretty false
```

`tests/agenda-demo.spec.ts` incluye una prueba que **congela el coste del arrastre** (nodos
mutados y cero remontajes). Si esa falla, has roto una barrera `memo`: lo más probable es un prop
recreado en cada render. No la desactives.

### Líneas rojas

- ❌ **No muevas la física del arrastre** (`startDrag`, `onMove`, `onUp`, el fantasma, `rAF`,
  `gridRect`). Se queda en el orquestador. Está medida y funciona: 80 movimientos cruzando 8
  franjas mutan 8 nodos y no remontan nada. Tocarla exige antes más E2E que la congelen.
- ❌ No reescribas, no renombres, no "mejores" nada de lo movido.
- ❌ No metas Zustand ni TanStack Query en lo movido: los bloques van por props.
- ❌ No dupliques la regla de solape. Siempre `citaSolapaOcupacion` / `pisaOtraCitaAlSoltar` de
  `lib/`. Ya costó siete copias divergentes.
- ❌ No pushees sin el checkout limpio en verde.

### Antes de empezar y entre pasos

`git status` y `git log --oneline -3`. **Hay otras sesiones trabajando en este repo**: si aparecen
cambios o commits que no son tuyos, intégralos primero y no los mezcles con tus extracciones.

### Objetivo

`AgendaCalendar.web.tsx` ≈ **7.143 líneas** (el orquestador: datos, realtime, física del arrastre,
filtros). Ningún fichero nuevo por encima de ~2.400. CI verde tras cada paso.

**No prometas 6.000**: no sale, y el orquestador por sí solo ya son 6.777.

---

## 8. Resumen

| Pregunta | Respuesta |
|---|---|
| ¿Qué se hace? | Mover 4.683 líneas de la agenda a 5 módulos, sin tocar lógica |
| ¿Se nota algo? | **No.** Es mantenibilidad, no rendimiento |
| ¿En qué ayuda? | Diffs revisables, pruebas rápidas en vez de E2E, y dos sesiones sin pisarse |
| ¿Puede romper algo? | Sí, y ya pasó: dos CI rotas. La red (tsc + checkout limpio + 466 tests + E2E del arrastre) lo caza, **pero hoy Vercel no espera a la CI** — arreglar eso primero |
| ¿Dónde acaba? | ~7.143 líneas. Bajar más exige partir el orquestador, que es otra fase |
