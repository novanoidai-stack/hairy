-- Migracion: Consentimientos RGPD y metadatos de conexion en citas del portal
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Anade:
--   1) Columnas consentimiento_datos y consentimiento_at a la tabla citas.
--   2) Columnas firma_svg, ip_registro y user_agent a la tabla consentimientos_cliente.
--   3) Actualizacion del RPC crear_cita_publica para registrar de forma automatica y atomica
--      el consentimiento en base de datos, capturando la IP del cliente y su User Agent.

-- 1) Agregar columnas de consentimiento a la tabla citas
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS consentimiento_datos boolean DEFAULT false;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS consentimiento_at timestamptz;

-- 2) Agregar metadatos de conexion a la tabla consentimientos_cliente
ALTER TABLE public.consentimientos_cliente ADD COLUMN IF NOT EXISTS firma_svg text;
ALTER TABLE public.consentimientos_cliente ADD COLUMN IF NOT EXISTS ip_registro text;
ALTER TABLE public.consentimientos_cliente ADD COLUMN IF NOT EXISTS user_agent text;

-- 3) Actualizar funcion crear_cita_publica
create or replace function public.crear_cita_publica(
  p_slug             text,
  p_servicio_id      uuid,
  p_profesional_id   uuid,
  p_inicio           timestamptz,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_cliente_email    text default null,
  p_notas            text default null,
  p_consentimiento_datos boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio    text;
  v_dur        int;
  v_espera     int;
  v_extra      int;
  v_total      int;
  v_min_ant    int;
  v_precio     numeric;
  v_prepago    boolean;
  v_prepago_pct numeric;
  v_prepago_fijo numeric;
  v_cliente    uuid;
  v_cita       uuid;
  v_fin        timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
  v_deposito   numeric := 0;
  v_estado     text;
  v_tz         text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  -- Validacion de entrada
  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then
    raise exception 'Indica tu nombre.';
  end if;
  if coalesce(length(trim(p_cliente_telefono)), 0) < 6 then
    raise exception 'Indica un telefono valido.';
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fija
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (
    select 1 from public.profesionales
    where id = p_profesional_id and negocio_id = v_negocio and activo = true
  ) then raise exception 'Profesional no valido'; end if;

  -- C5: cliente bloqueado (por telefono) no puede reservar online
  if exists (
    select 1 from public.clientes
    where negocio_id = v_negocio and telefono = trim(p_cliente_telefono) and bloqueado = true
  ) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  -- Anti-abuso: un mismo telefono no acumula mas de 3 citas futuras activas
  if (
    select count(*)
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id
    where c.negocio_id = v_negocio
      and cl.telefono = trim(p_cliente_telefono)
      and c.estado in ('pendiente','confirmada')
      and c.inicio > now()
  ) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  -- Anti-abuso: tope de reservas web por negocio y hora (inundacion)
  if (
    select count(*) from public.citas
    where negocio_id = v_negocio and canal = 'web' and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  v_total      := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin        := p_inicio + make_interval(mins => v_total);

  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
    raise exception 'Fuera de la antelacion minima';
  end if;

  if not exists (
    select 1 from public.horarios_profesional h
    where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio
      and (v_fin    at time zone v_tz)::time <= h.hora_fin
  ) then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio
  ) then raise exception 'El profesional no esta disponible'; end if;

  select id into v_cliente
  from public.clientes
  where negocio_id = v_negocio and telefono = trim(p_cliente_telefono)
  limit 1;
  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email)
    values (
      v_negocio,
      left(trim(p_cliente_nombre), 120),
      trim(p_cliente_telefono),
      left(nullif(trim(p_cliente_email), ''), 200)
    )
    returning id into v_cliente;
  end if;

  if v_prepago then
    if v_prepago_fijo is not null and v_prepago_fijo > 0 then
      v_deposito := v_prepago_fijo;
    elsif v_prepago_pct is not null and v_prepago_pct > 0 then
      v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
    end if;
  end if;

  v_estado := case when v_prepago and v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (
    negocio_id, profesional_id, servicio_id, cliente_id,
    inicio, fin, fin_activa, fin_espera,
    estado, canal, notas,
    deposito_requerido, deposito_pagado, deposito_importe,
    confirmado_por_cliente,
    consentimiento_datos, consentimiento_at
  ) values (
    v_negocio, p_profesional_id, p_servicio_id, v_cliente,
    p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, 'web', left(nullif(trim(p_notas), ''), 500),
    (v_prepago and v_deposito > 0), false, nullif(v_deposito, 0),
    true,
    p_consentimiento_datos, case when p_consentimiento_datos then now() else null end
  )
  returning id into v_cita;

  -- Registro automatico del log de consentimiento
  if p_consentimiento_datos then
    insert into public.consentimientos_cliente (
      negocio_id, cliente_id, tipo, aceptado, revocado, metodo_obtencion, fecha,
      ip_registro, user_agent
    ) values (
      v_negocio, v_cliente, 'tratamiento_datos', true, false, 'portal_web', now(),
      nullif(public.request_ip(), ''),
      nullif(coalesce(current_setting('request.headers', true), '{}')::json->>'user-agent', '')
    );
  end if;

  return jsonb_build_object(
    'cita_id', v_cita,
    'cliente_id', v_cliente,
    'estado', v_estado,
    'deposito_requerido', (v_prepago and v_deposito > 0),
    'deposito_importe', v_deposito,
    'inicio', p_inicio,
    'fin', v_fin
  );
end;
$$;

-- Mantener grants correctos para el portal anonimo
revoke all on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, boolean) from public;
grant execute on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, boolean) to anon, authenticated;
