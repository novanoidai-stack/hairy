-- =====================================================================
-- FIX: error 42804 "column 'ref_id' is of type uuid but expression is
-- of type text" al registrar cobros.
--
-- Causa raiz (verificado contra el error en vivo del 2026-08-14):
--   1) crear_cobro_walkin (desplegada desde pos-cobro-walkin-inventory.sql)
--      declara `v_ref_id text` y lo inserta en cobro_lineas.ref_id (uuid)
--      SIN cast en el INSERT de lineas. PL/pgSQL no convierte text->uuid
--      implicitamente -> TODO cobro rapido falla (error de tipos, no de
--      valor: falla aunque la linea no lleve producto). El mismo archivo
--      ya hacia v_ref_id::uuid en inventario/movimientos; era un olvido
--      en el INSERT de la linea.
--   2) vender_bono (sesion14) tenia el mismo patron: v_profesional_id
--      text -> cobros.profesional_id (uuid) y v_bono_id::text ->
--      cobro_lineas.ref_id (uuid).
--
-- Este archivo redefine ambas funciones ya corregidas. Idempotente.
-- Aplicar en remoto via Management API (helper .zcode/tmp/apply_migration.mjs)
-- o pegando en el SQL Editor de Supabase Studio.
-- =====================================================================

-- 1) crear_cobro_walkin corregida (unica linea que cambia vs la desplegada:
--    v_ref_id -> v_ref_id::uuid en el INSERT de cobro_lineas)
create or replace function public.crear_cobro_walkin(
  p_lineas jsonb,
  p_metodo text,
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_profesional_id uuid default null,
  p_cliente_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_negocio text;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_base_cents integer := 0;
  v_total_cents integer;
  v_cobro_id uuid;
  v_linea jsonb;
  v_nombre text;
  v_precio integer;
  v_cantidad integer;
  v_ref_id text;
begin
  select negocio_id into v_negocio from public.profiles where id = auth.uid();
  if v_negocio is null then raise exception 'sin_perfil'; end if;

  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'sin_lineas'; end if;

  if p_profesional_id is not null
     and not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio) then
    raise exception 'profesional_no_autorizado';
  end if;

  if p_cliente_id is not null
     and not exists (select 1 from public.clientes where id = p_cliente_id and negocio_id = v_negocio) then
    raise exception 'cliente_no_autorizado';
  end if;

  -- Validar y totalizar las lineas antes de insertar nada.
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_nombre := trim(coalesce(v_linea->>'nombre', ''));
    v_precio := coalesce((v_linea->>'precio_cents')::integer, -1);
    v_cantidad := coalesce((v_linea->>'cantidad')::integer, 1);
    if v_nombre = '' then raise exception 'linea_sin_nombre'; end if;
    if v_precio < 0 then raise exception 'linea_precio_invalido'; end if;
    if v_cantidad < 1 then raise exception 'linea_cantidad_invalida'; end if;
    v_base_cents := v_base_cents + (v_precio * v_cantidad);
  end loop;

  v_total_cents := greatest(0, v_base_cents - v_desc) + v_prop;
  if v_total_cents <= 0 then raise exception 'total_invalido'; end if;

  insert into public.cobros (
    negocio_id, cita_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_negocio, null, p_profesional_id, p_cliente_id,
    v_total_cents, v_prop, v_desc, p_metodo,
    case when p_metodo = 'efectivo' then v_total_cents else 0 end,
    case when p_metodo = 'datafono' then v_total_cents else 0 end,
    0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_ref_id := nullif(trim(coalesce(v_linea->>'ref_id', '')), '');

    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (
      v_cobro_id,
      case when v_ref_id is not null then 'producto' else 'servicio' end,
      v_ref_id::uuid,
      trim(v_linea->>'nombre'),
      (v_linea->>'precio_cents')::integer,
      coalesce((v_linea->>'cantidad')::integer, 1)
    );

    -- If it is a product, decrement stock in inventory and record the movement
    if v_ref_id is not null then
      -- 1. Decrement stock
      update public.inventario
         set unidades = greatest(0, unidades - coalesce((v_linea->>'cantidad')::integer, 1)),
             ultima_modificacion = now(),
             modificado_por = auth.uid()
       where negocio_id = v_negocio
         and producto_id = v_ref_id::uuid;

      -- 2. Record stock movement log
      insert into public.movimientos_inventario (
        negocio_id, producto_id, tipo, unidades, motivo, creado_por, referencia_id, referencia_tipo, notas
      ) values (
        v_negocio, v_ref_id::uuid, 'salida',
        -coalesce((v_linea->>'cantidad')::integer, 1),
        'venta', auth.uid(), v_cobro_id, 'cobro', 'Venta en POS / Caja'
      );
    end if;
  end loop;

  return v_cobro_id;
end;
$function$;

revoke all on function public.crear_cobro_walkin(jsonb,text,integer,integer,uuid,uuid) from public, anon;
grant execute on function public.crear_cobro_walkin(jsonb,text,integer,integer,uuid,uuid) to authenticated;

-- 2) Seguro idempotente: el CHECK de cobro_lineas.tipo debe admitir 'bono'
--    (lo ensancha sesion14; si ya esta aplicado, no hace nada).
do $$
begin
  alter table public.cobro_lineas drop constraint if exists cobro_lineas_tipo_check;
  alter table public.cobro_lineas add constraint cobro_lineas_tipo_check
    check (tipo in ('servicio','producto','suplemento','bono'));
exception
  when others then null;
end $$;

-- 3) vender_bono corregida (v_profesional_id uuid; ref_id sin ::text)
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
  v_profesional_id uuid;
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
  values (v_cobro_id, 'bono', v_bono_id, 'Bono ' || p_sesiones || 'x ' || coalesce(v_nombre_servicio, 'Servicio'), p_precio_cents, 1);

  return v_bono_id;
end;
$$;
