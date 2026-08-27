-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Inventario v0 - Schema básico
-- Autor: Carlos + Claude (1 jul 2026)
--
-- MVP de inventario para peluquerías:
--   - Productos (catálogo)
--   - Stock actual
--   - Movimientos (historial de entradas/salidas)
--   - Alertas de stock bajo
--
-- NOTA: v0 NO incluye integración automática con cobros (v2)
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. TABLA DE PRODUCTOS (catálogo)
--    Productos que el negocio vende (shampoos, tintes, accesorios...)
-- ===============================================================================
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Información del producto
  nombre text not null,
  descripcion text,
  categoria text default 'general', -- shampoo, color, tratamiento, accesorios...

  -- Datos de venta
  precio_cents integer not null default 0,
  iva_porcentaje numeric(5,2) default 21.00,

  -- Control de stock
  stock_minimo integer not null default 5,
  activo boolean not null default true,

  -- Metadatos
  codigo_barras text, -- Opcional, para escanear
  imagen_url text,    -- Opcional
  proveedor text,     -- Opcional, v2

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Constraint
  constraint productos_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists productos_negocio on productos(negocio_id, activo);
create index if not exists productos_categoria on productos(negocio_id, categoria);
create index if not exists productos_codigo_barras on productos(codigo_barras) where codigo_barras is not null;

-- Comentario
comment on table productos is 'Catálogo de productos vendibles (configuración del negocio)';
comment on column productos.stock_minimo is 'Umbral para alerta de stock bajo';

-- ===============================================================================
-- 2. TABLA DE INVENTARIO (stock actual)
--    Stock actual de cada producto en el negocio
-- ===============================================================================
create table if not exists inventario (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  producto_id uuid not null references productos(id) on delete cascade,

  -- Stock actual
  unidades integer not null default 0,

  -- Ubicación física
  ubicacion text, -- estantería A, cajón 2...

  -- Control
  ultima_modificacion timestamptz not null default now(),
  modificado_por uuid references profiles(id),

  -- Constraint
  constraint inventario_negocio_check check (negocio_id is not null),
  constraint inventario_producto_unico unique (negocio_id, producto_id)
);

-- Índices
create index if not exists inventario_negocio on inventario(negocio_id);
create index if not exists inventario_producto on inventario(producto_id);
create index if not exists inventario_stock_bajo on inventario(negocio_id, unidades) where unidades < 100;

-- Comentario
comment on table inventario is 'Stock actual de productos por negocio';

-- ===============================================================================
-- 3. TABLA DE MOVIMIENTOS DE INVENTARIO (historial)
--    Registro de todas las entradas y salidas de stock
-- ===============================================================================
create table if not exists movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  producto_id uuid not null references productos(id) on delete cascade,

  -- Tipo de movimiento
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),

  -- Cantidad (positivo para entrada, negativo para salida)
  unidades integer not null,

  -- Contexto
  motivo text, -- venta, reabastecimiento, merma, caducidad, ajuste...
  referencia_id uuid, -- cita_id, cobro_id, pedido_id...
  referencia_tipo text, -- cita, cobro, pedido...

  -- Quién y cuándo
  creado_por uuid references profiles(id),
  created_at timestamptz not null default now(),

  -- Notas adicionales
  notas text,

  -- Constraint
  constraint movimientos_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists movimientos_negocio on movimientos_inventario(negocio_id, created_at desc);
create index if not exists movimientos_producto on movimientos_inventario(producto_id, created_at desc);
create index if not exists movimientos_referencia on movimientos_inventario(referencia_id) where referencia_id is not null;

-- Comentario
comment on table movimientos_inventario is 'Historial de movimientos de stock (entradas/salidas/ajustes)';

-- ===============================================================================
-- 4. RLS (Row Level Security)
-- ===============================================================================

-- Habilitar RLS
alter table productos enable row level security;
alter table inventario enable row level security;
alter table movimientos_inventario enable row level security;

-- Políticas para productos
drop policy if exists productos_negocio_all on productos;
create policy productos_negocio_all
  on productos for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para inventario
drop policy if exists inventario_negocio_all on inventario;
create policy inventario_negocio_all
  on inventario for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para movimientos_inventario
drop policy if exists movimientos_inventario_negocio_all on movimientos_inventario;
create policy movimientos_inventario_negocio_all
  on movimientos_inventario for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- ===============================================================================
-- 5. TRIGGER: Actualizar updated_at en productos
-- ===============================================================================
create or replace function actualizar_productos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists productos_updated_at on productos;
create trigger productos_updated_at
  before update on productos
  for each row
  execute function actualizar_productos_updated_at();

-- ===============================================================================
-- 6. VISTA: Productos con stock actual
-- ===============================================================================
create or replace view productos_con_stock as
select
  p.id,
  p.negocio_id,
  p.nombre,
  p.descripcion,
  p.categoria,
  p.precio_cents,
  p.iva_porcentaje,
  p.stock_minimo,
  p.activo,
  p.codigo_barras,
  p.imagen_url,
  p.proveedor,
  p.created_at,
  p.updated_at,
  coalesce(i.unidades, 0) as stock_actual,
  i.ubicacion,
  i.ultima_modificacion as stock_ultima_modificacion,
  -- Indicador de stock bajo
  case
    when coalesce(i.unidades, 0) < p.stock_minimo then true
    else false
  end as stock_bajo,
  -- Días de stock (asumiendo consumo medio - placeholder, v2)
  case
    when coalesce(i.unidades, 0) = 0 then 0
    else null -- v2: calcular según consumo histórico
  end as dias_stock
from productos p
left join inventario i on i.producto_id = p.id;

comment on view productos_con_stock is 'Productos con su stock actual e indicador de stock bajo';
