# Spec — Mover a hueco de otro profesional (Agenda inteligente #2, slice 3)

Fecha: 2026-07-16 · Autor: Alexandru (lógica/motor) · Estado: aprobado para plan

## Contexto y objetivo

Cierra el ejemplo literal del `INFORME_TAREAS_AGENDA.md` #2: *"Mover la Cita B a un empleado
con tiempo muerto y misma especialidad"*. El slice 2 dejó hecha solo la mitad: `reasignar`
cambia de profesional **manteniendo la hora exacta**, y solo se emite si el destino está libre
justo en esa ventana. Cuando nadie está libre a esa hora concreta, hoy no hay estrategia.

Este slice añade la otra mitad: **otro profesional en otra hora**, buscando un hueco (o un
tiempo muerto) en la agenda del destino. Es la palanca que de verdad materializa PA-03 (*"el
tiempo de reposo es tan valioso como el activo"*) a nivel de salón y no solo de un estilista.

## Decisiones

Tomadas de forma autónoma contra los documentos (el usuario delegó explícitamente el criterio).

- **Especialidades: fuera del slice.** El Documento Modular es explícito: *"Especialidades son
  orientativas (no bloquean), guían la propuesta automática"*. El dato real (`profesionales.especialidades`)
  es `text[]` de **texto libre** editado a mano en Equipo y Mi Perfil, mientras los servicios cuelgan
  de `categorias_servicio`. Casarlos exigiría match por texto normalizado, que falla en silencio ante
  sinónimos ("Coloración" vs "Color") y daría un ranking peor que no tenerlo. Estructurar
  `especialidades` a `categoria_id[]` es un slice propio (migración + backfill + UI de Carlos).
  El desempate entre candidatos sigue siendo **categoría cualificada más baja**, igual que `reasignar`.
- **Categoría: filtro duro.** RN-AG-014. Se reusa `categoriaCumple`; `categoria_minima = null`
  = sin requisito (sigue siendo NULL en los 40 servicios, así que hoy no descarta a nadie: correcto,
  las restricciones de categoría son *configurables por el salón, no impuestas por el sistema*).
- **Bloqueos del destino: dentro del slice.** Es el requisito nuevo que trae mover a otra hora.
  `reasignar` no lo necesitaba (la hora original ya era operativa), pero proponer un hueco arbitrario
  del destino puede caer sobre sus vacaciones o su reunión → violaría RN-AG-010. Los bloqueos
  entran como obstáculos más en `buscarHueco`.
- **Recurrencia de bloqueos: fuera del slice.** `bloqueos_profesional.recurrencia` existe pero
  **nadie la expande hoy** (solo hay CRUD en `equipo.*`); ningún validador del producto la respeta.
  Se consumen solo los bloqueos cuyo `[inicio, fin]` intersecta el día analizado. Arreglar la
  recurrencia es deuda transversal y merece su propio ciclo.
- **Ventana de jornada del negocio: fuera del slice.** `cierreDefault` = último fin + 3h, no el
  horario real de `negocio_horarios`. Es un defecto **preexistente y compartido por todas las
  palancas** (`mover_hueco` ya puede proponer las 23:00 hoy). No es regresión de este slice y
  arrastrarlo aquí mezclaría dos problemas.
- **Sin cita encadenada:** `intrusa.grupoId != null` → no se emite (consistente con el resto).

## Estado actual (lo que se reutiliza)

- `lib/retrasos.ts`: `calcularEstrategiasSolape` con sus 5 palancas; `buscarHueco` (barrido a slot
  de 15 min con soporte `soloReposo`); `fasesDe`, `reubicar`, `toUpdate`, `chocaActivaActiva`,
  `hayColision`; `UpdateRetraso.profesional_id` (slice 2); dedup por firma de updates.
- `lib/organizarAgenda.ts`: `detectarSolapes` ya construye `candidatos` (otros profesionales activos
  + su `ocupacion`) y los pasa por `opts.reasignacion`. Este slice extiende ese mismo canal.
- `lib/constants.ts`: `categoriaCumple`, `CATEGORIA_ORDEN`.
- `lib/chispaOps.ts`: `optimizar_agenda` ya escribe y deshace `profesional_id` → el apply path
  del slice 2 sirve tal cual, sin tocar.
- `RetrasoEstrategiasModal.web.tsx`: genérico, usa `e.tipo` como React key → **el tipo nuevo debe
  ser único por lista** (lo garantiza el dedup).
- `AgendaCalendar.web.tsx`: ya carga `bloqueos_profesional` (`select *` por negocio) y ya renderiza
  `OrganizarAgendaPanel` → el cableado es pasar una prop más.

## Diseño

### 1. Tipos (`lib/retrasos.ts`)

- `EstrategiaTipo` gana `'mover_reasignar'` (sexto tipo).
- El candidato de `opts.reasignacion` gana un campo opcional:
  `bloqueos?: { inicio: string; fin: string }[]`.

### 2. Palanca `estrategiaMoverAOtroProfesional`

Función pura nueva, misma forma que las demás (devuelve `EstrategiaRetraso | null`):

1. Descarta si `intrusa.grupoId`.
2. Filtra candidatos por `categoriaCumple(c.categoria, categoriaMinima)`.
3. Para cada elegible, obstáculos = `c.ocupacion.map(fasesDe)` + sus bloqueos del día convertidos
   a fases opacas (`finA = finE = fin`, sin reposo → bloquean todo el tramo).
4. `buscarHueco(intrusaFases, obstaculos, desde, cierreMs, false)` con
   **`desde = max(ahoraMs, hora original de la intrusa)`** — solo hacia adelante, nunca se adelanta
   a la clienta. Dos razones: (a) adelantar a alguien que ya tiene su hora es operativamente peor
   que retrasarlo (puede no llegar), y para eso ya existe la palanca `adelantar_otra`; (b) hace que
   el primer slot que devuelve `buscarHueco` **sea ya el más cercano a su hora original**, que es
   justo el que queremos — sin primitivas nuevas ni barridos en dos direcciones.
   `soloReposo = false` en un único barrido: `buscarHueco` **ya admite** los slots que caen dentro
   del reposo de otra cita, así que un solo barrido cubre hueco y tiempo muerto. Si el slot elegido
   cae dentro de un reposo del destino, se detecta *a posteriori* solo para redactar el resumen.
5. **Elección del candidato:** como todos los slots son `>= hora original`, el mejor es simplemente
   el **slot más temprano** (= menor desplazamiento para la clienta). Desempate por categoría
   cualificada más baja, luego por nombre. Determinista.
6. Valida `hayColision([...obstaculos, nueva])` antes de emitir.
7. `update = { ...toUpdate(intrusa, nueva), profesional_id: candidato.id }`.
8. `avisos`: uno para la intrusa (cambia hora **y** profesional), si tiene teléfono.

**Métricas de la tarjeta:**
- `citasMovidas: 0` — no toca ninguna otra cita.
- `retrasoCierreMin`: delta del cierre del **profesional destino** (`max(0, finNuevo − último fin
  de su ocupación)`, y `0` si el destino no tiene citas). Es la métrica honesta de "cuánto alargas
  el día de alguien". Nota: `cierreDelta` no sirve aquí porque castea updates por id contra la
  lista del profesional **origen**, y la intrusa deja de ser suya.

### 3. Orquestación (`calcularEstrategiasSolape`)

Orden de inserción (= preferencia ante empate, el sort es estable):

```
reposo > hueco > reasignar > mover_reasignar > adelantar > cascada
```

`mover_reasignar` va detrás de `reasignar` a propósito: si podemos resolver el choque **sin mover
a la clienta de hora**, eso es preferible; cambiar hora *y* profesional es más disruptivo. Queda
por delante de `adelantar`/`cascada` porque no mueve a terceros.

El sort global (`citasMovidas` → `retrasoCierreMin`) y el dedup por firma no cambian. La firma ya
incluye `profesional_id`, así que si `reasignar` y `mover_reasignar` acabaran en el mismo efecto
(mismo profesional, misma hora), el dedup se queda con el primero.

### 4. Plumbing

- `organizarAgenda.ts`: `analizarAgendaDia` acepta los bloqueos por profesional y los inyecta al
  construir `candidatos` en `detectarSolapes`. Parámetro opcional → sin bloqueos, la palanca sigue
  funcionando pero solo esquiva citas (degradación explícita, no silenciosa: documentada en el tipo).
- `OrganizarAgendaPanel.web.tsx`: nueva prop `bloqueos`, la pasa al análisis.
- `AgendaCalendar.web.tsx`: pasa el `bloqueos` que ya tiene en estado.
- `useAvisos.ts`: segundo caller de `analizarAgendaDia`; carga bloqueos o pasa vacío.

## Testing

Tests Deno en `lib/retrasos.test.ts` (ver `reference_deno_hairy`: binario en
`C:\Users\alexa\.deno\bin\deno.exe`, fuera del PATH). Casos:

1. Emite `mover_reasignar` cuando ningún candidato está libre a la hora exacta (donde `reasignar`
   devuelve null) pero uno tiene hueco más tarde.
2. Elige el candidato con el hueco **más temprano** (= más cercano a la hora original), no el
   primero de la lista.
2b. Un candidato con hueco **antes** de la hora original no lo aprovecha: la búsqueda arranca en
   la hora original (no se adelanta a la clienta).
3. Un bloqueo del destino que tapa el hueco → no se propone ese slot (busca el siguiente o no emite).
4. Candidato de categoría insuficiente → descartado aunque tenga el mejor hueco.
5. `grupoId` presente → null.
6. `reasignar` (misma hora) gana a `mover_reasignar` cuando ambas son posibles.
7. El update lleva `profesional_id` **y** hora nueva.
8. Determinismo: dos candidatos con hueco equivalente → siempre el mismo (categoría, luego nombre).

Regresión: los tests existentes de `calcularEstrategiasSolape` deben seguir verdes (ojo al fallo
preexistente conocido del test "dia limpio" de `organizarAgenda`, no relacionado).

## Fuera de alcance (slices futuros)

Compresión de servicios (necesita regla de compresión mínima y visto bueno de Jose) · especialidades
estructuradas · expansión de recurrencia de bloqueos · ventana de jornada real (`negocio_horarios`)
· proactividad en segundo plano (#1) y surfacing en Avisos (#3).
