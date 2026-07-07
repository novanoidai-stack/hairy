-- ===============================================================================
-- 1. TABLA DE BONOS (Paquetes prepagados)
-- ===============================================================================
create table if not exists public.bonos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  servicio_id text not null references public.servicios(id) on delete restrict,
  sesiones_totales integer not null check(sesiones_totales > 0),
  sesiones_disponibles integer not null check(sesiones_disponibles >= 0),
  precio_cents integer not null check(precio_cents >= 0),
  fecha_caducidad timestamptz,
  estado text not null default 'activo' check (estado in ('activo', 'agotado', 'caducado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bonos_negocio_check check (negocio_id is not null)
);

create index if not exists bonos_cliente_idx on public.bonos(cliente_id);
create index if not exists bonos_negocio_idx on public.bonos(negocio_id, estado);

-- Habilitar RLS
alter table public.bonos enable row level security;

create policy bonos_select_own on public.bonos
  for select using (negocio_id = current_setting('app.negocio_id', true));

create policy bonos_insert_own on public.bonos
  for insert with check (negocio_id = current_setting('app.negocio_id', true));

create policy bonos_update_own on public.bonos
  for update using (negocio_id = current_setting('app.negocio_id', true));

create policy bonos_delete_own on public.bonos
  for delete using (negocio_id = current_setting('app.negocio_id', true));

-- ===============================================================================
-- 2. AJUSTE EN COBRO_LINEAS PARA PERMITIR TIPO 'bono'
-- ===============================================================================
do $$
begin
  alter table public.cobro_lineas drop constraint if exists cobro_lineas_tipo_check;
  alter table public.cobro_lineas add constraint cobro_lineas_tipo_check 
    check (tipo in ('servicio','producto','suplemento','bono'));
exception
  when others then null;
end $$;

-- ===============================================================================
-- 3. FUNCIONES HELPER (RPC) PARA BONOS
-- ===============================================================================

-- Función: vender bono (Crea el bono y el cobro en caja)
create or replace function public.vender_bono(
  p_cliente_id uuid,
  p_servicio_id text,
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
  v_profesional_id text;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select nombre into v_nombre_servicio from public.servicios where id = p_servicio_id and negocio_id = v_caller_negocio;
  if not found then raise exception 'servicio_no_encontrado'; end if;

  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;

  -- Create the bono
  insert into public.bonos (
    negocio_id, cliente_id, servicio_id,
    sesiones_totales, sesiones_disponibles, precio_cents
  ) values (
    v_caller_negocio, p_cliente_id, p_servicio_id,
    p_sesiones, p_sesiones, p_precio_cents
  ) returning id into v_bono_id;

  -- Get current user as profesional
  select id into v_profesional_id from public.profesionales where user_id = auth.uid() limit 1;

  -- Create cobro
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

  -- Create cobro linea
  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'bono', v_bono_id::text, 'Bono ' || p_sesiones || 'x ' || coalesce(v_nombre_servicio, 'Servicio'), p_precio_cents, 1);

  return v_bono_id;
end;
$$;

-- Función: consumir bono (Liquida una cita descontando 1 sesión del bono)
create or replace function public.consumir_bono_cita(
  p_cita_id uuid,
  p_bono_id uuid,
  p_propina_cents integer default 0
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
begin
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

  -- Consume session
  update public.bonos 
  set sesiones_disponibles = sesiones_disponibles - 1,
      estado = case when sesiones_disponibles - 1 = 0 then 'agotado' else estado end,
      updated_at = now()
  where id = p_bono_id;

  select nombre into v_nombre from public.servicios where id = v_cita.servicio_id;

  -- Create cobro at 0 euros (except propina)
  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_prop, v_prop, 0, 'efectivo', -- Defaulting to efectivo for propina if exists, else 0
    v_prop, 0, 0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  -- Create line item
  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio') || ' (Bono)', 0, 1);

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$$;

revoke execute on function public.vender_bono(uuid, text, integer, integer, text) from public;
grant execute on function public.vender_bono(uuid, text, integer, integer, text) to authenticated;

revoke execute on function public.consumir_bono_cita(uuid, uuid, integer) from public;
grant execute on function public.consumir_bono_cita(uuid, uuid, integer) to authenticated;
