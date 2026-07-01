# PROMPT SESIÓN 2: Portal Competitivo + Inventario v0 (Carlos)

> Copia este prompt completo para la siguiente sesión de Claude

---

## 🎯 OBJETIVO DE LA SESIÓN

Features competitivos para el portal de reserva + base para futuro inventario:

1. **Portal widget** - Iframe embebible + script para webs externas
2. **CAPTCHA** - Protección anti-bots (reCAPTCHA v3)
3. **Analytics** - Eventos GA4 para medir conversión
4. **Inventario v0** - Schema base + CRUD simple

---

## 📋 TAREA 1: WIDGET EMBEBIBLE (PRIORIDAD ALTA)

### Contexto
- **Portal funcional**: `/app/r/[slug]` (5 pasos de reserva)
- **GAP**: No hay iframe/JS para embeber en webs externas
- **Booksy/Fresha**: Sí tienen `<iframe>` + script embebible

### Acciones

#### 1.1 Crear página embebible
**Ruta**: `web/widget.html` (nuevo archivo)

**Features mínimas**:
- HTML standalone (sin dependencias del app)
- Iframe que carga `/app/r/[slug]?embed=1`
- Responsive (100% width, altura dinámica)
- Parámetros configurables:
  - `slug` (obligatorio)
  - `color` (opcional, sobrescribe acento)
  - `servicio` (opcional, preselecciona servicio)
  - `profesional` (opcional, preselecciona profesional)

**Código base**:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservar en [Nombre]</title>
  <style>
    /* Reset básico + iframe responsive */
  </style>
</head>
<body>
  <iframe
    id="mecha-widget"
    src="https://mecha.app/app/r/[slug]?embed=1&color=[color]"
    frameborder="0"
    allow="clipboard-write; payment">
  </iframe>
  <script>
    /* Script de comunicación (postMessage) */
    /* Auto-resize del iframe */
  </script>
</body>
</html>
```

#### 1.2 Script de inserción (JS)
**Ruta**: `widget/widget.js` (nuevo archivo)

**Features mínimas**:
- Auto-init: `MechaWidget.init({ slug: 'demo-salon' })`
- Métodos:
  - `openModal()` - Abre modal con iframe
  - `closeModal()` - Cierra modal
  - `onComplete(callback)` - Callback cuando se completa reserva
- Eventos: `mecha:reserva-completa`, `mecha:reserva-cancelada`, `mecha:cita-seleccionada`

**Ejemplo de uso**:
```html
<script src="https://mecha.app/widget/widget.js"></script>
<button onclick="MechaWidget.openModal()">Reserva ahora</button>
<script>
  MechaWidget.init({ slug: 'demo-salon' });
  MechaWidget.onComplete((cita) => {
    console.log('Reserva completada:', cita);
    // Redirigir a gracias
  });
</script>
```

#### 1.3 Modo embed en el portal
**Modificación en `app/r/[slug].web.tsx`**:

- Detectar `?embed=1`
- Ocultar header/footer
- Forzar color_acento del parámetro
- Comunicar altura al padre via `postMessage`
- Comunicar eventos (reserva completada, etc)

#### 1.4 Documentación
**Crear**: `docs/widget.md`

- Guía de instalación
- Ejemplos de código
- Parámetros configurables
- Eventos disponibles
- Customización CSS

### Entregable
- `web/widget.html` funcional
- `widget/widget.js` con API completa
- Modo embed en `/app/r/[slug]?embed=1`
- Documentación completa

---

## 📋 TAREA 2: CAPTCHA (reCAPTCHA v3) - PRIORIDAD ALTA

### Contexto
- **Vulnerabilidad**: Portal sin protección anti-bots
- **GAP**: Sin CAPTCHA

### Acciones

#### 2.1 Integrar reCAPTCHA v3
**En `app/r/[slug].web.tsx`**:

- Añadir script de reCAPTCHA v3
- Token en paso final (antes de `crear_cita_publica`)
- Validar en RPC (server-side)

**Schema**:
- Añadir campo `recaptcha_token` a `crear_cita_publica`
- Validar token en RPC con API de Google
- Retornar error si score < 0.5

#### 2.2 Configuración
**En `negocio_config`**:
- Añadir `recaptcha_site_key` (opcional, usa global si no existe)
- Añadir `recaptcha_min_score` (default: 0.5)

**Env vars** (Vercel):
- `RECAPTCHA_SITE_KEY` (pública)
- `RECAPTCHA_SECRET_KEY` (privada)

### Entregable
- reCAPTCHA v3 integrado en paso final
- Validación server-side
- Configuración por negocio opcional

---

## 📋 TAREA 3: ANALYTICS (GA4) - PRIORIDAD MEDIA

### Contexto
- **Gap**: No se puede medir funnel de conversión
- **Booksy/Fresha**: Analytics completos

### Acciones

#### 3.1 Configurar GA4
**Env var**:
- `NEXT_PUBLIC_GA4_ID` (ej: G-XXXXXXXXXX)

#### 3.2 Eventos en el portal
**En `app/r/[slug].web.tsx`**:

| Evento | Cuándo | Parámetros |
|--------|-------|------------|
| `view_item_list` | Al cargar servicios | items: [{id, nombre, categoria, precio}] |
| `select_item` | Al seleccionar servicio | item_id, item_name, precio |
| `add_to_cart` | Al seleccionar profesional | item_id, servicio_id, profesional_id |
| `begin_checkout` | Al seleccionar fecha/hora | servicio, profesional, fecha, hora |
| `purchase` | Al completar reserva | transaction_id, valor, servicio, profesional |

#### 3.3 Pageviews
- Virtual pageview por cada paso del funnel
- `page_view` con título del paso

#### 3.4 Configuración
**En `negocio_config`**:
- Añadir `ga4_tracking_id` (opcional, usa global si no existe)
- Añadir `analytics_enabled` (default: true)

### Entregable
- GA4 configurado
- Eventos de funnel implementados
- Configuración por negocio opcional

---

## 📋 TAREA 4: INVENTARIO V0 (Schema + CRUD) - PRIORIDAD BAJA

### Contexto
- **Estado actual**: NO existe
- **Prioridad**: BAJA (futuro)
- **Objetivo**: Schema base + CRUD simple para sentar bases

### Acciones

#### 4.1 Schema (migración)
**Crear**: `migrations/inventario-v0.sql`

**Tablas mínimas**:

```sql
-- Productos (catálogo)
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  descripcion text,
  categoria text, -- shampoo, color, tratamiento, accesorios...
  precio_cents integer not null default 0,
  stock_minimo integer default 5,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Stock actual
create table if not exists inventario (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  producto_id uuid references productos(id) on delete cascade,
  unidades integer not null default 0,
  ubicacion text, -- estantería, cajón...
  ultima_modificacion timestamptz not null default now()
);

-- Movimientos de stock
create table if not exists movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  producto_id uuid references productos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  unidades integer not null, -- positivo para entrada, negativo para salida
  motivo text, -- venta, reabastecimiento, merma, ajuste...
  referencia_id uuid, -- cita_id, cobro_id...
  creado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

**RLS**: Negocio_id (misma política que resto)

**Índices**:
- `productos(negocio_id, activo)`
- `inventario(negocio_id, producto_id)`
- `movimientos_inventario(negocio_id, producto_id, created_at)`

#### 4.2 RPCs básicas
**Crear**: `migrations/inventario-rpcs.sql`

```sql
-- Obtener inventario del negocio
obtener_inventario(negocio_id) → productos + stock actual

-- Registrar movimiento (entrada/salida)
registrar_movimiento_inventario(
  producto_id,
  tipo,
  unidades,
  motivo,
  referencia_id
) → movimientos_inventario

-- Obtener movimientos (historial)
obtener_movimientos_inventario(
  producto_id,
  desde,
  hasta
) → lista de movimientos

-- Productos con stock bajo
productos_stock_bajo(negocio_id) → alertas
```

#### 4.3 UI CRUD básica
**Crear**: `app/(tabs)/inventario.web.tsx`

**Features mínimas v0**:
- Lista de productos con stock actual
- Columnas: nombre, categoría, unidades, stock mínimo, alerta
- Botón "Nuevo producto" → Modal CRUD
- Botón "Movimiento" → Registrar entrada/salida
- Pestaña "Historial" → Lista de movimientos
- Badge "Stock bajo" en sidebar si hay alertas

**NO incluir v0**:
- Integración automática con cobros
- Predicción de demanda
- Proveedores
- Multi-almacén

### Entregable
- Schema inventario v0
- RPCs básicas (obtener, registrar, historial, alertas)
- UI CRUD simple (productos + movimientos)

---

## 🎨 REQUISITOS DE DISEÑO

**Usar hairy-design-system + hairy-ui-craft:**
- Widget: Limpio, minimalista (no "app UI")
- Iframe: Responsive, altura auto
- Inventario v0: CRUD funcional, no pulir visualmente
- Analytics: Invisible (no UI)

**Tokens de marca:**
- Widget configurable via parámetro `color`
- Acento: #f4501e (o custom del negocio)

---

## ✅ CRITERIOS DE COMPLETIÓN

### Widget
- [ ] `web/widget.html` funcional
- [ ] `widget/widget.js` con API completa
- [ ] Modo embed en `/app/r/[slug]?embed=1`
- [ ] Eventos (reserva completa, cancelada)
- [ ] Documentación `docs/widget.md`

### CAPTCHA
- [ ] reCAPTCHA v3 en paso final
- [ ] Validación server-side
- [ ] Env vars configuradas

### Analytics
- [ ] GA4 configurado
- [ ] Eventos de funnel (5 eventos)
- [ ] Virtual pageviews por paso
- [ ] Configuración por negocio opcional

### Inventario v0
- [ ] Schema completo (3 tablas)
- [ ] 4 RPCs básicas
- [ ] UI CRUD simple
- [ ] Alertas de stock bajo
- [ ] NO integración con cobros (v2)

---

## 📚 REFERENCIAS

**Portal existente:**
- `app/r/[slug].web.tsx` (portal de reserva)
- `migrations/portal-reserva-publica.sql` (RPCs)

**Patrones de widgets:**
- Booksy widget (referencia de funcionalidad)
- Fresha embed (referencia)

**Skills a cargar:**
1. `hairy-design-router` → router
2. `hairy-design-system` → diseño
3. `hairy-domain-data` → dominio

---

## 🚀 FLUJO DE TRABAJO

1. **Widget** (prioridad alta)
   - Crear `web/widget.html`
   - Crear `widget/widget.js`
   - Modo embed en portal
   - Documentar
2. **CAPTCHA** (prioridad alta)
   - Integrar reCAPTCHA v3
   - Validación server-side
3. **Analytics** (prioridad media)
   - Configurar GA4
   - Eventos de funnel
4. **Inventario v0** (prioridad baja, time permitting)
   - Schema
   - RPCs
   - UI CRUD básica

**Tiempo estimado**: 3-4 días (widget + CAPTCHA + analytics), +2 días (inventario v0)

---

## 🎯 IMPACTO

Tras esta sesión:
- **Mecha es competitivo en captación online** (widget + CAPTCHA + analytics)
- **Base sentada para inventario** (schema + CRUD básico)
- **Medible** (funnel de conversión)

---

> **IMPORTANTE**: Widget y CAPTCHA son prioridad alta. Inventario v0 es time permitting.
