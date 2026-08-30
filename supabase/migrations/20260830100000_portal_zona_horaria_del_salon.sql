-- El portal publico daba las horas siempre en Europe/Madrid.
--
-- `disponibilidad_publica` tenia el huso INCRUSTADO (`v_tz text := 'Europe/Madrid'`)
-- aunque la zona del salon SI es configurable desde el alta (`negocio_config.config
-- ->> 'timezone'`, que es lo que ya lee `avisos_del_negocio`). Consecuencia real:
-- un salon canario publicaba toda su disponibilidad con UNA HORA de desfase, y la
-- clienta reservaba a una hora a la que el salon no la esperaba.
--
-- No es un caso hipotetico de laboratorio: Canarias es la unica comunidad con huso
-- propio y ahi el fallo es sistematico, no un borde. Y el desfase es SILENCIOSO --
-- los huecos existen, cuadran entre si y no rompen ninguna validacion; solo estan
-- corridos.
--
-- Se cambia UNA sola cosa (de donde sale v_tz). El resto de la funcion queda
-- exactamente igual, incluida la geometria de fases activa/reposo/final, que es
-- delicada y no toca aqui.
create or replace function public.disponibilidad_publica(
  p_slug text,
  p_servicio_id uuid,
  p_fecha date,
  p_profesional_id uuid default null::uuid
)
returns table(
  profesional_id uuid,
  profesional_nombre text,
  slot timestamp with time zone,
  en_reposo boolean,
  reposo_disponible_min integer
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  -- La zona del SALON, no la de la sede. El coalesce mantiene el comportamiento
  -- de siempre para los salones que no la tienen puesta (que son la mayoria).
  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid')
    into v_tz
  from public.negocio_config c
  where c.negocio_id = v_negocio;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  return query
  with profs as (
    select pr.id, pr.nombre, d.total
    from public.profesionales pr
    cross join lateral public.duracion_efectiva_profesional(p_servicio_id, pr.id, v_dur, v_espera, v_extra) d
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
      and public.profesional_ofrece_servicio(pr.id, p_servicio_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin, p.total
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           f.total,
           (g.ts at time zone v_tz) as slot_tz
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
$function$;

comment on function public.disponibilidad_publica(text, uuid, date, uuid) is
  'Huecos del portal publico. El huso sale de negocio_config->>timezone (no incrustado): un salon canario daba citas con 1 h de desfase.';
