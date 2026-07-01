-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN COMPLETA: Inventario v0 para Mecha
--
-- INSTRUCCIONES:
-- 1. Abrir Dashboard de Supabase: https://vtrggiogjrhqtwbhbgia.supabase.co
-- 2. Ir a SQL Editor (icono </> en el sidebar)
-- 3. Copiar TODO este archivo y pegarlo en el editor
-- 4. Click en "Run" para ejecutar
-- 5. Verificar que no haya errores en la consola
--
-- Autor: Carlos + Claude (1 jul 2026)
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- PARTE 1: SCHEMA (inventario-v0.sql)
-- ===============================================================================

-- 1. TABLA DE PRODUCTOS (catálogo)
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

-- Comentarios
comment on table productos is 'Catálogo de productos vendibles (configuración del negocio)';
comment on column productos.stock_minimo is 'Umbral para alerta de stock bajo';

-- 2. TABLA DE INVENTARIO (stock actual)
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

comment on table inventario is 'Stock actual de productos por negocio';

-- 3. TABLA DE MOVIMIENTOS DE INVENTARIO (historial)
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

comment on table movimientos_inventario is 'Historial de movimientos de stock (entradas/salidas/ajustes)';

-- 4. RLS (Row Level Security)
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

-- 5. TRIGGER: Actualizar updated_at en productos
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

-- 6. VISTA: Productos con stock actual
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

-- ===============================================================================
-- PARTE 2: RPCS (inventario-rpcs.sql)
-- ===============================================================================

-- 1. OBTENER INVENTARIO
create or replace function obtener_inventario(
  p_solo_activos boolean default true,
  p_categoria text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Obtener negocio_id del usuario actual
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Construir resultado
  select jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'nombre', ps.nombre,
      'descripcion', ps.descripcion,
      'categoria', ps.categoria,
      'precio_cents', ps.precio_cents,
      'precio', (ps.precio_cents::numeric / 100)::numeric(10,2),
      'iva_porcentaje', ps.iva_porcentaje,
      'stock_minimo', ps.stock_minimo,
      'stock_actual', ps.stock_actual,
      'stock_bajo', ps.stock_bajo,
      'ubicacion', ps.ubicacion,
      'codigo_barras', ps.codigo_barras,
      'imagen_url', ps.imagen_url,
      'proveedor', ps.proveedor,
      'activo', ps.activo,
      'ultima_modificacion', ps.stock_ultima_modificacion
    )
  ) into v_resultado
  from productos_con_stock ps
  where ps.negocio_id = v_negocio_id
    and (not p_solo_activos or ps.activo = true)
    and (p_categoria is null or ps.categoria = p_categoria)
  order by ps.stock_bajo desc, ps.nombre;

  return jsonb_build_object(
    'ok', true,
    'productos', coalesce(v_resultado, '[]'::jsonb),
    'total', coalesce(jsonb_array_length(coalesce(v_resultado, '[]'::jsonb)), 0)
  );
end;
$$;

grant execute on function obtener_inventario to authenticated;

comment on function obtener_inventario is 'Lista productos del negocio con stock actual';

-- 2. OBTENER PRODUCTO
create or replace function obtener_producto(
  p_producto_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_producto productos_con_stock%rowtype;
begin
  -- Obtener negocio_id del usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Obtener producto
  select * into v_producto
  from productos_con_stock
  where id = p_producto_id and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Producto no encontrado'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'producto', jsonb_build_object(
      'id', v_producto.id,
      'nombre', v_producto.nombre,
      'descripcion', v_producto.descripcion,
      'categoria', v_producto.categoria,
      'precio_cents', v_producto.precio_cents,
      'precio', (v_producto.precio_cents::numeric / 100)::numeric(10,2),
      'iva_porcentaje', v_producto.iva_porcentaje,
      'stock_minimo', v_producto.stock_minimo,
      'stock_actual', v_producto.stock_actual,
      'stock_bajo', v_producto.stock_bajo,
      'ubicacion', v_producto.ubicacion,
      'codigo_barras', v_producto.codigo_barras,
      'imagen_url', v_producto.imagen_url,
      'proveedor', v_producto.proveedor,
      'activo', v_producto.activo,
      'created_at', v_producto.created_at,
      'ultima_modificacion', v_producto.stock_ultima_modificacion
    )
  );
end;
$$;

grant execute on function obtener_producto to authenticated;

-- 3. CREAR PRODUCTO
create or replace function crear_producto(
  p_nombre text,
  p_descripcion text default null,
  p_categoria text default 'general',
  p_precio_cents integer default 0,
  p_iva_porcentaje numeric default 21.00,
  p_stock_minimo integer default 5,
  p_codigo_barras text default null,
  p_imagen_url text default null,
  p_proveedor text default null,
  p_inicial_unidades integer default 0,
  p_ubicacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_nuevo_id uuid;
  v_inventario_id uuid;
begin
  -- Obtener negocio_id
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Crear producto
  insert into productos (
    negocio_id,
    nombre,
    descripcion,
    categoria,
    precio_cents,
    iva_porcentaje,
    stock_minimo,
    codigo_barras,
    imagen_url,
    proveedor
  ) values (
    v_negocio_id,
    p_nombre,
    p_descripcion,
    p_categoria,
    p_precio_cents,
    p_iva_porcentaje,
    p_stock_minimo,
    p_codigo_barras,
    p_imagen_url,
    p_proveedor
  ) returning id into v_nuevo_id;

  -- Crear entrada de inventario (si se especifican unidades iniciales)
  if p_inicial_unidades > 0 then
    insert into inventario (
      negocio_id,
      producto_id,
      unidades,
      ubicacion,
      ultima_modificacion,
      modificado_por
    ) values (
      v_negocio_id,
      v_nuevo_id,
      p_inicial_unidades,
      p_ubicacion,
      now(),
      auth.uid()
    ) returning id into v_inventario_id;

    -- Registrar movimiento inicial
    insert into movimientos_inventario (
      negocio_id,
      producto_id,
      tipo,
      unidades,
      motivo,
      creado_por
    ) values (
      v_negocio_id,
      v_nuevo_id,
      'entrada',
      p_inicial_unidades,
      'Stock inicial',
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'producto_id', v_nuevo_id,
    'inventario_id', v_inventario_id
  );
end;
$$;

grant execute on function crear_producto to authenticated;

-- 4. ACTUALIZAR PRODUCTO
create or replace function actualizar_producto(
  p_producto_id uuid,
  p_nombre text default null,
  p_descripcion text default null,
  p_categoria text default null,
  p_precio_cents integer default null,
  p_iva_porcentaje numeric default null,
  p_stock_minimo integer default null,
  p_codigo_barras text default null,
  p_imagen_url text default null,
  p_proveedor text default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
begin
  -- Obtener negocio_id
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Actualizar producto (solo campos proporcionados)
  update productos
  set
    nombre = coalesce(p_nombre, nombre),
    descripcion = coalesce(p_descripcion, descripcion),
    categoria = coalesce(p_categoria, categoria),
    precio_cents = coalesce(p_precio_cents, precio_cents),
    iva_porcentaje = coalesce(p_iva_porcentaje, iva_porcentaje),
    stock_minimo = coalesce(p_stock_minimo, stock_minimo),
    codigo_barras = coalesce(p_codigo_barras, codigo_barras),
    imagen_url = coalesce(p_imagen_url, imagen_url),
    proveedor = coalesce(p_proveedor, proveedor),
    activo = coalesce(p_activo, activo),
    updated_at = now()
  where id = p_producto_id and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Producto no encontrado'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'producto_id', p_producto_id
  );
end;
$$;

grant execute on function actualizar_producto to authenticated;

-- 5. REGISTRAR MOVIMIENTO DE INVENTARIO
create or replace function registrar_movimiento_inventario(
  p_producto_id uuid,
  p_tipo text,
  p_unidades integer,
  p_motivo text default null,
  p_referencia_id uuid default null,
  p_referencia_tipo text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_producto productos%rowtype;
  v_stock_actual integer;
  v_inventario_id uuid;
  v_movimiento_id uuid;
  v_nuevo_stock integer;
begin
  -- Validar usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Validar tipo
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Tipo de movimiento no válido'
    );
  end if;

  -- Obtener producto
  select * into v_producto
  from productos
  where id = p_producto_id and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Producto no encontrado'
    );
  end if;

  -- Obtener stock actual
  select coalesce(unidades, 0), id into v_stock_actual, v_inventario_id
  from inventario
  where producto_id = p_producto_id and negocio_id = v_negocio_id;

  -- Calcular nuevo stock
  if p_tipo = 'entrada' then
    v_nuevo_stock := v_stock_actual + p_unidades;
  elsif p_tipo = 'salida' then
    v_nuevo_stock := v_stock_actual - p_unidades;
    if v_nuevo_stock < 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'Stock insuficiente',
        'stock_actual', v_stock_actual,
        'solicitado', p_unidades
      );
    end if;
  else -- ajuste
    v_nuevo_stock := p_unidades; -- Ajuste establece el stock directamente
  end if;

  -- Actualizar o crear entrada de inventario
  if v_inventario_id is null then
    insert into inventario (
      negocio_id,
      producto_id,
      unidades,
      ultima_modificacion,
      modificado_por
    ) values (
      v_negocio_id,
      p_producto_id,
      v_nuevo_stock,
      now(),
      auth.uid()
    ) returning id into v_inventario_id;
  else
    update inventario
    set
      unidades = v_nuevo_stock,
      ultima_modificacion = now(),
      modificado_por = auth.uid()
    where id = v_inventario_id;
  end if;

  -- Registrar movimiento
  insert into movimientos_inventario (
    negocio_id,
    producto_id,
    tipo,
    unidades,
    motivo,
    referencia_id,
    referencia_tipo,
    creado_por,
    notas
  ) values (
    v_negocio_id,
    p_producto_id,
    p_tipo,
    case when p_tipo = 'ajuste' then v_nuevo_stock - v_stock_actual else p_unidades end,
    p_motivo,
    p_referencia_id,
    p_referencia_tipo,
    auth.uid(),
    p_notas
  ) returning id into v_movimiento_id;

  return jsonb_build_object(
    'ok', true,
    'movimiento_id', v_movimiento_id,
    'stock_anterior', v_stock_actual,
    'stock_nuevo', v_nuevo_stock,
    'diferencia', v_nuevo_stock - v_stock_actual
  );
end;
$$;

grant execute on function registrar_movimiento_inventario to authenticated;

-- 6. OBTENER MOVIMIENTOS
create or replace function obtener_movimientos_inventario(
  p_producto_id uuid default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_tipo text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Validar usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Construir resultado
  select jsonb_agg(
    jsonb_build_object(
      'id', mi.id,
      'producto_id', mi.producto_id,
      'producto_nombre', p.nombre,
      'tipo', mi.tipo,
      'unidades', mi.unidades,
      'motivo', mi.motivo,
      'referencia_id', mi.referencia_id,
      'referencia_tipo', mi.referencia_tipo,
      'notas', mi.notas,
      'creado_por', (
        select nombre from profiles where id = mi.creado_por
      ),
      'created_at', mi.created_at
    )
  ) into v_resultado
  from movimientos_inventario mi
  join productos p on p.id = mi.producto_id
  where mi.negocio_id = v_negocio_id
    and (p_producto_id is null or mi.producto_id = p_producto_id)
    and (p_desde is null or mi.created_at >= p_desde)
    and (p_hasta is null or mi.created_at <= p_hasta)
    and (p_tipo is null or mi.tipo = p_tipo)
  order by mi.created_at desc
  limit p_limit;

  return jsonb_build_object(
    'ok', true,
    'movimientos', coalesce(v_resultado, '[]'::jsonb)
  );
end;
$$;

grant execute on function obtener_movimientos_inventario to authenticated;

-- 7. PRODUCTOS STOCK BAJO
create or replace function productos_stock_bajo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Validar usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Construir resultado
  select jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'nombre', ps.nombre,
      'categoria', ps.categoria,
      'stock_actual', ps.stock_actual,
      'stock_minimo', ps.stock_minimo,
      'faltantes', ps.stock_minimo - ps.stock_actual,
      'ubicacion', ps.ubicacion,
      'proveedor', ps.proveedor
    )
  ) into v_resultado
  from productos_con_stock ps
  where ps.negocio_id = v_negocio_id
    and ps.stock_bajo = true
    and ps.activo = true
  order by (ps.stock_minimo - ps.stock_actual) desc;

  return jsonb_build_object(
    'ok', true,
    'alertas', coalesce(v_resultado, '[]'::jsonb),
    'total', coalesce(jsonb_array_length(coalesce(v_resultado, '[]'::jsonb)), 0)
  );
end;
$$;

grant execute on function productos_stock_bajo to authenticated;

comment on function productos_stock_bajo is 'Lista productos con stock por debajo del mínimo';

-- 8. ELIMINAR PRODUCTO (soft delete)
create or replace function eliminar_producto(
  p_producto_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
begin
  -- Validar usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Soft delete (marcar como inactivo)
  update productos
  set activo = false, updated_at = now()
  where id = p_producto_id and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Producto no encontrado'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'producto_id', p_producto_id
  );
end;
$$;

grant execute on function eliminar_producto to authenticated;

-- 9. OBTENER CATEGORÍAS
create or replace function obtener_categorias_productos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Validar usuario
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Obtener categorías únicas
  select jsonb_agg(
    jsonb_build_object(
      'categoria', categoria,
      'total', count(*)
    )
  ) into v_resultado
  from (
    select distinct categoria
    from productos
    where negocio_id = v_negocio_id and activo = true
    order by categoria
  ) c;

  return jsonb_build_object(
    'ok', true,
    'categorias', coalesce(v_resultado, '[]'::jsonb)
  );
end;
$$;

grant execute on function obtener_categorias_productos to authenticated;

-- ────────────────────────────────────────────────────────────────────────────────
-- FIN DE MIGRACIÓN
-- Verifica que no haya errores arriba y que todas las funciones se hayan creado
-- ────────────────────────────────────────────────────────────────────────────────
