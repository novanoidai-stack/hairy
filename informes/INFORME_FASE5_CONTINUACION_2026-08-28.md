# INFORME — Fase 5: continuación de la descomposición de la agenda
**Fecha:** 2026-08-28 · **Estado:** CI verde en `ad4a5b0f3` (typecheck + 466 tests + E2E + Biome)
**Autor:** ZCode · **Ámbito:** `components/agenda/`

---

## 1. ¿Qué es y para qué sirve la Fase 5?

La Fase 5 del plan maestro (`informes/PLAN-MAESTRO-RENDIMIENTO-Y-ARQUITECTURA-2026-08-27.md`) es la **descomposición controlada del monolito de la agenda**: partir `AgendaCalendar.web.tsx` en módulos encapsulados SIN reescribir lógica, de forma que cada pieza extraída sea idéntica en comportamiento a la original.

**No es una reescritura ni un cambio de tecnología.** Es una mudanza: el código se mueve "tal cual" a su propio archivo y las dependencias que le faltan las canta `tsc`. La receta ya está validada 4 veces (ver §4).

### Para qué sirve (objetivos medibles)
1. **Mantenibilidad:** poder abrir, leer y revisar un archivo de 400–1.500 líneas en vez de uno de 25.000. Hoy un cambio de una variable del drag puede romper el cobro rápido sin que nadie lo vea hasta producción — ese fue el argumento de ambos informes de auditoría.
2. **Velocidad de desarrollo:** bundling más granular → el navegador recarga/edita menos código en cada cambio y el editor va más fluido.
3. **Testabilidad:** módulos puros (como ya son `solapeAlSoltar.ts` y `cadena.ts`, con sus 207 tests) se pueden probar aislados; el monolito solo se puede probar con E2E.
4. **Onboarding:** una persona (o un agente) nueva puede entender "la vista de día" sin leer el resto del producto.

---

## 2. Estado actual — inventario verificado hoy

`AgendaCalendar.web.tsx` quedó en **11.826 líneas** (desde las 25.688 originales, −54%). Lo que YA está fuera:

| Módulo extraído | Líneas | Extrajo | ¿Verificado? |
|---|---|---|---|
| `modals/DetalleCitaModal.web.tsx` | 6.977 | sesión previa | ✅ tsc + CI + E2E |
| `modals/NewCitaModal.web.tsx` | 4.623 | sesión previa | ✅ (tras 2 fixes de imports en CI) |
| `views/VistasSemanaMes.web.tsx` (WeekView, MonthView, ClienteHistorialModal) | 1.410 | esta sesión | ✅ tsc + CI + E2E con selector visible |
| `ui/Icon.web.tsx` | 37 | esta sesión | ✅ |
| `ui/atomos.web.tsx` | 982 | sesión previa | ✅ |
| `store/useAgendaStore.ts` (Zustand, solo vista+profesional) | 53 | sesión previa | ✅ |
| `lib/agendaBloqueUi.ts` (BLOQUEO_COLORS/LABELS, bloqueDeCita) | 281 | compartido | ✅ |

**Lo que queda DENTRO del monolito** (objetivo de esta continuación), por tamaño:

| Bloque interno | Líneas aprox. | Qué es | Riesgo de extracción |
|---|---|---|---|
| `DayTimeline` (+memo) | ~2.370 | La rejilla de día completa: columnas por profesional, hora a hora | 🟠 Medio-alto: es la vista principal |
| `DayTimelineAppointmentCard` (export) | ~710 | Tarjeta de cita con fases/reposos y drag | 🟠 Medio |
| `DayTimelineProfessionalColumn` (export) | ~680 | Columna de un profesional | 🟠 Medio |
| `DayListView` | ~380 | Lista vertical (móvil) de día | 🟢 Bajo: autónoma, solo props |
| `StatCard`, `ProfRow`, `ViewTab`, `CitaEstadoBadge` | ~500 | Atomos de UI sueltos | 🟢 Bajo: componentes hoja sin estado compartido |
| `ReposoFreeGapInteractive` | ~360 | Hueco interactivo de reposo | 🟡 Medio: toca el drag |
| Componente principal `AgendaCalendar()` | ~6.000 | Datos, realtime, física del drag, filtros, orquestación | 🔴 Se queda: es el orquestador. Se adelgaza extrayendo lo de arriba; la física del arrastre solo si hay E2E que la congelen |

Ya están fuera y NO hay que tocarlos (se importan): `CobroSheet` (POS), `Onboarding*`, `ChispaMascota`, `OrganizarAgendaPanel`, `Retraso*Modal`, `ListaEspera*`.

---

## 3. ¿Todo funcionará como siempre? ¿Causará fallos? Análisis honesto

**Garantía al 100% no existe en ningún refactor — pero este método la acerca al máximo posible.** Esto es lo que dice la evidencia de las 4 extracciones ya hechas:

- **4 de 4 extracciones terminaron con CI verde** (typecheck + 466 tests unitarios + E2E de Playwright sobre la agenda demo real, que hoy incluye un test que congela el coste del arrastre y recorre las vistas Semana/Mes/Día).
- **2 de ellas rompieron la CI por el camino** (imports que faltaban en `NewCitaModal`). Dato importante: el fallo lo pilló la CI en minutos, no producción. **El sistema de protección funciona — el coste de equivocarse es un push roto, no un cliente roto.**

### Riesgos concretos y sus mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Imports incompletos al extraer (lo que pasó 2 veces) | Alta | El `tsc` del checkout limpio los canta TODOS. Regla: verificar en checkout limpio ANTES de pushear (ver prompt, §7) |
| El typecheck local pasa pero CI falla (archivos .expo generados enmascaran) | Ya ocurrió 2 veces | Réplica de checkout: `git archive HEAD \| tar -x` + tsc. Es la lección #1 de memory/2026-08-28.md |
| Romper el drag & drop al mover la física | Media | **No mover la física del drag en esta tanda** — solo mover bloques que reciben todo por props. La física se queda en el orquestador |
| Regresión visual sutil (estilos que dependían del scope del padre) | Baja | Los bloques objetivo usan TOKENS globales y props; la mudanza es textual |
| Colisión con otra sesión trabajando en paralelo | Ya ocurrió | Commitear en tandas pequeñas; hacer `git status` antes y después de cada extracción |

### ¿Implica regresión en el refactor ya hecho?
**No — y está verificado.** El estado actual (post-extracciones) pasa: `tsc --noEmit` limpio en checkout limpio, 466 tests unitarios en verde, CI completa en success con E2E. Las dos roturas intermedias (imports de NewCitaModal) se detectaron y repararon sin llegar ni un minuto a producción (Vercel despliega desde master solo cuando la CI pasa... nota: si Vercel no tiene configurado "esperar a CI", conviene revisarlo — es la única vía por la que un push roto llegaría a la web).

---

## 4. ¿Qué vamos a ganar? (validación de la decisión)

1. **El archivo más peligroso del proyecto deja de serlo.** De 25.688 → objetivo ~6.000 (solo orquestador). Ningún archivo por encima de ~2.500 tras esta tanda.
2. **La vista de día (DayTimeline) se vuelve testeable.** Hoy solo se prueba con E2E; extraída, se le pueden colgar tests de render puro como ya tienen los modales.
3. **Cada PR de agenda será revisable.** Un diff de 100 líneas en `DayListView.tsx` de 380 se entiende; hoy ese mismo cambio se pierde en 11.826.
4. **Desarrollo paralelo sin colisiones** — literalmente: esta semana dos sesiones tropezaron en el mismo archivo de 25K líneas. Con módulos separados no pasa.
5. **Coste: ~0.** No cambia runtime, no cambia datos, no cambia UX. Solo estructura de archivos.

**¿La decisión está bien tomada?** Sí, con evidencia: es la Fase 5 del plan maestro (que ya midió la línea base), fue crítica en las dos auditorías independientes, el método está validado 4/4 en este mismo repositorio, y la alternativa (dejar el monolito) es la que produjo los bugs históricos de "siete reglas de solape que no decían lo mismo". La única decisión que cuestionaría es tocar la física del drag ahora mismo: eso exige antes congelarla con más E2E — y NO está en esta tanda.

---

## 5. Qué NO hacer (líneas rojas)

- ❌ No reescribir ni "mejorar" el código movido: mudanza textual.
- ❌ No mover `startDrag`/`onMove`/`onUp`/ghost/rAF (la física) en esta tanda.
- ❌ No introducir el store Zustand en lo movido (los bloques van por props; el store es para vista/filtro).
- ❌ No cachear citas con TanStack Query (staleTime 0 por diseño; ver `lib/datos/queryClient.ts`).
- ❌ No pushear sin typecheck en checkout limpio.

---

## 6. Plan de tanda (ordenado por riesgo ascendente)

1. **Atomos sueltos** → `ui/atomos.web.tsx` o nuevo `ui/atomosAgenda.web.tsx`: `StatCard`, `ProfRow`, `ViewTab`, `CitaEstadoBadge` (~500 líneas). Riesgo mínimo, calibra el proceso.
2. **DayListView** → `views/VistaDiaLista.web.tsx` (~380). Autónoma.
3. **Familia DayTimeline** → `views/timeline/` en tres archivos: `AppointmentCard.web.tsx` (~710), `ProfessionalColumn.web.tsx` (~680), `Timeline.web.tsx` (~2.370). Misma carpeta para que los imports entre ellos sean cortos.
4. Commit por extracción (o por pareja), tsc + deno test + checkout limpio, push, CI verde, siguiente.

Resultado esperado: **AgendaCalendar.web.tsx ≈ 6.000–6.500 líneas** (orquestador puro) y ningún archivo nuevo por encima de ~2.500.

---

## 7. PROMPT INTEGRADO para lanzar en otra sesión

Copia y pega tal cual:

---

Continúa la Fase 5 del plan maestro (informes/PLAN-MAESTRO-RENDIMIENTO-Y-ARQUITECTURA-2026-08-27.md, §Fase 5): descomponer components/agenda/AgendaCalendar.web.tsx (hoy 11.826 líneas) en módulos, con mudanza textual SIN reescribir lógica. Lee antes: informes/INFORME_FASE5_CONTINUACION_2026-08-28.md y memory/2026-08-28.md (lecciones).

ORDEN EXACTO (uno por commit, riesgo ascendente):
1. Extraer StatCard, ProfRow, ViewTab y CitaEstadoBadge (~500 líneas) a components/agenda/ui/atomos.web.tsx (o nuevo archivo ui si no encajan).
2. Extraer DayListView (~380 líneas, empieza en la línea con "function DayListView") a components/agenda/views/VistaDiaLista.web.tsx.
3. Extraer DayTimelineAppointmentCard (~710) y DayTimelineProfessionalColumn (~680), ambos ya `export const ... = memo(...)`, a components/agenda/views/timeline/AppointmentCard.web.tsx y ProfessionalColumn.web.tsx.
4. Extraer DayTimeline + su memo (~2.370) a components/agenda/views/timeline/Timeline.web.tsx, importando los dos anteriores.

MÉTODO OBLIGATORIO (receta ya validada 4 veces en este repo):
- Mudanza textual: cortar-pegar el bloque tal cual, añadir `export` a lo movido, e importarlo de vuelta en AgendaCalendar.web.tsx.
- Dejar que `npx tsc --noEmit` cante los imports que faltan; resolverlos importando del módulo canónico (lib/constants, lib/horarios, lib/retrasos, lib/agendaBloqueUi, ui/atomos.web, ui/Icon.web...). NUNCA duplicar definiciones.
- Verificación ANTES de cada commit: `npm run typecheck` Y `deno task test` Y el checkout limpio:
  `rm -rf /tmp/hairy-checkout && mkdir -p /tmp/hairy-checkout && git archive HEAD | tar -x -C /tmp/hairy-checkout && cp -r node_modules /tmp/hairy-checkout && cd /tmp/hairy-checkout && npx tsc --noEmit --pretty false`
  (el typecheck del working tree NO basta: los .expo generados y cambios ajenos enmascaran errores; esto rompió la CI 2 veces).
- Commit pequeño por extracción, push, y confirmar que la CI de GitHub queda verde (curl -s "https://api.github.com/repos/novanoidai-stack/hairy/actions/runs?per_page=1") antes de la siguiente.

LÍNEAS ROJAS:
- No mover ni tocar la física del drag (startDrag/onMove/onUp/ghost/rAF/gridRect): se queda en el orquestador.
- No reescribir ni "mejorar" nada de lo movido, no renombrar variables, no cambiar estilos.
- No introducir el store Zustand ni TanStack Query en lo movido: los bloques van por props.
- No duplicar la regla de solape: siempre citaSolapaOcupacion/pisaOtraCitaAlSoltar de lib/.
- `git status` antes de empezar: si otra sesión dejó cambios sin commitear, commitea primero SOLO lo que sea claramente suyo terminado, y no lo mezcles con tus extracciones.

OBJETIVO FINAL: AgendaCalendar.web.tsx ≈ 6.000-6.500 líneas (orquestador), ningún archivo nuevo >2.500 líneas, CI verde tras cada paso.

---

## 8. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Para qué sirve? | Partir el último gigante (11.826 líneas) en módulos revisables y testeables, sin cambiar comportamiento |
| ¿Causará fallos? | El método (mudanza textual + tsc + checkout limpio + CI) hace que los fallos, si aparecen, se queden en el push — ocurrió 2 veces y ninguna llegó a producción |
| ¿Todo funcionará igual? | Sí: 4/4 extracciones previas terminaron en CI verde con los E2E de agenda pasando |
| ¿Regresión en lo ya refactoreado? | No: el estado actual pasa todas las verificaciones (tsc limpio, 466 tests, CI+E2E success en ad4a5b0f3) |
| ¿Qué ganamos? | Archivo más peligroso del proyecto de 25.688→~6.000; desarrollo paralelo sin colisiones; PRs revisables; testabilidad |
| ¿Decisión bien tomada? | Sí: validada por 2 auditorías independientes, el plan maestro medido, y 4 ejecuciones exitosas en este mismo repo. La única parte aplazada conscientemente es la física del drag (necesita más E2E antes) |
