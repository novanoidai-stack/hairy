-- P1-020 · Limite por IP en crear_cita_publica + captcha realmente exigible
--
-- ALCANCE REAL (la tarea del tracker nombraba tres RPCs; dos ya estaban cubiertos):
--   crear_resena_publica    -> YA tiene anti-abuso: 3 resenas/dia por IP y negocio,
--                              y 30/dia por negocio. No se toca.
--   crear_solicitud_publica -> YA tiene: 5/dia por IP + limite por email. No se toca.
--   crear_cita_publica      -> NO tiene NINGUN limite por IP. Es la unica que falta,
--                              y encima es la que crea citas. Es lo que se arregla aqui.
--
-- DOS MITADES INDEPENDIENTES, a proposito:
--   1) LIMITE POR IP. Entra en vigor al aplicar. No depende de desplegar nada.
--   2) CAPTCHA EXIGIBLE. Se aplica INERTE: solo actua cuando alguien enciende
--      negocio_portal.captcha_exigido, y eso NO debe hacerse hasta que la edge
--      validate-captcha nueva este desplegada.
--
-- POR QUE UN INTERRUPTOR NUEVO Y NO captcha_activo: captcha_activo ya existe, con
-- default true y los 6 negocios a true. Colgar de el la exigencia rechazaria TODAS
-- las reservas desde el primer segundo, porque hoy nadie escribe la prueba.
-- captcha_exigido nace en false.
--
-- EL AGUJERO QUE CIERRA: validate-captcha solo pregunta a Google y devuelve
-- {valid, score}; no deja rastro comprobable, asi que llamar al RPC directamente
-- con la clave anonima (que es publica) se salta el captcha entero. A partir de
-- aqui la edge deja constancia y el RPC la consume, de un solo uso.
--
-- NO APLICADA TODAVIA.

begin;

-- ---------------------------------------------------------------------------
-- 1) Limitador por IP
--
-- Tabla aparte y no una columna ip_origen en citas (que es el patron de resenas
-- y solicitudes) por dos razones: citas es una tabla grande y de negocio, y aqui
-- la IP se purga sola a las 24 h, que es mejor para RGPD que dejarla pegada a la
-- cita para siempre.
-- ---------------------------------------------------------------------------
create table if not exists public.rpc_rate_hits (
  id        bigserial primary key,
  bucket    text not null,
  clave     text not null,
  creado_en timestamptz not null default now()
);

create index if not exists rpc_rate_hits_lookup
  on public.rpc_rate_hits (bucket, clave, creado_en desc);

alter table public.rpc_rate_hits enable row level security;
-- Sin politicas: solo se toca desde funciones security definer.

comment on table public.rpc_rate_hits is
  'Contador de llamadas a RPCs publicos por bucket+clave. Se purga a las 24 h.';

create or replace function public.rate_limit_ok(
  p_bucket  text,
  p_clave   text,
  p_max     int,
  p_ventana interval
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  -- Sin clave no se puede identificar a nadie: NO se bloquea. Preferimos dejar
  -- pasar antes que tirar reservas legitimas si falta la cabecera; los demas
  -- limites del RPC (por telefono y por negocio) siguen aplicando.
  if p_clave is null or length(trim(p_clave)) = 0 then
    return true;
  end if;

  delete from public.rpc_rate_hits where creado_en < now() - interval '24 hours';

  select count(*) into v_n
    from public.rpc_rate_hits
   where bucket = p_bucket and clave = p_clave and creado_en > now() - p_ventana;

  if v_n >= p_max then
    return false;
  end if;

  insert into public.rpc_rate_hits (bucket, clave) values (p_bucket, p_clave);
  return true;
end;
$$;

revoke all on function public.rate_limit_ok(text, text, int, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Prueba de captcha que la BD puede comprobar
-- ---------------------------------------------------------------------------
create table if not exists public.captcha_validaciones (
  token_md5 text primary key,
  score     numeric,
  creado_en timestamptz not null default now(),
  usado_en  timestamptz
);

create index if not exists captcha_validaciones_creado on public.captcha_validaciones (creado_en);
alter table public.captcha_validaciones enable row level security;

comment on table public.captcha_validaciones is
  'Prueba de que validate-captcha verifico un token contra Google. Un solo uso, caduca a los 5 min.';

alter table public.negocio_portal
  add column if not exists captcha_exigido boolean not null default false;

comment on column public.negocio_portal.captcha_exigido is
  'Si true, crear_cita_publica EXIGE prueba de captcha. NO encender hasta que la edge validate-captcha nueva este desplegada.';

-- La escribe la edge validate-captcha con service_role.
create or replace function public.registrar_captcha_validado(p_token text, p_score numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;
  if p_token is null or length(trim(p_token)) < 10 then
    raise exception 'token vacio';
  end if;

  delete from public.captcha_validaciones where creado_en < now() - interval '1 hour';

  insert into public.captcha_validaciones (token_md5, score)
  values (md5(p_token), p_score)
  on conflict (token_md5) do nothing;
end;
$$;

revoke all on function public.registrar_captcha_validado(text, numeric) from public, anon, authenticated;

-- Consume la prueba: un solo uso, 5 minutos de margen.
create or replace function public.consumir_captcha(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return false;
  end if;

  update public.captcha_validaciones
     set usado_en = now()
   where token_md5 = md5(p_token)
     and usado_en is null
     and creado_en > now() - interval '5 minutes'
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.consumir_captcha(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Cablearlo en crear_cita_publica
--    (misma firma unificada de p1-018; solo cambia el cuerpo)
-- ---------------------------------------------------------------------------
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
  p_consentimiento_datos boolean default true,
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
  v_ip text := public.request_ip();
  v_captcha_exigido boolean;
begin
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;

  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id, coalesce(captcha_exigido, false)
    into v_negocio, v_captcha_exigido
  from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  -- Captcha: solo en el canal web (los agentes de WhatsApp y voz no pasan por el
  -- navegador) y solo si el negocio lo tiene exigido.
  if v_canal = 'web' and v_captcha_exigido then
    if not public.consumir_captcha(p_captcha_token) then
      raise exception 'No hemos podido verificar que eres una persona. Recarga la pagina e intentalo de nuevo.';
    end if;
  end if;

  -- Limite por IP, solo canal web: los agentes llaman desde el servidor de n8n y
  -- comparten IP, asi que limitarlos aqui los tumbaria a todos a la vez.
  --
  -- 20/hora y no menos porque en España los moviles salen por CGNAT: muchos
  -- usuarios sin relacion comparten la misma IP publica. Es una segunda linea
  -- contra bots, no el limite principal; el de verdad es el de 30/hora por
  -- negocio que hay mas abajo, y el captcha cuando se encienda.
  if v_canal = 'web' and not public.rate_limit_ok('crear_cita_publica_ip', v_ip, 20, interval '1 hour') then
    raise exception 'Demasiadas reservas desde esta conexion. Intentalo mas tarde o llama al salon.';
  end if;

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
$$;

commit;

-- Comprobacion:
--   select captcha_exigido, count(*) from public.negocio_portal group by 1;
--     -> false en todos. Encenderlo es MANUAL y posterior al despliegue de la edge.
--   select count(*) from public.rpc_rate_hits;
--     -> crece al reservar desde el portal; se purga sola a las 24 h.
--
-- ORDEN DE PUESTA EN MARCHA DEL CAPTCHA (no saltarse ningun paso):
--   1. Aplicar esta migracion (inerte).
--   2. Desplegar validate-captcha con la llamada a registrar_captcha_validado.
--   3. Comprobar que captcha_validaciones se llena al reservar.
--   4. Solo entonces: update negocio_portal set captcha_exigido = true.
