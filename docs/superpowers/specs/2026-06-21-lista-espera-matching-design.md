# Diseño — Lista de espera: matching automático + oferta del hueco

> Fecha: 2026-06-21 · Autor: Alexandro (backend/IA/mensajería) · Estado: build autónomo (el usuario pidió
> ejecutar sin frenar). Arranca OFF por defecto en todos los salones (no afecta a nadie hasta activarlo).
> Decisiones de producto del grupo del usuario (21 jun) integradas. Ver memoria `roadmap-mecha`.

## 1. Objetivo

Cuando se cancela una cita y se libera un hueco, ofrecerlo automáticamente a los clientes de la
`lista_espera` compatibles, **uno a uno** (secuencial), por WhatsApp, **reservándoles el hueco** durante
una ventana configurable. Si confirma, la cita es suya; si no responde, pasa al siguiente. Todo
configurable por salón y apagable.

## 2. Decisiones de producto (fijadas por el grupo)

- **Reservar el hueco** para el candidato avisado (no dejarlo abierto). Bloqueo **limitado en el tiempo**
  (máx. configurable, default 2 h) y se le avisa de ese límite en el mensaje.
- **Secuencial**: un candidato cada vez; ventana de respuesta configurable (default 30 min).
- **`aviso_hueco_caducado` se envía cuando el hueco se RESERVA** (alguien confirma), NO al vencer la
  ventana de un candidato (el "pasar al siguiente" es silencioso).
- **Todo configurable**, incluido desde cuándo cuenta el bloqueo máximo (primer aviso vs último).
- **OFF por defecto** (principio 100% configurable).

## 3. Arquitectura (cron-pull, sin triggers; aislada del motor principal)

Patrón consistente con el resto: una función `procesar_lista_espera()` que un **workflow n8n dedicado**
("Mecha — Lista de espera", INACTIVO hasta validar) llama cada ~2 min. **No se toca el motor principal**
`egkPWImnfQR1tRaA` (cero riesgo para las notificaciones ya en producción). Los mensajes de la lista de
espera salen por un **outbox propio** que el mismo workflow drena.

## 4. Config (en `negocio_config.config`, pestaña Notificaciones → sub-sección "Lista de espera")

| Clave | Tipo | Default | Qué hace |
|---|---|---|---|
| `listaEsperaMatchingActivo` | bool | **false** | Toggle maestro. OFF = lista manual, sin ofertas ni mensajes. |
| `listaEsperaVentanaMin` | int | 30 | Minutos que tiene cada candidato para responder. |
| `listaEsperaMaxBloqueoHoras` | int | 2 | Tope total que el hueco se mantiene reservado/ofreciéndose. |
| `listaEsperaAntelacionMinHoras` | int | 4 | No auto-ofrecer huecos a menos de X h vista. |
| `listaEsperaDesbloqueoDesde` | text | 'primer_aviso' | Desde cuándo cuenta el tope: `primer_aviso` o `ultimo_aviso`. |
| `listaEsperaOfertaPideSenal` | bool | false | La oferta confirmada exige señal (si el servicio la tiene). |
| `listaEsperaAvisarCaducado` | bool | false | Enviar `aviso_hueco_caducado` a los no agraciados al reservarse. |

Se añaden a `ConfigState` + `DEFAULT_CONFIG` y a `TabNotificaciones` (sub-sección con toggle maestro que
habilita el resto). UI la monta este mismo trabajo (Alexandro), siguiendo los átomos de `SettingsAtoms`.

## 5. Datos

- `lista_espera` (existe): candidatos. Estados `esperando / avisado / resuelta / cancelada`.
- **Nueva `lista_espera_ofertas`** (un registro por hueco liberado, recorre candidatos):
  `id, negocio_id, origen_cita_id, profesional_id, servicio_id, inicio, fin, fin_activa, fin_espera,
  estado ('activa'|'resuelta'|'agotada'|'cancelada'), candidato_id (lista_espera.id),
  candidato_cita_id (cita tentativa), expira_at, bloqueo_hasta, avisados uuid[], created_at`.
- **`citas`** (2 flags): `es_oferta_espera boolean default false` (cita tentativa de oferta; el escaneo
  de cancelaciones la ignora) y `lista_espera_revisada boolean default false` (cancelación ya
  considerada para matching; backfill `true` en cancelaciones existentes).
- **Nueva `lista_espera_avisos`** (outbox): `id, negocio_id, lista_espera_id, cita_id (nullable, para el
  botón), telefono, nombre, salon, servicio, fecha, hora, ventana_texto, template
  ('aviso_lista_espera'|'aviso_hueco_caducado'), estado ('pendiente'|'enviado'), created_at, enviado_at`.

## 6. Motor `procesar_lista_espera()` (service_role, security definer)

Hace tres pasos en cada tick, solo para salones con `listaEsperaMatchingActivo`:

- **A. Nuevas cancelaciones** → ofertas. Para cada `cita` cancelada, futura, de cliente real,
  `es_oferta_espera=false`, `lista_espera_revisada=false`: si hay candidato compatible, crear oferta
  (slot = el de la cita), ofrecer al mejor candidato (crear cita tentativa, encolar `aviso_lista_espera`),
  `bloqueo_hasta = now()+maxBloqueo`. Marcar `lista_espera_revisada=true` siempre.
- **B. Vencidas** → avanzar. Oferta `activa` con `expira_at<now()`: cancelar la cita tentativa actual; si
  `bloqueo_hasta` pasó → `agotada`; si no, elegir siguiente candidato no-avisado → nueva cita tentativa +
  `expira_at = now()+ventana` + encolar oferta. Si no quedan candidatos → `agotada`. (Silencioso: sin
  caducado aquí.)
- **C. Confirmadas** → resolver. Oferta `activa` cuya `candidato_cita` pasó a `confirmada`: oferta
  `resuelta`, candidato `resuelta`, y si `listaEsperaAvisarCaducado`, encolar `aviso_hueco_caducado` para
  los demás `avisados`.

**Candidato compatible** (helper): `estado='esperando'`, mismo negocio, `servicio_id` null o = del hueco,
`profesional_id` null o = del hueco, `franja` 'cualquiera' o coincide (mañana <14:00, tarde ≥14:00,
Europe/Madrid), fecha del hueco en `[desde,hasta]`, `telefono` válido, hueco `≥ now()+antelacionMin`, y
no estar en `avisados`. Orden: `prioridad desc, created_at asc`.

**Cita tentativa**: cliente = `lista_espera.cliente_id` o find-or-create por (negocio, telefono);
`estado='pendiente'`, `es_oferta_espera=true`, `canal='web'`, `deposito_requerido` = `listaEsperaOfertaPideSenal`
y el servicio tiene señal; copia `inicio/fin/fin_activa/fin_espera/servicio/profesional` del hueco.

**Outbox** `lista_espera_avisos_pendientes()` + `marcar_lista_espera_aviso_enviado(id)`: el workflow n8n
los drena. `ventana_texto` = texto legible (p.ej. "30 minutos" / "2 horas").

## 7. Aceptación (frontend)

Página `/app/cita/[id]` (ya existe): si la cita es `pendiente` + `es_oferta_espera`, mostrar **"Confirmar
esta cita"**. Si `deposito_requerido` → ir a pago (`/app/pago/...`, ya confirma vía webhook). Si no →
RPC `confirmar_cita_oferta(cita_id, telefono)` (anónima, gated por par cita+telefono) que pasa a
`confirmada`. El tick (paso C) resuelve la oferta. El motor principal manda la `confirmacion_citas` normal.

## 8. n8n — workflow dedicado "Mecha — Lista de espera" (INACTIVO)

Schedule 2 min → `procesar_lista_espera` → drenar `lista_espera_avisos_pendientes` (Code: payload por
template; `aviso_lista_espera` = 6 body params + botón cita_id; `aviso_hueco_caducado` = 2 body params,
sin botón) → enviar WhatsApp → `marcar_lista_espera_aviso_enviado`. Se activa cuando Meta apruebe las
plantillas y el salón encienda el toggle.

## 9. Seguridad / multi-tenant

Todo por `negocio_id`. Funciones del motor `service_role only`. `confirmar_cita_oferta` anónima pero
gated por par `cita_id + telefono` (mismo patrón que `cancelar/modificar_cita_publica`). Advisors tras la
migración.

## 10. Pruebas

- SQL con datos sintéticos: cancelación → oferta + cita tentativa + outbox; vencimiento → avanza al
  siguiente; confirmación → resuelve + caducado encolado; sin candidatos → agotada; respeta los toggles
  y la antelación mínima. Limpiar tras probar.
- E2E real: **bloqueado** hasta que Meta apruebe `aviso_lista_espera` / `aviso_hueco_caducado` y se active
  el workflow. Se construye todo y queda listo (OFF por defecto).

## 11. Pendiente externo (usuario)

Plantillas Meta `aviso_lista_espera` (con botón URL dinámico a `/app/cita/{{1}}`) y `aviso_hueco_caducado`
(opcional). Activar el workflow n8n dedicado cuando estén aprobadas.
