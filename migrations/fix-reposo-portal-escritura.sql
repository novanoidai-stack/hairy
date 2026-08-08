-- Fix: las RPC de escritura del portal publico seguian rechazando el hueco de reposo.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- La revision final de rama de las Tasks 1-2 (fix-reposo-portal-disponibilidad.sql)
-- detecto que disponibilidad_publica ya ofrece el hueco de reposo como reservable,
-- pero las tres funciones que de verdad CREAN o MUEVEN una cita
-- (crear_cita_publica, modificar_cita_publica, crear_cita_publica_grupo) seguian
-- comparando contra el rango completo [inicio, fin] de cada cita existente, sin mirar
-- fin_activa/fin_espera. Resultado: un cliente ve el hueco de reposo como libre,
-- rellena sus datos, pulsa confirmar, y la RPC lo rechaza con 'El hueco ya esta
-- ocupado' (o, en el caso de crear_cita_publica_grupo, 'El hueco del asistente %
-- ya esta ocupado'). Las Tasks 1-2 ya estan en produccion — hasta que esta
-- migracion se aplique, la Fase A no cumple su objetivo: el portal anuncia un
-- hueco que no se puede reservar de verdad.
--
-- Esta migracion alinea las tres RPC de escritura con el mismo modelo que ya usa
-- disponibilidad_publica y la agenda interna (lib/retrasos.ts: ventanasActivas):
-- una cita ocupa [inicio, fin_activa) y, si hay reposo real, [fin_espera, fin);
-- el tramo [fin_activa, fin_espera) queda libre para otra reserva.
--
-- OJO grants: ninguna de las tres funciones cambia su RETURNS (todas siguen
-- devolviendo jsonb), asi que CREATE OR REPLACE basta — no hace falta DROP y los
-- grants existentes NO se tocan ni se pierden (a diferencia de
-- disponibilidad_publica en la Task 1, que si cambiaba su RETURNS TABLE y
-- necesito DROP + re-GRANT). Confirmado antes de escribir esta migracion via
-- information_schema.routine_privileges: anon, authenticated, postgres,
-- service_role tienen EXECUTE en las tres funciones.

CREATE OR REPLACE FUNCTION public.crear_cita_publica(p_slug text, p_servicio_id uuid, p_profesional_id uuid, p_inicio timestamp with time zone, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text, p_consentimiento_datos boolean DEFAULT true, p_consiente_ia boolean DEFAULT false, p_captcha_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text; v_dur int; v_espera int; v_extra int; v_total int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_cliente uuid; v_cita uuid; v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_deposito numeric := 0; v_estado text; v_canal text; v_tz text := 'Europe/Madrid';
begin
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;

  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;
  if coalesce(length(public.normalizar_telefono(p_cliente_telefono)), 0) < 7 then raise exception 'Indica un telefono valido.'; end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fija
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio and activo = true)
  then raise exception 'Profesional no valido'; end if;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_cliente_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (select count(*) from public.citas where negocio_id = v_negocio and canal = 'web' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  v_total := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin := p_inicio + make_interval(mins => v_total);

  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then raise exception 'Fuera de la antelacion minima'; end if;

  if not exists (select 1 from public.horarios_profesional h where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio and (v_fin at time zone v_tz)::time <= h.hora_fin)
  then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_inicio)
      )
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio) then raise exception 'El profesional no esta disponible'; end if;

  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) limit 1;

  if v_cliente is null then
    insert into public.clientes (
      negocio_id, nombre, telefono, email,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha
    )
    values (
      v_negocio,
      left(trim(p_cliente_nombre), 120),
      trim(p_cliente_telefono),
      left(nullif(trim(p_cliente_email), ''), 200),
      p_consiente_ia,
      case when p_consiente_ia then 'portal' else null end,
      case when p_consiente_ia then now() else null end
    )
    returning id into v_cliente;
  else
    update public.clientes
       set consiente_ia = p_consiente_ia,
           consiente_ia_origen = 'portal',
           consiente_ia_fecha = now()
     where id = v_cliente
       and (consiente_ia is distinct from p_consiente_ia or consiente_ia_origen is null);
  end if;

  if v_prepago then
    if v_prepago_fijo is not null and v_prepago_fijo > 0 then v_deposito := v_prepago_fijo;
    elsif v_prepago_pct is not null and v_prepago_pct > 0 then v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
    end if;
  end if;

  if coalesce((select (config->>'depositoDinamicoActivo')::boolean from public.negocio_config where negocio_id = v_negocio), false) then
    declare v_tier text; v_factor numeric; v_uf int; v_ua int;
    begin
      select coalesce((config->>'depositoFactorRiesgo')::numeric, 2), coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3), coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
        into v_factor, v_uf, v_ua from public.negocio_config where negocio_id = v_negocio;
      v_tier := public.perfil_riesgo_cliente(v_cliente, coalesce(v_uf,3), coalesce(v_ua,2));
      if v_tier = 'exento' then v_deposito := 0;
      elsif v_tier = 'riesgo' then v_deposito := least(round(v_deposito * coalesce(v_factor,2), 2), coalesce(v_precio,0));
      elsif v_tier = 'alto' then v_deposito := coalesce(v_precio, 0);
      end if;
    end;
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
    estado, canal, notas, deposito_requerido, deposito_pagado, deposito_importe, confirmado_por_cliente,
    consentimiento_datos, consentimiento_at)
  values (v_negocio, p_profesional_id, p_servicio_id, v_cliente, p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500), (v_deposito > 0), false, nullif(v_deposito, 0), true,
    p_consentimiento_datos, case when p_consentimiento_datos then now() else null end)
  returning id into v_cita;

  return jsonb_build_object('cita_id', v_cita, 'cliente_id', v_cliente, 'estado', v_estado, 'canal', v_canal,
    'deposito_requerido', (v_deposito > 0), 'deposito_importe', v_deposito, 'inicio', p_inicio, 'fin', v_fin);
end;
$function$;

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
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_nuevo_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_nuevo_inicio)
      )
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

CREATE OR REPLACE FUNCTION public.crear_cita_publica_grupo(p_slug text, p_inicio timestamp with time zone, p_reservante_nombre text, p_reservante_telefono text, p_reservante_email text, p_asistentes jsonb, p_consentimiento_datos boolean DEFAULT true, p_captcha_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_grupo uuid := gen_random_uuid();
  v_cliente uuid;
  v_asistente jsonb;
  v_orden smallint := 0;
  v_cita_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_dur int; v_espera int; v_extra int; v_min_ant int;
  v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_servicio_id uuid; v_prof_id uuid; v_asist_nombre text; v_asist_notas text;
  v_tz text := 'Europe/Madrid';
  v_n int;
begin
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if coalesce(length(trim(p_reservante_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;
  if coalesce(length(trim(p_reservante_telefono)), 0) < 6 then raise exception 'Indica un telefono valido.'; end if;

  if jsonb_typeof(p_asistentes) <> 'array' then raise exception 'Formato de asistentes invalido'; end if;
  v_n := jsonb_array_length(p_asistentes);
  if v_n < 1 then raise exception 'Añade al menos un asistente'; end if;
  if v_n > 6 then raise exception 'Máximo 6 asistentes por reserva de grupo'; end if;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_reservante_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva con estos datos. Contacta con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_reservante_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) + v_n > 6 then
    raise exception 'Ya tienes muchas citas pendientes. Contacta con el salon para gestionar el grupo.';
  end if;

  if (select count(*) from public.citas where negocio_id = v_negocio and canal = 'web'
      and created_at > now() - interval '1 hour') + v_n >= 40 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_reservante_telefono) limit 1;
  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email)
    values (v_negocio, left(trim(p_reservante_nombre), 120), trim(p_reservante_telefono),
            left(nullif(trim(p_reservante_email), ''), 200))
    returning id into v_cliente;
  end if;

  for v_asistente in select value from jsonb_array_elements(p_asistentes) loop
    v_orden := v_orden + 1;
    v_asist_nombre := left(trim(coalesce(v_asistente->>'nombre', '')), 120);
    v_servicio_id := (v_asistente->>'servicio_id')::uuid;
    v_prof_id := (v_asistente->>'profesional_id')::uuid;
    v_asist_notas := left(nullif(trim(coalesce(v_asistente->>'notas', '')), ''), 500);

    if v_asist_nombre = '' then raise exception 'Falta el nombre del asistente %', v_orden; end if;

    select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
           coalesce(min_antelacion_min,0)
      into v_dur, v_espera, v_extra, v_min_ant
    from public.servicios
    where id = v_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
    if v_dur is null then raise exception 'Servicio no reservable para el asistente %', v_orden; end if;

    if not exists (select 1 from public.profesionales where id = v_prof_id and negocio_id = v_negocio and activo = true) then
      raise exception 'Profesional no valido para el asistente %', v_orden;
    end if;

    v_fin_activa := p_inicio + make_interval(mins => v_dur);
    v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
    v_fin := p_inicio + make_interval(mins => v_dur + v_espera + v_extra);

    if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
      raise exception 'Fuera de la antelacion minima';
    end if;

    if not exists (select 1 from public.horarios_profesional h where h.profesional_id = v_prof_id
        and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
        and (p_inicio at time zone v_tz)::time >= h.hora_inicio and (v_fin at time zone v_tz)::time <= h.hora_fin) then
      raise exception 'Fuera del horario laboral del profesional del asistente %', v_orden;
    end if;

    if exists (
      select 1 from public.citas c
      where c.profesional_id = v_prof_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
           and c.fin > p_inicio)
        )
    ) then
      raise exception 'El hueco del asistente % ya esta ocupado', v_orden;
    end if;

    if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = v_prof_id
        and b.inicio < v_fin and b.fin > p_inicio) then
      raise exception 'Profesional no disponible en el asistente %', v_orden;
    end if;

    insert into public.citas (
      negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
      estado, canal, notas, deposito_requerido, deposito_pagado, confirmado_por_cliente,
      grupo_id, orden_en_grupo
    ) values (
      v_negocio, v_prof_id, v_servicio_id,
      case when v_orden = 1 then v_cliente else null end,
      p_inicio, v_fin, v_fin_activa, v_fin_espera,
      'confirmada', 'web',
      trim(concat('Grupo ', v_orden, '/', v_n, ' — ', v_asist_nombre,
                  case when v_asist_notas is not null then E'\n' || v_asist_notas else '' end)),
      false, false, true,
      v_grupo, v_orden
    ) returning id into v_cita_id;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'cita_id', v_cita_id, 'orden', v_orden, 'nombre', v_asist_nombre
    ));
  end loop;

  return jsonb_build_object(
    'ok', true, 'grupo_id', v_grupo, 'cliente_id', v_cliente,
    'total', v_n, 'citas', v_result, 'inicio', p_inicio
  );
end;
$function$;
