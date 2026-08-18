-- =====================================================================
-- Bonos prepagados (adaptado del sesion14 al esquema real: RLS por
-- profiles.negocio_id, servicios.id uuid, profesionales.profile_id) +
-- consumir_bono_cita extendido: el bono cubre la cita, pero los
-- productos extra del ticket (y su descuento) se cobran en el mismo cobro.
-- Aplicado a la BD el 2026-08-18 via MCP (name: bonos_tabla_y_consumo_con_productos).
-- =====================================================================
create table if not exists public.bonos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  sesiones_totales integer not null check(sesiones_totales > 0),
  sesiones_disponibles integer not null check(sesiones_disponibles >= 0),
  precio_cents integer not null check(precio_cents >= 0),
  fecha_caducidad timestamptz,
  estado text not null default 'activo' check (estado in ('activo', 'agotado', 'caducado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bonos_cliente_idx on public.bonos(cliente_id);
create index if not exists bonos_negocio_idx on public.bonos(negocio_id, estado);

alter table public.bonos enable row level security;

drop policy if exists bonos_select_own on public.bonos;
create policy bonos_select_own on public.bonos
  for select using (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()));
drop policy if exists bonos_insert_own on public.bonos;
create policy bonos_insert_own on public.bonos
  for insert with check (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()));
drop policy if exists bonos_update_own on public.bonos;
create policy bonos_update_own on public.bonos
  for update using (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()));
drop policy if exists bonos_delete_own on public.bonos;
create policy bonos_delete_own on public.bonos
  for delete using (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()));

-- cobro_lineas admite tipo 'bono'
do $$
begin
  alter table public.cobro_lineas drop constraint if exists cobro_lineas_tipo_check;
  alter table public.cobro_lineas add constraint cobro_lineas_tipo_check
    check (tipo in ('servicio','producto','suplemento','bono'));
exception
  when others then null;
end $$;

-- Venta de bono: crea el bono y su cobro.
create or replace function public.vender_bono(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_sesiones integer,
  p_precio_cents integer,
  p_metodo text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_bono_id uuid;
  v_cobro_id uuid;
  v_nombre_servicio text;
  v_profesional_id uuid;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select nombre into v_nombre_servicio from public.servicios where id = p_servicio_id and negocio_id = v_caller_negocio;
  if not found then raise exception 'servicio_no_encontrado'; end if;

  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;

  insert into public.bonos (
    negocio_id, cliente_id, servicio_id,
    sesiones_totales, sesiones_disponibles, precio_cents
  ) values (
    v_caller_negocio, p_cliente_id, p_servicio_id,
    p_sesiones, p_sesiones, p_precio_cents
  ) returning id into v_bono_id;

  select id into v_profesional_id from public.profesionales where profile_id = auth.uid() limit 1;

  insert into public.cobros (
    negocio_id, cliente_id, profesional_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_caller_negocio, p_cliente_id, v_profesional_id,
    p_precio_cents, 0, 0, p_metodo,
    case when p_metodo = 'efectivo' then p_precio_cents else 0 end,
    case when p_metodo = 'datafono' then p_precio_cents else 0 end,
    0, 'manual', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'bono', v_bono_id, 'Bono ' || p_sesiones || 'x ' || coalesce(v_nombre_servicio, 'Servicio'), p_precio_cents, 1);

  return v_bono_id;
end;
$$;

-- Consumo de bono en cita: la cita la cubre el bono (linea a 0 marcada
-- "(Bono)"), y los productos extra + descuento + propina se cobran aparte
-- dentro del MISMO cobro.
create or replace function public.consumir_bono_cita(
  p_cita_id uuid,
  p_bono_id uuid,
  p_propina_cents integer default 0,
  p_lineas_extra jsonb default '[]'::jsonb,
  p_descuento_cents integer default 0,
  p_metodo text default 'efectivo'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_cita public.citas%rowtype;
  v_bono public.bonos%rowtype;
  v_cobro_id uuid;
  v_nombre text;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_metodo text := coalesce(nullif(p_metodo, ''), 'efectivo');
  v_lineas jsonb := coalesce(p_lineas_extra, '[]'::jsonb);
  v_producto_cents integer := 0;
  li jsonb;
  v_nombre_li text;
  v_precio_li integer;
  v_cant_li integer;
  v_ref_li uuid;
  v_total integer;
  v_efectivo integer := 0;
  v_datafono integer := 0;
begin
  if v_metodo not in ('efectivo','datafono','online','bizum','mixto') then
    v_metodo := 'efectivo';
  end if;

  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;

  select * into v_bono from public.bonos where id = p_bono_id for update;
  if not found then raise exception 'bono_no_encontrado'; end if;
  if v_bono.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_bono.cliente_id <> v_cita.cliente_id then raise exception 'bono_cliente_distinto'; end if;
  if v_bono.servicio_id <> v_cita.servicio_id then raise exception 'bono_servicio_distinto'; end if;
  if v_bono.estado <> 'activo' or v_bono.sesiones_disponibles <= 0 then raise exception 'bono_agotado'; end if;

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_producto_cents := v_producto_cents + v_precio_li * v_cant_li;
  end loop;

  update public.bonos
  set sesiones_disponibles = sesiones_disponibles - 1,
      estado = case when sesiones_disponibles - 1 = 0 then 'agotado' else estado end,
      updated_at = now()
  where id = p_bono_id;

  select nombre into v_nombre from public.servicios where id = v_cita.servicio_id;

  v_total := greatest(0, v_producto_cents - v_desc) + v_prop;
  if v_metodo = 'datafono' then
    v_datafono := v_total;
  else
    if v_metodo = 'mixto' then v_metodo := 'efectivo'; end if;
    v_efectivo := v_total;
  end if;

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_total, v_prop, least(v_desc, v_producto_cents), v_metodo,
    v_efectivo, v_datafono, 0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio') || ' (Bono)', 0, 1);

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_nombre_li := nullif(btrim(li->>'nombre'), '');
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_ref_li := nullif(li->>'ref_id', '');
    if v_nombre_li is null then continue; end if;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, 'producto', v_ref_li, v_nombre_li, v_precio_li, v_cant_li);
  end loop;

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$$;

revoke execute on function public.vender_bono(uuid, uuid, integer, integer, text) from public;
grant execute on function public.vender_bono(uuid, uuid, integer, integer, text) to authenticated;
revoke execute on function public.consumir_bono_cita(uuid, uuid, integer, jsonb, integer, text) from public;
grant execute on function public.consumir_bono_cita(uuid, uuid, integer, jsonb, integer, text) to authenticated;
