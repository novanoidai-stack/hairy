-- Disponibilidad del portal para VARIOS servicios en la misma visita.
--
-- Son las gemelas de `disponibilidad_publica` y `portal_dias_disponibles`, con
-- una sola diferencia de fondo: la duracion que hay que encajar es la SUMA de
-- los servicios elegidos (con el override de cada profesional aplicado a cada
-- uno), y el profesional tiene que hacerlos TODOS.
--
-- Sin esto, añadir un servicio en el paso de "¿te falta algo?" enseñaria huecos
-- que solo caben para el primero, y la reserva reventaria al final con un
-- "el hueco ya esta ocupado" despues de que la clienta haya metido sus datos.
--
-- La antelacion minima que manda es la MAS restrictiva de la cadena.

-- ---------------------------------------------------------------------------
-- Huecos de un dia concreto
-- ---------------------------------------------------------------------------
create or replace function public.disponibilidad_publica_cadena(
  p_slug text,
  p_servicio_ids uuid[],
  p_fecha date,
  p_profesional_id uuid default null
)
returns table(profesional_id uuid, profesional_nombre text, slot timestamptz,
              en_reposo boolean, reposo_disponible_min integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_negocio text;
  v_min_ant int;
  v_n       int;
  v_dow     int := extract(dow from p_fecha)::int;
  v_tz      text := 'Europe/Madrid';
begin
  if p_servicio_ids is null or array_length(p_servicio_ids, 1) is null then return; end if;

  select negocio_id into v_negocio
    from public.negocio_portal
   where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  if exists (select 1 from public.cierres_negocio cn
              where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  -- Todos los servicios tienen que existir y ser reservables: si uno no lo es,
  -- no hay disponibilidad que valga.
  select count(*), max(coalesce(min_antelacion_min, 0))
    into v_n, v_min_ant
    from public.servicios
   where id = any(p_servicio_ids) and negocio_id = v_negocio
     and reservable_online = true and activo = true;
  if v_n is null or v_n <> array_length(p_servicio_ids, 1) then return; end if;

  return query
  with profs as (
    select pr.id, pr.nombre, t.total
      from public.profesionales pr
      cross join lateral (
        select sum(d.total)::int as total
          from unnest(p_servicio_ids) as sv(id)
          join public.servicios s on s.id = sv.id
          cross join lateral public.duracion_efectiva_profesional(
            sv.id, pr.id,
            s.duracion_activa_min,
            coalesce(s.duracion_espera_min, 0),
            coalesce(s.duracion_activa_extra_min, 0)
          ) d
      ) t
     where pr.negocio_id = v_negocio and pr.activo = true
       and (p_profesional_id is null or pr.id = p_profesional_id)
       -- tiene que hacer TODOS los servicios de la cadena
       and not exists (
         select 1 from unnest(p_servicio_ids) as sv2(id)
          where not public.profesional_ofrece_servicio(pr.id, sv2.id)
       )
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin, p.total
      from public.horarios_profesional h
      join profs p on p.id = h.profesional_id
     where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id, f.total, (g.ts at time zone v_tz) as slot_tz
      from franjas f
      cross join lateral generate_series(
        (p_fecha + f.hora_inicio),
        (p_fecha + f.hora_fin) - make_interval(mins => f.total),
        interval '15 minutes'
      ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz, reposo.en_reposo, reposo.disponible_min
    from gen
    join profs pr on pr.id = gen.profesional_id
    cross join lateral (
      select
        exists (
          select 1 from public.citas c2
           where c2.profesional_id = gen.profesional_id
             and c2.estado in ('pendiente','confirmada')
             and c2.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and c2.fin    > gen.slot_tz
        ) as en_reposo,
        (
          select min(round(extract(epoch from (
                   coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
                 )) / 60)::int)
            from public.citas c3
           where c3.profesional_id = gen.profesional_id
             and c3.estado in ('pendiente','confirmada')
             and c3.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and c3.fin    > gen.slot_tz
        ) as disponible_min
    ) reposo
   where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
     and not exists (
       select 1 from public.citas c
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and (
            (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
            or
            (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
             and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
             and c.fin > gen.slot_tz)
          )
     )
     and not exists (
       select 1 from public.bloqueos_profesional b
        where b.profesional_id = gen.profesional_id
          and b.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and b.fin    > gen.slot_tz
     )
   order by gen.slot_tz, pr.nombre;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Dias con al menos un hueco para la cadena entera
-- ---------------------------------------------------------------------------
create or replace function public.portal_dias_disponibles_cadena(
  p_slug text,
  p_servicio_ids uuid[],
  p_profesional_id uuid default null,
  p_dias integer default 21
)
returns table(dia date)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_negocio text;
  v_min_ant int;
  v_n       int;
  v_tz      text := 'Europe/Madrid';
  v_hoy     date;
  v_dias    int := least(greatest(coalesce(p_dias, 21), 1), 60);
begin
  if p_servicio_ids is null or array_length(p_servicio_ids, 1) is null then return; end if;

  select negocio_id into v_negocio
    from public.negocio_portal
   where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select count(*), max(coalesce(min_antelacion_min, 0))
    into v_n, v_min_ant
    from public.servicios
   where id = any(p_servicio_ids) and negocio_id = v_negocio
     and reservable_online = true and activo = true;
  if v_n is null or v_n <> array_length(p_servicio_ids, 1) then return; end if;

  v_hoy := (now() at time zone v_tz)::date;

  return query
  with dias as (
    select gd::date as d
      from generate_series(v_hoy, v_hoy + (v_dias - 1), interval '1 day') gd
     where not exists (
       select 1 from public.cierres_negocio cn
        where cn.negocio_id = v_negocio and cn.fecha = gd::date
     )
  ),
  profs as (
    select pr.id, t.total
      from public.profesionales pr
      cross join lateral (
        select sum(d.total)::int as total
          from unnest(p_servicio_ids) as sv(id)
          join public.servicios s on s.id = sv.id
          cross join lateral public.duracion_efectiva_profesional(
            sv.id, pr.id,
            s.duracion_activa_min,
            coalesce(s.duracion_espera_min, 0),
            coalesce(s.duracion_activa_extra_min, 0)
          ) d
      ) t
     where pr.negocio_id = v_negocio and pr.activo = true
       and (p_profesional_id is null or pr.id = p_profesional_id)
       and not exists (
         select 1 from unnest(p_servicio_ids) as sv2(id)
          where not public.profesional_ofrece_servicio(pr.id, sv2.id)
       )
  ),
  gen as (
    select d.d, p.id as profesional_id, p.total, (g.ts at time zone v_tz) as slot_tz
      from dias d
      cross join profs p
      join public.horarios_profesional h
        on h.profesional_id = p.id
       and h.dia_semana = extract(dow from d.d)::int
      cross join lateral generate_series(
        (d.d + h.hora_inicio),
        (d.d + h.hora_fin) - make_interval(mins => p.total),
        interval '15 minutes'
      ) as g(ts)
  )
  select distinct gen.d
    from gen
   where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
     and not exists (
       select 1 from public.citas c
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and (
            (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
            or
            (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
             and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
             and c.fin > gen.slot_tz)
          )
     )
     and not exists (
       select 1 from public.bloqueos_profesional b
        where b.profesional_id = gen.profesional_id
          and b.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and b.fin    > gen.slot_tz
     )
   order by gen.d;
end;
$fn$;

grant execute on function public.disponibilidad_publica_cadena(text, uuid[], date, uuid) to anon, authenticated;
grant execute on function public.portal_dias_disponibles_cadena(text, uuid[], uuid, integer) to anon, authenticated;
