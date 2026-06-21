# Diseño — Aviso de retraso al cliente + config real de notificaciones por salón

> Fecha: 2026-06-21 · Autor: Alexandro (área backend/IA/mensajería) · Estado: aprobado el diseño, pendiente spec review.
> Fuente del alcance: día 6-7 de `PLAN_DIARIO_MECHA.md` ("Retrasos encadenados — aviso" + "mejorar notificaciones/alertas").
> Principio rector: la app es 100% configurable por salón (ver memoria `config-toggle-features`).

## 1. Objetivo y alcance

Cerrar el último cabo de los **retrasos encadenados** (avisar al cliente por WhatsApp cuando la
cascada mueve su cita) y **hacer real** la pestaña Notificaciones de Configuración (hoy es un mockup
deshabilitado, "fase 4"), de modo que cada salón controle qué notificaciones envía el motor.

**En alcance:**
1. Nuevo aviso saliente `retraso` enganchado al motor de notificaciones existente.
2. Ajustes por salón (en `negocio_config.config`) que **gatean el motor**: on/off por tipo, ventana
   del recordatorio, y horario "no molestar".
3. Reescritura de `TabNotificaciones` (UI) recortada a lo realmente soportado.

**Fuera de alcance (no tocar ahora):**
- Alertas internas al equipo (in-app).
- Tipos de aviso nuevos más allá del retraso (agradecimiento, cumpleaños, etc.).
- Robustez del motor (reintentos, log de entregas, panel de estado).
- Multicanal (SMS/email): solo existe WhatsApp Cloud vía Meta.
- Edición libre del texto de plantillas: las plantillas son fijas y aprobadas por Meta.
- Matching automático de lista de espera: es otro spec, **aparcado** a la espera de una decisión del
  usuario sobre la estrategia de reserva del hueco.

## 2. Estado actual (lo que ya existe)

- **Motor cron-pull**: workflow n8n "Mecha — Notificaciones WhatsApp" (`egkPWImnfQR1tRaA`, ACTIVO) llama
  cada ~2 min a la RPC `notificaciones_pendientes(p_limit, p_recordatorio_horas)` (service_role,
  `security definer`), envía la plantilla Meta y llama `marcar_notificacion_enviada(cita_id, tipo)`.
  Tipos actuales: `senal`, `confirmacion`, `recordatorio`, `resena` (ver
  `migrations/senal-notificacion-y-expiracion.sql`).
- **Cascada de retraso**: `components/agenda/AgendaCalendar.web.tsx` → `aplicarRetraso(_avisarClientes)`
  (~línea 4191) escribe las nuevas horas de las citas afectadas con `supabase.from('citas').update(...)`.
  El parámetro `_avisarClientes` hoy está sin usar; el modal `RetrasoPropuestaModal` pasa
  `avisarDisponible={false}` (checkbox "Avisar por WhatsApp a los clientes afectados" deshabilitado).
- **Config por salón**: tabla `negocio_config` con columna JSON `config`. En `configuracion.web.tsx`
  se carga con merge sobre `DEFAULT_CONFIG` (`{ ...DEFAULT_CONFIG, ...cfgRow.config }`, ~línea 370) y se
  guarda con `upsert({ negocio_id, config }, { onConflict: 'negocio_id' })` (~línea 481). La pestaña
  `TabNotificaciones` (~línea 2511) es hoy un mockup `disabled` con `SoonBanner`.

## 3. Ajustes de configuración (en `negocio_config.config`)

Claves nuevas. Todas nacen **ON** para no alterar el comportamiento de salones ya en marcha; el motor
trata "clave ausente" (o salón sin fila en `negocio_config`) como el default vía `coalesce`.

| Clave | Tipo | Default | Efecto |
|---|---|---|---|
| `notifConfirmacionActiva` | bool | true | Enviar confirmación al confirmarse la cita |
| `notifRecordatorioActiva` | bool | true | Enviar recordatorio previo |
| `notifRecordatorioHoras` | int | 24 | Horas de antelación del recordatorio (rango 1–72) |
| `notifResenaActiva` | bool | true | Petición de reseña tras la cita |
| `notifSenalActiva` | bool | true | Enlace de pago de señal |
| `notifRetrasoActiva` | bool | true | Habilita el aviso de retraso (gatea el checkbox del modal) |
| `notifNoMolestar` | bool | false | Activar el horario sin envíos |
| `notifNoMolestarInicio` | text `HH:MM` | `'22:00'` | Inicio del rango "no molestar" |
| `notifNoMolestarFin` | text `HH:MM` | `'08:00'` | Fin del rango "no molestar" |

Cambios en `configuracion.web.tsx`: añadir las 9 claves a la interfaz `ConfigState` y a
`DEFAULT_CONFIG`. No hace falta tocar carga/guardado (el merge + upsert ya las arrastran).

## 4. Motor — reescritura de `notificaciones_pendientes`

Nueva migración. La RPC mantiene la firma `notificaciones_pendientes(p_limit, p_recordatorio_horas)`
(n8n la llama así); `p_recordatorio_horas` pasa a ser **fallback** cuando el salón no tiene
`notifRecordatorioHoras` guardado.

Reglas por salón (LEFT JOIN a `negocio_config nc on nc.negocio_id = c.negocio_id`, leyendo
`nc.config` con `coalesce` a los defaults de §3):

- **Gating por tipo**: incluir una fila solo si el `notif<Tipo>Activa` del salón es true.
- **Recordatorio**: la ventana es `coalesce((config->>'notifRecordatorioHoras')::int, p_recordatorio_horas, 24)`
  horas (sustituye al uso directo del parámetro).
- **No molestar**: si `notifNoMolestar` es true y la hora actual en `Europe/Madrid` cae dentro del
  rango `[notifNoMolestarInicio, notifNoMolestarFin]` (contemplando el cruce de medianoche cuando
  inicio > fin), **excluir los tipos `recordatorio` y `resena`**. `confirmacion`, `senal` y `retraso`
  se envían siempre (son transaccionales / sensibles al tiempo). Al ser cron-pull, lo excluido se
  recupera en la siguiente pasada fuera del rango.
- **Nuevo tipo `retraso`** (plantilla `aviso_retraso`): citas con `retraso_aviso_pendiente = true`,
  `inicio > now()`, salón con `notifRetrasoActiva`. Datos: nombre, salón, servicio, **hora nueva**
  (la cita ya tiene el `inicio` nuevo tras la cascada), `slug`, `cita_id` (para el botón). Prioridad
  alta (tras `senal`). Reordenar las prioridades: `senal`=0, `retraso`=1, `confirmacion`=2,
  `recordatorio`=3, `resena`=4.

Misma forma de salida JSON que hoy (array de objetos con `cita_id, tipo, template, telefono, nombre,
salon, servicio, profesional, fecha, hora, slug, importe_cents`). El `importe_cents` sigue solo para
`senal`.

`marcar_notificacion_enviada(p_cita_id, p_tipo)`: añadir rama `p_tipo = 'retraso'` →
`update citas set retraso_aviso_pendiente = false where id = p_cita_id`.

Tras aplicar la migración: pasar los **advisors de seguridad** de Supabase (regla del repo). La RPC
sigue siendo `service_role only`; no se abre nada a `anon`.

## 5. Aviso de retraso — flujo end-to-end

1. **Migración**: `alter table public.citas add column if not exists retraso_aviso_pendiente boolean not null default false;`
   (sin backfill: default false = nada pendiente).
2. **Cascada** (`AgendaCalendar.web.tsx`, `aplicarRetraso`): el parámetro pasa a usarse. Para cada cita
   del array de `updates` que (a) se mueve a una hora posterior, (b) es una cita real de cliente (tiene
   `cliente_id`/`telefono`), añadir `retraso_aviso_pendiente: avisarClientes` al objeto `campos` del
   mismo `update`. No hace falta RPC nueva (la escritura ya va por RLS autenticada del equipo).
   - Quitar el comentario "queda pendiente de la plantilla Meta `aviso_retraso`".
3. **Modal** (`RetrasoPropuestaModal`): `avisarDisponible={config.notifRetrasoActiva}` en vez de `false`.
   El componente padre debe disponer del flag del salón (cargarlo de `negocio_config` o pasarlo por prop).
4. **Plantilla Meta `aviso_retraso`** (la crea el usuario; categoría Servicio/Utility, español):
   - Body con 4 variables: `[nombre, salon, servicio, hora_nueva]`.
   - Texto propuesto: *"Hola {{1}}, en {{2}} vamos con algo de retraso. Tu cita de {{3}} pasa a las
     {{4}}. Disculpa las molestias."*
   - **Botón URL dinámico** a `https://mecha.app/app/cita/{{1}}` (con `cita_id`), para cancelar/reagendar
     si la nueva hora no le va — mismo patrón que `enlace_pago_senal`.
5. **n8n** (Code node "Construir mensajes" del workflow `egkPWImnfQR1tRaA`): añadir el mapeo de
   `aviso_retraso` (4 params de body + componente `button` con `cita_id`). Editar vía curl con la write
   key (el MCP n8n de instancia falla auth; `get_node`/`search_nodes` del MCP sí sirven). Verificar el
   recuento real de variables con `GET graph.facebook.com/v21.0/{WABA}/message_templates`.

## 6. Pestaña Notificaciones (UI) — recortada a lo real

Reescribir `TabNotificaciones` en `configuracion.web.tsx` (quitar `SoonBanner` y todos los `disabled`):

- **Sección "Avisos automáticos"**: un `Toggle` por tipo cableado a su clave de config —
  Confirmación (`notifConfirmacionActiva`), Recordatorio (`notifRecordatorioActiva`) con un
  `NumberInput` para `notifRecordatorioHoras` (unidad "h", 1–72), Petición de reseña
  (`notifResenaActiva`), Enlace de señal (`notifSenalActiva`), Aviso de retraso (`notifRetrasoActiva`).
- **Sección "Horario sin envíos (no molestar)"**: `Toggle` (`notifNoMolestar`) + dos `TimeInput`
  (`notifNoMolestarInicio`/`Fin`). Nota visible: "afecta a recordatorios y reseñas; confirmaciones,
  señal y avisos de retraso se envían siempre".
- **Quitar**: selector multicanal (mostrar como dato fijo "Canal: WhatsApp" o nada), recordatorios
  múltiples 48/24/2h, y el editor de texto de plantillas (opcional: listar las plantillas en
  solo-lectura para que el salón vea qué se envía).
- Seguir el design system (`SettingsAtoms`: `Section`, `FieldRow`, `Toggle`, `NumberInput`,
  `TimeInput`) y `useResponsive()` para móvil.

## 7. Multi-tenant y seguridad

- Todo por `negocio_id`. La config vive en `negocio_config` (una fila por negocio).
- `notificaciones_pendientes` y `marcar_notificacion_enviada` siguen `service_role only`
  (las llama n8n con la service key). No se expone nada nuevo a `anon`/`authenticated`.
- `retraso_aviso_pendiente` lo escribe el equipo autenticado vía la RLS ya existente de `citas`.

## 8. Plan de pruebas

- **SQL (probable en demo, sin Meta)**: con un salón de prueba, alternar cada `notif*Activa` y verificar
  que `notificaciones_pendientes` incluye/excluye la fila correcta; ventana de recordatorio por salón;
  ventana "no molestar" (incluyendo cruce de medianoche) excluye recordatorio/reseña pero no
  confirmación/señal/retraso; un `retraso_aviso_pendiente=true` produce una fila `retraso` con la hora
  nueva; `marcar_notificacion_enviada(...,'retraso')` baja el flag (idempotente).
- **Retraso E2E**: **bloqueado** hasta que Meta apruebe `aviso_retraso`. Una vez aprobada: cascada de
  retraso con "avisar" marcado → fila `retraso` → n8n envía → WhatsApp al móvil de prueba (wamid OK) →
  flag a false. Probar con el número tester; no ensuciar el tenant demo.
- **UI**: la pestaña guarda y recarga los toggles (round-trip por `negocio_config`); móvil sin overflow.

## 9. Dependencia externa (usuario)

Crear y mandar a revisión de Meta la plantilla **`aviso_retraso`** (Servicio/Utility, español, 4
variables de body + botón URL dinámico). El resto se construye y queda listo para activarse al aprobarse.

## 10. Entregables (resumen)

- Migración SQL: columna `citas.retraso_aviso_pendiente` + reescritura de `notificaciones_pendientes` +
  rama `retraso` en `marcar_notificacion_enviada`. Advisors de seguridad tras aplicar.
- `configuracion.web.tsx`: 9 claves en `ConfigState`/`DEFAULT_CONFIG` + reescritura de `TabNotificaciones`.
- `AgendaCalendar.web.tsx`: `aplicarRetraso` marca el flag; `avisarDisponible` desde la config.
- n8n: mapeo de `aviso_retraso` en el Code node del motor.
- Externo: plantilla Meta `aviso_retraso`.
