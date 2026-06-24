-- POS: cobro sin cita (walk-in / venta suelta).
-- Mismo motor que crear_cobro_desde_cita pero sin cita: lineas libres (sin
-- catalogo de producto, disciplina "sin inventario todavia" del dossier).
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
set search_path to 'public'
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
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (
      v_cobro_id, 'producto', null,
      trim(v_linea->>'nombre'),
      (v_linea->>'precio_cents')::integer,
      coalesce((v_linea->>'cantidad')::integer, 1)
    );
  end loop;

  return v_cobro_id;
end;
$function$;
