-- PASO 2 de la reparacion del 30 ago 2026.
--
-- gate_suscripcion_triggers_y_portal (20260830155347) recreo crear_cita_publica
-- MOVIENDO p_canal de la posicion 11 a la 9. Para Postgres eso es OTRA funcion,
-- asi que quedaron dos sobrecargas con el MISMO juego de nombres de parametro.
-- PostgREST resuelve por nombres, no por orden, y devolvia:
--
--   HTTP 300  PGRST203  "Could not choose the best candidate function"
--
-- El portal publico no podia reservar un servicio suelto -- el caso normal;
-- solo salia adelante la reserva encadenada, que usa otra RPC. Y encima la
-- sobrecarga nueva, la unica que llevaba el gate de suscripcion, NO estaba
-- concedida a anon, asi que ese control no se aplicaba nunca.
--
-- Aqui se deja UNA sola firma: la canonica de siempre (p_canal el ultimo, que
-- es la que llama lib/reservaPublica.ts y la que tiene los grants), con el gate
-- dentro. Los dos cuerpos eran identicos salvo esas cuatro lineas.
--
-- Es la tercera vez que este proyecto se come una sobrecarga de esta RPC
-- (limpiar_sobrecargas_rpc, p1_018_unificar_crear_cita_publica). Si hay que
-- cambiarle los parametros: se cambian EN SU SITIO, o se hace drop de la firma
-- vieja en la MISMA migracion. Nunca se deja convivir a las dos.
--
-- NOTA sobre prepago_cantidad_fija: la version que se aplico en produccion
-- heredaba de 20260819195010 la errata `prepago_cantidad_fijo` (la columna es
-- `fija`), que la migracion 20260830190749 corrigio acto seguido. Este fichero
-- ya sale con el nombre bueno, asi que replayarlo en limpio deja lo correcto y
-- la 190749 se queda sin nada que hacer -- que es como esta escrita.

drop function if exists public.crear_cita_publica(
  text, uuid, uuid, timestamptz, text, text, text, text, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.crear_cita_publica(
  p_slug text,
  p_servicio_id uuid,
  p_profesional_id uuid,
  p_inicio timestamp with time zone,
  p_nombre text,
  p_telefono text,
  p_email text DEFAULT NULL::text,
  p_notas text DEFAULT NULL::text,
  p_consiente_ia boolean DEFAULT false,
  p_captcha_token text DEFAULT NULL::text,
  p_canal text DEFAULT 'web'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_negocio text; v_dur int; v_espera int; v_extra int; v_total int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_cliente uuid; v_cita uuid; v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_deposito numeric := 0; v_estado text; v_canal text; v_tz text := 'Europe/Madrid';
  v_nivel_sin_deposito boolean := false;
  v_ip text;
  v_captcha_exigido boolean := false;
  v_tel_clean text;
begin
  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id, coalesce(captcha_activo, false)
    into v_negocio, v_captcha_exigido
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;

  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  -- Gate de suscripcion: salon caducado o sin acceso
  if not public.negocio_con_acceso(v_negocio) then
    raise exception 'El servicio de reserva online no esta disponible temporalmente para este salon. Por favor, contacta directamente con el establecimiento.';
  end if;

  -- Rate Limiting por IP para canal web (máx 5 peticiones por minuto)
  if v_canal = 'web' then
    v_ip := public.request_ip();
    if not public.rate_limit_ok('crear_cita_publica_ip', v_ip, 5, interval '1 minute') then
      raise exception 'Demasiados intentos desde esta conexión. Por favor, espera un minuto o contacta con el salón.';
    end if;
  end if;

  -- Validación de Captcha de un solo uso
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

  -- Validación y normalización de teléfono
  v_tel_clean := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 or length(v_tel_clean) < 8 then
    raise exception 'Indica un teléfono móvil válido para la confirmación de la cita.';
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fija
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;

  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio and activo = true)
  then raise exception 'Profesional no valido'; end if;

  -- Override activo = false: ese profesional no realiza este servicio.
  if not public.profesional_ofrece_servicio(p_profesional_id, p_servicio_id) then
    raise exception 'Ese profesional no realiza este servicio';
  end if;

  -- Duracion efectiva: override del profesional por encima del catalogo.
  select d.activa, d.espera, d.extra
    into v_dur, v_espera, v_extra
  from public.duracion_efectiva_profesional(p_servicio_id, p_profesional_id, v_dur, v_espera, v_extra) d;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)
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

  -- Comprobación respetando huecos de reposo químico (no solapar fase activa ni extra)
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
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) limit 1;

  if v_cliente is null then
    insert into public.clientes (
      negocio_id, nombre, telefono, email,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha
    )
    values (
      v_negocio,
      left(trim(p_nombre), 120),
      trim(p_telefono),
      left(nullif(trim(p_email), ''), 200),
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

  v_nivel_sin_deposito := coalesce((public.obtener_nivel_cliente(v_cliente)->'nivel'->>'sin_deposito')::boolean, false);

  if v_nivel_sin_deposito then
    v_deposito := 0;
  else
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
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
    estado, canal, notas, deposito_requerido, deposito_pagado, deposito_importe, confirmado_por_cliente,
    consentimiento_datos, consentimiento_at)
  values (v_negocio, p_profesional_id, p_servicio_id, v_cliente, p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500), (v_deposito > 0), false, nullif(v_deposito, 0), true,
    true, now())
  returning id into v_cita;

  return jsonb_build_object('cita_id', v_cita, 'cliente_id', v_cliente, 'estado', v_estado, 'canal', v_canal,
    'deposito_requerido', (v_deposito > 0), 'deposito_importe', v_deposito, 'inicio', p_inicio, 'fin', v_fin);
end;
$$;

-- La canonica ya tenia sus grants; CREATE OR REPLACE los conserva. Se reafirman
-- por si la sobrecarga borrada se los habia llevado por delante.
grant execute on function public.crear_cita_publica(
  text, uuid, uuid, timestamptz, text, text, text, text, boolean, text, text
) to anon, authenticated, service_role;
