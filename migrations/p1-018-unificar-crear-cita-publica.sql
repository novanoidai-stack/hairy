-- P1-018 · Unificar las dos sobrecargas de crear_cita_publica en una sola
--
-- CONTEXTO: convivian dos versiones que habian DIVERGIDO, cada una con algo que
-- a la otra le faltaba:
--
--   firma con p_captcha_token  -> deposito dinamico por perfil de riesgo, y
--                                 devuelve 'canal'. NO guardaba los consentimientos.
--   firma con p_consiente_ia   -> guarda consentimiento_datos y consiente_ia
--                                 (RGPD). NO aplicaba el deposito dinamico.
--
-- Ademas ninguna de las dos aceptaba los dos parametros, asi que el frontend
-- —que mandaba ambos— recibia 404 PGRST202 y el portal llevaba roto desde el
-- 6 de julio. Esta migracion es el arreglo de raiz de eso.
--
-- OJO CON UN DETALLE QUE NO ES COSMETICO: la version de IA decidia el estado con
-- "v_prepago and v_deposito > 0". Con deposito dinamico, un cliente de riesgo
-- 'alto' recibe deposito = precio completo AUNQUE el servicio no exija prepago;
-- con esa condicion la cita se habria confirmado sin cobrar. Se conserva la
-- condicion de la version de captcha: "v_deposito > 0".
--
-- PENDIENTE APARTE (P1-020): p_captcha_token se sigue aceptando SIN validar. La
-- comprobacion ocurre hoy en el navegador, asi que llamar al RPC directo con la
-- clave anonima se la salta. Eso se arregla en P1-020, no aqui.
--
-- NO APLICADA TODAVIA.

begin;

-- migrations/consentimientos-gdpr.sql NUNCA se aplico al remoto: comprobado el
-- 4-ago-2026, consentimiento_datos no existe ni en citas ni en clientes. Por eso
-- la version viva con p_consiente_ia, que lo inserta en clientes, revienta en
-- runtime en cuanto el cliente es nuevo. Se anaden aqui para que esta migracion
-- sea autocontenida.
alter table public.citas add column if not exists consentimiento_datos boolean default false;
alter table public.citas add column if not exists consentimiento_at    timestamptz;

create or replace function public.crear_cita_publica(
  p_slug                 text,
  p_servicio_id          uuid,
  p_profesional_id       uuid,
  p_inicio               timestamptz,
  p_cliente_nombre       text,
  p_cliente_telefono     text,
  p_cliente_email        text default null,
  p_notas                text default null,
  p_canal                text default 'web',
  p_consentimiento_datos boolean default false,
  p_consiente_ia         boolean default false,
  p_captcha_token        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text; v_dur int; v_espera int; v_extra int; v_total int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_cliente uuid; v_cita uuid; v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_deposito numeric := 0; v_estado text; v_canal text; v_tz text := 'Europe/Madrid';
begin
  -- Consentimiento de datos obligatorio para reservar online (RGPD)
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;
  -- p_captcha_token se acepta para el plumbing anti-bots; la validacion real
  -- todavia NO ocurre aqui (P1-020).

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

  if exists (select 1 from public.citas c where c.profesional_id = p_profesional_id and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_inicio) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio) then raise exception 'El profesional no esta disponible'; end if;

  -- Cliente + consentimientos (venia de la version con p_consiente_ia)
  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) limit 1;

  if v_cliente is null then
    -- OJO: consentimiento_datos NO es columna de clientes, es de citas (ver
    -- consentimientos-gdpr.sql). La version viva con p_consiente_ia la insertaba
    -- aqui, asi que reventaba en runtime con cada cliente nuevo.
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

  -- Deposito base del servicio
  if v_prepago then
    if v_prepago_fijo is not null and v_prepago_fijo > 0 then v_deposito := v_prepago_fijo;
    elsif v_prepago_pct is not null and v_prepago_pct > 0 then v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
    end if;
  end if;

  -- Deposito dinamico por perfil de riesgo (venia de la version con p_captcha_token)
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

  -- Sobre v_deposito y no sobre v_prepago: el tier 'alto' puede exigir deposito
  -- aunque el servicio no lo pidiera.
  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  -- consentimiento_datos / consentimiento_at se dejaron de escribir cuando la
  -- funcion se bifurco en dos: ninguna de las dos versiones vivas los guardaba,
  -- pese a que consentimientos-gdpr.sql los anadio para eso. Se restauran.
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
$$;

-- Fuera las dos viejas. Mientras existan, PostgREST puede seguir resolviendo a
-- ellas segun los parametros que le lleguen.
drop function if exists public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, text, boolean, boolean);
drop function if exists public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, text, boolean, text);

-- Las funciones nuevas no nacen ejecutables por anon (round 4 de seguridad).
grant execute on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, text, boolean, boolean, text) to anon, authenticated;

commit;

-- Comprobacion posterior:
--   select pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'crear_cita_publica';
--   -> debe devolver UNA sola fila, la de 12 parametros.
--
-- Y despues, en lib/reservaPublica.ts, volver a enviar p_captcha_token (esta
-- comentado ahi el motivo por el que se quito).
