-- Migracion: portal de reserva online publica (C1)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Anade:
--   1) Tabla negocio_portal: identidad publica del salon (slug + ajustes del portal).
--   2) RPC portal_info(slug): cabecera + servicios reservables + profesionales (para pintar el portal).
--   3) RPC disponibilidad_publica(slug, servicio, fecha, [profesional]): huecos libres reales.
--   4) RPC crear_cita_publica(...): upsert de cliente + alta de cita con canal='web'.
--
-- Seguridad: el portal es anonimo. NO se abre SELECT directo a tablas con datos de
-- clientes (citas/clientes). Todo pasa por funciones security definer con grants a anon,
-- replicando el patron ya usado en el proyecto (is_staff, staff_grant_full_access, solicitudes).
--
-- Zona horaria del salon (v1): Europe/Madrid (luego configurable por negocio).
-- Disponibilidad v1: una cita ocupa todo su rango [inicio, fin] (conservador; el
-- aprovechamiento de reposos es una optimizacion solo para uso interno).

-- ---------------------------------------------------------------------------
-- 1) Tabla de identidad publica del negocio
-- ---------------------------------------------------------------------------
create table if not exists public.negocio_portal (
  negocio_id      text primary key,
  slug            text unique not null,
  nombre_publico  text,
  logo_url        text,
  direccion       text,
  telefono        text,
  idioma          text not null default 'es',
  portal_activo   boolean not null default true,
  mostrar_precios text not null default 'catalogo'
                  check (mostrar_precios in ('catalogo','tras_seleccion','nunca')),
  color_acento    text default '#f4501e',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.negocio_portal enable row level security;

-- El equipo del negocio (autenticado, mismo negocio_id) puede gestionar su portal.
drop policy if exists negocio_portal_owner_all on public.negocio_portal;
create policy negocio_portal_owner_all on public.negocio_portal
  for all to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()))
  with check (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- No se expone SELECT a anon: el portal lee via portal_info() (security definer).

-- ---------------------------------------------------------------------------
-- 2) portal_info(slug): datos publicos para pintar el portal
-- ---------------------------------------------------------------------------
create or replace function public.portal_info(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug,
      'nombre', np.nombre_publico,
      'logo_url', np.logo_url,
      'direccion', np.direccion,
      'telefono', np.telefono,
      'idioma', np.idioma,
      'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento,
      'analytics_config', coalesce(np.analytics_config, '{"enabled": false, "measurementId": "", "consentGiven": false}'::jsonb)
    ),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'nombre', s.nombre,
        'descripcion', s.descripcion,
        'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria,
        'prepago', coalesce(s.prepago_requerido, false)
      ) order by s.categoria nulls last, s.nombre)
      from public.servicios s
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'nombre', pr.nombre,
        'color', pr.color
      ) order by pr.nombre)
      from public.profesionales pr
      where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np
  where np.slug = p_slug and np.portal_activo = true;
$$;

-- ---------------------------------------------------------------------------
-- 3) disponibilidad_publica(slug, servicio, fecha, [profesional])
--    Devuelve los huecos libres (inicio de slot) por profesional para ese dia.
-- ---------------------------------------------------------------------------
create or replace function public.disponibilidad_publica(
  p_slug         text,
  p_servicio_id  uuid,
  p_fecha        date,
  p_profesional_id uuid default null
)
returns table(profesional_id uuid, profesional_nombre text, slot timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_total     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int; -- 0=Dom .. 6=Sab
  v_tz        text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  v_total := v_dur + v_espera + v_extra;

  return query
  with profs as (
    select pr.id, pr.nombre
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           (g.ts at time zone v_tz) as slot_tz   -- hora local del salon -> timestamptz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => v_total),
      interval '15 minutes'
    ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz
  from gen
  join profs pr on pr.id = gen.profesional_id
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and c.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c.fin    > gen.slot_tz
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.slot_tz, pr.nombre;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) crear_cita_publica(...): valida y crea la cita (canal='web')
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

  v_total      := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin        := p_inicio + make_interval(mins => v_total);

  -- Antelacion minima
  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
    raise exception 'Fuera de la antelacion minima';
  end if;

  -- Cabe en alguna franja del horario laboral de ese dia
  if not exists (
    select 1 from public.horarios_profesional h
    where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio
      and (v_fin    at time zone v_tz)::time <= h.hora_fin
  ) then raise exception 'Fuera del horario laboral'; end if;

  -- No solapa con otra cita activa
  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  -- No cae en bloqueo
  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio
  ) then raise exception 'El profesional no esta disponible'; end if;

  -- Upsert de cliente por telefono dentro del negocio
  if p_cliente_telefono is not null and length(trim(p_cliente_telefono)) > 0 then
    select id into v_cliente
    from public.clientes
    where negocio_id = v_negocio and telefono = trim(p_cliente_telefono)
    limit 1;
  end if;
  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email)
    values (
      v_negocio,
      coalesce(nullif(trim(p_cliente_nombre), ''), 'Cliente web'),
      nullif(trim(p_cliente_telefono), ''),
      nullif(trim(p_cliente_email), '')
    )
    returning id into v_cliente;
  end if;

  -- Deposito / senal (si el servicio lo requiere)
  if v_prepago then
    if v_prepago_fijo is not null and v_prepago_fijo > 0 then
      v_deposito := v_prepago_fijo;
    elsif v_prepago_pct is not null and v_prepago_pct > 0 then
      v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
    end if;
  end if;

  -- Sin senal -> confirmada. Con senal pendiente de pago -> pendiente (la confirma el webhook de pago).
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
    v_estado, 'web', nullif(trim(p_notas), ''),
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
-- 5) Grants: el portal es anonimo
-- ---------------------------------------------------------------------------
revoke all on function public.portal_info(text) from public;
grant execute on function public.portal_info(text) to anon, authenticated;

revoke all on function public.disponibilidad_publica(text, uuid, date, uuid) from public;
grant execute on function public.disponibilidad_publica(text, uuid, date, uuid) to anon, authenticated;

revoke all on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
