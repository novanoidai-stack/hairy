-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Productos usados en una cita (integración inventario ↔ cita)
-- Autor: Alexandru + Claude
--
-- Cierra el "v2" que dejaba pendiente inventario-v0.sql: los productos que se
-- gastan en una cita quedan registrados, descuentan stock y su precio entra en
-- el cobro (el front los pasa al CobroSheet como líneas).
--
-- Decisión de producto: el stock se descuenta AL AÑADIR el producto a la cita
-- (el bote sale de la estantería cuando se usa, no cuando se cobra) y se
-- devuelve al quitarlo. Cada movimiento queda en movimientos_inventario con
-- referencia_tipo='cita'.
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. TABLA: productos usados en una cita
--    nombre/precio_cents se guardan COPIADOS: si mañana cambias el catálogo,
--    el histórico de la cita no se altera.
-- ===============================================================================
create table if not exists cita_productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cita_id uuid not null references public.citas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,

  nombre text not null,
  precio_cents integer not null default 0,
  cantidad integer not null default 1 check (cantidad > 0),

  created_at timestamptz not null default now(),

  constraint cita_productos_negocio_check check (negocio_id is not null),
  constraint cita_productos_unico unique (cita_id, producto_id)
);

create index if not exists cita_productos_cita on cita_productos(cita_id);
create index if not exists cita_productos_negocio on cita_productos(negocio_id);

comment on table cita_productos is 'Productos gastados en una cita (entran en el cobro y descuentan stock)';

-- ===============================================================================
-- 2. RLS: multi-tenant por negocio_id, igual que el resto
-- ===============================================================================
alter table cita_productos enable row level security;

drop policy if exists cita_productos_negocio_all on cita_productos;
create policy cita_productos_negocio_all
  on cita_productos for all
  to authenticated
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

-- ===============================================================================
-- 3. RPC: añadir un producto a la cita
--    Atómico: alta/incremento en cita_productos + descuento de stock +
--    movimiento de inventario. SECURITY INVOKER => la RLS del usuario aplica,
--    así que solo puede tocar su propio negocio.
-- ===============================================================================
create or replace function cita_producto_add(p_cita_id uuid, p_producto_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio text;
  v_nombre  text;
  v_precio  integer;
begin
  select p.negocio_id, p.nombre, p.precio_cents
    into v_negocio, v_nombre, v_precio
    from public.productos p
   where p.id = p_producto_id;

  if v_negocio is null then
    raise exception 'Producto no encontrado o sin acceso';
  end if;

  insert into public.cita_productos
    (negocio_id, cita_id, producto_id, nombre, precio_cents, cantidad)
  values
    (v_negocio, p_cita_id, p_producto_id, v_nombre, v_precio, 1)
  on conflict (cita_id, producto_id)
  do update set cantidad = public.cita_productos.cantidad + 1;

  -- Descontar stock. Si el producto aún no tenía fila de inventario, se crea
  -- en -1: refleja que se ha usado algo que no estaba dado de alta en stock.
  insert into public.inventario (negocio_id, producto_id, unidades)
  values (v_negocio, p_producto_id, -1)
  on conflict (negocio_id, producto_id)
  do update set unidades = public.inventario.unidades - 1,
                ultima_modificacion = now();

  insert into public.movimientos_inventario
    (negocio_id, producto_id, tipo, unidades, motivo, referencia_id, referencia_tipo, creado_por)
  values
    (v_negocio, p_producto_id, 'salida', -1, 'Usado en cita', p_cita_id, 'cita', auth.uid());
end;
$$;

-- ===============================================================================
-- 4. RPC: quitar una unidad del producto de la cita (devuelve stock)
-- ===============================================================================
create or replace function cita_producto_remove(p_cita_id uuid, p_producto_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_negocio  text;
  v_cantidad integer;
begin
  select cp.negocio_id, cp.cantidad
    into v_negocio, v_cantidad
    from public.cita_productos cp
   where cp.cita_id = p_cita_id and cp.producto_id = p_producto_id;

  if v_cantidad is null then
    return; -- no estaba: nada que hacer
  end if;

  if v_cantidad > 1 then
    update public.cita_productos
       set cantidad = cantidad - 1
     where cita_id = p_cita_id and producto_id = p_producto_id;
  else
    delete from public.cita_productos
     where cita_id = p_cita_id and producto_id = p_producto_id;
  end if;

  update public.inventario
     set unidades = unidades + 1,
         ultima_modificacion = now()
   where negocio_id = v_negocio and producto_id = p_producto_id;

  insert into public.movimientos_inventario
    (negocio_id, producto_id, tipo, unidades, motivo, referencia_id, referencia_tipo, creado_por)
  values
    (v_negocio, p_producto_id, 'entrada', 1, 'Quitado de cita', p_cita_id, 'cita', auth.uid());
end;
$$;

-- ===============================================================================
-- 5. Permisos: solo usuarios autenticados (nunca anon, ver §4 de CLAUDE.md)
-- ===============================================================================
revoke all on function cita_producto_add(uuid, uuid) from public, anon;
revoke all on function cita_producto_remove(uuid, uuid) from public, anon;
grant execute on function cita_producto_add(uuid, uuid) to authenticated;
grant execute on function cita_producto_remove(uuid, uuid) to authenticated;
