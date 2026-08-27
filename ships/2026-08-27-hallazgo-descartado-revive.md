# Ship: descartar un hallazgo de agenda hace reaparecer su gemelo del cliente

**Estado:** cerrado 2026-08-27 · Decisión de producto: opción 1 ("descarte manda 1 h", elegida por el usuario). Implementado en `useAvisos.ts`: mapa módulo-nivel `descartesRecientes` (tipo → timestamp) alimentado en `resolverHallazgo` cuando el estado es `descartado`; `construirItems` suprime el respaldo cliente de los tipos descartados hace <1 h (con auto-limpieza). Nota: la vigilancia del servidor seguirá reescribiendo el hallazgo en su siguiente pasada si el problema persiste — cuestión de producto pendiente por sí misma.

## Contexto

La política de reconciliación (`eef06d943`) decide por tipo: si hay hallazgo del servidor, el item del cliente se salta (`tiposConHallazgo`). Pero `hallazgos` es la lista de ABIERTOS (`nuevo`/`visto`): cuando el usuario descarta o resuelve el hallazgo "Retrasos en curso" (`marcarHallazgo` lo quita de la lista, línea ~134), a la siguiente vuelta del sondeo el tipo ya no está en `tiposConHallazgo` y **el respaldo cliente reaparece** — el mismo problema que el usuario acaba de descartar, ahora como tarjetas por cita de urgencia media. Experience: "lo quité y volvió".

Además la vigilancia reescribirá el hallazgo en su siguiente pasada (15 min u ojo), así que el descarte de un problema que sigue existiendo es efímero de todas formas — cuestión de producto pendiente por sí misma.

## Tarea

Decidir e implementar una de:
1. **Descarte manda un rato:** guardar localmente (estado del hook, o timestamp) los tipos descartados recientemente y seguir suprimiendo el respaldo aunque no haya hallazgo abierto (p.ej. 1 h, o hasta medianoche).
2. **El descarte persiste en servidor:** que `_upsert_hallazgo` no revive un hallazgo descartado si `datos`/`resumen` no cambian (hoy revive siempre que count > 0), y el respaldo cliente solo se activa si NUNCA ha habido hallazgo del tipo en el día.
3. **Aceptar el comportamiento** pero bajar la urgencia del respaldo cuando hubo hallazgo descartado ese día (tarjeta suave "siguen habiendo N retrasos" en vez de tarjetas por cita).

Ver cómo lo resuelve la UX: hablarlo con producto antes de codificar la 1 o la 2.
