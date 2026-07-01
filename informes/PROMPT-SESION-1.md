# PROMPT SESIÓN 1: Sistemas Operativos (Carlos)

> Copia este prompt completo para la siguiente sesión de Claude

---

## 🎯 OBJETIVO DE LA SESIÓN

Completar 3 sistemas que **YA tienen backend completo** y solo les falta UI/pulido:

1. **Lista de espera** - Activar workflow n8n (coord con Alexandro)
2. **Comisiones** - UI de liquidaciones
3. **Fidelización** - UI de configuración de recompensas

---

## 📋 TAREA 1: LISTA DE ESPERA (Activación)

### Contexto
- **Schema completo**: 3 tablas (lista_espera, lista_espera_ofertas, lista_espera_avisos)
- **9 RPCs implementadas**: candidatos_para_hueco, asignar_candidato_hueco, confirmar_cita_oferta, etc.
- **UI completa**: app/(tabs)/lista-espera.web.tsx (428 líneas)
- **GAP único**: Workflow n8n inactivo

### Acciones
1. **Coordinar con Alexandro**:
   - Aprobar plantillas WhatsApp en Meta (aviso_lista_espera, aviso_hueco_caducado)
   - Activar workflow n8n "Mecha — Lista de espera" (cron cada 2 min)
2. **Activar en config**:
   - `listaEsperaMatchingActivo = true` en negocio_config
3. **QA E2E**:
   - Añadir cliente a lista de espera
   - Cancelar cita existente
   - Verificar que se generan candidatos
   - Simular aviso al cliente
   - Verificar confirmación desde enlace público

### Entregable
- Lista de espera funcional E2E con workflow n8n activo

---

## 📋 TAREA 2: COMISIONES (UI de Liquidaciones)

### Contexto
- **Schema completo**: migrations/comisiones-liquidaciones.sql
- **5 RPCs completas**: migrations/comisiones-rpcs.sql
  - `calcular_comisiones_periodo(profesional_id, desde, hasta)`
  - `generar_liquidacion(profesional_id, periodo_inicio, periodo_fin)`
  - `obtener_liquidaciones(negocio_id, profesional_id, estado)`
  - `marcar_liquidacion_pagada(liquidacion_id, notas)`
  - `anular_liquidacion(liquidacion_id, motivo)`
- **GAP**: No existe UI para gestionar liquidaciones

### Acciones UI

#### 2.1 Nueva pantalla: Liquidaciones
**Ruta**: `app/(tabs)/liquidaciones.web.tsx`

**Features mínimas**:
- Lista de liquidaciones (paginada) con filtros:
  - Profesional (dropdown)
  - Estado (pendiente/pagada/rechazada/anulada)
  - Periodo (mes/año)
- Columnas:
  - Profesional (nombre)
  - Periodo (ej: "Jun 2026")
  - Base calculada (€)
  - Porcentaje (%)
  - Importe comisión (€)
  - Estado (badge)
  - Acciones (ver detalle, marcar pagada, anular)
- Botón "Generar liquidación" → Modal con:
  - Profesional
  - Periodo (mes/año)
  - Opción forzar recálculo
- Modal de detalle:
  - Desglose completo (servicios, productos, suplementos, propinas)
  - Lista de cobros incluidos
  - Configuración aplicada
  - Notas de pago
  - Botones: Marcar pagada / Anular

#### 2.2 Integración en informes
- Añadir sección "Comisiones este mes" en `informes.web.tsx`
- Resumen: total pendiente, total pagada
- Link a pantalla de liquidaciones

#### 2.3 Notificaciones (Alexandro)
- WhatsApp al profesional cuando se genera liquidación
- Email con PDF (opcional v2)

### Entregable
- Pantalla de liquidaciones funcional
- Generación, visualización, marca de pago
- Integración en informes

---

## 📋 TAREA 3: FIDELIZACIÓN (UI de Recompensas)

### Contexto
- **Schema completo**: migrations/recompensas.sql
  - 5 tablas: recompensas, recompensas_canjeadas, niveles_fidelizacion, logros, logros_desbloqueados
- **5 RPCs completas**:
  - `obtener_recompensas_negocio(solo_activas)`
  - `canjear_recompensa(recompensa_id, cliente_id, cita_id)`
  - `obtener_nivel_cliente(cliente_id)`
  - `verificar_logros_cliente(cliente_id)`
  - `obtener_logros_desbloqueados(cliente_id)`
- **GAP**: No existe UI para configurar recompensas ni canjearlas

### Acciones UI

#### 3.1 Nueva sección: Recompensas (en Configuración)
**Ruta**: `app/(tabs)/configuracion.web.tsx` → Nueva tab "Recompensas"

**Features mínimas**:
- Lista de recompensas configuradas
- Botón "Nueva recompensa" → Modal con:
  - Nombre (ej: "Corte gratis", "10% descuento", "Producto regalo")
  - Descripción (opcional)
  - Tipo (descuento_pct, descuento_eur, producto, servicio)
  - Valor (según tipo: "10", "15.00", o texto)
  - Umbral de visitas (default: 10)
  - Expira en meses (default: 6, 0 = no expira)
  - Activo/Inactivo
- Acciones por recompensa:
  - Editar
  - Desactivar (no borrar)
  - Ver canjes (historial)

#### 3.2 Nueva sección: Niveles (en Configuración)
**Subtab "Niveles" dentro de Recompensas**

**Features mínimas**:
- Lista de niveles (Nuevo, Habitual, VIP...)
- Botón "Nuevo nivel" → Modal con:
  - Nombre
  - Orden (para visualización)
  - Umbral visitas (OR)
  - Umbral gastado € (OR)
  - Color (hex picker)
  - Icono (dropdown)
- Niveles predefinidos (no editable):
  - Nuevo: 0 visitas
  - Habitual: 3+ visitas
  - VIP: 10+ visitas OR 500€ gastado

#### 3.3 Canje desde ficha de cliente
**En `clientes.web.tsx`**:

- Si cliente tiene suficientes visitas para alguna recompensa:
  - Mostrar botón "Canjear premio"
  - Dropdown con premios disponibles
- Modal de canje:
  - Seleccionar recompensa
  - Mostrar umbral y visitas actuales
  - Asociar a cita (opcional)
  - Confirmar canje
- Historial de canjes en la ficha:
  - Lista de premios canjeados
  - Fecha y estado

#### 3.4 Notificaciones (Alexandro)
- WhatsApp al completar sellos ("¡Tienes un premio!")
- Email con código de descuento

### Entregable
- Configuración de recompensas funcional
- Canje desde ficha de cliente
- Historial de canjes visible

---

## 🎨 REQUISITOS DE DISEÑO

**Usar hairy-design-system + hairy-ui-craft:**
- Sombrear/profesional/atemporal (no estética startup)
- Velocidad > belleza (≤3 toques)
- Sin emojis en código/UI
- Reutilizar componentes existentes (Section, FieldRow, etc.)
- Móvil primero (useResponsive)

**Tokens de marca:**
- Acento: #f4501e (profundo #c0260a)
- Fondos: #f6f1ea / #fffdfb
- Dark theme (todo el app es dark)

---

## ✅ CRITERIOS DE COMPLETACIÓN

### Lista de espera
- [ ] Workflow n8n activo (coord Alexandro)
- [ ] QA E2E pasado (cancelación → candidato → aviso → confirmación)

### Comisiones
- [ ] Pantalla `liquidaciones.web.tsx` funcional
- [ ] Generar liquidación desde UI
- [ ] Ver detalle desglosado
- [ ] Marcar como pagada
- [ ] Anular liquidación pendiente
- [ ] Integración en informes
- [ ] Notificación WhatsApp (Alexandro)

### Fidelización
- [ ] Tab "Recompensas" en Configuración
- [ ] CRUD de recompensas
- [ ] Subtab "Niveles"
- [ ] Canje desde ficha de cliente
- [ ] Historial de canjes visible
- [ ] Notificación al completar sellos (Alexandro)

---

## 📚 REFERENCIAS

**Backend RPCs:**
- Comisiones: `migrations/comisiones-rpcs.sql`
- Recompensas: `migrations/recompensas.sql`
- Lista espera: `migrations/lista-espera-matching.sql`

**UI existente:**
- `app/(tabs)/configuracion.web.tsx` (patrón de tabs)
- `app/(tabs)/clientes.web.tsx` (ficha de cliente)
- `app/(tabs)/informes.web.tsx` (informes)

**Skills a cargar:**
1. `hairy-design-router` → router
2. `hairy-design-system` → diseño
3. `hairy-domain-data` → dominio

---

## 🚀 FLUJO DE TRABAJO

1. **Coordinar con Alexandro** (lista de espera)
2. **Implementar UI comisiones** (liquidaciones.web.tsx)
3. **Implementar UI fidelización** (config + clientes.web.tsx)
4. **QA E2E** de los 3 sistemas
5. **Merge a master** tras verificación

**Tiempo estimado**: 2-3 días de desarrollo + 1 día de QA

---

> **IMPORTANTE**: Todo el backend YA existe. Solo falta UI. No tocar migrations/ a menos que sea un bug.
