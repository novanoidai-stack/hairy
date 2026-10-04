# Bloqueos, ausencias y gastos — 4 octubre 2026

## Fuente de verdad

- Las ausencias solicitadas en **Mi jornada**, los bloqueos creados en **Agenda** y los gestionados en **Equipo** usan `bloqueos_profesional`. **Bandeja** aprueba o rechaza las solicitudes sobre esas mismas filas. No se ha creado otra tabla de ausencias.
- El horario semanal habitual se guarda en `horarios_profesional`; los bloqueos son excepciones a ese horario. Ambos intervienen en la disponibilidad.
- Los gastos se guardan en `gastos`. La única pantalla para darlos de alta o editarlos queda en **Caja › Gastos**; **Informes** muestra el total del periodo y enlaza a esa pantalla.

## Cambios

- **Equipo › ficha de profesional** separa **Horario semanal**, **Bloqueos y ausencias** y **Ficha y acceso**. El horario muestra un día por fila y se edita con campos de hora. Valida el orden de entrada, pausa y salida.
- **Bloqueos y ausencias** muestra todos los bloqueos que se solapan con el mes seleccionado, en lista y calendario, con los mismos datos. Las solicitudes pendientes se identifican y llevan a Bandeja para revisarlas.
- **Mi jornada** muestra los bloqueos recientes del profesional, no solo las vacaciones, y ahora guarda las solicitudes con el ID de la ficha profesional. Antes usaba el ID de la cuenta: era una causa de ausencias que no aparecían junto al resto de bloqueos.
- Las operaciones de crear, editar, borrar y aprobar bloques comprueban errores de base de datos y acotan por `negocio_id` donde corresponde.
- **Caja** tiene pestañas **Cobros** y **Gastos**. Se elimina la gestión duplicada de gastos en **Informes**.

## Verificación

- `npx tsc --noEmit`: correcto.
- `npm run build:web`: correcto.
- `npm run vigilar:rapido`: sin bloqueantes; quedan avisos de línea base existentes.
- `npm run vigilar:bd`: sin bloqueantes; quedan avisos de línea base existentes.
- Demo local: revisadas las pestañas de Equipo y Caja en el navegador.

## Límite conocido

La aprobación pendiente sigue representada por el prefijo `[PENDIENTE]` en `motivo`, según el esquema actual. La solicitud ocupa disponibilidad desde que se crea. Un estado explícito en base de datos requeriría una migración y una decisión de producto sobre si las solicitudes pendientes deben reservar el hueco.
