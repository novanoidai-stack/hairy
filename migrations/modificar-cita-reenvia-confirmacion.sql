-- Al reagendar una cita desde el portal (/app/cita/[id]), resetear los flags de notificacion
-- para que el motor reenvie una confirmacion con la NUEVA fecha y reprograme el recordatorio.
-- Unico cambio respecto a la version anterior: el UPDATE añade
--   confirmacion_enviada = false, recordatorio_enviado = false.
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-17.

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

  select c.id, c.estado, c.inicio, c.servicio_id, c.profesional_id
    into v_cita
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_cita_id and c.negocio_id = v_negocio and cl.telefono = trim(p_telefono);
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
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_nuevo_inicio
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
$function$;
