-- Migracion: portal_dias_disponibles (C1.1)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Devuelve, para los proximos N dias, que dias tienen AL MENOS un hueco reservable
-- (mismo criterio que disponibilidad_publica: horario laboral, antelacion minima, sin
-- solape con citas activas ni con bloqueos). De un solo viaje, para que el portal:
--   1) auto-seleccione el primer dia con disponibilidad real (arregla el bug de UX por
--      el que el portal arrancaba en "hoy" y, fuera de horario, parecia roto),
--   2) pinte en gris (no clicable) los dias cerrados/pasados/completos.
--
-- Seguridad: anonimo, security definer, mismo patron de grants que el resto del portal.
-- Zona horaria del salon (v1): Europe/Madrid.

create or replace function public.portal_dias_disponibles(
  p_slug           text,
  p_servicio_id    uuid,
  p_profesional_id uuid default null,
  p_dias           int  default 21
)
returns table(dia date)
language plpgsql
stable
security definer
set search_path = public
as $$
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
        and c.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c.fin    > gen.slot_tz
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.d;
end;
$$;

revoke all on function public.portal_dias_disponibles(text, uuid, uuid, int) from public;
grant execute on function public.portal_dias_disponibles(text, uuid, uuid, int) to anon, authenticated;
