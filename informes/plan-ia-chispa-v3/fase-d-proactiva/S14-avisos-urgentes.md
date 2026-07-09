# S14 · Avisos de Chispa + canal urgente

**Fase:** D · Proactiva · **Dueño:** Carlos (UI/cola) + Alexandro (envío real) · **Esfuerzo:** medio-alto · **Depende:** S13

> Los hallazgos (S13) se muestran de forma accionable, y lo **urgente** se marca para salir por
> WhatsApp/correo — **el envío real lo hace Alexandro**.

## Lee antes
- [`../README.md`](../README.md) (reparto Carlos/Alexandro). Carga `hairy-design-system`.

## Objetivo (resultado deseado)
Que el usuario vea los hallazgos en **Avisos** con acciones de un clic, y que lo urgente quede
encolado/etiquetado para notificación externa (stub claro para Alexandro).

## Ya existe (no reconstruir — verifica)
- Avisos/`AvisosBell`, onboarding checklist en Avisos, `hallazgos_ia` (S13). Motor n8n de envíos
  WhatsApp (Alexandro).

## Construir
1. **Surface en Avisos:** lista priorizada de hallazgos con su **acción sugerida de un clic** (aplicar,
   ver, descartar); estados visibles; sin fallo silencioso.
2. **Urgencia:** marca de severidad "urgente" y una **cola de notificación externa** (tabla/campo) que
   Alexandro conecta al envío real (WhatsApp/correo). Deja el stub y el contrato claros; **no** envíes
   tú.
3. **Cierre del bucle:** al resolver un hallazgo desde Avisos, actualizar estado + registrar (S08).

## Reglas duras que te aplican
- **Envío real = Alexandro** (no lo implementes). RLS/tenant/rol. Casi-nunca-texto-plano.

## Criterios de aceptación (verificables)
- Los hallazgos aparecen en Avisos y se resuelven de un clic (estado actualizado, verificado por SQL).
- Lo urgente entra en la cola de notificación con el contrato documentado (sin enviar).

## Definición de HECHA
`[x] tsc  [x] build  [x] migración+advisors  [x] E2E SQL  [x] manuales+iaCatalogo
[x] specs landing (ya cubierto en S13)  [x] commit+push  [x] S14 marcada  [x] stub de envío documentado`

## Estado
HECHA (9 jul).
- Integración en Avisos elegida **aditiva** (acuerdo con Carlos): se mantienen las secciones nativas
  (sin confirmar con nombre/hora, mensajes, fuga, cumpleaños) y se añade una sección
  **"Chispa está vigilando"** con los hallazgos que hoy NO se veían (señal sin pagar, presupuesto sin
  respuesta, stock bajo). Los tipos ya nativos (cita_sin_confirmar, bandeja, fuga) se excluyen de la
  sección para no duplicar (`HALLAZGOS_YA_NATIVOS` en `useAvisos`).
- **UI:** `useAvisos` carga `hallazgos` (RPC `hallazgos_del_negocio`, demo devuelve []) + `resolverHallazgo`
  (optimista). Sección con color por severidad + acciones de un clic **Ver / Resolver / Descartar** en
  `AvisosBell.web.tsx` (web) y `AvisosSheet.tsx` (móvil/tablet, paridad). Marca **URGENTE** y el punto de
  la campana se pone en rojo si hay urgentes. Sin fallo silencioso.
- **Cierre del bucle:** `marcar_hallazgo` (resuelto/descartado) actualiza estado + cancela la
  notificación pendiente asociada.
- **Migración `sesion14-avisos-notificaciones-urgentes.sql`** (aplicada en remoto, advisors sin clase nueva):
  outbox `hallazgos_notificaciones` (RLS SELECT propio negocio, único parcial 1 pendiente/hallazgo).
  Regla de urgencia determinista: `cita_sin_confirmar` con una cita en <12h → severidad `urgente`.
  `procesar_hallazgos_negocio` encola urgentes + reconcilia (cancela pendientes que dejan de aplicar).
  Detectores de citas excluyen `oculta_en_calendario` (alineado con `useAvisos`).
- **Verificado E2E por SQL** (tenant desechable): cita <12h → urgente + notif encolada; al confirmar,
  hallazgo cerrado + notif reconciliada a descartado. UI: smoke test en demo, campana abre sin errores
  (la sección sale vacía en demo por diseño). tsc + build limpios.

### STUB DE ENVÍO PARA ALEXANDRO (contrato)
El **envío real** (WhatsApp/correo al gestor) NO está implementado — es tuyo. Contrato listo:
- **Pull:** `select public.notificaciones_hallazgos_pendientes(p_limit int default 50)` (service_role) →
  jsonb array de `{ notificacion_id, hallazgo_id, negocio_id, tipo, resumen, canal, creado_en }`.
- **Ack:** `select public.marcar_notificacion_hallazgo_enviada(p_id uuid, p_canal text default 'whatsapp')`
  (service_role) → marca `enviado`.
- El cliente cancela solo las notificaciones cuyo hallazgo se resuelve/deja de ser urgente (estado
  `descartado`), así que no envíes las que ya no estén `pendiente`.
- Patrón idéntico a `presupuestos_pendientes_envio` / `marcar_presupuesto_enviado` (mismo workflow n8n
  cron-pull). Falta: enganchar el teléfono del gestor del negocio y el texto del mensaje.
