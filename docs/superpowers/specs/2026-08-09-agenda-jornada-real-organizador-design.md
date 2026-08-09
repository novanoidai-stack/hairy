# Agenda: jornada real por profesional y organizador que no propone imposibles

Fecha: 2026-08-09
Estado: aprobado, en implementacion
Subproyectos **C + D** (Entrega 1 de 2). Ver `2026-08-09-portal-reservas-movil-resenas-design.md` para el reparto en 4 subproyectos.

## Problema

Cinco defectos, todos con causa localizada y verificada en el codigo:

| # | Sintoma | Causa raiz | Sitio |
|---|---|---|---|
| 1 | El organizador propone adelantar en vez de aprovechar un reposo | `buscarHueco(..., false)` devuelve el hueco **mas temprano**; despues se mira si por casualidad cayo en un reposo y solo se **etiqueta**. El reposo nunca se prefiere. Lo irónico: `buscarHueco` ya acepta `soloReposo` y el organizador no lo usa | `lib/organizarAgenda.ts:426`, `:431`; `lib/retrasos.ts:339` |
| 2 | Adelanta X minutos pudiendo adelantar mas | Techo fijo `AGENDA_MAX_ADELANTO_MIN_DEFAULT = 60`: `desde` se recorta a `propia.ini - 60min` | `lib/constants.ts:19`, `lib/organizarAgenda.ts:424` |
| 3 | "Enseñamelo" muestra todos los problemas a la vez | `if (ensenar) return problemasAgenda;` devuelve el array entero. El foco problema a problema existe (`enfocarProblema`, con scroll y pulso) pero el interruptor lo pisa | `components/agenda/AgendaCalendar.web.tsx:1447` |
| 4 | La jornada propia de cada profesional no se ve en la agenda | `AgendaCalendar.web.tsx` **nunca carga `horarios_profesional`**. La rejilla se dibuja con `negocio_horarios` y las constantes globales, que son del salon entero | `AgendaCalendar.web.tsx:945`, `:6501` |
| 5 | (no reportado, el mas grave) El organizador puede proponer una hora en la que ese profesional no trabaja | `ventanaDelDia()` devuelve **una** ventana `[apertura, cierre]` del salon, no los tramos del profesional | `lib/organizarAgenda.ts:263` |

El #5 es el que ata C con D: no tiene sentido pulir el criterio del organizador
mientras no sepa donde esta la carretera.

### Lo que ya funciona (comprobado, no supuesto)

- `bloqueos_profesional` **si** se carga y se pinta, con colores por tipo
  (vacaciones, descanso, etc.). Lo que falta es la jornada, no los bloqueos.
- **La pausa de comida ya esta modelada** y no necesita tabla nueva:
  `horarios_profesional` tiene columna `turno`, asi que la comida es el hueco
  entre el turno 1 y el turno 2.
- El mecanismo de oferta con caducidad y retencion de hueco existe entero en
  `lista_espera_ofertas` (`expira_at`, `bloqueo_hasta`, `estado`) con outbox
  `lista_espera_avisos`. Es la base de la Entrega 2.

## Decisiones tomadas

1. **Reposo y adelanto se proponen los dos**, como dos estrategias en la misma
   tarjeta, y decide el usuario. (No "siempre el reposo": el usuario prefirio
   elegir en el momento.)
2. **El techo de 60 min se queda en esta entrega.** Levantarlo solo es seguro
   cuando exista la negociacion con el cliente; si no, el organizador propondria
   adelantos de 3 horas aplicados a la brava, peor que hoy.
3. **"Enseñamelo" pasa a paso a paso, 1 de N**, con anterior/siguiente, scroll
   automatico y el resto de la rejilla apagado.
4. **La agenda carga y pinta la jornada real** de cada profesional: fin de
   jornada propio, tramos, y el hueco entre turnos como pausa.
5. **El organizador respeta los tramos del profesional**, no la ventana del salon.

### Diferido a la Entrega 2 (negociacion con el cliente)

El techo no deberia medirse en minutos de adelanto sino en **tiempo de reaccion
del cliente**: adelantar de 17:00 a 10:00 es razonable a las 7:00 y temerario a
las 9:50. La Entrega 2 sustituye el techo por `nuevaHora - ahora >= 2h`
(ajustable), convierte "adelantar" en propuesta con caducidad y hueco retenido,
y deja claro en la UI **el riesgo de que el cliente no lea el aviso**.

Las citas **sin telefono** no se mueven solas: el organizador las señala aparte
y se pregunta una a una, avisando de que el aviso corre por cuenta del salon.

Dependencia externa: el envio real del WhatsApp lo drena n8n, que lleva
Alexandro, igual que `lista_espera_avisos`. Por eso la Entrega 1 no depende de
nadie y la 2 si.

## Diseño

### C1 — Cargar la jornada

`AgendaCalendar.web.tsx` pasa a cargar `horarios_profesional` (columnas
`profesional_id, dia_semana, hora_inicio, hora_fin, turno`) junto al resto de
datos del dia, y a derivar por profesional los **tramos** del dia visible.

**TRAMPA, verificada contra datos reales:** las dos tablas de horario usan
convenciones OPUESTAS para `dia_semana`.

| Tabla | Convencion | Quien la usa asi |
|---|---|---|
| `horarios_profesional` | **0 = domingo** (`extract(dow)` / `getDay()`) | `disponibilidad_publica` hace `v_dow := extract(dow from p_fecha)` y compara directo |
| `negocio_horarios` | **0 = lunes** | `ventanaDelDia` hace `(getDay() + 6) % 7` |

Comprobado por comportamiento, no por deduccion: el 2026-08-09 es domingo,
`disponibilidad_publica` devuelve 0 huecos y ningun profesional del demo tiene
fila `dia_semana = 0`; el lunes 10 devuelve 85 y si existe `dia_semana = 1`.

Copiar el helper `(getDay() + 6) % 7` para `horarios_profesional` desplazaria
todo un dia **en silencio**. Para esta tabla se usa `getDay()` tal cual.

### C2 — Pintar la jornada

En cada columna de profesional:

- **Fuera de su jornada** (antes de su primer turno, despues del ultimo): franja
  apagada, visualmente distinta de "libre".
- **Entre turnos**: misma franja, etiquetada como pausa.
- Sin fila en `horarios_profesional`: se asume la jornada del salon, como hoy.
  No inventar un horario que nadie configuro.

Los bloqueos (`bloqueos_profesional`) siguen pintandose como ahora, por encima.

### D1 — El organizador respeta los tramos

`analizarAgendaDia` recibe los tramos por profesional. `ventanaDelDia` deja de
ser la unica fuente: se conserva como respaldo cuando un profesional no tiene
horario propio.

En `detectarHuecos`, en vez de una llamada a `buscarHueco` con
`[desde, cierreMs]`, se llama **una vez por tramo** con
`[max(desde, tramo.desde), min(cierre, tramo.hasta)]` y se toma el primer
resultado no nulo. Asi un hueco nunca cae fuera de la jornada del profesional ni
a caballo entre dos turnos, y no hace falta cambiar el contrato de
`buscarHueco`.

### D2 — Las dos estrategias

`detectarHuecos` calcula dos candidatos por cita movible:

- `buscarHueco(..., soloReposo: true)` → estrategia "Aprovechar el reposo"
- `buscarHueco(..., soloReposo: false)` → estrategia "Adelantar"

Si los dos existen y son distintos, la tarjeta lleva **las dos estrategias**, con
el reposo primero y marcado como recomendado. Si coinciden o solo hay uno, una
sola estrategia, como hoy. El tipo de problema pasa a ser
`reposo_desaprovechado` cuando existe candidato de reposo.

`ProblemaAgenda.estrategias` ya es un array: no hace falta cambiar el tipo.

### D3 — "Enseñamelo" paso a paso

`zonasResaltadas` deja de devolver todo con el interruptor encendido. Con
`ensenar` activo se resalta **solo** el problema en curso, y aparece un control
"Anterior / N de M / Siguiente" que reutiliza `enfocarProblema` (que ya cambia de
profesional y hace scroll con pulso). Al encender, se enfoca el primero.

## Verificacion

Comprobar con datos reales, no solo que compile:

1. Un profesional con dos turnos: la agenda pinta apagado antes del primero,
   entre turnos y despues del ultimo.
2. Un profesional que acaba antes que el salon: su columna lo refleja.
3. El organizador **no** propone ningun hueco fuera de los tramos del
   profesional. Test unitario: cita a las 17:00, profesional que acaba a las 14:00,
   hueco libre a las 16:00 → no se propone.
4. Con un reposo aprovechable y un hueco normal, la tarjeta ofrece **las dos**.
5. "Enseñamelo" resalta uno solo y avanza con Siguiente.
6. Ningun profesional sin `horarios_profesional` cambia de comportamiento.

Tests puros con `deno test lib/organizarAgenda.test.ts` (ya existe).

## Fuera de alcance

- **Entrega 2**: negociacion con el cliente (margen de 2h, oferta con caducidad,
  hueco retenido, citas sin telefono).
- **Subproyecto B**: scroll lateral en la vista movil de todos los profesionales.
- Editar la jornada desde la agenda: se configura donde ya se configura.
- El mojibake detectado en ~10 ficheros de `lib/` durante el subproyecto A.
