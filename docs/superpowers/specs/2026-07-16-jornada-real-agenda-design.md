# Spec — Jornada real del negocio en el organizador (Agenda)

Fecha: 2026-07-16 · Autor: Alexandru (lógica/motor) · Estado: aprobado para plan

## Contexto y objetivo

El organizador acota sus propuestas a la jornada usando `HORARIO_APERTURA` (09:00) y
`HORARIO_CIERRE` (20:00) de `lib/constants.ts`: **constantes globales hardcodeadas**, iguales para
todos los salones y todos los días. La tabla `negocio_horarios` sí tiene el dato real
(`abierto`, `apertura`, `cierre`) por `negocio_id` + `dia_semana`, pero el motor no la lee.

Resultado: propuestas fuera de jornada (viola RN-AG-010) y huecos válidos que no se ofrecen
(viola PA-02: cada slot tiene un propósito o está deliberadamente libre).

**Corrección a una creencia previa (estaba en la spec del slice 3):** se dijo que `mover_hueco`
"puede proponer las 23:00" por culpa de `cierreDefault` (= último fin + 3h). **Es falso.**
`analizarAgendaDia` ya calcula `cierreMs = cierreDelDia(...)` (20:00) y lo pasa a todas las
palancas; `cierreDefault` solo actúa si el llamador no pasa `cierreMs`, que en la práctica son
solo los tests. El problema real es el que describe esta spec: el horario es una constante, no
el del salón.

## Evidencia (BD Mecha, consultada 2026-07-16)

**17 de 21 filas** de `negocio_horarios` tienen horario distinto de 09:00-20:00. Los 3 negocios
configurados:

| negocio | horario | daño actual |
|---|---|---|
| `nose_03801` | 07:00-21:00 todos los días | se le ocultan 2h por la mañana y 1h por la tarde de huecos válidos |
| `testeo4_03801` | 09:00-20:00, **sábado 09:00-14:00**, domingo cerrado | el sábado se le proponen movimientos hasta 6h después de cerrar |
| `florent_surez_peluqueros_15004` | 09:30-20:00, cierra lunes y domingo | se le propone la franja 09:00-09:30, fuera de jornada |

## Decisiones

- **`dia_semana` es 0 = LUNES, no domingo.** `DAY_LABELS` en `configuracion.web.tsx` es
  `['Lunes','Martes',...,'Domingo']`. `Date.getDay()` usa 0 = domingo, asi que **hay que mapear**:
  `(getDay() + 6) % 7`. Sin esto, todo el slice aplica el horario con un dia de desfase.
  Los datos lo confirman: `florent` cierra los dias 0 y 6 = lunes y domingo (patron clasico de
  peluqueria); con la convencion JS seria "cierra sabados", que ninguna peluqueria hace.
  `testeo4` tiene el dia 5 de 09:00 a 14:00 = sabado de media jornada. Encaja.
- **Apertura tambien, no solo cierre.** `estrategiaAdelantarFija` busca desde `ahoraMs`, asi que
  hoy puede adelantar una cita a antes de abrir. La unidad de diseño es una **ventana**
  `[aperturaMs, cierreMs]`, no un cierre suelto.
- **Fallback = comportamiento actual.** Sin fila para el dia, o `abierto = false`, o
  `apertura`/`cierre` a NULL -> usar `HORARIO_APERTURA`/`HORARIO_CIERRE`. Asi no hay regresion
  para quien no tenga horarios configurados, y un dia marcado cerrado que aun tenga citas
  (apertura excepcional) sigue pudiendo reorganizarse en vez de quedarse sin ninguna estrategia.
- **Pausas de comida: fuera del slice.** `pausa_inicio`/`pausa_fin` existen en la tabla, pero
  **0 de 21 filas las usan** (los 3 negocios las tienen a NULL). Mismo criterio que la recurrencia
  de bloqueos: cero clientes, no se construye. Cuando alguien las use, su propio ciclo.
- **Recurrencia de bloqueos: fuera (y confirmado por datos).** 0 de 7 bloqueos son recurrentes.

## Estado actual (lo que se reutiliza)

- `lib/organizarAgenda.ts`: `cierreDelDia(fechaRefIso)` (L90) ya resuelve un cierre por fecha desde
  `HORARIO_CIERRE`; `analizarAgendaDia` lo llama en L287 y reparte `cierreMs` a `detectarRetraso`,
  `detectarSolapes` y `detectarHuecos`. Es el punto exacto donde entra la ventana real.
- `lib/retrasos.ts`: `buscarHueco(cita, obstaculos, desde, hasta, soloReposo)` ya acepta `desde` y
  `hasta` -> no hay que tocar la primitiva, solo lo que le pasan los llamadores.
- `AnalisisAgendaOpts` ya se extendio con `bloqueos` en el slice 3: mismo patron para `horarios`.
- `AgendaCalendar.web.tsx` y `useAvisos.ts` ya cargan datos del negocio: mismo sitio para el select.

## Diseño

### 1. Tipos y helper de ventana (`lib/organizarAgenda.ts`)

```ts
// Fila cruda de negocio_horarios. OJO: dia_semana es 0 = LUNES ... 6 = DOMINGO.
export interface HorarioNegocio {
  dia_semana: number;
  abierto: boolean;
  apertura: string | null; // 'HH:MM' o 'HH:MM:SS'
  cierre: string | null;
}

export interface JornadaDia {
  aperturaMs: number;
  cierreMs: number;
}
```

`ventanaDelDia(fechaRefIso, horarios?): JornadaDia` sustituye a `cierreDelDia`:
1. `dia = (new Date(fechaRefIso).getDay() + 6) % 7` (JS 0=domingo -> tabla 0=lunes).
2. Busca la fila de ese `dia_semana`.
3. Si no hay fila, `abierto === false`, o `apertura`/`cierre` son NULL -> fallback a
   `HORARIO_APERTURA`/`HORARIO_CIERRE`.
4. Parsea `'HH:MM'` / `'HH:MM:SS'` sobre la fecha local de referencia (mismo patron que
   `cierreDelDia`: `setHours` sobre la fecha, hora local del salon).
5. Si el parseo falla o `cierre <= apertura` -> fallback (defensivo: no emitir ventanas absurdas).

### 2. Propagar la ventana

- `AnalisisAgendaOpts` gana `horarios?: HorarioNegocio[]`.
- `analizarAgendaDia` calcula `const jornada = ventanaDelDia(citasProf[0].inicio, opts?.horarios)`
  y pasa `jornada` (no solo `cierreMs`) a `detectarRetraso`, `detectarSolapes` y `detectarHuecos`.
- `EstrategiasOpts` (retrasos) gana `aperturaMs?: number`; el `opts` de `calcularEstrategiasSolape`
  tambien. Default cuando falta: `-Infinity` (= sin restriccion por abajo, comportamiento actual).

### 3. Acotar por abajo en las palancas (`lib/retrasos.ts`)

Cada palanca que llama a `buscarHueco` pasa `desde = Math.max(desdeActual, aperturaMs)`:
- `estrategiaMoverUna` (retraso: hueco y reposo)
- `estrategiaMoverIntrusa` (solape: hueco y reposo)
- `estrategiaAdelantarFija` — **la mas afectada**: hoy busca desde `ahoraMs` y puede adelantar
  una cita a antes de abrir.
- `estrategiaMoverAOtroProfesional` (slice 3)
- `detectarHuecos` en `organizarAgenda.ts` (L214) — tambien llama a `buscarHueco` directo.

El `hasta` sigue siendo `cierreMs`, ahora el real.

## Testing

Tests Deno (`C:\Users\alexa\.deno\bin\deno.exe test`). En `organizarAgenda.test.ts`:

1. **El mapeo de dia** (el test que protege el bug caro): una cita en **domingo** con horarios donde
   el dia 6 (domingo) esta cerrado y el dia 0 (lunes) abre 09:00-20:00 -> debe usar el fallback del
   domingo, NO el horario del lunes. Con `getDay()` sin mapear, este test falla.
2. Sabado corto (`cierre` 14:00): no se propone ningun slot despues de las 14:00.
3. Cierre 21:00: SI se propone un hueco a las 20:30 (hoy se perderia por la constante de las 20:00).
4. Apertura 09:30: `adelantar_otra` no adelanta una cita a las 09:00.
5. Sin `horarios` en opts -> comportamiento identico al actual (no regresion).
6. `abierto = false` con citas ese dia -> fallback, sigue habiendo estrategias.
7. `apertura`/`cierre` NULL -> fallback.
8. Formato `'HH:MM:SS'` (lo que devuelve Postgres para `time`) se parsea igual que `'HH:MM'`.

Regresion: toda la suite de `retrasos.test.ts` (31) y `organizarAgenda.test.ts` sigue verde, salvo
el fallo preexistente conocido "dia limpio".

## Plumbing

- `AgendaCalendar.web.tsx`: `select('dia_semana, abierto, apertura, cierre')` de `negocio_horarios`
  por `negocio_id`; pasarlo al panel como prop `horarios`.
- `OrganizarAgendaPanel.web.tsx`: prop `horarios`, al `analizarAgendaDia`.
- `useAvisos.ts`: mismo select, mismo paso.

## Fuera de alcance

Pausas de comida (0 usos) · recurrencia de bloqueos (0 usos) · jornada por profesional (no existe
tal tabla: la jornada es del negocio y las ausencias individuales son `bloqueos_profesional`).

**Festivos y cierres puntuales: fuera, pero el modelo SI existe.** (Correccion: una version previa
de esta spec decia "no hay modelo".) La tabla es `cierres_negocio (fecha, motivo)` y
`AgendaCalendar.web.tsx` ya la carga en su `Promise.all` (estado `cierres`). El organizador no la
mira: en un dia marcado como cierre seguiria proponiendo movimientos con el horario normal de ese
dia de la semana. Es un slice pequeno y natural encima de `ventanaDelDia` (si la fecha esta en
`cierres_negocio`, no hay jornada). No se mete aqui para no mezclar dos fuentes de verdad en el
mismo cambio, y porque un dia de cierre no deberia tener citas que reorganizar.
