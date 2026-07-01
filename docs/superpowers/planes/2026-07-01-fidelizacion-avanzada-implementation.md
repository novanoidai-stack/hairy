# Plan de Implementación: Fidelización Avanzada

**Fecha:** 2026-07-01
**Espec base:** `docs/superpowers/specs/2026-07-01-sesion2-portal-competitivo-fidelizacion.md` (ÁREA 4)
**Horas estimadas:** 6-8h

---

## 0. Configuración previa

### Environment variables
No requiere nuevas env vars. Todo se configura en BD por negocio.

### Dependencias
Ya instaladas (verificar):
- `@supabase/supabase-js` - Cliente Supabase
- `date-fns` - Fechas (ya usado)
- Lucide icons (vía componentes existentes)

---

## 1. Migraciones de base de datos

### 1.1 Verificar migración existente

**Archivo:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\migrations\recompensas.sql`

La migración ya existe y contiene:
- Tabla `recompensas` (configuración de premios)
- Tabla `recompensas_canjeadas` (historial)
- Tabla `niveles_fidelizacion` (niveles: Nuevo, Habitual, VIP...)
- Tabla `logros` (logros desbloqueables)
- Tabla `logros_desbloqueados` (registro por cliente)
- RPCs: `obtener_recompensas_negocio`, `canjear_recompensa`, `obtener_nivel_cliente`, `verificar_logros_cliente`, `obtener_logros_desbloqueados`

**VERIFICACIÓN:** Ejecutar en Supabase SQL Editor:
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'niveles_fidelizacion'
);
```
Si retorna `false`, aplicar la migración.

---

### 1.2 Crear migración: servicios-bonus-puntos.sql

**Archivo:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\migrations\servicios-bonus-puntos.sql`

```sql
-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Bonus de puntos en servicios
-- Autor: Carlos + Claude (1 jul 2026)
--
-- Añade campo bonus_puntos a la tabla servicios para que servicios premium
-- (tintes, tratamientos) otorguen más sellos/puntos.
-- ────────────────────────────────────────────────────────────────────────────────

-- Añadir campo bonus_puntos (default 1 = 1 sello por visita)
ALTER TABLE servicios
ADD COLUMN IF NOT EXISTS bonus_puntos integer DEFAULT 1
CONSTRAINT bonus_puntos_positive CHECK (bonus_puntos >= 0);

-- Comentario
COMMENT ON COLUMN servicios.bonus_puntos IS 'Sellos/puntos otorgados por este servicio (default 1). Servicios premium dan más.';

-- Índice para servicios con bonus
CREATE INDEX IF NOT EXISTS servicios_bonus ON servicios(negocio_id, bonus_puntos) WHERE bonus_puntos > 1;

-- RLS (mantener política existente, no tocar)
-- La política existente de servicios ya cubre este campo
```

**Comando para aplicar:**
```bash
# Via MCP de Supabase o SQL Editor manual
# Copiar contenido de servicios-bonus-puntos.sql y ejecutar en Supabase
```

---

## 2. Librería de fidelización

### 2.1 Crear archivo: lib/fidelizacion.ts

**Archivo:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\lib\fidelizacion.ts`

```typescript
/**
 * Librería de fidelización - Sistema de gamificación
 * 
 * Maneja niveles, logros, recompensas y cálculo de puntos/sellos.
 * Multi-tenant por negocio_id.
 */

import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NivelFidelizacion {
  id: string;
  negocio_id: string;
  nombre: string;
  umbral_visitas: number;
  umbral_gastado_cents: number;
  color: string;
  icono: string;
  orden: number;
  activo: boolean;
}

export interface Logro {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'primera_visita' | 'visitas_multiple' | 'gastado_total' | 'sin_noshow' | 'servicio_fav' | 'antiguedad' | 'custom';
  condicion: Record<string, any>;
  icono: string;
  color: string;
  activo: boolean;
}

export interface LogroDesbloqueado {
  id: string;
  negocio_id: string;
  cliente_id: string;
  logro_id: string;
  desbloqueado_en: string;
  detalles: Record<string, any>;
}

export interface Recompensa {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'descuento_pct' | 'descuento_eur' | 'producto' | 'servicio';
  valor: string;
  umbral_visitas: number;
  expira_meses: number | null;
  activo: boolean;
}

export interface RecompensaCanjeada {
  id: string;
  negocio_id: string;
  cliente_id: string;
  recompensa_id: string;
  cita_id: string | null;
  canjeado_en: string;
  estado: 'canjeado' | 'usado' | 'expirado' | 'cancelado';
  usado_en: string | null;
  notas: string | null;
}

export interface EstadoFidelizacion {
  nivel: NivelFidelizacion | null;
  nivel_nombre: string;
  nivel_color: string;
  nivel_icono: string;
  nivel_orden: number;
  visitas_totales: number;
  gastado_cents: number;
  logros_desbloqueados: LogroDesbloqueado[];
  recompensas_disponibles: Recompensa[];
  sellos_totales: number;
  sellos_caducan_en: string | null;
}

// ---------------------------------------------------------------------------
// RPCs (funciones que llaman a Supabase)
// ---------------------------------------------------------------------------

/**
 * Obtiene el nivel de fidelización de un cliente
 */
export async function obtenerNivelCliente(clienteId: string): Promise<{
  ok: boolean;
  nivel?: NivelFidelizacion;
  nivel_nombre?: string;
  nivel_color?: string;
  nivel_icono?: string;
  nivel_orden?: number;
  visitas?: number;
  gastado_cents?: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_nivel_cliente', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo nivel cliente:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Verifica y desbloquea logros automáticamente
 */
export async function verificarLogrosCliente(clienteId: string): Promise<{
  ok: boolean;
  desbloqueados?: number;
  visitas?: number;
  gastado_cents?: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('verificar_logros_cliente', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error verificando logros:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Obtiene logros desbloqueados de un cliente
 */
export async function obtenerLogrosDesbloqueados(clienteId: string): Promise<{
  ok: boolean;
  logros?: (LogroDesbloqueado & { logro_nombre: string; logro_descripcion: string | null; logro_tipo: string; logro_icono: string; logro_color: string })[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_logros_desbloqueados', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo logros desbloqueados:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Obtiene recompensas disponibles del negocio
 */
export async function obtenerRecompensasNegocio(negocioId: string, soloActivas = true): Promise<{
  ok: boolean;
  recompensas?: Recompensa[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_recompensas_negocio', {
      p_negocio_id: negocioId,
      p_solo_activas: soloActivas,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo recompensas:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Canjea una recompensa para un cliente
 */
export async function canjearRecompensa(
  recompensaId: string,
  clienteId: string,
  citaId?: string
): Promise<{
  ok: boolean;
  canje_id?: string;
  recompensa?: string;
  valor?: string;
  error?: string;
  visitas_actuales?: number;
  visitas_requeridas?: number;
}> {
  try {
    const { data, error } = await supabase.rpc('canjear_recompensa', {
      p_recompensa_id: recompensaId,
      p_cliente_id: clienteId,
      p_cita_id: citaId || null,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error canjeando recompensa:', e);
    return { ok: false, error: (e as any).message };
  }
}

// ---------------------------------------------------------------------------
// Helpers de cálculo (frontend)
// ---------------------------------------------------------------------------

/**
 * Calcula sellos totales de un cliente
 * Sellos = sum(bonus_puntos) de citas completadas
 */
export function calcularSellosVisitas(citas: Array<{ bonus_puntos?: number; estado: string }>): number {
  return citas
    .filter(c => c.estado === 'completada')
    .reduce((acc, c) => acc + (c.bonus_puntos || 1), 0);
}

/**
 * Calcula cuándo caducan los sellos más antiguos
 */
export function calcularCaducidadSellos(
  citas: Array<{ inicio: string; estado: string; bonus_puntos?: number }>,
  expiraMeses: number
): string | null {
  if (expiraMeses === 0 || expiraMeses === null) return null;

  // Primera visita con sellos
  const primera = citas
    .filter(c => c.estado === 'completada')
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

  if (!primera) return null;

  const fecha = new Date(primera.inicio);
  fecha.setMonth(fecha.getMonth() + expiraMeses);
  return fecha.toISOString();
}

/**
 * Obtiene estado completo de fidelización de un cliente
 */
export async function obtenerEstadoFidelizacion(
  clienteId: string,
  negocioId: string,
  citas?: Array<{ inicio: string; estado: string; bonus_puntos?: number }>
): Promise<EstadoFidelizacion> {
  // Ejecutar todas las consultas en paralelo
  const [nivel, logros, recompensas] = await Promise.all([
    obtenerNivelCliente(clienteId),
    obtenerLogrosDesbloqueados(clienteId),
    obtenerRecompensasNegocio(negocioId),
  ]);

  // Calcular sellos si se proporcionan citas
  const sellos_totales = citas ? calcularSellosVisitas(citas) : 0;

  // Calcular caducidad (usar primera recompensa como referencia)
  const sellos_caducan_en = recompensas.recompensas?.[0]
    ? calcularCaducidadSellos(
        citas || [],
        recompensas.recompensas[0].expira_meses || 0
      )
    : null;

  return {
    nivel: nivel.nivel || null,
    nivel_nombre: nivel.nivel_nombre || 'Nuevo',
    nivel_color: nivel.nivel_color || '#9ca3af',
    nivel_icono: nivel.nivel_icono || 'star',
    nivel_orden: nivel.nivel_orden || 0,
    visitas_totales: nivel.visitas || 0,
    gastado_cents: nivel.gastado_cents || 0,
    logros_desbloqueados: logros.logros || [],
    recompensas_disponibles: recompensas.recompensas || [],
    sellos_totales,
    sellos_caducan_en,
  };
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

/**
 * Obtiene color y estilo para badge de nivel
 */
export function getNivelBadgeStyle(nivel: EstadoFidelizacion['nivel']) {
  if (!nivel) {
    return {
      bg: '#f3f4f6',
      color: '#6b7280',
      border: '#d1d5db',
    };
  }
  return {
    bg: `${nivel.color}15`, // 15% opacity
    color: nivel.color,
    border: nivel.color,
  };
}

/**
 * Formatea diferencia de tiempo para caducidad
 */
export function formatearCaducidad(fechaIso: string | null): string {
  if (!fechaIso) return 'No caducan';

  const fecha = new Date(fechaIso);
  const hoy = new Date();
  const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  if (dias < 0) return 'Caducados';
  if (dias === 0) return 'Caducan hoy';
  if (dias === 1) return 'Caducan mañana';
  if (dias < 30) return `Caducan en ${dias} días`;
  if (dias < 365) return `Caducan en ${Math.ceil(dias / 30)} meses`;
  return `Caducan en ${Math.ceil(dias / 365)} años`;
}
```

---

## 3. Modificar pantalla de Clientes

### 3.1 Archivo: app/(tabs)/clientes.web.tsx

**Ubicación:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\app\(tabs)\clientes.web.tsx`

**Modificaciones:**

#### 3.1.1 Añadir imports

```typescript
// Al inicio del archivo, después de los imports existentes:
import { obtenerEstadoFidelizacion, getNivelBadgeStyle, formatearCaducidad } from '@/lib/fidelizacion';
```

#### 3.1.2 Añadir campos al interface Cliente

```typescript
interface Cliente {
  // ... campos existentes ...
  // Añadir:
  nivel_fidelizacion?: string;
  nivel_color?: string;
  logros_count?: number;
  sellos_totales?: number;
}
```

#### 3.1.3 Modificar carga de clientes

```typescript
// En la función que carga clientes (alrededor de la línea 300-400)
// Añadir join con niveles y logros

const cargarClientes = useCallback(async () => {
  // ... código existente ...

  // Añadir a la consulta:
  // - nivel de fidelización
  // - conteo de logros desbloqueados
  // - sellos totales (sum de bonus_puntos)

  const { data, error } = await supabase
    .from('clientes')
    .select(`
      *,
      citas:cliente_id(
        id,
        estado,
        bonus_puntos
      )
    `)
    .eq('negocio_id', negocioId)
    .order('created_at', { ascending: false });

  // ... procesar datos ...
  // Calcular nivel, sellos, etc. para cada cliente
}, [negocioId]);
```

#### 3.1.4 Añadir badge de nivel en tarjeta

```typescript
// En el render de la tarjeta de cliente (alrededor de la línea 600-800)
// Añadir badge de nivel después del nombre:

<div style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '12px',
  background: cliente.nivel_color ? `${cliente.nivel_color}15` : '#f3f4f6',
  color: cliente.nivel_color || '#6b7280',
  fontSize: '12px',
  fontWeight: 500,
  border: `1px solid ${cliente.nivel_color || '#d1d5db'}`,
}}>
  <Icon name={cliente.nivel_icono || 'star'} size={14} color={cliente.nivel_color || '#6b7280'} />
  <span>{cliente.nivel_fidelizacion || 'Nuevo'}</span>
</div>
```

#### 3.1.5 Añadir sección de logros en panel detalle

```typescript
// En el panel detalle del cliente (modal o expand)
// Añadir sección "Logros y Sellos":

{clienteFidelizacion && (
  <div style={{ 
    padding: '16px',
    background: TOKENS.bgCard,
    borderRadius: '12px',
    marginTop: '16px',
  }}>
    <h4 style={{ 
      fontSize: '14px', 
      fontWeight: 600, 
      marginBottom: '12px',
      color: TOKENS.text,
    }}>Fidelización</h4>

    {/* Nivel */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '12px',
      padding: '8px 12px',
      borderRadius: '8px',
      background: getNivelBadgeStyle(clienteFidelizacion.nivel).bg,
      border: `1px solid ${getNivelBadgeStyle(clienteFidelizacion.nivel).border}`,
    }}>
      <Icon 
        name={clienteFidelizacion.nivel_icono} 
        size={18} 
        color={getNivelBadgeStyle(clienteFidelizacion.nivel).color} 
      />
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: getNivelBadgeStyle(clienteFidelizacion.nivel).color }}>
          {clienteFidelizacion.nivel_nombre}
        </div>
        <div style={{ fontSize: '11px', color: TOKENS.textSec }}>
          {clienteFidelizacion.visitas_totales} visitas · {formatearEuros(clienteFidelizacion.gastado_cents / 100)}
        </div>
      </div>
    </div>

    {/* Sellos */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderRadius: '8px',
      background: TOKENS.bgCardHi,
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="sparkle" size={16} color={TOKENS.primary} />
        <span style={{ fontSize: '13px', color: TOKENS.text }}>
          Sellos totales
        </span>
      </div>
      <span style={{ fontSize: '14px', fontWeight: 600, color: TOKENS.primary }}>
        {clienteFidelizacion.sellos_totales}
      </span>
    </div>

    {/* Caducidad */}
    {clienteFidelizacion.sellos_caducan_en && (
      <div style={{
        fontSize: '11px',
        color: TOKENS.warning,
        marginBottom: '12px',
        textAlign: 'right',
      }}>
        {formatearCaducidad(clienteFidelizacion.sellos_caducan_en)}
      </div>
    )}

    {/* Logros */}
    {clienteFidelizacion.logros_desbloqueados.length > 0 && (
      <div>
        <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '8px', color: TOKENS.textSec }}>
          Logros desbloqueados
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {clienteFidelizacion.logros_desbloqueados.map(logro => (
            <div
              key={logro.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: `${logro.logro_color}15`,
                border: `1px solid ${logro.logro_color}40`,
                fontSize: '11px',
                color: logro.logro_color,
              }}
              title={logro.logro_descripcion || logro.logro_nombre}
            >
              <Icon name={logro.logro_icono} size={12} color={logro.logro_color} />
              <span>{logro.logro_nombre}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

---

## 4. Modificar pantalla de Configuración

### 4.1 Archivo: app/(tabs)/configuracion.web.tsx

**Ubicación:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\app\(tabs)\configuracion.web.tsx`

Ya existe el componente `<TabRecompensas />` importado. Verificar que está integrado correctamente.

#### 4.1.1 Verificar que el tab está en el Tabs principal

```typescript
// Buscar el componente Tabs o el sistema de pestañas
// Debe incluir algo como:

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="servicios">Servicios</TabsTrigger>
    <TabsTrigger value="equipo">Equipo</TabsTrigger>
    {/* ... otros tabs ... */}
    <TabsTrigger value="recompensas">Fidelización</TabsTrigger> {/* <-- ASEGURAR QUE EXISTE */}
  </TabsList>

  <TabsContent value="recompensas">
    <TabRecompensas negocioId={negocioId} />
  </TabsContent>
</Tabs>
```

#### 4.1.2 Si no existe el sistema de Tabs, añadir:

```typescript
// Al inicio del componente, en los estados:
const [activeTab, setActiveTab] = useState('general');

// En el render, después de las secciones existentes:
{activeTab === 'recompensas' && (
  <TabRecompensas negocioId={negocioId} />
)}

// Y añadir el botón/tab para activarlo
```

### 4.2 Mejorar TabRecompensas si es necesario

**Archivo:** `c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy\app\(tabs)\configuracion-recompensas.web.tsx`

Verificar que incluye:
1. **Sub-tabs para:** Niveles, Logros, Recompensas
2. **CRUD completo** para cada entidad
3. **Previsualización** de colores/iconos
4. **Validación** de formularios

Si faltan sub-tabs, añadir:

```typescript
// Añadir estado para sub-tab dentro de TabRecompensas:
const [activeSubTab, setActiveSubTab] = useState<'recompensas' | 'niveles' | 'logros'>('recompensas');

// Renderizar tabs:
<div style={{
  display: 'flex',
  gap: '4px',
  borderBottom: `1px solid ${T.border}`,
  marginBottom: '16px',
}}>
  {[
    { key: 'recompensas', label: 'Recompensas' },
    { key: 'niveles', label: 'Niveles' },
    { key: 'logros', label: 'Logros' },
  ].map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveSubTab(tab.key as any)}
      style={{
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${activeSubTab === tab.key ? T.primary : 'transparent'}`,
        color: activeSubTab === tab.key ? T.primary : T.textSec,
        fontWeight: activeSubTab === tab.key ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {tab.label}
    </button>
  ))}
</div>

// Renderizar contenido según sub-tab:
{activeSubTab === 'recompensas' && <RecompensasSection />}
{activeSubTab === 'niveles' && <NivelesSection />}
{activeSubTab === 'logros' && <LogrosSection />}
```

---

## 5. Despliegue

### 5.1 Aplicar migraciones

```bash
# 1. Conectar a Supabase (via dashboard o MCP)
# 2. Ejecutar contenido de migrations/servicios-bonus-puntos.sql
# 3. Verificar que la tabla servicios tiene el campo bonus_puntos

# Via SQL Editor:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'servicios' AND column_name = 'bonus_puntos';
```

### 5.2 Compilar y probar localmente

```bash
cd c:\Users\carli\OneDrive\Escritorio\novanoidai\Hairy
npm run build:web
node scripts/serve-web.mjs
```

Probar en:
- http://localhost:8080/app?demo=1 (modo demo)
- Verificar:
  - Pantalla de clientes muestra badges de nivel
  - Panel detalle muestra logros y sellos
  - Configuración > Fidelización permite editar niveles/logros/recompensas

### 5.3 Deploy a Vercel

```bash
# Desde la raíz del repo
vercel --prod
# O via dashboard de Vercel: "Deploy" > "Production"
```

---

## 6. Lista de verificación manual (tests)

### 6.1 Base de datos

- [ ] `servicios` tiene campo `bonus_puntos` con default 1
- [ ] `niveles_fidelizacion` tiene datos de demo (al menos 3 niveles)
- [ ] `logros` tiene al menos 1 logro de demo
- [ ] `recompensas` tiene al menos 1 recompensa de demo

### 6.2 Backend (RPCs)

- [ ] `obtener_nivel_cliente` retorna nivel correcto para cliente con visitas
- [ ] `verificar_logros_cliente` desbloquea "primera_visita" al completar primera cita
- [ ] `obtener_recompensas_negocio` lista recompensas del negocio
- [ ] `canjear_recompensa` falla si visitas < umbral

### 6.3 Frontend - Clientes

- [ ] Badge de nivel visible en tarjeta de cliente (color/icono correctos)
- [ ] Panel detalle muestra sección "Fidelización"
- [ ] Sellos totales calculados correctamente (sum de bonus_puntos)
- [ ] Logros mostrados como chips con iconos/colores
- [ ] Caducidad de sellos mostrada si aplica

### 6.4 Frontend - Configuración

- [ ] Tab "Fidelización" accesible desde configuración
- [ ] Sub-tabs: Recompensas, Niveles, Logros
- [ ] Crear nivel: nombre, umbrales, color, icono, orden
- [ ] Crear logro: nombre, tipo, condición
- [ ] Crear recompensa: nombre, tipo, valor, umbral, expiración
- [ ] Editar/borrar funciona correctamente
- [ ] Previsualización de colores funciona

### 6.5 Multi-tenant

- [ ] Cada negocio ve solo sus niveles/logros/recompensas
- [ ] Demo usa datos de demo_salon_001
- [ ] Cambio de negocio no filtra datos de otro

### 6.6 Responsive

- [ ] Móvil (<768px): badges legibles, sin overflow horizontal
- [ ] Tablet: tabs usables, layouts apilados correctamente
- [ ] Desktop: previsualización de niveles/recompensas clara

### 6.7 Bug conocido: nombres de tablas

**PROBLEMA:** El componente `configuracion-recompensas.web.tsx` usa nombres de tablas con sufijo `_fidelizacion`:
- `recompensas_fidelizacion` (pero la migración crea `recompensas`)
- `logros_fidelizacion` (pero la migración crea `logros`)

**SOLUCIÓN:** Actualizar el componente para usar los nombres correctos de las tablas:

```typescript
// En configuracion-recompensas.web.tsx, buscar y reemplazar:
// 'recompensas_fidelizacion' -> 'recompensas'
// 'logros_fidelizacion' -> 'logros'
```

O crear una migración que renombre las tablas (menos recomendado si ya hay datos).

---

## 7. Comandos útiles

### Verificar migración aplicada

```sql
-- En Supabase SQL Editor:
SELECT * FROM niveles_fidelizacion WHERE negocio_id = 'demo_salon_001';
SELECT * FROM logros WHERE negocio_id = 'demo_salon_001';
SELECT * FROM recompensas WHERE negocio_id = 'demo_salon_001';

-- Verificar campo bonus_puntos:
SELECT nombre, bonus_puntos FROM servicios WHERE bonus_puntos > 1;
```

### Seed datos de demo

```sql
-- Niveles demo
INSERT INTO niveles_fidelizacion (negocio_id, nombre, umbral_visitas, umbral_gastado_cents, color, icono, orden) VALUES
  ('demo_salon_001', 'Nuevo', 0, 0, '#9ca3af', 'star', 0),
  ('demo_salon_001', 'Habitual', 3, 5000, '#f59e0b', 'award', 1),
  ('demo_salon_001', 'VIP', 10, 20000, '#dc2626', 'trophy', 2)
ON CONFLICT DO NOTHING;

-- Logros demo
INSERT INTO logros (negocio_id, nombre, descripcion, tipo, condicion, icono, color) VALUES
  ('demo_salon_001', 'Primera visita', 'Completaste tu primera cita', 'primera_visita', '{}', 'sparkle', '#10b981'),
  ('demo_salon_001', 'Fiel', '5 citas completadas', 'visitas_multiple', '{"visitas": 5}', 'heart', '#ec4899'),
  ('demo_salon_001', 'Inverterido', 'Has gastado más de 100€', 'gastado_total', '{"gastado_cents": 10000}', 'euro', '#8b5cf6')
ON CONFLICT DO NOTHING;

-- Recompensas demo
INSERT INTO recompensas (negocio_id, nombre, descripcion, tipo, valor, umbral_visitas, expira_meses) VALUES
  ('demo_salon_001', 'Corte gratis', 'Un corte de cortesía', 'servicio', 'corte', 10, 12),
  ('demo_salon_001', '20% descuento', '20% en tu próximo servicio', 'descuento_pct', '20', 5, 6)
ON CONFLICT DO NOTHING;
```

### Verificar fidelización de cliente específico

```sql
-- Ver nivel actual
SELECT * FROM obtener_nivel_cliente('CLIENTE_UUID');

-- Ver logros desbloqueados
SELECT * FROM obtener_logros_desbloqueados('CLIENTE_UUID');

-- Verificar logros (trigger desbloqueo)
SELECT * FROM verificar_logros_cliente('CLIENTE_UUID');
```

---

## 8. Problemas conocidos y soluciones

### Problema: Niveles no se muestran en clientes

**Causa:** RPC `obtener_nivel_cliente` retorna null o error
**Solución:**
1. Verificar que `niveles_fidelizacion` tiene datos para el negocio
2. Verificar que `negocio_id` coincide entre cliente y niveles
3. Logs de consola en frontend

### Problema: Logros no se desbloquean

**Causa:** Trigger no se ejecuta tras completar cita
**Solución:**
1. Verificar que `verificar_logros_cliente` se llama al marcar cita como completada
2. Añadir trigger en BD o llamar RPC manualmente desde frontend
3. Considerar edge function para triggers automáticos

### Problema: Sellos no se calculan

**Causa:** Campo `bonus_puntos` es null en citas
**Solución:**
1. Verificar que `servicios.bonus_puntos` tiene default 1
2. Al crear cita, copiar `bonus_puntos` desde servicio
3. Backfill: `UPDATE citas SET bonus_puntos = 1 WHERE bonus_puntos IS NULL`

---

## 9. Archivos resumen

### Archivos creados

| Archivo | Propósito |
|---------|-----------|
| `migrations/servicios-bonus-puntos.sql` | Campo bonus_puntos en servicios |
| `migrations/niveles_fidelizacion.sql` | Referencia + seed de niveles (ya en recompensas.sql) |
| `migrations/logros.sql` | Referencia + seed de logros (ya en recompensas.sql) |
| `migrations/recompensas-nueva.sql` | Referencia + seed de recompensas (ya en recompensas.sql) |
| `lib/fidelizacion.ts` | Helpers de fidelización (niveles, logros, sellos) |

### Archivos a modificar

| Archivo | Modificación |
|---------|--------------|
| `app/(tabs)/clientes.web.tsx` | Badges de nivel, panel de fidelización |
| `app/(tabs)/configuracion.web.tsx` | Integrar TabRecompensas si falta |

### Archivos existentes (no tocar)

| Archivo | Contenido |
|---------|-----------|
| `migrations/recompensas.sql` | Tablas y RPCs base (ya existe) |
| `app/(tabs)/configuracion-recompensas.web.tsx` | Tab de configuración (ya existe) |

---

## 10. Tiempos estimados por tarea

| Tarea | Horas |
|-------|-------|
| Verificar migración existente | 0.5h |
| Crear migración servicios-bonus-puntos | 0.5h |
| Crear lib/fidelizacion.ts | 1.5h |
| Modificar clientes.web.tsx (badges + panel) | 2h |
| Mejorar configuración.web.tsx si falta | 0.5h |
| Testing manual | 1h |
| Deploy y verificación | 0.5h |
| **Total** | **6.5h** |
