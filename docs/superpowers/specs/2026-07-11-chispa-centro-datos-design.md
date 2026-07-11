# Chispa: centro de datos del salón — Diseño

> 2026-07-11 · Carlos + Claude (Opus 4.8). Aprobado en sesión. Producción despliega desde `master`.

## Objetivo
Que Chispa **liste y analice cualquier dato del salón** y actúe sobre él, renderizado bonito
(tablas/KPIs), sin deflectar. Chispa ya tiene ~25 tools de lectura + acciones; se cierran los
huecos reales. **Todo lo construye Carlos en esta sesión; solo el envío real de WhatsApp/correo
queda para Alexandro** (las acciones dejan la cola lista).

## Piezas

### A. `listar_clientes` (hueco real: no había forma de listar/segmentar la cartera)
- RPC SQL `listar_clientes_ia(p_negocio, p_segmento, p_orden, p_limite)` **security definer,
  solo service_role** (llamada vía `svc.rpc` desde el edge, mismo modelo de confianza que
  `resumen_gestion`). Segmentos: `todos · vip · recurrentes · nuevos · en_riesgo · fuga · inactivos`.
  Orden: `reciente · gasto · frecuencia · alfabetico`. Gasto = suma de `cobros.total_cents`
  (cobrado) server-side.
- **RGPD/salud:** NUNCA devuelve `alergias/sensibilidades_cuero/notas`. Los clientes con
  `consiente_ia=false` no se listan en detalle pero cuentan en el total (`excluidos_consentimiento`).
- **PII fuera del LLM:** las filas (nombres) van SOLO al bloque renderizado (cliente, RLS-autorizado);
  al LLM se le devuelven solo conteos + segmento (no inventa nombres/cifras).
- Handler `procesarListarClientes` en el edge: empuja `kpi` (total/listados/excluidos) + `tabla`
  (nombre · última visita · visitas · gasto · riesgo) + `opciones` (acciones), devuelve resumen al LLM.
- RBAC: `clientes.ver`.

### B. "analiza mi salón" — panel 360 (foco `panorama` en `resumen_gestion`, solo gestor)
- Reusa el pipeline de `resumen_gestion` (ya emite kpi/tabla/barras/opciones). Junta de un vistazo:
  caja hoy · citas hoy + sin confirmar · clientes (total/nuevos/riesgo/fuga) · stock bajo ·
  reseñas (media) · hallazgos. Cifras server-side (nunca inventadas). Termina con menú de acciones.
- Gate: `informes.ver` (como el resto de `resumen_gestion`).

### C. Acciones en bloque desde los listados/panel
- Los menús `opciones` referencian acciones YA existentes (vuelven como turno → tool): `confirmar_citas`,
  `optimizar_agenda`, `consultar_hallazgos`, `listar_clientes`.
- Nuevo tool de escritura `reenviar_confirmacion` (agenda, propone→confirma): resetea
  `confirmacion_enviada`/`recordatorio_enviado` de las citas CONFIRMADAS por el salón pero **sin
  confirmar por el cliente** en un rango, para que el motor reavise. Cierra la confusión del
  transcript ("no hay sin confirmar" vs hallazgo). Envío real = Alexandro.

## Prompt + docs
- Reglas nuevas: mapear "lista/segmenta clientes", "analiza el salón/panorama", "avisa a los que no
  han confirmado" a las tools correctas. Cumpleaños → `consultar_cumpleanos` (ya existe).
- `lib/iaCatalogo.ts` + `lib/manuals/chispa.ts` actualizados.

## Verificación
tsc + build + deno check limpios; migración + advisors; edge desplegado por CLI + probado; E2E contra
el edge con cuenta real.
