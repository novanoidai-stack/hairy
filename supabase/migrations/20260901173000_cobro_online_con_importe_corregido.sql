-- 1 sep 2026. El cobro online (QR/enlace) respeta el importe corregido a mano.
--
-- Convenir con crear_cobro_desde_cita (20260901161500): requerir_pago_total_cita
-- e iniciar_cobro_online aceptan p_base_cents opcional (base del servicio ya
-- corregida en el POS, bruta de señal); registrar_cobro_online usa esa base de
-- metadata para la linea de servicio en vez del catalogo. El total del cobro ya
-- salia del pago, asi que no cambia la conciliacion.
-- Ojo firmas nuevas => re-grants explicitos (patron 20260828211000).

create or replace function public.requerir_pago_total_cita(
  p_cita_id uuid,
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_metodo text default 'online',
  p_base_cents integer default null
)
returns public.pagos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_base int;
  v_senal int;
  v_prop int := greatest(0, coalesce(p_propina_cents, 0));
  v_desc int := greatest(0, coalesce(p_descuento_cents, 0));
  v_total int;
  v_pago public.pagos;
begin
  if p_metodo not in ('online','bizum') then raise exception 'metodo_invalido'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_not_found'; end if;

  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;

  -- Base = precio de servicio(s). En grupo, suma de precios; cabecera = primera del grupo.
  if v_cita.grupo_id is not null then
    select coalesce(sum(round(coalesce(s.precio, 0) * 100)::int), 0)
      into v_base
      from public.citas c
      left join public.servicios s on s.id = c.servicio_id
      where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1;
  else
    select coalesce(round(coalesce(s.precio, 0) * 100)::int, 0)
      into v_base from public.servicios s where s.id = v_cita.servicio_id;
    v_cabecera := v_cita.id;
  end if;

  -- Importe corregido a mano en el POS: sustituye al de catalogo.
  if p_base_cents is not null then
    if p_base_cents < 0 then raise exception 'base_invalida'; end if;
    v_base := p_base_cents;
  end if;

  select coalesce(sum(importe_cents), 0) into v_senal
    from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pagado';

  v_total := greatest(0, coalesce(v_base, 0) - v_senal - v_desc) + v_prop;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'total' and estado = 'pendiente'
    limit 1;

  if found then
    update public.pagos
    set importe_cents = v_total,
        metadata = coalesce(metadata, '{}'::jsonb)
                   || jsonb_build_object('propina_cents', v_prop, 'descuento_cents', v_desc,
                                         'metodo', p_metodo, 'base_cents', coalesce(v_base, 0)),
        updated_at = now()
    where id = v_pago.id returning * into v_pago;
  else
    insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado, metadata)
    values (v_cita.negocio_id, v_cabecera, v_cita.cliente_id, 'total', v_total, 'pendiente',
            jsonb_build_object('propina_cents', v_prop, 'descuento_cents', v_desc,
                               'metodo', p_metodo, 'base_cents', coalesce(v_base, 0)))
    returning * into v_pago;
  end if;

  return v_pago;
end;
$$;
revoke all on function public.requerir_pago_total_cita(uuid, integer, integer, text, integer) from public, anon;
grant execute on function public.requerir_pago_total_cita(uuid, integer, integer, text, integer) to authenticated, service_role;

create or replace function public.iniciar_cobro_online(
  p_cita_id uuid,
  p_metodo text default 'online',
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_base_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_cita public.citas;
  v_pago public.pagos;
  v_token text;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;

  v_pago := public.requerir_pago_total_cita(p_cita_id, p_propina_cents, p_descuento_cents, p_metodo, p_base_cents);
  if v_pago.id is null or coalesce(v_pago.importe_cents, 0) <= 0 then
    raise exception 'nada_que_cobrar';
  end if;

  v_token := public.enlace_pago_token(v_pago.cita_id, 'total');

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'pago_id', v_pago.id,
    'importe_cents', v_pago.importe_cents
  );
end;
$$;
revoke all on function public.iniciar_cobro_online(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.iniciar_cobro_online(uuid, text, integer, integer, integer) to authenticated;

-- La linea de servicio del cobro online usa la base real (corregida si la hubo).
create or replace function public.registrar_cobro_online(p_pago_id uuid, p_metodo text default 'online')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.pagos;
  v_cita public.citas;
  v_precio numeric;
  v_nombre text;
  v_base_cents int;
  v_prop int;
  v_desc int;
  v_metodo text;
  v_cobro_id uuid;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado'; end if;
  if v_pago.cita_id is null then return null; end if;

  select * into v_cita from public.citas where id = v_pago.cita_id;
  if not found then return null; end if;

  if v_cita.cobrada then
    return v_cita.cobro_id;
  end if;

  v_prop := greatest(0, coalesce((v_pago.metadata->>'propina_cents')::int, 0));
  v_desc := greatest(0, coalesce((v_pago.metadata->>'descuento_cents')::int, 0));
  v_metodo := coalesce(nullif(p_metodo, ''), v_pago.metadata->>'metodo', 'online');
  if v_metodo not in ('online','bizum') then v_metodo := 'online'; end if;

  select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cita.servicio_id;
  -- Base corregida en el POS si la hubo (via metadata del pago); si no, catalogo.
  v_base_cents := coalesce((v_pago.metadata->>'base_cents')::int,
                           coalesce(round(coalesce(v_precio, 0) * 100)::int, 0));

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_pago.importe_cents, v_prop, v_desc, v_metodo,
    0, 0, v_pago.importe_cents, 'portal', 'completado', 'pago:' || v_pago.id::text
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio'), v_base_cents, 1);

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id and cobrada = false;

  return v_cobro_id;
end;
$$;
revoke all on function public.registrar_cobro_online(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_cobro_online(uuid, text) to service_role;

-- Fuera las sobrecargas viejas de 4 argumentos: con dos versiones vivas,
-- PostgREST puede no saber cual elegir en llamadas con argumentos con nombre
-- (mismo patron que explica 20260828211000).
drop function if exists public.requerir_pago_total_cita(uuid, integer, integer, text);
drop function if exists public.iniciar_cobro_online(uuid, text, integer, integer);
