# 🎯 AUDITORÍA ESTRATÉGICA: Mecha vs Competencia
**Fecha:** 1 jul 2026 | **Estado:** Análisis técnico completo del código

---

## 📊 MATRIZ DE POSICIONAMIENTO ACTUAL (VERIFICADO)

| Área | Mecha | Booksy/Fresha | Completitud | Gap Crítico | Sesión |
|------|-------|---------------|-------------|-------------|--------|
| **Lista de espera** | Schema ✅ RPCs ✅ UI ✅ Motor ⚠️ | ~90% | 90% | Activar workflow n8n | 1 |
| **Comisiones** | Schema ✅ RPCs ✅ UI ❌ | ~80% | 60% | UI liquidaciones | 1 |
| **Portal reserva** | RPCs ✅ Rutas ✅ Widget ❌ | ~95% | 65% | Widget + CAPTCHA + Analytics | 2 |
| **Fidelización** | Schema ✅ RPCs ✅ UI parcial | ~70% | 70% | UI config + canjes | 1 |
| **Inventario** | ❌ NO EXISTE | ~60% | 0% | Schema completo | Future |

---

## 🔍 ANÁLISIS TÉCNICO PROFUNDO

### 1. LISTA DE ESPERA - "ARMADO PERO APAGADO"

#### ✅ LO QUE EXISTE (verificado en código)
- **Schema completo** ([migrations/lista-espera.sql](migrations/lista-espera.sql)):
  - Tabla `lista_espera` (9 campos, RLS implementado)
  - Tabla `lista_espera_ofertas` (matching de huecos)
  - Tabla `lista_espera_avisos` (registro de notificaciones)
- **9 RPCs implementadas** ([lista-espera-matching.sql](migrations/lista-espera-matching.sql)):
  - `candidatos_para_hueco` - Busca candidatos para un hueco liberado
  - `asignar_candidato_hueco` - Asigna hueco a candidato
  - `confirmar_cita_oferta` - Cliente confirma oferta desde enlace
  - `procesar_lista_espera` - Motor principal de matching
  - `crear_solicitud_lista_espera` - Añadir cliente a lista
  - `cancelar_solicitud_lista_espera` - Eliminar solicitud
  - `lista_espera_avisar` - Marcar para avisar
  - `lista_espera_liberar_hueco` - Liberar hueco tras cancelación
  - `obtener_lista_espera` - Listar solicitudes del negocio
- **UI web completa** ([app/(tabs)/lista-espera.web.tsx](app/(tabs)/lista-espera.web.tsx)): 428 líneas
  - Lista de solicitudes con filtros
  - Botón "Ver candidatos" al cancelar cita
  - Gestión de ofertas (aceptar/rechazar)
- **Integración en agenda**:
  - Botón candidatos en modal de cancelación
  - Configuración: 7 parámetros en Configuración (ventana, antelación, señal...)
- **Página pública** ([app/cita/[id].web.tsx](app/cita/[id].web.tsx)):
  - Confirmación de oferta desde enlace anónimo
  - Anti-abuso por teléfono

#### ⚠️ GAP ÚNICO
**Workflow n8n INACTIVO** (esperando aprobación plantillas Meta):
- `listaEsperaMatchingActivo = false` por defecto en config
- Requiere aprobar plantillas WhatsApp (aviso_lista_espera, aviso_hueco_caducado)
- Requiere activar workflow n8n (cada 2 min)

#### Esfuerzo restante
- **Coordination con Alexandro**: 1 hora (aprobar Meta + activar workflow)
- **QA**: 2 horas (verificar flujo E2E)
- **Total**: ~3 horas (MINIMO, solo activación)

---

### 2. COMISIONES - "BACKEND COMPLETO, FALTA UI"

#### ✅ LO QUE EXISTE (verificado en código)
- **Schema completo** ([migrations/comisiones-liquidaciones.sql](migrations/comisiones-liquidaciones.sql)):
  - Tabla `comisiones` (periodo, base_calculo, porcentaje, importe_comision, estado)
  - Estados: `pendiente`, `pagada`, `rechazada`, `anulada`
  - Integración con `cobros` (profesional_id, total_cents, propina_cents)
  - Integración con `equipo` (porcentaje_comision por profesional)
- **5 RPCs completas** ([migrations/comisiones-rpcs.sql](migrations/comisiones-rpcs.sql)):
  1. `calcular_comisiones_periodo(profesional_id, desde, hasta)` → JSONB con desglose
  2. `generar_liquidacion(profesional_id, periodo_inicio, periodo_fin)` → Crea registro persistente
  3. `obtener_liquidaciones(negocio_id, profesional_id, estado)` → Lista paginada
  4. `marcar_liquidacion_pagada(liquidacion_id, notas)` → Marca como pagada
  5. `anular_liquidacion(liquidacion_id, motivo)` → Anula pendiente
- **UI parcial existente**:
  - Configuración de comisiones en [configuracion.web.tsx](app/(tabs)/configuracion.web.tsx):
    - `comisionBaseImporte` (neto/bruto)
    - `comisionAddons` (incluir productos/suplementos)
    - `comisionPropinas` (incluir propinas)
    - `comisionPeriodo` (mensual/trimestral)
  - Informes client-side en [informes.web.tsx](app/(tabs)/informes.web.tsx):
    - Cálculo en vivo desde `cobros`
    - NO persiste (solo visual)
  - Panel profesional [mi-jornada.web.tsx](app/(tabs)/mi-jornada.web.tsx):
    - Métricas gateadas por rol

#### ❌ GAPS CRÍTICOS
- **Sin UI de liquidaciones**:
  - No existe pantalla para gestionar liquidaciones
  - No se puede ver historial de pagos
  - No se puede generar/ver PDF de liquidación
- **Sin notificaciones al profesional**:
  - El profesional no sabe cuándo se genera una liquidación
  - No hay alerta de "liquidación pendiente"
- **Modelos avanzados NO implementados en UI**:
  - % por categoría (sí existe en schema, no en UI)
  - Tramos (sí existe en schema, no en UI)
  - Venta de producto (sí existe en schema, no en UI)
  - Sillón en alquiler (sí existe en schema, no en UI)
- **Sin sistema de disputas**:
  - Profesional no puede rechazar una liquidación
  - No hay flujo de corrección

#### Esfuerzo estimado
- **Schema**: 0 (YA existe)
- **RPCs**: 0 (YA existen)
- **UI liquidaciones**: 1-2 días (lista, detalle, marcar pagada)
- **UI configuración avanzada**: 1 día (tramos, categorías)
- **Notificaciones**: 0.5 días ( Alexandro)
- **Total**: 2-3 días

---

### 3. PORTAL DE RESERVA ONLINE - "MVP FUNCIONAL, FALTAN FEATURES COMPETITIVAS"

#### ✅ LO QUE EXISTE (verificado en código)
- **9 RPCs security definer** ([portal-reserva-publica.sql](migrations/portal-reserva-publica.sql)):
  - `portal_info(slug)` → Datos del negocio + servicios + profesionales
  - `disponibilidad_publica(slug, servicio, fecha, profesional)` → Huecos libres
  - `crear_cita_publica(...)` → Crear cita anónima con canal='web'
  - `cita_publica(token)` → Datos de cita para gestión
  - `cancelar_cita_publica(token, motivo)` → Cancelar desde enlace
  - `modificar_cita_publica(token, ...)` → Reagendar desde enlace
  - `resenas_publicas(slug)` → Lista de reseñas verificadas
  - `crear_resena_publica(slug, cita_token, ...)` → Dejar reseña
  - `portal_dias_disponibles(slug)` → Días con huecos este mes
- **3 rutas públicas implementadas**:
  - `/app/r/[slug]` → Portal de reserva (5 pasos: servicio→profesional→día→hora→datos)
  - `/app/resena/[slug]` → Valoraciones públicas (llamas 🔥)
  - `/app/cita/[id]` → Autogestión del cliente (ver/cambiar/cancelar)
- **Anti-abuso básico** ([security-round2-antiabuso-portal.sql](migrations/security-round2-antiabuso-portal.sql)):
  - Rate limiting por teléfono (3/hora)
  - Rate limiting por negocio/hora (50)
  - Rate limiting por IP (20/hora)
  - Detección de spam (señales básicas)
- **Configuración del negocio** ([negocio_portal](migrations/portal-reserva-publica.sql)):
  - `slug` único
  - `mostrar_precios` (catalogo/tras_seleccion/nunca)
  - `color_acento` personalizable
  - `portal_activo` on/off
  - `idioma` (base español)

#### ❌ GAPS COMPETITIVOS
- **Widget embebible** - NO hay iframe/JS para embeber en webs externas
  - Booksy/Fresha sí tienen `<iframe>` + script
  - Mecha solo QR a `/app/r/[slug]`
- **CAPTCHA** - Sin protección anti-bots
  - Sin reCAPTCHA ni hCaptcha
  - Vulnerable a scripts de reserva masiva
- **Pagos NO integrados** - Depósitos no cobran online
  - Solo marcan `prepago_requerido=true`
  - Cliente paga presencialmente (no captación online)
- **Analytics** - Sin tracking de conversión
  - Sin GA4/Mixpanel
  - No se puede medir funnel de reserva
- **Multi-idioma** - Solo español
  - i18n no implementado
  - Limita expansión
- **Notificaciones** - Sin confirmación/recordatorios automáticos
  - (Esto lo cubre Alexandro con workflow n8n, pero falta integración UI)
- **SEO** - Meta tags básicos, sin optimización
  - No OpenGraph dinámico
  - No Schema.org para negocio local

#### Esfuerzo estimado
- **Widget**: 1-2 días (iframe + script + docs)
- **CAPTCHA**: 0.5 días (reCAPTCHA v3)
- **Analytics**: 0.5 días (GA4 events)
- **Pagos UI**: 1 día (integrar checkout en portal)
- **Total**: 3-4 días

---

### 4. FIDELIZACIÓN - "BACKEND COMPLETO, FALTA UI"

#### ✅ LO QUE EXISTE (verificado en código)
- **Schema completo** ([migrations/recompensas.sql](migrations/recompensas.sql)):
  - Tabla `recompensas` (configuración: nombre, tipo, valor, umbral_visitas, expira_meses)
  - Tabla `recompensas_canjeadas` (historial de canjes)
  - Tabla `niveles_fidelizacion` (Nuevo/Habitual/VIP con umbrales)
  - Tabla `logros` (achievements desbloqueables)
  - Tabla `logros_desbloqueados` (registro por cliente)
- **5 RPCs completas** ([recompensas.sql](migrations/recompensas.sql)):
  - `obtener_recompensas_negocio(solo_activas)` → Lista de premios
  - `canjear_recompensa(recompensa_id, cliente_id, cita_id)` → Registrar canje
  - `obtener_nivel_cliente(cliente_id)` → Calcula nivel (visitas OR gastado)
  - `verificar_logros_cliente(cliente_id)` → Auto-desbloquea logros
  - `obtener_logros_desbloqueados(cliente_id)` → Lista achievements
- **UI v1 existente** ([clientes.web.tsx](app/(tabs)/clientes.web.tsx)):
  - Tarjeta de sellos (10 círculos, cálculo vivo: `Math.floor(visitas / 10)`)
  - Clasificación automática (VIP >10 visitas o >500€, Habitual 3+, Nuevo)
  - Etiquetas manuales (clientes.etiquetas[])

#### ❌ GAPS CRÍTICOS
- **Sin UI de configuración de recompensas**:
  - Negocio no puede crear/editar premios
  - No puede cambiar umbral (10→8 visitas)
  - No puede definir qué vale cada premio
- **Sin UI de canje para el cliente**:
  - Cliente no ve progreso en portal público
  - No hay botón "Canjear premio"
- **Sin UI de logros/niveles**:
  - No hay pantalla de gamificación
  - Logros existen pero no se muestran
- **Sin notificaciones**:
  - Cliente no sabe cuando completa sellos
  - No hay alerta de "¡Tienes un premio!"
- **Tarjeta fija a 10**:
  - No configurable (obj: 5, 8, 12 visitas)
  - Sin expiración de sellos
- **Sin bonificación por margen**:
  - Servicios premium no dan más sellos

#### Esfuerzo estimado
- **UI configuración recompensas**: 1 día (CRUD de premios)
- **UI canjes cliente**: 1 día (botón en ficha + historial)
- **UI logros/niveles**: 0.5 días (visualización)
- **Notificaciones**: 0.5 días (Alexandro)
- **Total**: 3 días

---

### 5. INVENTARIO - "NO EXISTE"

#### Estado actual
- **NO hay tabla productos** en BD
- `cobro_lineas` permite `tipo='producto'` pero sin tabla maestra
- **NO hay UI** de gestión
- **NO hay alertas** de stock bajo

#### Prioridad
**BAJA** - Roadmap marca "🔴 sin empezar - no urgente"

#### Esfuerzo estimado (futuro)
- Schema completo: 2 días
- UI gestión: 2 días
- Alertas stock: 1 día
- Integración caja: 1 día
- **Total**: 5-7 días

---

## 🎯 ESTRATEGIA RECOMENDADA: 2 SESIONES

### SESIÓN 1: SISTEMAS OPERATIVOS (Carlos)
**Objetivo:** Consolidar lo que YA existe y falta pulido

**Puntos a abordar:**
1. ✅ **Lista de espera**: Activar sistema (coord con Alexandro para plantillas Meta)
2. ✅ **Comisiones**: UI de liquidaciones + notificaciones
3. ✅ **Fidelización**: UI de configuración + canjes

**Impacto:** El negocio puede gestionar lo que YA tiene backend

---

### SESIÓN 2: PORTAL + PREPARACIÓN INVENTARIO (Carlos)
**Objetivo:** Features competitivos + base para futuro

**Puntos a abordar:**
1. ✅ **Portal widget**: Iframe embebible + script
2. ✅ **CAPTCHA**: reCAPTCHA v3
3. ✅ **Analytics**: Eventos GA4
4. ✅ **Inventario v0**: Schema base + CRUD simple

**Impacto:** Mecha es competitivo en captación online + base para inventario

---

## 📋 PROMPTS PARA LAS SESIONES

Ver siguiente archivo: `PROMPT-SESION-1.md` y `PROMPT-SESION-2.md`
