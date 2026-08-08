-- Fix: el portal publico dejaba de ofrecer el reposo de una cita como hueco reservable.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- disponibilidad_publica y portal_dias_disponibles bloqueaban el rango COMPLETO
-- [inicio, fin] de cualquier cita existente, sin mirar nunca fin_activa/fin_espera.
-- El comentario original en migrations/portal-reserva-publica.sql lo documentaba como
-- decision consciente de v1 ("conservador; el aprovechamiento de reposos es una
-- optimizacion solo para uso interno"). Esta migracion alinea el portal publico con
-- el modelo que ya usa la agenda interna (lib/retrasos.ts: ventanasActivas): una cita
-- ocupa [inicio, fin_activa) y, si hay reposo real, [fin_espera, fin); el tramo
-- [fin_activa, fin_espera) queda libre.
--
-- disponibilidad_publica gana ademas dos columnas: en_reposo (bool) y
-- reposo_disponible_min (minutos exactos que quedan desde ese slot hasta que el
-- profesional necesita volver con la clienta original). Se calculan gratis en la
-- misma consulta: como el NOT EXISTS ya descarta cualquier choque con una fase
-- activa, cualquier solape restante contra el rango total de otra cita cae
-- necesariamente dentro de su reposo.
--
-- OJO grants: disponibilidad_publica CAMBIA su RETURNS TABLE (gana 2 columnas), y
-- Postgres rechaza eso en un CREATE OR REPLACE (42P13: cannot change return type of
-- existing function) — hay que DROP + CREATE, lo que borra los grants existentes, asi
-- que se re-otorgan a mano al final (confirmados por consulta directa a
-- information_schema.routine_privileges antes de escribir esta migracion: anon,
-- authenticated, service_role tienen EXECUTE; PUBLIC no). portal_dias_disponibles NO
-- cambia su RETURNS TABLE, asi que ahi CREATE OR REPLACE si preserva los grants sin
-- tocar nada mas.

DROP FUNCTION IF EXISTS public.disponibilidad_publica(text, uuid, date, uuid);

CREATE FUNCTION public.disponibilidad_publica(p_slug text, p_servicio_id uuid, p_fecha date, p_profesional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profesional_id uuid, profesional_nombre text, slot timestamp with time zone, en_reposo boolean, reposo_disponible_min integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_total     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

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
           (g.ts at time zone v_tz) as slot_tz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => v_total),
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
          and c2.inicio < gen.slot_tz + make_interval(mins => v_total)
          and c2.fin    > gen.slot_tz
      ) as en_reposo,
      (
        select min(round(extract(epoch from (
          coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
        )) / 60)::int)
        from public.citas c3
        where c3.profesional_id = gen.profesional_id
          and c3.estado in ('pendiente','confirmada')
          and c3.inicio < gen.slot_tz + make_interval(mins => v_total)
          and c3.fin    > gen.slot_tz
      ) as disponible_min
  ) reposo
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => v_total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => v_total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.slot_tz, pr.nombre;
end;
$function$;

-- DROP borro los grants: se re-otorgan exactamente los que tenia antes de esta migracion
-- (confirmado por consulta directa a information_schema.routine_privileges: anon,
-- authenticated, service_role — PUBLIC no tenia EXECUTE, no se le concede aqui).
GRANT EXECUTE ON FUNCTION public.disponibilidad_publica(text, uuid, date, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_dias_disponibles(p_slug text, p_servicio_id uuid, p_profesional_id uuid DEFAULT NULL::uuid, p_dias integer DEFAULT 21)
 RETURNS TABLE(dia date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_total   int;
  v_min_ant int;
  v_tz      text := 'Europe/Madrid';
  v_hoy     date;
  v_dias    int := least(greatest(coalesce(p_dias, 21), 1), 60);
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select duracion_activa_min + coalesce(duracion_espera_min,0) + coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0)
    into v_total, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_total is null then return; end if;

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
    select pr.id
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  gen as (
    select d.d,
           p.id as profesional_id,
           (g.ts at time zone v_tz) as slot_tz
    from dias d
    cross join profs p
    join public.horarios_profesional h
      on h.profesional_id = p.id
     and h.dia_semana = extract(dow from d.d)::int
    cross join lateral generate_series(
      (d.d + h.hora_inicio),
      (d.d + h.hora_fin) - make_interval(mins => v_total),
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
          (c.inicio < gen.slot_tz + make_interval(mins => v_total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => v_total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.d;
end;
$function$;
