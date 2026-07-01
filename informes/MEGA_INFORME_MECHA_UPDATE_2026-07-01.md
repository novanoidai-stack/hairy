# Actualizaciones al MEGA_INFORME_MECHA.md — 1 de julio de 2026

> Secciones que deben actualizarse en el MEGA_INFORME_MECHA.md tras el desarrollo de julio 2026.

> **ACTUALIZACIÓN 1 jul (tarde) — DESPLEGADO Y VERIFICADO.** Hasta esta auditoría, comisiones,
> fidelización e inventario eran **solo migraciones `.sql` en disco NUNCA aplicadas** + UI llamando
> a RPCs inexistentes (habrían fallado al abrirse). En la auditoría se **aplicaron a Supabase real
> (`vtrggiogjrhqtwbhbgia`), se corrigieron bugs de esquema** (`cobros.profesional_id` uuid no text;
> `profiles.apellido` no `apellidos`; `profesionales.comision_pct` no tabla `equipo`), se **alineó
> el panel de fidelización** a la BD canónica (usaba tablas `*_fidelizacion` y columnas distintas),
> se **reconcilió `crear_cita_publica`** (aceptaba mal `p_consentimiento_datos` → reserva rota) y se
> **conectaron las UIs** (tab Recompensas en Configuración, LiquidacionesSection en Informes,
> Inventario en el nav). Verificado en la app real (demo) + advisors de seguridad sin fallos nuevos.
> Pendiente SOLO de credenciales del usuario: captcha real (claves Google), analytics GA4 (measurement
> id), y activación de lista de espera (n8n + plantillas Meta = Alexandro).

## 1. Actualización de Estado por Área (§1.2)

| Área | Estado real | Nota |
|---|---|---|
| Lista de espera | **~85%** ⬆⬆ | **HECHO**: matching automático completo (motor `procesar_lista_espera()`), outbox de avisos `lista_espera_avisos`, citas tentativas `es_oferta_espera`, confirmación desde portal. Falta: activar workflow n8n dedicado (INACTIVO hasta validación de plantillas Meta) |
| Comisiones | **~80%** ⬆⬆ | **HECHO**: sistema de liquidaciones completo con persistencia (`comisiones`, `comisiones_tramos`, `comisiones_por_categoria`), RPCs `calcular_comisiones_periodo`, `generar_liquidacion`, `obtener_liquidaciones`, `marcar_liquidacion_pagada`, `anular_liquidacion`. UI en Informes (`LiquidacionesSection`). |
| Fidelización | **~75%** ⬆⬆ | **HECHO**: sistema de recompensas persistente (`recompensas`, `recompensas_canjeadas`, `niveles_fidelizacion`, `logros`, `logros_desbloqueados`), RPCs `obtener_recompensas_negocio`, `canjear_recompensa`, `obtener_nivel_cliente`, `verificar_logros_cliente`. UI en Configuración (`TabRecompensas`). |

## 2. Reemplazo de §7.3 "Lista de espera v2"

### 7.3 Lista de espera v2 — **HECHO** ✅ (1 jul 2026)

**Estado**: Motor server-side completo, listo para activar. OFF por defecto en todos los salones (config `listaEsperaMatchingActivo: false`).

**Especificación completa**: `docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md`

**Arquitectura implementada** (migración `lista-espera-matching.sql`):

1. **Motor `procesar_lista_espera()`**: función `security definer` (solo `service_role`) que procesa:
   - Nuevas cancelaciones → crea ofertas
   - Ofertas vencidas → avanza al siguiente candidato
   - Ofertas confirmadas → resuelve + avisa a los demás

2. **Tablas nuevas**:
   - `lista_espera_ofertas`: un registro por hueco liberado, con estado (`activa`/`resuelta`/`agotada`), candidato actual, ventana de expiración, bloqueo máximo, lista de `avisados`
   - `lista_espera_avisos`: outbox para mensajes WhatsApp (`template`: `aviso_lista_espera` / `aviso_hueco_caducado`)

3. **Flags en `citas`**:
   - `es_oferta_espera`: marca citas tentativas creadas por el motor (el escaneo de cancelaciones las ignora)
   - `lista_espera_revisada`: marca cancelaciones ya procesadas

4. **RPCs**:
   - `lista_espera_avisos_pendientes()`: drena el outbox para n8n
   - `marcar_lista_eserva_aviso_enviado(id)`: marca aviso como enviado
   - `confirmar_cita_oferta(cita_id, telefono)`: aceptación desde el portal (anónima, gated por par cita+teléfono)

**Configuración** (`negocio_config.config`):

| Clave | Default | Qué hace |
|---|---|---|
| `listaEsperaMatchingActivo` | **false** | Toggle maestro |
| `listaEsperaVentanaMin` | 30 | Minutos para responder |
| `listaEsperaMaxBloqueoHoras` | 2 | Tope total de bloqueo del hueco |
| `listaEsperaAntelacionMinHoras` | 4 | Antelación mínima para ofrecer |
| `listaEsperaDesbloqueoDesde` | 'primer_aviso' | Desde cuándo cuenta el tope |
| `listaEsperaOfertaPideSenal` | false | La oferta exige señal |
| `listaEsperaAvisarCaducado` | false | Avisar a los no agraciados |

**Pendiente** (Alexandro):
- Activar workflow n8n dedicado "Mecha — Lista de espera" (Schedule 2 min → `procesar_lista_espera` → drenar avisos → enviar WhatsApp → marcar enviado)
- Validar plantillas de Meta (`aviso_lista_espera`, `aviso_hueco_caducado`)

**UI existente**: `app/(tabs)/lista-espera.web.tsx` (gestión manual de candidatos, filtros por estado, marcar avisado/resuelto).

## 3. Nueva sección: "Comisiones y liquidaciones"

### Comisiones y liquidaciones — **HECHO** ✅ (1 jul 2026)

**Sistema completo de liquidaciones mensuales con persistencia y modelos avanzados.**

**Modelo de datos** (migraciones `comisiones-liquidaciones.sql` + `comisiones-rpcs.sql`):

1. **`comisiones`**: tabla de liquidaciones por profesional y periodo
   - `negocio_id`, `profesional_id` (uuid), `periodo_inicio/fin`
   - `base_calculo_cents`: base sobre la que se calcula la comisión
   - `porcentaje_aplicado`, `comision_base` ('neto'/'bruto'), `incluir_addons`, `incluir_propinas`
   - `importe_comision_cents`: resultado
   - `estado`: 'pendiente'/'pagada'/'anulada'
   - `detalles`: JSONB con desglose
   - `pagada_en`: fecha de pago

2. **`comisiones_tramos`**: modelos de comisión por tramos de facturación
   - `nivel`, `umbral_min_cents`, `umbral_max_cents`, `porcentaje`

3. **`comisiones_por_categoria`**: porcentajes diferentes por categoría de servicio
   - `categoria_id`, `porcentaje`

**RPCs implementadas** (solo `authenticated`, RLS por `negocio_id`):

- `calcular_comisiones_periodo(p_profesional_id, p_desde, p_hasta)`: calcula sin persistir
  - Lee config de `negocio_config` → porcentaje defecto, base tipo, addons, propinas
  - Aplica porcentaje individual del profesional si existe
  - Devuelve JSON con base, porcentaje, comisión, desglose

- `generar_liquidacion(p_profesional_id, p_periodo_inicio, p_periodo_fin)`: persiste
  - Verifica que no exista ya para el periodo
  - Inserta en `comisiones` con snapshot de config
  - Devuelve `liquidacion_id`, importe, cálculo

- `obtener_liquidaciones(p_negocio_id?, p_profesional_id?, p_estado?)`: lista
  - Devuelve array con detalles + pagada_en

- `marcar_liquidacion_pagada(p_liquidacion_id)`: marca como pagada (solo gestores)
- `anular_liquidacion(p_liquidacion_id)`: anula (permite regenerar)

**UI implementada** (`components/informes/LiquidacionesSection.tsx`):

- Selector de mes (últimos 6 meses)
- Toggle "Todas" / "Por profesional"
- Lista de liquidaciones con estado (pendiente/pagada/anulada)
- Modal de detalle con:
  - Base de cálculo, porcentaje aplicado, comisión final
  - Configuración aplicada (neto/bruto, addons, propinas)
  - Resumen de actividad (nº cobros)
  - Estado y fechas (creada, pagada)
- Acciones: generar todas, marcar como pagada, exportar CSV

**Configuración existente**: `app/(tabs)/configuracion.web.tsx` → "Comisiones" (porcentaje defecto, base tipo, addons, propinas) + `app/(tabs)/equipo.web.tsx` (porcentaje individual por profesional).

**Pendiente**: integrar modelos de tramos y por categoría en el cálculo (RPC soporta el modelo; UI de configuración de tramos pendiente).

## 4. Nueva sección: "Fidelización y recompensas"

### Fidelización y recompensas — **HECHO** ✅ (1 jul 2026)

**Sistema de recompensas con persistencia, niveles y logros desbloqueables.**

**Modelo de datos** (migración `recompensas.sql`):

1. **`recompensas`**: premios canjeables por clientes
   - `nombre`, `descripcion`, `tipo` ('descuento_pct'/'descuento_eur'/'producto'/'servicio'), `valor`
   - `umbral_visitas`: número de visitas necesario para canjear
   - `expira_meses`: caducidad (null = no expira)

2. **`recompensas_canjeadas`**: historial de canjes
   - `cliente_id`, `recompensa_id`, `cita_id` (asociada)
   - `estado`: 'canjeado'/'usado'/'expirado'/'cancelado'

3. **`niveles_fidelizacion`**: categorías de cliente (Nuevo, Habitual, VIP...)
   - `nombre`, `orden`, `color`, `icono`
   - `umbral_visitas` OR `umbral_gastado_cents` (cumple uno u otro)

4. **`logros`**: badges desbloqueables
   - `tipo`: 'primera_visita'/'visitas_multiple'/'gastado_total'/'sin_noshow'/'servicio_fav'/'antiguedad'/'custom'
   - `condicion`: JSONB con parámetros (ej: `{"visitas": 10}`)

5. **`logros_desbloqueados`**: registro de logros desbloqueados por cliente

**RPCs implementadas**:

- `obtener_recompensas_negocio(p_solo_activas?)`: lista recompensas del negocio
- `canjear_recompensa(p_recompensa_id, p_cliente_id, p_cita_id?)`: registra canje
  - Verifica umbral de visitas
  - Inserta en `recompensas_canjeadas`
- `obtener_nivel_cliente(p_cliente_id)`: calcula nivel según métricas
- `verificar_logros_cliente(p_cliente_id)`: desbloquea logros automáticamente según métricas
- `obtener_logros_desbloqueados(p_cliente_id)`: lista logros de un cliente

**UI implementada** (`app/(tabs)/configuracion-recompensas.web.tsx` → "Recompensas"):

- **Sección de Recompensas**: listado, búsqueda, crear/editar (nombre, tipo, valor, umbral, expiración), activar/desactivar
- **Sección de Niveles**: listado con drag & drop de orden, color, umbrales (visitas o gastado)
- **Sección de Logros**: listado, crear/editar (nombre, tipo, condición JSON), activar/desactivar

**Integración pendiente**:
- Mostrar nivel del cliente en su ficha (`clientes.web.tsx`)
- Mostrar logros desbloqueados en la ficha del cliente
- Sugerir recompensa canjeable al completar una cita

## 5. Pendientes resueltos (añadir a checklist)

**Comisiones**:
- ✅ Motor server-side de cálculo de comisiones (`calcular_comisiones_periodo`)
- ✅ Persistencia de liquidaciones (`generar_liquidacion`, `obtener_liquidaciones`)
- ✅ Modelos avanzados (tramos, por categoría) en BD
- ✅ UI de Informes (`LiquidacionesSection`) con detalle, exportar CSV, marcar pagada
- ✅ Integración con config de comisiones existente

**Fidelización**:
- ✅ Persistencia de recompensas (recompensas, recompensas_canjeadas)
- ✅ Sistema de niveles (niveles_fidelizacion)
- ✅ Sistema de logros (logros, logros_desbloqueados)
- ✅ RPCs de cálculo automático de nivel y verificación de logros
- ✅ UI de configuración (`TabRecompensas`) completa

**Lista de espera**:
- ✅ Motor de matching automático (`procesar_lista_espera()`)
- ✅ Outbox de avisos WhatsApp (`lista_espera_avisos`)
- ✅ Citas tentativas y confirmación desde portal (`confirmar_cita_oferta`)
- ✅ Configuración completa (ventanas, bloqueos, antelación)
- ⏳ Activación workflow n8n (pendiente validación de plantillas Meta)
- ✅ Documentación de activación (`docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md`)
