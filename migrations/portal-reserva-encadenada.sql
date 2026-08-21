-- Portal de reserva: reservar VARIOS servicios en la misma visita.
--
-- `crear_cita_publica` sigue existiendo tal cual (un servicio) y la usa el
-- agente de WhatsApp. Esta es su version en cadena: recibe la lista de
-- servicios en el orden en que se van a hacer y crea UNA cita por servicio,
-- pegadas en el tiempo y unidas por `grupo_id`. No es una cita mas larga: cada
-- tramo conserva su servicio, su precio y sus fases, que es lo que la agenda,
-- la caja y las comisiones esperan encontrar.
--
-- El hueco se valida para la cadena ENTERA antes de insertar nada: si el ultimo
-- tramo no cabe, no se reserva ninguno (todo o nada). Por eso la disponibilidad
-- que pinta el portal se pide con la duracion total, no con la del primero.
--
-- Cada tramo empieza donde ACABA el anterior (`fin`, no `fin_activa`): el hueco
-- de reposo de un tinte se puede vender a OTRA clienta, pero no a la misma que
-- esta sentada esperando.

create or replace function public.crear_cita_publica_cadena(
  p_slug text,
  p_servicio_ids uuid[],
  p_profesional_id uuid,
  p_inicio timestamptz,
  p_nombre text,
  p_telefono text,
  p_email text default null,
  p_notas text default null,
  p_consiente_ia boolean default false,
  p_captcha_token text default null,
  p_canal text default 'web'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_negocio text; v_tz text := 'Europe/Madrid'; v_canal text;
  v_ip text; v_tel_clean text;
  v_cliente uuid; v_grupo uuid := gen_random_uuid();
  v_cursor timestamptz; v_fin_cadena timestamptz;
  v_precio_total numeric := 0; v_deposito numeric := 0; v_estado text;
  v_nivel_sin_deposito boolean := false;
  v_primera uuid := null; v_orden int := 0;
  v_sid uuid;
  v_dur int; v_espera int; v_extra int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_fin_activa timestamptz; v_fin_espera timestamptz; v_fin timestamptz;
  v_cita uuid;
  v_tramos jsonb := '[]'::jsonb;
begin
  if p_servicio_ids is null or array_length(p_servicio_ids, 1) is null then
    raise exception 'Indica al menos un servicio.';
  end if;
  if array_length(p_servicio_ids, 1) > 4 then
    raise exception 'Demasiados servicios en una misma reserva. Llama al salon, por favor.';
  end if;

  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id into v_negocio
    from public.negocio_portal
   where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  -- --- anti-abuso: el mismo que la version de un servicio -------------------
  if v_canal = 'web' then
    v_ip := public.request_ip();
    if not public.rate_limit_ok('crear_cita_publica_ip', v_ip, 5, interval '1 minute') then
      raise exception 'Demasiados intentos desde esta conexión. Por favor, espera un minuto o contacta con el salón.';
    end if;
  end if;

  if p_captcha_token is not null and length(trim(p_captcha_token)) > 0 then
    if not public.consumir_captcha_token(p_captcha_token) then
      raise exception 'La verificación de seguridad ha caducado o no es válida. Por favor, inténtalo de nuevo.';
    end if;
  end if;

  if exists (select 1 from public.cierres_negocio cn
      where cn.negocio_id = v_negocio and cn.fecha = (p_inicio at time zone v_tz)::date) then
    raise exception 'El salon esta cerrado ese dia';
  end if;

  if coalesce(length(trim(p_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;

  v_tel_clean := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 or length(v_tel_clean) < 8 then
    raise exception 'Indica un teléfono móvil válido para la confirmación de la cita.';
  end if;

  if not exists (select 1 from public.profesionales
                  where id = p_profesional_id and negocio_id = v_negocio and activo = true) then
    raise exception 'Profesional no valido';
  end if;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono)
      and bloqueado = true) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio
        and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (select count(*) from public.citas
                           where negocio_id = v_negocio and canal = 'web'
                             and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  -- --- 1a pasada: validar la cadena ENTERA sin escribir nada ---------------
  v_cursor := p_inicio;
  foreach v_sid in array p_servicio_ids loop
    select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
           coalesce(min_antelacion_min,0), precio
      into v_dur, v_espera, v_extra, v_min_ant, v_precio
      from public.servicios
     where id = v_sid and negocio_id = v_negocio and reservable_online = true and activo = true;
    if v_dur is null then raise exception 'Servicio no reservable'; end if;

    if not public.profesional_ofrece_servicio(p_profesional_id, v_sid) then
      raise exception 'Ese profesional no realiza uno de los servicios elegidos';
    end if;

    select d.activa, d.espera, d.extra into v_dur, v_espera, v_extra
      from public.duracion_efectiva_profesional(v_sid, p_profesional_id, v_dur, v_espera, v_extra) d;

    if v_cursor = p_inicio and p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
      raise exception 'Fuera de la antelacion minima';
    end if;

    v_fin := v_cursor + make_interval(mins => v_dur + v_espera + v_extra);

    if not exists (select 1 from public.horarios_profesional h
                    where h.profesional_id = p_profesional_id
                      and h.dia_semana = extract(dow from (v_cursor at time zone v_tz))::int
                      and (v_cursor at time zone v_tz)::time >= h.hora_inicio
                      and (v_fin at time zone v_tz)::time <= h.hora_fin) then
      raise exception 'La reserva completa no cabe en el horario de ese profesional';
    end if;

    if exists (
      select 1 from public.citas c
       where c.profesional_id = p_profesional_id
         and c.estado in ('pendiente','confirmada')
         and (
           (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > v_cursor)
           or (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
               and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
               and c.fin > v_cursor)
         )
    ) then raise exception 'El hueco ya esta ocupado'; end if;

    if exists (select 1 from public.bloqueos_profesional b
                where b.profesional_id = p_profesional_id and b.inicio < v_fin and b.fin > v_cursor) then
      raise exception 'El profesional no esta disponible';
    end if;

    v_precio_total := v_precio_total + coalesce(v_precio, 0);
    v_cursor := v_fin;
  end loop;
  v_fin_cadena := v_cursor;

  -- --- cliente -------------------------------------------------------------
  select id into v_cliente from public.clientes
   where negocio_id = v_negocio
     and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) limit 1;

  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha)
    values (v_negocio, left(trim(p_nombre), 120), trim(p_telefono),
      left(nullif(trim(p_email), ''), 200), p_consiente_ia,
      case when p_consiente_ia then 'portal' else null end,
      case when p_consiente_ia then now() else null end)
    returning id into v_cliente;
  else
    update public.clientes
       set consiente_ia = p_consiente_ia, consiente_ia_origen = 'portal', consiente_ia_fecha = now()
     where id = v_cliente
       and (consiente_ia is distinct from p_consiente_ia or consiente_ia_origen is null);
  end if;

  -- --- deposito: se calcula sobre el precio TOTAL de la cadena --------------
  v_nivel_sin_deposito := coalesce(
    (public.obtener_nivel_cliente(v_cliente)->'nivel'->>'sin_deposito')::boolean, false);

  if not v_nivel_sin_deposito then
    select bool_or(coalesce(prepago_requerido,false)),
           max(prepago_porcentaje), max(prepago_cantidad_fija)
      into v_prepago, v_prepago_pct, v_prepago_fijo
      from public.servicios where id = any(p_servicio_ids);

    if v_prepago then
      if v_prepago_fijo is not null and v_prepago_fijo > 0 then
        v_deposito := v_prepago_fijo;
      elsif v_prepago_pct is not null and v_prepago_pct > 0 then
        v_deposito := round(v_precio_total * v_prepago_pct / 100.0, 2);
      end if;
    end if;

    if coalesce((select (config->>'depositoDinamicoActivo')::boolean
                   from public.negocio_config where negocio_id = v_negocio), false) then
      declare v_tier text; v_factor numeric; v_uf int; v_ua int;
      begin
        select coalesce((config->>'depositoFactorRiesgo')::numeric, 2),
               coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3),
               coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
          into v_factor, v_uf, v_ua
          from public.negocio_config where negocio_id = v_negocio;
        v_tier := public.perfil_riesgo_cliente(v_cliente, coalesce(v_uf,3), coalesce(v_ua,2));
        if v_tier = 'exento' then v_deposito := 0;
        elsif v_tier = 'riesgo' then
          v_deposito := least(round(v_deposito * coalesce(v_factor,2), 2), v_precio_total);
        elsif v_tier = 'alto' then v_deposito := v_precio_total;
        end if;
      end;
    end if;
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  -- --- 2a pasada: insertar los tramos --------------------------------------
  v_cursor := p_inicio;
  foreach v_sid in array p_servicio_ids loop
    select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0)
      into v_dur, v_espera, v_extra
      from public.servicios where id = v_sid;
    select d.activa, d.espera, d.extra into v_dur, v_espera, v_extra
      from public.duracion_efectiva_profesional(v_sid, p_profesional_id, v_dur, v_espera, v_extra) d;

    v_fin_activa := v_cursor + make_interval(mins => v_dur);
    v_fin_espera := v_cursor + make_interval(mins => v_dur + v_espera);
    v_fin        := v_cursor + make_interval(mins => v_dur + v_espera + v_extra);

    insert into public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin,
      fin_activa, fin_espera, estado, canal, notas, deposito_requerido, deposito_pagado,
      deposito_importe, confirmado_por_cliente, consentimiento_datos, consentimiento_at,
      grupo_id, orden_en_grupo)
    values (v_negocio, p_profesional_id, v_sid, v_cliente, v_cursor, v_fin,
      v_fin_activa, v_fin_espera, v_estado, v_canal,
      case when v_orden = 0 then left(nullif(trim(p_notas), ''), 500) else null end,
      -- El deposito se pide UNA vez, en el primer tramo: es una sola visita.
      (v_orden = 0 and v_deposito > 0), false,
      case when v_orden = 0 then nullif(v_deposito, 0) else null end,
      true, true, now(), v_grupo, v_orden)
    returning id into v_cita;

    if v_primera is null then v_primera := v_cita; end if;
    v_tramos := v_tramos || jsonb_build_object('cita_id', v_cita, 'servicio_id', v_sid,
                                               'inicio', v_cursor, 'fin', v_fin);
    v_orden := v_orden + 1;
    v_cursor := v_fin;
  end loop;

  return jsonb_build_object(
    'cita_id', v_primera, 'grupo_id', v_grupo, 'cliente_id', v_cliente,
    'estado', v_estado, 'canal', v_canal, 'tramos', v_tramos,
    'deposito_requerido', (v_deposito > 0), 'deposito_importe', v_deposito,
    'precio_total', v_precio_total, 'inicio', p_inicio, 'fin', v_fin_cadena);
end;
$fn$;

-- Decision 4 del CLAUDE.md: las funciones nuevas no nacen ejecutables por anon.
grant execute on function public.crear_cita_publica_cadena(
  text, uuid[], uuid, timestamptz, text, text, text, text, boolean, text, text
) to anon, authenticated;
