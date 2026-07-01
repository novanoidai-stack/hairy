# SESIÓN 2: Portal Competitivo + Fidelización Avanzada

**Fecha:** 2026-07-01
**Proyecto:** Mecha (Hairy)
**Ámbito:** 4 áreas independientes de desarrollo

---

## Índice

1. [ÁREA 2: CAPTCHA (reCAPTCHA v3)](#area-2-captcha-recaptcha-v3)
2. [ÁREA 3: Analytics (GA4)](#area-3-analytics-ga4)
3. [ÁREA 1: Widget embebible](#area-1-widget-embebible)
4. [ÁREA 4: Fidelización avanzada](#area-4-fidelizacion-avanzada)

---

## ÁREA 2: CAPTCHA (reCAPTCHA v3)

### Objetivo
Proteger el portal público contra bots automatizados que puedan llenar agendas con reservas falsas o spam de reseñas.

### Alcance
- Integración de reCAPTCHA v3 invisible
- Validación de tokens en backend (RPCs)
- Toggle de configuración para el negocio

### Arquitectura

#### 1. Setup de claves
- **Claves globales de Mecha**: Un solo proyecto en Google Cloud para todo el SaaS
- **Site key**: Pública, se usa en frontend
- **Secret key**: Privada, se usa en validación backend
- **Environment variable**: `RECAPTCHA_SECRET_KEY` en Supabase

#### 2. RPCs modificadas

**`crear_cita_publica`** - Añadir parámetro:
```plpgsql
p_captcha_token text default null
```

**`crear_resena_publica`** - Añadir parámetro:
```plpgsql
p_captcha_token text default null
```

#### 3. Función de validación

**`validar_captcha(p_token text)`** - Nueva función helper:
```plpgsql
CREATE OR REPLACE FUNCTION public.validar_captcha(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response jsonb;
  v_score numeric;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'TOKEN_MISSING');
  END IF;

  -- Llamar a Google API para validar
  -- (implementación con http extension o vía edge function)
  -- Por ahora, placeholder:
  RETURN jsonb_build_object('valid', true, 'score', 0.7);
END;
$$;
```

**Nota**: La validación real requiere:
- Opción A: Usar `pg_http` extension de Supabase
- Opción B: Edge function intermedia
- **Decisión**: Opción B (edge function) para no depender de extensiones

#### 4. Edge function: `validate-captcha`

**Archivo**: `supabase/functions/validate-captcha/index.ts`

```typescript
// Valida token con Google API
// POST /functions/v1/validate-captcha
// Body: { token: string }
// Returns: { valid: boolean, score: number, error?: string }
```

#### 5. Frontend - Portal

**`app/r/[slug].web.tsx`**:
- Cargar script de reCAPTCHA v3
- Ejecutar `grecaptcha.execute()` antes de submit
- Enviar token a la RPC

```tsx
// Cargar script
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://www.google.com/recaptcha/api.js?render=SITE_KEY';
  script.async = true;
  document.head.appendChild(script);
}, []);

// Antes de submit
const token = await window.grecaptcha.execute('SITE_KEY', { action: 'submit' });
await crearCitaPublica({ ..., captcha_token: token });
```

#### 6. Configuración

**`app/(tabs)/configuracion.web.tsx`**:
- Nueva sección: "Portal público"
- Toggle: "Protección CAPTCHA en portal" (ON por defecto)
- Texto de ayuda: "Protege tu portal contra bots. Recomendado: siempre activo."

### Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/validate-captcha/index.ts` | NUEVO | Edge function para validar tokens |
| `migrations/captcha-rollback.sql` | NUEVO | Actualizar RPCs con parámetro captcha |
| `app/r/[slug].web.tsx` | MODIFICAR | Integrar reCAPTCHA v3 |
| `app/(tabs)/configuracion.web.tsx` | MODIFICAR | Añadir toggle CAPTCHA |

### Security considerations
- Secret key NUNCA en frontend
- Token expira rápidamente (2 min)
- Score threshold: 0.5 (ajustable)
- Rate limiting CAPTCHA: max 10 validaciones/minuto por IP

---

## ÁREA 3: Analytics (GA4)

### Objetivo
Trackear conversiones del portal para optimizar la tasa de reserva y entender puntos de fuga.

### Alcance
- Integración de GA4 con consentimiento GDPR
- Eventos de tracking en todo el flujo
- Configuración en Settings

### Arquitectura

#### 1. Librería de analytics

**`lib/analytics.ts`** - NUEVO:

```typescript
export interface AnalyticsConfig {
  measurementId: string;
  enabled: boolean;
  consentGiven: boolean;
}

export function initGA4(config: AnalyticsConfig): void
export function trackEvent(name: string, params: Record<string, any>): void
export function trackPageView(path: string, title: string): void
export function giveConsent(): void
export function withdrawConsent(): void
```

#### 2. Eventos a trackear

| Evento | Cuándo | Parámetros |
|--------|-------|------------|
| `portal_view` | Se carga el portal | `slug`, `negocio_nombre` |
| `step_view` | Cada paso del flujo | `step` (servicio\|profesional\|fecha\|datos\|resumen), `slug` |
| `booking_completed` | Cita creada con éxito | `cita_id`, `servicio`, `profesional`, `importe`, `slug` |
| `booking_abandoned` | Usuario abandona el flujo | `last_step`, `slug` |
| `review_submitted` | Reseña enviada | `puntuacion`, `slug` |

#### 3. Portal integration

**`app/r/[slug].web.tsx`**:
```tsx
import { initGA4, trackEvent, trackPageView, giveConsent } from '@/lib/analytics';

// Al cargar
useEffect(() => {
  const config = portalInfo.negocio.analytics_config;
  if (config?.enabled) {
    initGA4(config);
    trackPageView(`/r/${slug}`, portalInfo.negocio.nombre);
  }
}, []);

// En cada cambio de paso
useEffect(() => {
  if (config?.enabled && config?.consentGiven) {
    trackEvent('step_view', { step: currentStep, slug });
  }
}, [currentStep]);

// Al completar reserva
onBookingComplete: () => {
  trackEvent('booking_completed', { cita_id, servicio, profesional, importe, slug });
}

// Banner de consentimiento
<ConsentBanner onAccept={giveConsent} />
```

#### 4. Banner de consentimiento GDPR

**Componente** - `<ConsentBanner />`:
- Aparece al entrar al portal
- Texto: "Usamos cookies para mejorar tu experiencia. Acepta para continuar."
- Botones: "Aceptar", "Rechazar", "Más info"
- Guarda elección en localStorage

#### 5. Configuración

**`app/(tabs)/configuracion.web.tsx`**:
- Nueva sección: "Portal público > Analytics"
- Campo: "Measurement ID de GA4" (formato: G-XXXXXXXXXX)
- Toggle: "Activar analytics"
- Link: "Ver en GA4" (abre dashboard)

### Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `lib/analytics.ts` | NUEVO | Librería de tracking GA4 |
| `app/r/[slug].web.tsx` | MODIFICAR | Integrar eventos y banner consentimiento |
| `components/portal/ConsentBanner.tsx` | NUEVO | Banner GDPR |
| `app/(tabs)/configuracion.web.tsx` | MODIFICAR | Añadir config analytics |

### GDPR compliance
- Consentimiento explícito requerido
- Opción de rechazo sin bloqueo de funcionalidad
- Política de cookies accesible
- Datos anonimizados cuando sea posible

---

## ÁREA 1: Widget embebible

### Objetivo
Permitir que negocios embeban el portal de reserva en sus propias webs (WordPress, Wix, custom).

### Alcance
- Modo embed del portal
- SDK JS para integración
- Página de configuración con snippet

### Arquitectura

#### 1. Modo embed del portal

**`app/r/[slug].web.tsx`** - Modificación:

```tsx
const { mode } = useLocalSearchParams();
const isEmbed = mode === 'embed';

// En modo embed:
// - Sin header/footer global
// - Fondo transparente
// - postMessage al padre
useEffect(() => {
  if (isEmbed && window.parent !== window) {
    const postMessage = (type: string, data: any) => {
      window.parent.postMessage({ type, data }, '*');
    };

    // Eventos
    postMessage('widget_loaded', { slug });
    // ... en cada paso, confirmación, error
  }
}, [isEmbed]);
```

**CSS específico embed**:
```css
.rp-embed {
  background: transparent !important;
  max-height: none !important;
  border-radius: 0 !important;
}
```

#### 2. SDK JS

**`web/embed-widget.js`** - NUEVO:

```javascript
(function(window) {
  'use strict';

  const MechaWidget = {
    _container: null,
    _slug: null,
    _iframe: null,
    _onEvent: null,
    _styles: {},

    init: function(config) {
      this._slug = config.slug;
      this._container = typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;
      this._onEvent = config.onEvent || function() {};
      this._styles = config.styles || {};

      this._render();
      this._listen();
    },

    open: function() {
      if (this._iframe) {
        this._iframe.style.display = 'block';
      }
    },

    close: function() {
      if (this._iframe) {
        this._iframe.style.display = 'none';
      }
    },

    setService: function(serviceId) {
      this._postToIframe('set_service', { serviceId });
    },

    _render: function() {
      const iframe = document.createElement('iframe');
      iframe.src = `https://mecha.app/r/${this._slug}?mode=embed`;
      iframe.style.cssText = `
        width: 100%;
        height: ${this._styles.maxHeight || '600px'};
        border: none;
        border-radius: ${this._styles.borderRadius || '8px'};
        background: ${this._styles.backgroundColor || '#ffffff'};
      `;
      this._iframe = iframe;
      this._container.appendChild(iframe);
    },

    _listen: function() {
      window.addEventListener('message', (event) => {
        if (event.origin !== 'https://mecha.app') return;
        const { type, data } = event.data;
        this._onEvent(type, data);
      });
    },

    _postToIframe: function(type, data) {
      if (this._iframe && this._iframe.contentWindow) {
        this._iframe.contentWindow.postMessage({ type, data }, 'https://mecha.app');
      }
    }
  };

  window.MechaWidget = MechaWidget;
})(window);
```

#### 3. Eventos postMessage

**Del widget al padre**:
| Evento | Cuándo | Data |
|--------|-------|------|
| `widget_loaded` | Widget inicializado | `{ slug }` |
| `step_view` | Usuario cambia de paso | `{ step, slug }` |
| `booking_completed` | Reserva completada | `{ cita_id, servicio, slug }` |
| `error` | Error en el flujo | `{ error, slug }` |

**Del padre al widget**:
| Evento | Cuándo | Data |
|--------|-------|------|
| `set_service` | Pre-seleccionar servicio | `{ serviceId }` |
| `open` | Abrir widget | - |
| `close` | Cerrar widget | - |

#### 4. Configuración - Integración

**`app/(tabs)/configuracion.web.tsx`**:
- Nueva sección: "Portal público > Integración"
- Snippet de código:
  ```html
  <div id="mecha-widget"></div>
  <script src="https://mecha.app/embed-widget.js"></script>
  <script>
    MechaWidget.init({
      slug: 'tu-slug',
      container: '#mecha-widget',
      styles: {
        maxHeight: '600px',
        borderRadius: '12px',
        color: '#f4501e'
      },
      onEvent: (type, data) => console.log(type, data)
    });
  </script>
  ```
- Preview en iframe
- Botón "Copiar código"

### Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `app/r/[slug].web.tsx` | MODIFICAR | Añadir modo embed + postMessage |
| `web/embed-widget.js` | NUEVO | SDK JS del widget |
| `app/(tabs)/configuracion.web.tsx` | MODIFICAR | Añadir tab "Integración" |
| `vercel.json` | MODIFICAR | Headers CORS para embed |

### CORS y seguridad
- `postMessage` con validación de origen
- Headers CORS en Vercel
- X-Frame-Options: SAMEORIGIN (excepto en modo embed)

---

## ÁREA 4: Fidelización avanzada

### Objetivo
Implementar sistema de gamificación para retener clientes: niveles, logros, sellos con expiración.

### Alcance
- Niveles configurables por negocio
- Sistema de logros/hitos
- Sellos con expiración
- Bonificación por servicios premium

### Arquitectura

#### 1. Nuevas tablas

**`niveles_fidelizacion`**:
```sql
CREATE TABLE niveles_fidelizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  nombre text NOT NULL,              -- "Bronce", "Plata", "Oro"
  umbral_visitas integer DEFAULT 0,   -- Mínimo de visitas
  umbral_gastado numeric DEFAULT 0,   -- Mínimo gastado (euros)
  color text DEFAULT '#b8860b',
  icono text DEFAULT 'award',
  orden integer DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

**`logros`**:
```sql
CREATE TABLE logros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  nombre text NOT NULL,                    -- "Primera visita", "VIP"
  descripcion text,
  tipo text NOT NULL,                      -- 'primera_visita', 'visitas_X', 'gasto_Y', 'sin_noshow_Z'
  condicion_json jsonb,                    -- {"visitas": 10, "gasto": 100}
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

**`cliente_logros`**:
```sql
CREATE TABLE cliente_logros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  logro_id uuid NOT NULL REFERENCES logros(id) ON DELETE CASCADE,
  desbloqueado_en timestamptz DEFAULT now(),
  UNIQUE(cliente_id, logro_id)
);
```

**`recompensas`** (modificar tabla existente o crear nueva):
```sql
CREATE TABLE recompensas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  nombre text NOT NULL,                    -- "Corte gratis", "20% descuento"
  sellos_requeridos integer NOT NULL,
  expira_meses integer DEFAULT 12,        -- Meses para canjear
  descuento_pct numeric DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

#### 2. Modificar tabla `servicios`

Añadir campo `bonus_puntos`:
```sql
ALTER TABLE servicios ADD COLUMN bonus_puntos integer DEFAULT 1;
-- Servicios premium dan más sellos (ej: tinte = 2)
```

#### 3. RPC para calcular nivel

**`calcular_nivel_cliente(p_cliente_id uuid)`**:
```plpgsql
CREATE OR REPLACE FUNCTION public.calcular_nivel_cliente(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_visitas int;
  v_gastado numeric;
  v_nivel_id uuid;
  v_nivel_nombre text;
  v_nivel_color text;
  v_nivel_icono text;
BEGIN
  -- Contar visitas completadas
  SELECT count(*), coalesce(sum(precio_cobrado), 0)
    INTO v_visitas, v_gastado
  FROM citas
  WHERE cliente_id = p_cliente_id
    AND estado IN ('completada', 'noshow', 'cancelada_cliente');

  -- Buscar nivel máximo alcanzado
  SELECT id, nombre, color, icono
    INTO v_nivel_id, v_nivel_nombre, v_nivel_color, v_nivel_icono
  FROM niveles_fidelizacion
  WHERE negocio_id = (SELECT negocio_id FROM clientes WHERE id = p_cliente_id)
    AND (umbral_visitas IS NULL OR v_visitas >= umbral_visitas)
    AND (umbral_gastado IS NULL OR v_gastado >= umbral_gastado)
    AND activo = true
  ORDER BY orden DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'nivel_id', v_nivel_id,
    'nivel_nombre', coalesce(v_nivel_nombre, 'Nuevo'),
    'nivel_color', v_nivel_color,
    'nivel_icono', v_nivel_icono,
    'visitas_totales', v_visitas,
    'gastado_total', v_gastado
  );
END;
$$;
```

#### 4. RPC para verificar logros

**`verificar_logros_cliente(p_cliente_id uuid)`**:
```plpgsql
-- Desbloquea logros nuevos y retorna lista completa
```

#### 5. UI - Clientes

**`app/(tabs)/clientes.web.tsx`**:
- Badge de nivel en tarjeta de cliente
- Sección de "Logros desbloqueados" (iconos con tooltips)
- Indicador de "Sellos disponibles"

#### 6. UI - Configuración

**`app/(tabs)/configuracion.web.tsx`** - Nuevas secciones:

**Tab "Niveles"**:
- Lista de niveles del negocio
- Botón "Añadir nivel"
- Editar: nombre, umbrales, color, icono, orden

**Tab "Logros"**:
- Lista de logros configurados
- Crear logro: nombre, tipo, condición

**Tab "Recompensas"**:
- Lista de recompensas
- Crear: nombre, sellos requeridos, expiración meses, descuento

### Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `migrations/niveles_fidelizacion.sql` | NUEVO | Tabla de niveles |
| `migrations/logros.sql` | NUEVO | Tabla de logros + cliente_logros |
| `migrations/recompensas.sql` | NUEVO | Tabla de recompensas |
| `migrations/servicios-bonus-puntos.sql` | NUEVO | Campo bonus_puntos |
| `app/(tabs)/clientes.web.tsx` | MODIFICAR | Badges de nivel y logros |
| `app/(tabs)/configuracion.web.tsx` | MODIFICAR | Tabs de fidelización |
| `lib/fidelizacion.ts` | NUEVO | Helpers de fidelización |

### Lógica de expiración de sellos

- Campo `expira_meses` en recompensas
- Al canjear, se marca la fecha de obtención del primer sello
- Si `now() > fecha_primer_sello + expira_meses`, los sellos pierden prioridad
- Notificación: "Tus sellos caducan en X días" (vía n8n)

---

## Plan de implementación

### Orden recomendado

1. **CAPTCHA** (2-3h) - Seguridad crítica
2. **Analytics** (2-3h) - Métricas para optimizar
3. **Widget** (4-5h) - Diferencial competitivo
4. **Fidelización** (6-8h) - Gamificación

### Testing

- CAPTCHA: Probar con tokens de test de reCAPTCHA
- Analytics: Verificar eventos en GA4 DebugView
- Widget: Test en diferentes sites (WordPress, custom HTML)
- Fidelización: Crear niveles, logros y verificar cálculo

### Despliegue

1. Aplicar migrations en Supabase (remoto)
2. Deploy edge functions
3. Deploy web (Vercel)
4. Verificar funcionalidad end-to-end en demo

---

## Notas

- **Inventario**: Excluido de esta sesión (se hará en sesión separada)
- **Claves reCAPTCHA**: El usuario debe proporcionar site key y secret key
- **GDPR**: Banner de consentimiento es obligatorio en UE
- **Multi-tenant**: Todas las nuevas tablas filtran por `negocio_id`
