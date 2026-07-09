# S05 · Deshacer / revertir acciones de Chispa

**Fase:** A · Experiencia · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S03

> Que cualquier acción que Chispa aplique se pueda **deshacer** de un clic (confianza del usuario).

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-design-system`; si tocas agenda, `hairy-agenda-rules`.

## Objetivo (resultado deseado)
Un "Deshacer" fiable para las acciones aplicadas (cita creada/reagendada/cancelada, config cambiada,
servicio editado…), con ventana clara y estado visible.

## Ya existe (no reconstruir — verifica)
- `migrations/chispa-acciones-historial-config.sql` (historial de acciones/config). `lib/chispaOps.ts`
  / `lib/agendaOps.ts` (`ejecutarAccion`). `citas_historial` (auditoría de agenda).

## Construir
1. **Registro de reversibilidad:** al aplicar una acción, guardar lo necesario para revertirla (estado
   previo / operación inversa). Apóyate en el historial existente; añade lo que falte.
2. **Acción inversa** por tipo (mapa `tipo → cómo se deshace`): p.ej. crear→borrar, reagendar→volver a
   marcas previas (las 4, coherentes), cambiar_config→restaurar valor previo. Las no reversibles se
   marcan como tales (no ofrecer "deshacer" engañoso).
3. **UI:** tras aplicar, un "Deshacer" (en el mensaje de confirmación y/o toast) con ventana temporal;
   estado aplicando/aplicada/deshecha visible. Guardrail demo (no escribe de verdad).
4. **Auditoría:** el "deshacer" también queda registrado (motivo "Revertido por el usuario").

## Reglas duras que te aplican
- Multi-tenant/rol/RLS. Regla dura de agenda al revertir citas (4 marcas). Nunca dejar datos a medias.

## Criterios de aceptación (verificables)
- Crear una cita por Chispa y **deshacerla** deja la BD como antes (verificado por SQL).
- Reagendar y deshacer restaura las 4 marcas coherentes. Config cambiada y deshecha restaura el valor.
- Acciones no reversibles no muestran "deshacer".

## Definición de HECHA
`[x] tsc  [x] build  [x] migración+advisors (si aplica)  [x] E2E demo  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S05 marcada`

## Estado
HECHA (2026-07-09). Implementación verificada en la auditoría del plan V3:
- Tabla `chispa_acciones` con RLS multi-tenant, demo guardrail y auditoría permanente (`migrations/chispa-deshacer-acciones.sql`, 128 líneas).
- RPC `registrar_accion_chispa` SECURITY DEFINER con guardrail demo.
- `deshacerAccion()` en `lib/chispaOps.ts` (línea 961) cubriendo 8+ tipos de acción con inversas coherentes:
  crear_cita→borrar, reagendar→restaurar 4 marcas, cancelar→des-cancelar, liberar_hueco→recrear, cambiar_config→restaurar, cambiar_idioma_portal→restaurar, editar_servicio→restaurar campos.
- `bloquear_hueco` ahora es reversible: se captura el `bloqueo_id` al crear y el undo lo borra
  (`lib/chispaOps.ts`, auditoría 9 jul).
- Registro de auditoría del undo vía `registrarHistorialIA()`.
- `iaCatalogo.ts` actualizado con `chispa-deshacer` (id `chispa-deshacer`).
- **FIX de seguridad (auditoría V3, 9 jul):** `chispa_acciones` tenía políticas RLS pero **RLS estaba
  DESHABILITADO** (policies inertes → log de acciones legible/escribible cross-tenant). Corregido:
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` aplicado a producción; advisors de seguridad en verde.
