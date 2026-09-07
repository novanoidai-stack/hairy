CREATE OR REPLACE FUNCTION public.modificar_cita_publica(p_slug text, p_cita_id uuid, p_telefono text, p_nuevo_inicio timestamp with time zone, p_nuevo_profesional_id uuid DEFAULT NULL::uuid, p_canal text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio    text;
  v_cita       record;
  v_prof       uuid;
  v_dur        int;
  v_espera     int;
  v_extra      int;
  v_total      int;
  v_min_ant    int;
  v_fin        timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
  v_tz         text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if exists (select 1 from public.cierres_negocio cn
      where cn.negocio_id = v_negocio and cn.fecha = (p_nuevo_inicio at time zone v_tz)::date) then
    raise exception 'El salon esta cerrado ese dia';
  end if;

  select c.id, c.estado, c.inicio, c.servicio_id, c.profesional_id
    into v_cita
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);
  if v_cita.id is null then raise exception 'Cita no encontrada'; end if;
  if v_cita.estado not in ('pendiente','confirmada') then raise exception 'La cita no se puede modificar'; end if;
  if v_cita.inicio <= now() then raise exception 'La cita ya ha pasado'; end if;

  v_prof := coalesce(p_nuevo_profesional_id, v_cita.profesional_id);

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = v_cita.servicio_id and negocio_id = v_negocio;
  if v_dur is null then raise exception 'Servicio no valido'; end if;

  if not exists (
    select 1 from public.profesionales
    where id = v_prof and negocio_id = v_negocio and activo = true
  ) then raise exception 'Profesional no valido'; end if;

  -- Override activo = false: ese profesional no realiza este servicio.
  if not public.profesional_ofrece_servicio(v_prof, v_cita.servicio_id) then
    raise exception 'Ese profesional no realiza este servicio';
  end if;

  -- Duracion efectiva: al cambiar de profesional el bloque se recalcula con SU duracion.
  select d.activa, d.espera, d.extra
    into v_dur, v_espera, v_extra
  from public.duracion_efectiva_profesional(v_cita.servicio_id, v_prof, v_dur, v_espera, v_extra) d;

  v_total      := v_dur + v_espera + v_extra;
  v_fin_activa := p_nuevo_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_nuevo_inicio + make_interval(mins => v_dur + v_espera);
  v_fin        := p_nuevo_inicio + make_interval(mins => v_total);

  if p_nuevo_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
    raise exception 'Fuera de la antelacion minima';
  end if;

  if not exists (
    select 1 from public.horarios_profesional h
    where h.profesional_id = v_prof
      and h.dia_semana = extract(dow from (p_nuevo_inicio at time zone v_tz))::int
      and (p_nuevo_inicio at time zone v_tz)::time >= h.hora_inicio
      and (v_fin         at time zone v_tz)::time <= h.hora_fin
  ) then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    cross join lateral public.ventanas_activas_cita(c.id, c.inicio, c.fin_activa, c.fin_espera, c.fin) v
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and v.desde < v_fin
      and v.hasta > p_nuevo_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = v_prof
      and b.inicio < v_fin and b.fin > p_nuevo_inicio
  ) then raise exception 'El profesional no esta disponible'; end if;

  update public.citas
    set inicio = p_nuevo_inicio,
        fin = v_fin,
        fin_activa = v_fin_activa,
        fin_espera = v_fin_espera,
        profesional_id = v_prof,
        confirmacion_enviada = false,
        recordatorio_enviado = false,
        modificado_at = now()
  where id = p_cita_id;

  return jsonb_build_object(
    'ok', true,
    'cita_id', p_cita_id,
    'inicio', p_nuevo_inicio,
    'fin', v_fin,
    'profesional_id', v_prof
  );
end;
$function$
