-- Lista de espera MANUAL (sin WhatsApp): al cancelar una cita, el equipo ve los
-- candidatos compatibles con ese hueco y puede asignar uno directamente.
-- Solo lectura + asignacion en la propia app. Aplicada en remoto (vtrggiogjrhqtwbhbgia) el 2026-06-23.
-- Ambas SECURITY INVOKER: la RLS de citas/lista_espera/clientes ya aisla por negocio.

-- Candidatos de la lista de espera compatibles con el hueco de una cita (mismo criterio
-- que el motor automatico, pero devuelve TODOS, ordenados por prioridad). No crea nada.
create or replace function public.candidatos_para_hueco(p_cita_id uuid)
 returns jsonb language sql stable security invoker set search_path to 'public' as $function$
  with h as (select negocio_id, servicio_id, profesional_id, inicio from public.citas where id = p_cita_id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', le.id, 'nombre', le.nombre, 'telefono', le.telefono, 'prioridad', le.prioridad,
    'servicio_id', le.servicio_id, 'profesional_id', le.profesional_id, 'franja', le.franja,
    'nota', le.nota, 'created_at', le.created_at
  ) order by le.prioridad desc, le.created_at asc), '[]'::jsonb)
  from public.lista_espera le, h
  where le.negocio_id = h.negocio_id
    and le.estado = 'esperando'
    and (le.servicio_id is null or le.servicio_id = h.servicio_id)
    and (le.profesional_id is null or le.profesional_id = h.profesional_id)
    and (le.franja = 'cualquiera' or le.franja =
         case when extract(hour from h.inicio at time zone 'Europe/Madrid') < 14 then 'manana' else 'tarde' end)
    and (le.desde is null or (h.inicio at time zone 'Europe/Madrid')::date >= le.desde)
    and (le.hasta is null or (h.inicio at time zone 'Europe/Madrid')::date <= le.hasta);
$function$;

-- Asigna un candidato al hueco: crea cita confirmada (copiando el slot) y marca el
-- candidato como resuelto. confirmacion/senal_enviada=true => el motor principal NO manda
-- WhatsApp (el equipo contacta manualmente). es_oferta_espera=false (asignacion manual).
create or replace function public.asignar_candidato_hueco(p_cita_id uuid, p_candidato_id uuid)
 returns jsonb language plpgsql security invoker set search_path to 'public' as $function$
declare
  h public.citas; le public.lista_espera; v_cliente uuid; v_cita uuid;
begin
  select * into h from public.citas where id = p_cita_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada'); end if;
  select * into le from public.lista_espera where id = p_candidato_id and negocio_id = h.negocio_id and estado = 'esperando';
  if not found then return jsonb_build_object('ok', false, 'error', 'candidato_no_disponible'); end if;
  v_cliente := le.cliente_id;
  if v_cliente is null then
    select id into v_cliente from public.clientes where negocio_id = h.negocio_id and telefono = le.telefono limit 1;
    if v_cliente is null then
      insert into public.clientes(negocio_id, nombre, telefono) values (h.negocio_id, coalesce(le.nombre, 'Cliente'), le.telefono) returning id into v_cliente;
    end if;
  end if;
  insert into public.citas(negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera,
    estado, canal, es_oferta_espera, deposito_requerido, deposito_pagado, confirmacion_enviada, senal_enviada, recordatorio_enviado)
  values (h.negocio_id, v_cliente, h.servicio_id, h.profesional_id, h.inicio, h.fin, h.fin_activa, h.fin_espera,
    'confirmada', 'web', false, false, false, true, true, false)
  returning id into v_cita;
  update public.lista_espera set estado = 'resuelta' where id = p_candidato_id;
  return jsonb_build_object('ok', true, 'cita_id', v_cita, 'cliente_id', v_cliente);
end;
$function$;

grant execute on function public.candidatos_para_hueco(uuid) to authenticated;
grant execute on function public.asignar_candidato_hueco(uuid, uuid) to authenticated;
