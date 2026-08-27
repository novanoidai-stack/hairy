-- Comparación canónica de teléfonos: helper normalizar_telefono (solo dígitos) +
-- las 7 RPC que comparan teléfono pasan a comparar sobre el canónico, en vez de
-- igualdad exacta `telefono = trim(p_telefono)`. Junto con el backfill a E.164 y el
-- componente PhoneInput, el cliente puede teclear su número con/sin prefijo y casa.
-- Spec: docs/superpowers/specs/2026-06-22-telefono-internacional-design.md

create or replace function public.normalizar_telefono(p text)
returns text language sql immutable parallel safe
set search_path = '' as $$
  -- Canónico para comparar: solo dígitos + quitar el prefijo internacional "00" inicial
  -- (equivalente a "+"). Con datos en E.164 equivale a prefijo+nacional.
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', ''), '');
$$;

-- ============================ cita_publica ============================
CREATE OR REPLACE FUNCTION public.cita_publica(p_slug text, p_cita_id uuid, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_cita    record;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'motivo', 'portal');
  end if;

  select c.id, c.estado, c.inicio, c.fin, c.servicio_id, c.profesional_id,
         coalesce(c.es_oferta_espera, false) as es_oferta_espera,
         coalesce(c.deposito_requerido, false) as deposito_requerido,
         coalesce(c.deposito_pagado, false) as deposito_pagado,
         coalesce(s.nombre, '')            as servicio,
         coalesce(s.cancelacion_horas, 24) as cancelacion_horas,
         coalesce(pr.nombre, '')           as profesional,
         coalesce(np.nombre_publico, '')   as salon
    into v_cita
  from public.citas c
  join public.clientes cl       on cl.id = c.cliente_id
  join public.negocio_portal np on np.negocio_id = c.negocio_id
  left join public.servicios s     on s.id = c.servicio_id
  left join public.profesionales pr on pr.id = c.profesional_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);

  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cita_id', v_cita.id,
    'estado', v_cita.estado,
    'servicio_id', v_cita.servicio_id,
    'servicio', v_cita.servicio,
    'profesional_id', v_cita.profesional_id,
    'profesional', v_cita.profesional,
    'inicio', v_cita.inicio,
    'fin', v_cita.fin,
    'salon', v_cita.salon,
    'slug', p_slug,
    'es_oferta_espera', v_cita.es_oferta_espera,
    'deposito_requerido', v_cita.deposito_requerido,
    'deposito_pagado', v_cita.deposito_pagado,
    'cancelable', (v_cita.estado in ('pendiente','confirmada') and v_cita.inicio > now()),
    'cancelacion_horas', v_cita.cancelacion_horas,
    'fuera_de_plazo', (v_cita.inicio < now() + make_interval(hours => v_cita.cancelacion_horas))
  );
end;
$function$;

-- ======================== cancelar_cita_publica ========================
CREATE OR REPLACE FUNCTION public.cancelar_cita_publica(p_slug text, p_cita_id uuid, p_telefono text, p_motivo text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_cita    record;
  v_horas   int;
  v_fuera   boolean;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  select c.id, c.estado, c.inicio, coalesce(s.cancelacion_horas, 24) as cancelacion_horas
    into v_cita
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  left join public.servicios s on s.id = c.servicio_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);
  if v_cita.id is null then raise exception 'Cita no encontrada'; end if;
  if v_cita.estado not in ('pendiente','confirmada') then raise exception 'La cita no se puede cancelar'; end if;
  if v_cita.inicio <= now() then raise exception 'La cita ya ha pasado'; end if;

  v_horas := v_cita.cancelacion_horas;
  v_fuera := v_cita.inicio < now() + make_interval(hours => v_horas);

  update public.citas
    set estado = 'cancelada',
        cancelado_por = case when coalesce(nullif(trim(p_canal),''),'web') in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end,
        motivo_cancelacion = left(nullif(trim(p_motivo), ''), 300),
        modificado_at = now()
  where id = p_cita_id;

  return jsonb_build_object(
    'ok', true,
    'cita_id', p_cita_id,
    'estado', 'cancelada',
    'fuera_de_plazo', v_fuera,
    'cancelacion_horas', v_horas
  );
end;
$function$;

-- ======================== modificar_cita_publica ========================
CREATE OR REPLACE FUNCTION public.modificar_cita_publica(p_slug text, p_cita_id uuid, p_telefono text, p_nuevo_inicio timestamp with time zone, p_nuevo_profesional_id uuid DEFAULT NULL::uuid, p_canal text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio    text;
  v_cita       record;
  v_prof       uuid;
  v_dur        int;
  v_espera     int;
  v_extra      int;
  v_total      int;
  v_min_ant    int;
  v_fin        timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
  v_tz         text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  select c.id, c.estado, c.inicio, c.servicio_id, c.profesional_id
    into v_cita
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);
  if v_cita.id is null then raise exception 'Cita no encontrada'; end if;
  if v_cita.estado not in ('pendiente','confirmada') then raise exception 'La cita no se puede modificar'; end if;
  if v_cita.inicio <= now() then raise exception 'La cita ya ha pasado'; end if;

  v_prof := coalesce(p_nuevo_profesional_id, v_cita.profesional_id);

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = v_cita.servicio_id and negocio_id = v_negocio;
  if v_dur is null then raise exception 'Servicio no valido'; end if;

  if not exists (
    select 1 from public.profesionales
    where id = v_prof and negocio_id = v_negocio and activo = true
  ) then raise exception 'Profesional no valido'; end if;

  v_total      := v_dur + v_espera + v_extra;
  v_fin_activa := p_nuevo_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_nuevo_inicio + make_interval(mins => v_dur + v_espera);
  v_fin        := p_nuevo_inicio + make_interval(mins => v_total);

  if p_nuevo_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
    raise exception 'Fuera de la antelacion minima';
  end if;

  if not exists (
    select 1 from public.horarios_profesional h
    where h.profesional_id = v_prof
      and h.dia_semana = extract(dow from (p_nuevo_inicio at time zone v_tz))::int
      and (p_nuevo_inicio at time zone v_tz)::time >= h.hora_inicio
      and (v_fin         at time zone v_tz)::time <= h.hora_fin
  ) then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_nuevo_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = v_prof
      and b.inicio < v_fin and b.fin > p_nuevo_inicio
  ) then raise exception 'El profesional no esta disponible'; end if;

  update public.citas
    set inicio = p_nuevo_inicio,
        fin = v_fin,
        fin_activa = v_fin_activa,
        fin_espera = v_fin_espera,
        profesional_id = v_prof,
        confirmacion_enviada = false,
        recordatorio_enviado = false,
        modificado_at = now()
  where id = p_cita_id;

  return jsonb_build_object(
    'ok', true,
    'cita_id', p_cita_id,
    'inicio', p_nuevo_inicio,
    'fin', v_fin,
    'profesional_id', v_prof
  );
end;
$function$;

-- ======================== confirmar_cita_oferta ========================
CREATE OR REPLACE FUNCTION public.confirmar_cita_oferta(p_cita_id uuid, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cita public.citas;
  v_tel text;
begin
  select * into v_cita from public.citas
    where id = p_cita_id and es_oferta_espera = true and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'error', 'oferta_no_disponible'); end if;
  select telefono into v_tel from public.clientes where id = v_cita.cliente_id;
  if public.normalizar_telefono(v_tel) is distinct from public.normalizar_telefono(p_telefono) then
    return jsonb_build_object('ok', false, 'error', 'telefono_no_coincide');
  end if;
  if v_cita.deposito_requerido and not v_cita.deposito_pagado then
    return jsonb_build_object('ok', false, 'needs_payment', true, 'cita_id', p_cita_id);
  end if;
  update public.citas set estado = 'confirmada', confirmacion_enviada = false, confirmada_cliente = true,
    confirmada_at = now(), modificado_at = now() where id = p_cita_id;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id);
end;
$function$;

-- ========================== citas_de_cliente ==========================
CREATE OR REPLACE FUNCTION public.citas_de_cliente(p_slug text, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return '[]'::jsonb; end if;
  if coalesce(length(trim(p_telefono)), 0) < 6 then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cita_id', c.id,
      'inicio', c.inicio,
      'fin', c.fin,
      'estado', c.estado,
      'canal', c.canal,
      'servicio_id', c.servicio_id,
      'servicio', s.nombre,
      'profesional_id', c.profesional_id,
      'profesional', pr.nombre,
      'precio', s.precio,
      'deposito_requerido', c.deposito_requerido,
      'deposito_pagado', c.deposito_pagado,
      'cancelacion_horas', coalesce(s.cancelacion_horas, 24),
      'fuera_de_plazo', (c.inicio < now() + make_interval(hours => coalesce(s.cancelacion_horas, 24)))
    ) order by c.inicio)
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.servicios s on s.id = c.servicio_id
    left join public.profesionales pr on pr.id = c.profesional_id
    where c.negocio_id = v_negocio
      and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)
      and c.estado in ('pendiente','confirmada')
      and c.inicio > now()
  ), '[]'::jsonb);
end;
$function$;

-- ========================== identificar_cliente ==========================
CREATE OR REPLACE FUNCTION public.identificar_cliente(p_slug text, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_row     record;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return jsonb_build_object('encontrado', false); end if;
  if coalesce(length(trim(p_telefono)), 0) < 6 then return jsonb_build_object('encontrado', false); end if;

  select c.id, c.nombre, c.ultima_visita, c.total_visitas, c.bloqueado,
         c.profesional_habitual_id, pr.nombre as profesional_habitual
    into v_row
  from public.clientes c
  left join public.profesionales pr on pr.id = c.profesional_habitual_id
  where c.negocio_id = v_negocio
    and public.normalizar_telefono(c.telefono) = public.normalizar_telefono(p_telefono)
  limit 1;

  if v_row.id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  return jsonb_build_object(
    'encontrado', true,
    'cliente_id', v_row.id,
    'nombre', v_row.nombre,
    'profesional_habitual_id', v_row.profesional_habitual_id,
    'profesional_habitual', v_row.profesional_habitual,
    'ultima_visita', v_row.ultima_visita,
    'total_visitas', v_row.total_visitas,
    'bloqueado', v_row.bloqueado
  );
end;
$function$;

-- ========================== crear_cita_publica ==========================
CREATE OR REPLACE FUNCTION public.crear_cita_publica(p_slug text, p_servicio_id uuid, p_profesional_id uuid, p_inicio timestamp with time zone, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text)
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
    'canal', v_canal,
    'deposito_requerido', (v_prepago and v_deposito > 0),
    'deposito_importe', v_deposito,
    'inicio', p_inicio,
    'fin', v_fin
  );
end;
$function$;
