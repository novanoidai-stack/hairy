# La ley del bloque de cita (agenda)

> Decisiones cerradas el 26 de agosto de 2026. Sustituyen a lo que dijera antes
> `INFORME-PROMPT-DISENO-AGENDA.md` en todo lo que se contradiga: ese informe
> describe los prototipos, esto describe lo que se implementó.
>
> Implementación: `lib/agendaBloqueUi.ts` (color), `lib/motion.tsx` (movimiento),
> `components/agenda/ChainFlowOverlay.web.tsx` (cadenas),
> `components/agenda/AgendaCalendar.web.tsx` (rejilla web),
> `components/agenda/AppointmentCard.tsx` (nativo, hereda el mapa de color).

## Por qué existe este documento

Tres intentos seguidos acabaron con tarjetas que tenían el borde superior del
color de la categoría, el izquierdo del color del profesional, el resto gris, un
aro ámbar girando por el perímetro y un barrido verde en diagonal por encima.
Cuatro lenguajes de color en ciento veinte píxeles. Ninguno estaba mal por
separado; el problema era que nadie había decidido **quién manda sobre qué**.

## Los cuatro canales

Un bloque cuenta cuatro cosas a la vez, y cada una tiene un canal exclusivo:

| Qué cuenta | Canal | Quién lo pinta |
|---|---|---|
| **Estado** — dónde va en el ciclo | fondo, borde y barra izquierda del bloque | `lib/agendaBloqueUi.ts`, y nadie más |
| **Cadena** — con qué otras citas va | el riel exterior y el índice `1/3` | `ChainFlowOverlay.web.tsx` |
| **Fases** — activa / reposo | franjas dentro del bloque, en neutro | la propia card |
| **Quién** — el profesional | la columna y el avatar | la rejilla |

Reglas que se siguen de ahí:

- La categoría de servicio **no** pinta el bloque. Es un punto de 6px delante
  del nombre del servicio.
- El profesional **no** pinta el bloque. Ya tiene columna y avatar.
- Una cita encadenada **no** cambia de color. Antes se ponía negra
  (`chainMechaGradient`, un slate de Tailwind en un tema crema) y el índice
  `1/2` chocaba con el chip de estado.
- El reposo **no** es un estado: es estructura. Va en rayado neutro cálido. El
  verde se reserva para el hueco aprovechable, que sí es una acción.

## El color codifica la acción, no el estado literal

| Color | Significa | Estados |
|---|---|---|
| neutro (blanco) | nada que hacer | confirmada, cobrada |
| ámbar | te falta algo | sin confirmar, sin cobrar |
| fuego | está pasando ahora | en curso |
| rojo | algo va mal | no presentada, sin cerrar |
| apagado | ya no cuenta | cancelada |

**Solo dos estados llevan relleno: el ámbar y el fuego.** Los rojos van en
blanco con barra, borde y chip rojos. Salió de la verificación en pantalla: con
el fuego al 10% y el rojo al 7%, una cita en curso y un no-show caían los dos en
el mismo rosa pálido y eran indistinguibles de un vistazo. Además es honesto —
un no-show ya no se puede trabajar y no tiene que gritar tanto como lo que está
pasando delante de ti. El fuego subió a 0,14 por lo mismo.

Sin confirmar y sin cobrar comparten ámbar **a propósito**: son la misma
pregunta en dos momentos distintos y el chip dice cuál. Una cita confirmada no
lleva chip: lo normal no grita, y si gritara todo no destacaría nada.

Contraste: el texto de los chips usa `successHi` / `warningHi` / `dangerHi`
(variantes profundas añadidas a `designTokens.ts`). El color plano a 9,5px sobre
su propio fondo *Soft* se queda en ~3:1 y se lee lavado.

## Anatomía: cada esquina tiene dueño

- Arriba a la izquierda: nombre de la clienta, y debajo el servicio.
- Arriba a la derecha: **la hora, y nada más**.
- Abajo a la izquierda: el chip de estado y el avatar.
- Abajo a la derecha: el índice de cadena.

Estado y cadena en esquinas opuestas: no se pueden solapar. El estado se dice
**una sola vez** — no hay iconos de estado junto a la hora duplicando el chip.
Nada de `flexWrap` en la fila de chips: lo que no cabe se corta con puntos
suspensivos.

Tres densidades, porque un bloque de 15 minutos no puede llevar lo mismo que uno
de dos horas:

| Altura útil | Contenido |
|---|---|
| ≤ 50px | una línea: hora, nombre, punto de estado, índice |
| ≤ 64px | nombre y hora arriba, chip abajo; sin servicio |
| > 64px | todo; la duración aparece a partir de 78px |

Los umbrales son la suma real de lo que hay dentro, no números redondos: dos
filas ocupan 14 (padding) + 15 (nombre) + 4 + 17 (chip) = 50px, y la tercera fila
suma 15 más. Con el umbral en 34 una cita de 15 minutos (40px) intentaba pintar
dos filas y el chip salía cortado por la mitad.

Y **la altura que cuenta es la del tramo ACTIVO, no la del bloque**: en una cita
de una hora con cincuenta minutos de reposo, el texto solo dispone de los diez
primeros minutos. Midiendo el bloque entero se colaba el layout completo en una
franja de 27px.

## Movimiento: solo late lo vivo

En bucle, únicamente dos cosas: la cita **en curso** (barrido de 1,8s + barra de
progreso real) y lo que sigue **sin cobrar** (latido interior de 3,2s, muy
tenue). Todo lo demás anima una vez al cambiar de estado y se queda quieto: el
candado que se cierra, el tachado de una cancelada, la sacudida de una vencida.

Con veinticinco citas en pantalla, si se mueven todas no se mueve ninguna.

Nada de movimiento en bloques de menos de 28px: ahí un barrido no se lee, solo
parpadea. Y todo respeta `prefers-reduced-motion`, incluido dejar lo que anima
una vez en su estado **final** (si no, el tachado no llega a dibujarse nunca).

## Regla de rendimiento (esta se aprendió por las malas)

**En la agenda solo se animan `transform` y `opacity`.** Son las dos únicas
propiedades que el compositor resuelve en GPU sin repintar. La primera versión
animaba `background-position` (el barrido de "en curso"), `box-shadow` (el
latido de "sin cobrar") y el ángulo de un `conic-gradient` (el aura del marco):
las tres repintan en cada frame. Con nueve tarjetas latiendo a la vez más un
contenedor de 1400×2400px repintándose sesenta veces por segundo, la agenda se
quedaba sin frames.

Traducción de cada efecto:

| Efecto | Antes (repinta) | Ahora (compone) |
|---|---|---|
| Barrido de "en curso" | `background-position` | una banda de luz con `translateX` |
| Latido de "sin cobrar" | `box-shadow` animada | sombra fija, late la `opacity` de la capa |
| Riel de la cadena | `background-position` | rayas con `translateY` dentro de `overflow:hidden` |
| Aura del marco | ángulo de `conic-gradient` | borde fijo + luz en el canto superior con `translateX` |

Única excepción tolerada: el `stroke-dashoffset` del cable de la cadena (un solo
path fino, y no hay forma de hacerlo con `transform`).

Cómo comprobarlo sin depender de contar frames — que además no funciona si la
ventana está en segundo plano, porque `requestAnimationFrame` se congela:

```js
document.getAnimations().map(a => ({
  n: a.animationName,
  props: [...new Set(a.effect.getKeyframes().flatMap(Object.keys))],
}))
```

Si ahí aparece algo que no sea `transform` u `opacity`, eso repinta.

## Cuidado con el zoom del navegador

`getBoundingClientRect()` y `clientX/clientY` devuelven píxeles **escalados** por
el zoom de página; lo que se escribe en un `style` y las constantes del código
(`ROW_H`, los 56px de la columna de horas) son píxeles **CSS**. Mezclarlos
descuadra el arrastre de forma acumulativa: con el zoom al 108% el fantasma
salía un 8% más grande y corrido, soltar sobre una cita de las 12:00 creaba una
de 12:15 (y a las 19:00 el error pasaba de tres cuartos de hora), y la previa de
suelta se plantaba a más de cien píxeles de la columna en el lado derecho.

El factor exacto es `elemento.getBoundingClientRect().width / elemento.offsetWidth`
(`offsetWidth` no se escala). En `startDrag` se calcula una vez y **todo lo que
se guarda en el objeto de arrastre ya va en píxeles CSS**. Si alguien vuelve a
restar `56` a un `getBoundingClientRect()`, el arrastre se rompe otra vez y solo
lo notarán los que naveguen con zoom.

## El marco

- Aura cónica fuego recorriendo el perímetro cada 7s (`.m-agenda-aura`).
- Fuera el rayado diagonal de "fuera de jornada" y "salón cerrado": es el
  negativo del día, no un evento, y repetido en todas las columnas mañana y
  tarde era la mitad del aspecto de cuaderno. Pasa a tono plano apagado. El
  rayado se queda para los bloqueos que sí son un evento.
- Hairlines de cuarto y media hora al 40%, y en carbón cálido, no en negro.
- La banda alterna de hora pasa de `#fafafa` (gris azulado) a `#fdfaf6`.

## Dónde aplica

La ley vale para las tres representaciones del mismo objeto, y las tres leen el
mismo `bloqueDeCita()`:

- Rejilla de día (web) — completa, con movimiento.
- Vista de semana (web) — misma paleta y un solo chip, sin movimiento (son
  tarjetas de 100px y ahí un barrido no se lee).
- Tarjeta nativa (`AppointmentCard.tsx`) — mapa de color, sin movimiento (el
  sistema de motion es solo web; en nativo tocaría reanimated).

## Ojo con esto al verificar

`prefers-reduced-motion` desactiva **todas** las animaciones a propósito. Si en
tu navegador no se mueve nada, comprueba primero
`matchMedia('(prefers-reduced-motion: reduce)').matches` antes de dar por roto
el CSS. La forma fiable de comprobar que una animación corre no es comparar dos
capturas (puedes pillar la misma fase dos veces): es leer
`elemento.getAnimations({subtree:true})` y ver que `currentTime` avanza.

## Paleta: lo que no vuelve a entrar

Se barrieron de la agenda: `#1e293b`, `#0f172a`, `#312e81`, `#6366f1`,
`#4f46e5`, `#818cf8`, `#38bdf8`, `#10b981`, `#22c55e`, `#ea580c`, `#059669`,
`#f59e0b`, `#b45309`. Todos eran de Tailwind y ninguno estaba en
`designTokens.ts`.

La única excepción viva es `#7c3aed` en `BLOQUEO_COLORS.reserva_temporal`, que
es una decisión anterior y documentada del lenguaje de **bloqueos** — que es
otro lenguaje, no el de las citas.
