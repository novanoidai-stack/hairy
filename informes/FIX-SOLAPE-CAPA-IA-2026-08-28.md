# RESUELTO — La regla de solape en la capa de IA del software

**Fecha:** 27-28 ago 2026 · **Autor:** Carlos

> **Nota de reparto.** Este documento nació como traspaso a Alexandro por error de criterio mío:
> di por hecho que "capa de IA" = suya. El reparto real es más fino: **los agentes recepcionistas
> (cara al cliente) son de Alexandro; la IA DENTRO del software es de Carlos.** `agenda-asistente`
> y `agenda-optimizador` son IA de software → míos, y están arreglados aquí.
> `chispa-recepcionista`, revisado: **solo hace rate limiting**, no reserva ni calcula solapes, así
> que no hereda ninguno de estos fallos.

## Qué estaba mal

`supabase/functions/agenda-asistente/index.ts`, función `detectarSolapa()`, era una **copia a mano**
de la regla de ocupación —el propio comentario decía *"replica AgendaCalendar.web.tsx"*— y divergía
en tres puntos. Es la función que decide si la IA puede crear o mover una cita sin pisar otra.

**(1) Filtraba `estado = 'confirmada'`.** Lo que ocupa hueco es
`CITA_STATUS_BLOQUEAN_SOLAPE` = `pendiente + confirmada + completada`. Con ese filtro **la IA podía
reservar encima de una cita PENDIENTE**. Detalle revelador: el prompt de `agenda-optimizador` ya le
dice al modelo la regla correcta (*"Bloquean solape: pendiente, confirmada y completada"*). El
prompt la tenía bien y el código no.

**(2) Solo miraba la PRIMERA fase activa de la cita propuesta.** Un color tiene dos fases activas
separadas por el reposo. Si la segunda caía sobre el trabajo de otra, pasaba el control.

**(3) `new Date(c.fin_activa)` sin alternativa para NULL.** En JS `new Date(null)` es el epoch de
1970, así que la comparación daba siempre falso: **una fila con `fin_activa` a NULL era invisible**
y nunca producía choque. La versión del cliente al menos tenía `?? c.fin`.

Los tres fallos van del lado peligroso: dejan pasar solapes que sí lo son.

## Otros dos del mismo tipo, en la misma capa

- **`agenda-asistente`, cálculo de huecos libres**: filtraba `estado='confirmada'`, así que una cita
  pendiente no contaba y **la IA ofrecía como libre un hueco ya cogido**.
- **`agenda-optimizador`**: leía el día con `['pendiente','confirmada']`, sin `completada`. Como el
  cron autocompleta al pasar la hora, una cita recién terminada desaparecía del mapa y el
  optimizador podía proponer mover a alguien a un sillón todavía ocupado.

## Cómo se arregló

Delegando en la regla única: `fasesDe` + `chocaActivaActiva` de `lib/retrasos.ts`, la misma que usan
la agenda, la pantalla de nueva cita y el organizador.

Detalle de importación que conviene saber: se importa de **`lib/retrasos.ts`** y no de
`lib/utils/appointment.ts`, porque ese último importa sin extensión `.ts` y **Deno no lo resuelve**.

## Verificación

Ejecutada la composición nueva contra los tres casos:

| Caso | Antes | Ahora |
|---|---|---|
| Cita pendiente ocupa hueco | no contaba | **cuenta** (`pendiente, confirmada, completada`) |
| 2ª fase activa de un color | no se miraba | **detecta el choque** |
| Fila con `fin_activa` NULL | invisible | **detecta el choque** |
| Encajar en el reposo ajeno | permitido | **sigue permitido** (no hay regresión del diferencial) |

`deno check` limpio en las tres funciones. Además **`agenda-asistente` se ha añadido a
`deno task check:edges`**: no estaba, así que la CI no la comprobaba — justo la que más falta hacía.
