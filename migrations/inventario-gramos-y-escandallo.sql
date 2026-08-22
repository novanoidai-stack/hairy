-- Inventario en gramos y mililitros, y coste real del producto por servicio.
--
-- El inventario v0 contaba UNIDADES enteras, que sirve para vender champu pero
-- no para la zona tecnica: un tinte no se gasta en botes, se gasta en gramos.
-- Un salon que aplica 45 g de un tubo de 60 no ha gastado "un bote", ha gastado
-- tres cuartos, y hasta que no se sabe eso no se puede decir cuanto cuesta de
-- verdad una cobertura de canas ni cual es el margen.
--
-- DECISION: el stock se guarda SIEMPRE en la unidad base del producto (gramos,
-- mililitros o unidades) en la columna que ya existe, `inventario.unidades`.
-- No se renombra ni se parte en dos ("botes cerrados" + "gramos sueltos")
-- porque eso obliga a mantener dos numeros coherentes entre si y a decidir que
-- pasa cuando no cuadran. Con un solo entero, los envases cerrados y el bote
-- empezado son una division: 75 g con envases de 60 son 1 cerrado y 15 sueltos.
--
-- Retrocompatible: un producto que no diga nada sigue siendo 'unidades' y todo
-- lo que ya funcionaba sigue igual.

-- ─────────────── 1. Como se mide y cuanto cuesta cada producto ───────────────

alter table public.productos
  add column if not exists unidad_medida text not null default 'unidades',
  -- Cantidad de unidad base que trae un envase: 60 g el tubo, 1000 ml la garrafa.
  add column if not exists capacidad_envase integer,
  -- Lo que cuesta COMPRAR un envase (sin IVA). Distinto de precio_cents, que es
  -- lo que el salon cobra al cliente si lo revende.
  add column if not exists coste_envase_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_unidad_medida_check') then
    alter table public.productos add constraint productos_unidad_medida_check
      check (unidad_medida in ('unidades', 'gramos', 'mililitros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_capacidad_envase_check') then
    alter table public.productos add constraint productos_capacidad_envase_check
      check (capacidad_envase is null or capacidad_envase > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_coste_envase_check') then
    alter table public.productos add constraint productos_coste_envase_check
      check (coste_envase_cents is null or coste_envase_cents >= 0);
  end if;
end $$;

comment on column public.productos.unidad_medida is
  'En que se mide el stock: unidades (venta), gramos o mililitros (zona tecnica).';
comment on column public.productos.capacidad_envase is
  'Cantidad de unidad base por envase: 60 g un tubo de tinte, 1000 ml una garrafa de oxidante.';
comment on column public.productos.coste_envase_cents is
  'Coste de compra de UN envase, sin IVA. De aqui sale el coste por gramo del escandallo.';

comment on column public.inventario.unidades is
  'Stock en la UNIDAD BASE del producto (gramos, mililitros o unidades), no en envases.';

-- ─────────────── 2. Coste por unidad base (el gramo de tinte) ───────────────
--
-- Se redondea igual que en el cliente (lib/inventario/escandallo.ts): la
-- division entera de Postgres trunca, y dos numeros distintos para lo mismo
-- acaban en un "aqui no cuadra" que cuesta una tarde.
--
-- En millonesimas de euro y no en centimos a proposito: un gramo de tinte
-- cuesta del orden de 0,14 EUR, y redondeando a centimos por gramo el coste de
-- una mezcla de 50 g se iria facilmente un 20% arriba o abajo.
create or replace function public.coste_por_unidad_micros(p_producto_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.coste_envase_cents is null or p.capacidad_envase is null or p.capacidad_envase = 0
      then null
    else round((p.coste_envase_cents::numeric * 10000) / p.capacidad_envase)::bigint
  end
  from productos p
  where p.id = p_producto_id
    and p.negocio_id = (select my_negocio_id_text());
$$;

revoke all on function public.coste_por_unidad_micros(uuid) from public, anon;
grant execute on function public.coste_por_unidad_micros(uuid) to authenticated, service_role;

-- ─────────────── 3. La vista, con lo que hace falta para la zona tecnica ─────
--
-- Se añade al final: create or replace view no deja cambiar las columnas que ya
-- estaban, y todo lo que consulta la app las espera donde estan.
-- OJO: security_invoker es lo que hace que la vista respete la RLS de productos.
-- Sin el, la vista se ejecuta como su dueño y un anonimo veria el inventario de
-- TODOS los salones (la vista tiene select concedido a anon de serie). Se
-- comprobo antes de tocarla: hoy anon ve 0 filas, y tiene que seguir asi.
drop view if exists public.productos_con_stock;
create view public.productos_con_stock with (security_invoker = true) as
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
  case when coalesce(i.unidades, 0) < p.stock_minimo then true else false end as stock_bajo,
  case when coalesce(i.unidades, 0) = 0 then 0 else null end as dias_stock,
  -- Nuevo en la zona tecnica
  p.unidad_medida,
  p.capacidad_envase,
  p.coste_envase_cents,
  -- Envases sin abrir y lo que queda del empezado. Sin capacidad de envase no
  -- hay envases que contar: el stock es lo que es.
  case when p.capacidad_envase is null or p.capacidad_envase = 0 then null
       else coalesce(i.unidades, 0) / p.capacidad_envase end as envases_cerrados,
  case when p.capacidad_envase is null or p.capacidad_envase = 0 then null
       else coalesce(i.unidades, 0) % p.capacidad_envase end as resto_abierto,
  case when p.coste_envase_cents is null or p.capacidad_envase is null or p.capacidad_envase = 0 then null
       else round((p.coste_envase_cents::numeric * 10000) / p.capacidad_envase)::bigint end as coste_unidad_micros
from productos p
left join inventario i on i.producto_id = p.id;

comment on view public.productos_con_stock is
  'Productos con su stock en unidad base, envases cerrados/abierto y coste por gramo.';

-- Al recrear la vista se pierden los grants: se devuelven los que tenia, pero
-- solo lectura y sin anon (el inventario no es cosa del portal publico).
grant select on public.productos_con_stock to authenticated, service_role;

-- ─────────────── 4. Lo que se ha gastado en cada cita ───────────────
--
-- Distinta de cita_productos, que es lo que se VENDE a la clienta (un champu
-- que se lleva a casa). Esto es lo que se GASTA en atenderla: 45 g de tinte,
-- 75 ml de oxidante. No se cobra aparte, pero se come el margen.
create table if not exists public.cita_consumos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cita_id uuid not null references public.citas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  -- En la unidad base del producto.
  cantidad integer not null check (cantidad > 0),
  -- Coste congelado en el momento de gastarlo: si mañana sube el proveedor, el
  -- margen de la cita de hoy no puede cambiar sola.
  coste_micros bigint not null default 0,
  creado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_cita_consumos_cita on public.cita_consumos (cita_id);
create index if not exists idx_cita_consumos_negocio on public.cita_consumos (negocio_id, created_at desc);

alter table public.cita_consumos enable row level security;

drop policy if exists "cita_consumos_select_propio" on public.cita_consumos;
create policy "cita_consumos_select_propio" on public.cita_consumos
  for select using (negocio_id = (select my_negocio_id_text()));

drop policy if exists "cita_consumos_insert_propio" on public.cita_consumos;
create policy "cita_consumos_insert_propio" on public.cita_consumos
  for insert with check (negocio_id = (select my_negocio_id_text()));

drop policy if exists "cita_consumos_delete_propio" on public.cita_consumos;
create policy "cita_consumos_delete_propio" on public.cita_consumos
  for delete using (negocio_id = (select my_negocio_id_text()));

drop policy if exists "cita_consumos_demo_block_insert" on public.cita_consumos;
create policy "cita_consumos_demo_block_insert" on public.cita_consumos
  as restrictive for insert with check (not (select is_shared_demo_visitor()));

drop policy if exists "cita_consumos_demo_block_delete" on public.cita_consumos;
create policy "cita_consumos_demo_block_delete" on public.cita_consumos
  as restrictive for delete using (not (select is_shared_demo_visitor()));

-- ─────────────── 5. Apuntar el gasto y descontarlo, de una vez ───────────────
--
-- Todo en la misma funcion para que no pueda quedarse a medias: apuntado el
-- consumo pero sin descontar del stock, o al reves. El descuento va con un
-- update aritmetico (unidades = unidades - x) y no leyendo-y-escribiendo, que
-- es como dos coloristas preparando mezcla a la vez se pisan el stock.
create or replace function public.registrar_consumo_cita(
  p_cita_id uuid,
  p_producto_id uuid,
  p_cantidad integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_coste bigint;
  v_stock integer;
  v_id uuid;
begin
  v_negocio := (select my_negocio_id_text());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'La cantidad tiene que ser mayor que cero');
  end if;

  -- La cita y el producto tienen que ser de este salon. Sin esto, al ser
  -- security definer, se podria apuntar gasto en la cita de otro.
  if not exists (select 1 from citas c where c.id = p_cita_id and c.negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Esa cita no es de este salon');
  end if;
  if not exists (select 1 from productos p where p.id = p_producto_id and p.negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Ese producto no es de este salon');
  end if;

  select case
    when p.coste_envase_cents is null or p.capacidad_envase is null or p.capacidad_envase = 0 then 0
    else round((p.coste_envase_cents::numeric * 10000) / p.capacidad_envase)::bigint
  end into v_coste
  from productos p where p.id = p_producto_id;

  insert into cita_consumos (negocio_id, cita_id, producto_id, cantidad, coste_micros, creado_por)
  values (v_negocio, p_cita_id, p_producto_id, p_cantidad, coalesce(v_coste, 0) * p_cantidad, auth.uid())
  returning id into v_id;

  insert into inventario (negocio_id, producto_id, unidades)
  values (v_negocio, p_producto_id, -p_cantidad)
  on conflict (negocio_id, producto_id) do update
    set unidades = inventario.unidades - p_cantidad,
        ultima_modificacion = now(),
        modificado_por = auth.uid()
  returning unidades into v_stock;

  insert into movimientos_inventario
    (negocio_id, producto_id, tipo, unidades, motivo, referencia_id, referencia_tipo, creado_por)
  values
    (v_negocio, p_producto_id, 'salida', p_cantidad, 'Consumo en cita', p_cita_id, 'cita', auth.uid());

  return jsonb_build_object(
    'ok', true,
    'consumo_id', v_id,
    'stock_restante', v_stock,
    'coste_micros', coalesce(v_coste, 0) * p_cantidad
  );
end;
$$;

revoke all on function public.registrar_consumo_cita(uuid, uuid, integer) from public, anon;
grant execute on function public.registrar_consumo_cita(uuid, uuid, integer) to authenticated, service_role;

-- ─────────────── 6. Que la pantalla reciba la medida ───────────────
--
-- obtener_inventario devuelve jsonb, asi que añadirle claves no rompe a quien
-- ya lo usa.
--
-- OJO con el ORDER BY: en migrations/inventario-rpcs.sql cuelga del select
-- agregado en vez de ir dentro de jsonb_agg, y asi la funcion revienta con
-- 42803 ("must appear in the GROUP BY clause") en cuanto alguien la llama. En
-- el remoto habia una version corregida a mano que no estaba en ningun archivo,
-- y reescribir la funcion desde el archivo la piso: la pantalla de inventario
-- dejo de cargar hasta que se arreglo. El orden va DENTRO del agregado, que
-- ademas es el unico sitio donde significa algo.
create or replace function public.obtener_inventario(
  p_solo_activos boolean default true,
  p_categoria text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  select negocio_id into v_negocio_id from profiles where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no válido');
  end if;

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
      'ultima_modificacion', ps.stock_ultima_modificacion,
      'unidad_medida', ps.unidad_medida,
      'capacidad_envase', ps.capacidad_envase,
      'coste_envase_cents', ps.coste_envase_cents,
      'envases_cerrados', ps.envases_cerrados,
      'resto_abierto', ps.resto_abierto,
      'coste_unidad_micros', ps.coste_unidad_micros
    )
    order by ps.stock_bajo desc, ps.nombre
  ) into v_resultado
  from productos_con_stock ps
  where ps.negocio_id = v_negocio_id
    and (not p_solo_activos or ps.activo = true)
    and (p_categoria is null or ps.categoria = p_categoria);

  return jsonb_build_object(
    'ok', true,
    'productos', coalesce(v_resultado, '[]'::jsonb),
    'total', coalesce(jsonb_array_length(coalesce(v_resultado, '[]'::jsonb)), 0)
  );
end;
$fn$;

grant execute on function public.obtener_inventario to authenticated;

-- Guardar como se mide un producto y lo que cuesta el envase. Aparte de
-- crear_producto a proposito: la tarifa de la zona tecnica se rellena despues,
-- en una sentada, no al dar de alta el champu.
create or replace function public.actualizar_medida_producto(
  p_producto_id uuid,
  p_unidad_medida text,
  p_capacidad_envase integer default null,
  p_coste_envase_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
begin
  v_negocio := (select my_negocio_id_text());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;

  if p_unidad_medida not in ('unidades', 'gramos', 'mililitros') then
    return jsonb_build_object('ok', false, 'error', 'Unidad de medida no valida');
  end if;

  -- Medir en gramos sin decir cuanto trae el envase deja el stock sin sentido:
  -- no se sabe si 120 son dos botes o media garrafa.
  if p_unidad_medida <> 'unidades' and coalesce(p_capacidad_envase, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Falta la capacidad del envase');
  end if;

  update productos
  set unidad_medida = p_unidad_medida,
      capacidad_envase = case when p_unidad_medida = 'unidades' then null else p_capacidad_envase end,
      coste_envase_cents = p_coste_envase_cents,
      updated_at = now()
  where id = p_producto_id and negocio_id = v_negocio;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese producto no es de este salon');
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.actualizar_medida_producto(uuid, text, integer, integer) from public, anon;
grant execute on function public.actualizar_medida_producto(uuid, text, integer, integer) to authenticated, service_role;
