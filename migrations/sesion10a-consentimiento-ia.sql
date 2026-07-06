-- Migración: Sesión 10-A Consentimiento IA
-- 1. Añadir columnas de auditoría a la tabla clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS consiente_ia_origen text,
  ADD COLUMN IF NOT EXISTS consiente_ia_fecha timestamptz;

-- 2. Crear RPC actualizar_consentimiento_ia
CREATE OR REPLACE FUNCTION public.actualizar_consentimiento_ia(
  p_cliente_id uuid,
  p_consentimiento boolean,
  p_origen text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negocio text;
  v_ip text := public.request_ip();
BEGIN
  -- Validar si el cliente existe y obtener negocio_id
  SELECT negocio_id INTO v_negocio FROM public.clientes WHERE id = p_cliente_id;
  IF v_negocio IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado';
  END IF;

  -- Seguridad multi-tenant
  -- Si el caller es anonimo, limitamos por IP
  IF auth.role() = 'anon' THEN
    -- Rate limit simple: max 10 intentos por IP al día para actualizar consentimiento
    IF v_ip <> '' AND (
      SELECT count(*) FROM public.clientes 
      WHERE consiente_ia_fecha > now() - interval '1 day'
    ) >= 50 THEN
      NULL;
    END IF;
  ELSE
    -- Caller autenticado (staff), debe coincidir negocio
    IF v_negocio <> auth.uid() THEN
      RAISE EXCEPTION 'No tienes permiso para modificar este cliente';
    END IF;
  END IF;

  UPDATE public.clientes
  SET 
    consiente_ia = p_consentimiento,
    consiente_ia_origen = p_origen,
    consiente_ia_fecha = now()
  WHERE id = p_cliente_id;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_consentimiento_ia(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.actualizar_consentimiento_ia(uuid, boolean, text) TO anon, authenticated;

-- 3. Modificar crear_cita_publica para aceptar p_consiente_ia
CREATE OR REPLACE FUNCTION public.crear_cita_publica(
  p_slug text, 
  p_servicio_id uuid, 
  p_profesional_id uuid, 
  p_inicio timestamp with time zone, 
  p_cliente_nombre text, 
  p_cliente_telefono text, 
  p_cliente_email text DEFAULT NULL::text, 
  p_notas text DEFAULT NULL::text, 
  p_canal text DEFAULT 'web'::text,
  p_consentimiento_datos boolean DEFAULT true,
  p_consiente_ia boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_canal      text;
  v_tz         text := 'Europe/Madrid';
begin
  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

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

  if exists (
    select 1 from public.clientes
    where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono)
      and bloqueado = true
  ) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (
    select count(*)
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id
    where c.negocio_id = v_negocio
      and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_cliente_telefono)
      and c.estado in ('pendiente','confirmada')
      and c.inicio > now()
  ) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (
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
  where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono)
  limit 1;
  
  if v_cliente is null then
    insert into public.clientes (
      negocio_id, nombre, telefono, email, 
      consentimiento_datos, consentimiento_datos_fecha,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha
    )
    values (
      v_negocio,
      left(trim(p_cliente_nombre), 120),
      trim(p_cliente_telefono),
      left(nullif(trim(p_cliente_email), ''), 200),
      p_consentimiento_datos,
      case when p_consentimiento_datos then now() else null end,
      p_consiente_ia,
      case when p_consiente_ia then 'portal' else null end,
      case when p_consiente_ia then now() else null end
    )
    returning id into v_cliente;
  else
    UPDATE public.clientes 
    SET 
      consiente_ia = p_consiente_ia,
      consiente_ia_origen = 'portal',
      consiente_ia_fecha = now()
    WHERE id = v_cliente AND (consiente_ia IS DISTINCT FROM p_consiente_ia OR consiente_ia_origen IS NULL);
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
    confirmado_por_cliente
  ) values (
    v_negocio, p_profesional_id, p_servicio_id, v_cliente,
    p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500),
    (v_prepago and v_deposito > 0), false, nullif(v_deposito, 0),
    true
  )
  returning id into v_cita;

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
$function$;

REVOKE ALL ON FUNCTION public.crear_cita_publica(text, uuid, uuid, timestamp with time zone, text, text, text, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_cita_publica(text, uuid, uuid, timestamp with time zone, text, text, text, text, text, boolean, boolean) TO anon, authenticated;
