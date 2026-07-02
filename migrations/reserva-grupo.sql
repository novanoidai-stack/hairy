-- =====================================================================
-- Mecha · Reserva de grupo por el portal público
-- =====================================================================
-- Permite reservar varias personas para la MISMA hora de inicio, cada una con
-- su servicio y profesional. Se guardan como N citas con el mismo grupo_id
-- (columnas grupo_id / orden_en_grupo ya existen en `citas`).
--
-- Restricciones v0 para acotar riesgo (§ CLAUDE.md: no meter deuda innecesaria):
--   - Sin depósito online — reserva de grupo siempre nace `confirmada`. Los
--     depósitos individuales se pueden añadir después (usarían la misma logica
--     de perfil_riesgo por asistente y romperia el simple "todo o nada" de UX).
--   - Todos los asistentes empiezan a la misma hora (uso típico: bodas, madres+hijas,
--     grupo de amigas). Servicios encadenados NO entran aquí, ya existen en agenda.
--   - Máximo 6 asistentes por reserva (control DoS y sensatez de portal público).
--   - El "reservante" es el cliente 1; el resto se asocia como cita anónima con notas
--     "Grupo i/N — nombre_asistente" para que en la agenda se vea el contexto.
-- =====================================================================

create or replace function public.crear_cita_publica_grupo(
  p_slug text,
  p_inicio timestamptz,
  p_reservante_nombre text,
  p_reservante_telefono text,
  p_reservante_email text,
  p_asistentes jsonb,       -- [{nombre, servicio_id, profesional_id, notas?}]
  p_consentimiento_datos boolean default true,
  p_captcha_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_grupo uuid := gen_random_uuid();
  v_cliente uuid;
  v_asistente jsonb;
  v_orden smallint := 0;
  v_cita_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_dur int; v_espera int; v_extra int; v_min_ant int;
  v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_servicio_id uuid; v_prof_id uuid; v_asist_nombre text; v_asist_notas text;
  v_tz text := 'Europe/Madrid';
  v_n int;
begin
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if coalesce(length(trim(p_reservante_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;
  if coalesce(length(trim(p_reservante_telefono)), 0) < 6 then raise exception 'Indica un telefono valido.'; end if;

  if jsonb_typeof(p_asistentes) <> 'array' then raise exception 'Formato de asistentes invalido'; end if;
  v_n := jsonb_array_length(p_asistentes);
  if v_n < 1 then raise exception 'Añade al menos un asistente'; end if;
  if v_n > 6 then raise exception 'Máximo 6 asistentes por reserva de grupo'; end if;

  -- Bloqueado?
  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_reservante_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva con estos datos. Contacta con el salon.';
  end if;

  -- Anti-abuso: mismo criterio que crear_cita_publica
  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_reservante_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) + v_n > 6 then
    raise exception 'Ya tienes muchas citas pendientes. Contacta con el salon para gestionar el grupo.';
  end if;

  if (select count(*) from public.citas where negocio_id = v_negocio and canal = 'web'
      and created_at > now() - interval '1 hour') + v_n >= 40 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  -- Upsert del reservante como cliente 1
  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_reservante_telefono) limit 1;
  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email)
    values (v_negocio, left(trim(p_reservante_nombre), 120), trim(p_reservante_telefono),
            left(nullif(trim(p_reservante_email), ''), 200))
    returning id into v_cliente;
  end if;

  -- Validar y crear cada cita en orden
  for v_asistente in select value from jsonb_array_elements(p_asistentes) loop
    v_orden := v_orden + 1;
    v_asist_nombre := left(trim(coalesce(v_asistente->>'nombre', '')), 120);
    v_servicio_id := (v_asistente->>'servicio_id')::uuid;
    v_prof_id := (v_asistente->>'profesional_id')::uuid;
    v_asist_notas := left(nullif(trim(coalesce(v_asistente->>'notas', '')), ''), 500);

    if v_asist_nombre = '' then raise exception 'Falta el nombre del asistente %', v_orden; end if;

    select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
           coalesce(min_antelacion_min,0)
      into v_dur, v_espera, v_extra, v_min_ant
    from public.servicios
    where id = v_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
    if v_dur is null then raise exception 'Servicio no reservable para el asistente %', v_orden; end if;

    if not exists (select 1 from public.profesionales where id = v_prof_id and negocio_id = v_negocio and activo = true) then
      raise exception 'Profesional no valido para el asistente %', v_orden;
    end if;

    v_fin_activa := p_inicio + make_interval(mins => v_dur);
    v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
    v_fin := p_inicio + make_interval(mins => v_dur + v_espera + v_extra);

    if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
      raise exception 'Fuera de la antelacion minima';
    end if;

    if not exists (select 1 from public.horarios_profesional h where h.profesional_id = v_prof_id
        and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
        and (p_inicio at time zone v_tz)::time >= h.hora_inicio and (v_fin at time zone v_tz)::time <= h.hora_fin) then
      raise exception 'Fuera del horario laboral del profesional del asistente %', v_orden;
    end if;

    if exists (select 1 from public.citas c where c.profesional_id = v_prof_id and c.estado in ('pendiente','confirmada')
        and c.inicio < v_fin and c.fin > p_inicio) then
      raise exception 'El hueco del asistente % ya esta ocupado', v_orden;
    end if;

    if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = v_prof_id
        and b.inicio < v_fin and b.fin > p_inicio) then
      raise exception 'Profesional no disponible en el asistente %', v_orden;
    end if;

    insert into public.citas (
      negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
      estado, canal, notas, deposito_requerido, deposito_pagado, confirmado_por_cliente,
      grupo_id, orden_en_grupo
    ) values (
      v_negocio, v_prof_id, v_servicio_id,
      case when v_orden = 1 then v_cliente else null end,
      p_inicio, v_fin, v_fin_activa, v_fin_espera,
      'confirmada', 'web',
      trim(concat('Grupo ', v_orden, '/', v_n, ' — ', v_asist_nombre,
                  case when v_asist_notas is not null then E'\n' || v_asist_notas else '' end)),
      false, false, true,
      v_grupo, v_orden
    ) returning id into v_cita_id;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'cita_id', v_cita_id, 'orden', v_orden, 'nombre', v_asist_nombre
    ));
  end loop;

  return jsonb_build_object(
    'ok', true, 'grupo_id', v_grupo, 'cliente_id', v_cliente,
    'total', v_n, 'citas', v_result, 'inicio', p_inicio
  );
end;
$$;

revoke all on function public.crear_cita_publica_grupo(text,timestamptz,text,text,text,jsonb,boolean,text)
  from public;
grant execute on function public.crear_cita_publica_grupo(text,timestamptz,text,text,text,jsonb,boolean,text)
  to anon, authenticated;
