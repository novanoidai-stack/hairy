# Spec de agenda: cita o falta de disponibilidad

Fuente: los dos vídeos más recientes de `Descargas` (`WhatsApp Video 2026-10-03 at 09.00.30.mp4` y `09.00.44.mp4`).

## Lo que pide Jose

Al pulsar un hueco de la agenda, elegir entre crear una cita o añadir una falta de disponibilidad al colaborador. El bloqueo debe partir de la hora elegida y permitir duraciones como una o dos horas para comida; el ejemplo visual también muestra un tramo de 15 minutos.

## Estado encontrado

El selector y la creación de bloqueos ya existían, pero solo estaban conectados a la lista móvil. La rejilla diaria de escritorio, que es la vista grabada en los vídeos, abría directamente Nueva cita. El formulario de bloqueo tampoco ofrecía 15 minutos.

## Cambio aplicado

- La rejilla de escritorio y la lista móvil usan el mismo flujo de selección.
- Los huecos de reposo mantienen el acceso directo a una cita, porque corresponden al tiempo de una cita ya existente.
- La duración del bloqueo admite ahora 15, 30 y 45 minutos además de las opciones de una, dos y cuatro horas ya presentes.
- Se actualizó la ayuda de la agenda y el texto emergente del hueco.

La persistencia reutiliza `bloqueos_profesional`, con `negocio_id` y `profesional_id` explícitos. No hace falta migración de base de datos.

## Verificación

`npx tsc --noEmit`, `npm run vigilar:rapido` y `npm run build:web` completados sin errores bloqueantes. La comprobación de creación real con una cuenta de salón queda para la prueba funcional de la agenda.
