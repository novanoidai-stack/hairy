# S26 · Seguridad y políticas de la capa IA (endurecimiento)

**Fase:** G · Cierre · **Dueño:** Carlos + Alexandro · **Esfuerzo:** medio-alto · **Depende:** toda la superficie nueva

> Auditoría y endurecimiento de TODO lo nuevo (memoria, registro, ejecuciones IA, sustituto-owner,
> tools, campañas): RLS, acceso, salud, consentimiento, auditoría, rate-limits, advisors.

## Lee antes
- [`../README.md`](../README.md) (constraints de seguridad). `informes/PLAN_BLINDAJE_SEGURIDAD_*`,
  `informes/CHECKLIST-DPO-IA.md`. Migraciones `security-round*`.

## Objetivo (resultado deseado)
Que la capa IA V3 sea segura y conforme: sin fugas cross-tenant, salud fuera del LLM garantizada,
consentimiento/DPO cubierto, todo auditable, advisors en verde.

## Ya existe (no reconstruir — verifica)
- Rondas de seguridad (`security-round4-superficie-funciones.sql`, etc.), antifraude/inmutabilidad,
  consentimiento IA, allowlists CORS, rate-limit landing.

## Construir (auditoría + fixes)
1. **RLS de todas las tablas nuevas** (memoria, registro, hallazgos, cola de notificación, campañas):
   por `negocio_id` + rol; sin `USING(true)`; RPCs con grants explícitos.
2. **Acceso a memoria** por tenant/rol; **salud nunca** en memoria/registro/prompt (revisión activa).
3. **Consentimiento/DPO:** `consiente_ia`, retención/borrado RGPD, checklist DPO actualizada.
4. **Auditoría + rate-limits:** eventos inmutables donde aplique; límites en tools sensibles/campañas.
5. **Advisors:** pasar advisors de seguridad y dejar 0 hallazgos nuevos.

## Reglas duras que te aplican
- Es la sesión de seguridad: 0 concesiones. Nada de `exec_sql`, `USING(true)`, secretos en código.

## Criterios de aceptación (verificables)
- Advisors en verde; pruebas de RLS cross-tenant fallan el acceso correctamente; no hay ruta por la que
  salud llegue al LLM; DPO checklist cerrada (evidencia adjunta).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] migraciones+advisors en verde  [ ] pruebas RLS cross-tenant  [ ] DPO checklist
[ ] commit+push  [ ] S26 marcada`

## Estado
PENDIENTE.
