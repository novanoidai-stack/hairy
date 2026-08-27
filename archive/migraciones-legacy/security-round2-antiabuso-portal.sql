-- Migracion: seguridad ronda 2 — anti-abuso del portal publico + higiene
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- APLICADA en remoto el 10/06/2026 via MCP (apply_migration: security_round2_antiabuso_portal)
--
-- Que corrige:
--   a) Reservas anonimas sin limite: cualquiera podia llenar la agenda entera
--      de un salon con reservas falsas en bucle. Ahora: max 3 citas futuras
--      activas por telefono, max 30 reservas web/hora por negocio, y
--      validacion de longitudes (nombre >= 2, telefono >= 6, notas <= 500).
--   b) Resenas anonimas sin limite (spam de 1 estrella o inflado de 5):
--      max 3/dia por IP y negocio, max 30/dia por negocio; comentario <= 1000.
--      Se guarda ip_origen (uso interno; el RPC publico no la devuelve).
--   c) staff_set_demo_visits ya no es invocable por anon.
--   d) search_path fijo en set_updated_at, my_negocio_id, generar_negocio_id,
--      demo_visit_limit (advisor function_search_path_mutable).
--
-- PENDIENTE (manual, dashboard de Supabase): activar "Leaked password
-- protection" en Auth > Settings (advisor auth_leaked_password_protection).

-- ---------------------------------------------------------------------------
-- 1) request_ip(): IP del cliente que llama via PostgREST (x-forwarded-for).
--    Sin EXECUTE para anon/authenticated: solo la usan las funciones definer.
-- ---------------------------------------------------------------------------
create or replace function public.request_ip()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true), '{}')::json->>'x-forwarded-for', ',', 1), ''),
    ''
  );
$$;
revoke all on function public.request_ip() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Resenas: ip_origen + limites de ritmo
-- ---------------------------------------------------------------------------
alter table public.resenas add column if not exists ip_origen text;

create or replace function public.crear_resena_publica(
  p_slug          text,
  p_puntuacion    smallint,
  p_comentario    text,
  p_autor_nombre  text,
  p_profesional_id uuid default null,
  p_servicio_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_id uuid;
  v_ip text := public.request_ip();
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;
  if p_puntuacion is null or p_puntuacion < 1 or p_puntuacion > 5 then raise exception 'Puntuacion invalida'; end if;

  -- Anti-abuso: misma IP max 3 resenas/dia por negocio; negocio max 30/dia.
  if v_ip <> '' and (
    select count(*) from public.resenas
    where negocio_id = v_negocio and ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'Ya has enviado tu valoracion. Gracias.';
  end if;
  if (
    select count(*) from public.resenas
    where negocio_id = v_negocio and fuente = 'web' and created_at > now() - interval '1 day'
  ) >= 30 then
    raise exception 'No se pueden registrar mas valoraciones hoy. Intentalo manana.';
  end if;

  if p_profesional_id is not null and not exists (
    select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio
  ) then p_profesional_id := null; end if;
  if p_servicio_id is not null and not exists (
    select 1 from public.servicios where id = p_servicio_id and negocio_id = v_negocio
  ) then p_servicio_id := null; end if;

  insert into public.resenas (negocio_id, profesional_id, servicio_id, puntuacion, comentario, autor_nombre, fuente, visible, ip_origen)
  values (v_negocio, p_profesional_id, p_servicio_id, p_puntuacion,
          left(nullif(trim(p_comentario), ''), 1000), left(nullif(trim(p_autor_nombre), ''), 80), 'web', true, nullif(v_ip, ''))
  returning id into v_id;

  return jsonb_build_object('resena_id', v_id, 'ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) crear_cita_publica con anti-abuso (sustituye a la version de
--    bloquear-clientes.sql; conserva el chequeo C5 de cliente bloqueado)
-- ---------------------------------------------------------------------------
create or replace function public.crear_cita_publica(
  p_slug             text,
  p_servicio_id      uuid,
  p_profesional_id   uuid,
  p_inicio           timestamptz,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_cliente_email    text default null,
  p_notas            text default null
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
    confirmado_por_cliente
  ) values (
    v_negocio, p_profesional_id, p_servicio_id, v_cliente,
    p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, 'web', left(nullif(trim(p_notas), ''), 500),
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
$$;

-- ---------------------------------------------------------------------------
-- 4) Higiene
-- ---------------------------------------------------------------------------
revoke execute on function public.staff_set_demo_visits(uuid, integer) from anon;

alter function public.set_updated_at() set search_path = public;
alter function public.my_negocio_id() set search_path = public;
alter function public.generar_negocio_id() set search_path = public;
alter function public.demo_visit_limit() set search_path = public;

-- ---------------------------------------------------------------------------
-- 5) Correccion posterior (misma fecha): el EXECUTE de anon en
--    staff_set_demo_visits venia heredado de PUBLIC; el revoke a anon solo
--    no bastaba. (apply_migration: staff_set_demo_visits_revoke_public)
-- ---------------------------------------------------------------------------
revoke execute on function public.staff_set_demo_visits(uuid, integer) from public, anon;
grant execute on function public.staff_set_demo_visits(uuid, integer) to authenticated;
