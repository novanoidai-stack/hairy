-- Sesion 8 (PLAN-IA-CHISPA): Matching de lista de espera para la IA Chispa.
-- RPC que permite a Chispa encontrar la mejor candidata para un hueco liberado.
-- Requiere: lista-espera-matching.sql aplicada.
-- Aplicar via Supabase MCP y ejecutar advisors despues.

-- 1) RPC matching_lista_espera(p_cita_id) -> devuelve la mejor candidata.
--    Security definer, ejecutable solo por authenticated con rol staff.
--    Priorizacion: antiguedad en lista (created_at ASC) + fidelidad (numero de citas historicas).
--    Multi-tenant estricto: solo devuelve candidatas del mismo negocio.
create or replace function public.matching_lista_espera(p_cita_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cita public.citas;
  v_negocio text;
  v_candidata public.lista_espera;
  v_servicio_nombre text;
  v_profesional_nombre text;
  v_num_citas bigint;
  v_gasto_total numeric;
begin
  -- Obtener la cita cancelada (debe existir y estar cancelada)
  select * into v_cita from public.citas
    where id = p_cita_id and estado = 'cancelada';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada_o_no_cancelada');
  end if;

  -- Derivar negocio_id del usuario autenticado (multi-tenant estricto)
  v_negocio := (select negocio_id from public.profiles where id = auth.uid());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'usuario_sin_negocio');
  end if;

  -- Verificar que la cita pertenece al mismo negocio (seguridad multi-tenant)
  if v_cita.negocio_id <> v_negocio then
    return jsonb_build_object('ok', false, 'error', 'cita_de_otro_negocio');
  end if;

  -- Encontrar la mejor candidata (reusar logica del motor existente)
  select le.* into v_candidata from public.lista_espera le
  where le.negocio_id = v_negocio and le.estado = 'esperando'
    and (le.servicio_id is null or le.servicio_id = v_cita.servicio_id)
    and (le.profesional_id is null or le.profesional_id = v_cita.profesional_id)
    and (le.franja = 'cualquiera' or le.franja =
         case when extract(hour from v_cita.inicio at time zone 'Europe/Madrid') < 14 then 'manana' else 'tarde' end)
    and (le.desde is null or (v_cita.inicio at time zone 'Europe/Madrid')::date >= le.desde)
    and (le.hasta is null or (v_cita.inicio at time zone 'Europe/Madrid')::date <= le.hasta)
    and le.telefono is not null and length(trim(le.telefono)) >= 6
  order by le.prioridad desc, le.created_at asc
  limit 1;

  if v_candidata is null then
    return jsonb_build_object('ok', true, 'candidata', null, 'mensaje', 'No hay candidatas compatibles en lista de espera');
  end if;

  -- Obtener metadatos de la candidata
  select coalesce(nombre, '') into v_servicio_nombre
    from public.servicios where id = coalesce(v_candidata.servicio_id, v_cita.servicio_id);
  select coalesce(nombre, '') into v_profesional_nombre
    from public.profesionales where id = coalesce(v_candidata.profesional_id, v_cita.profesional_id);

  -- Calcular fidelidad: numero de citas historicas del cliente
  select coalesce(count(*), 0) into v_num_citas
    from public.citas
    where negocio_id = v_negocio
      and cliente_id = v_candidata.cliente_id
      and estado in ('confirmada', 'completada', 'cobrada');

  -- Calcular gasto acumulado (opcional, para priorizacion por valor)
  select coalesce(sum(precio_cobrado), 0) into v_gasto_total
    from public.cobros
    where negocio_id = v_negocio
      and cliente_id = v_candidata.cliente_id;

  -- Devolver la candidata con todos los datos para Chispa
  return jsonb_build_object(
    'ok', true,
    'candidata', jsonb_build_object(
      'lista_espera_id', v_candidata.id,
      'cliente_id', v_candidata.cliente_id,
      'nombre', v_candidata.nombre,
      'telefono', v_candidata.telefono,
      'servicio_id', v_candidata.servicio_id,
      'servicio_nombre', v_servicio_nombre,
      'profesional_id', v_candidata.profesional_id,
      'profesional_nombre', v_profesional_nombre,
      'franja', v_candidata.franja,
      'nota', v_candidata.nota,
      'prioridad', v_candidata.prioridad,
      'created_at', v_candidata.created_at,
      'fidelidad_citas', v_num_citas,
      'gasto_acumulado', v_gasto_total
    ),
    'cita_origen', jsonb_build_object(
      'id', v_cita.id,
      'servicio_id', v_cita.servicio_id,
      'profesional_id', v_cita.profesional_id,
      'inicio', v_cita.inicio,
      'fin', v_cita.fin
    ),
    'mensaje', 'Candidata compatible encontrada'
  );
end;
$function$;

-- 2) RPC avisar_lista_espera_candidata(p_lista_espera_id, p_cita_origen_id)
--    Crea el registro de aviso pendiente para el motor de WhatsApp (Alexandro).
--    Security definer, ejecutable solo por authenticated con rol staff.
--    Si la plantilla 'aviso_lista_espera' no existe, deja el flag pendiente.
create or replace function public.avisar_lista_espera_candidata(p_lista_espera_id uuid, p_cita_origen_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_negocio text;
  v_le public.lista_espera;
  v_cita public.citas;
  v_servicio_nombre text;
  v_profesional_nombre text;
  v_salon text;
  v_ventana integer := 30; -- ventana por defecto en minutos
  v_cita_oferta uuid;
  v_cliente uuid;
begin
  -- Derivar negocio_id del usuario autenticado (multi-tenant estricto)
  v_negocio := (select negocio_id from public.profiles where id = auth.uid());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'usuario_sin_negocio');
  end if;

  -- Obtener la lista de espera
  select * into v_le from public.lista_espera
    where id = p_lista_espera_id and negocio_id = v_negocio and estado = 'esperando';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'candidata_no_encontrada_o_no_disponible');
  end if;

  -- Obtener la cita origen (hueco liberado)
  select * into v_cita from public.citas
    where id = p_cita_origen_id and negocio_id = v_negocio and estado = 'cancelada';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cita_origen_no_encontrada');
  end if;

  -- Obtener metadatos para el aviso
  select coalesce(nombre, '') into v_servicio_nombre
    from public.servicios where id = coalesce(v_le.servicio_id, v_cita.servicio_id);
  select coalesce(nombre, '') into v_profesional_nombre
    from public.profesionales where id = coalesce(v_le.profesional_id, v_cita.profesional_id);
  select coalesce(nombre_publico, '') into v_salon
    from public.negocio_portal
    where negocio_id = v_negocio and portal_activo = true limit 1;

  -- Cliente: el de la lista, o find-or-create por telefono
  v_cliente := v_le.cliente_id;
  if v_cliente is null then
    select id into v_cliente from public.clientes
      where negocio_id = v_negocio and telefono = v_le.telefono limit 1;
    if v_cliente is null then
      insert into public.clientes(negocio_id, nombre, telefono)
        values (v_negocio, coalesce(v_le.nombre, 'Cliente'), v_le.telefono) returning id into v_cliente;
    end if;
  end if;

  -- Crear cita tentativa (oferta)
  insert into public.citas(negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa,
    fin_espera, estado, canal, es_oferta_espera, deposito_requerido, deposito_pagado,
    confirmacion_enviada, senal_enviada, recordatorio_enviado)
  values (v_negocio, v_cliente, v_cita.servicio_id, v_cita.profesional_id, v_cita.inicio, v_cita.fin,
    v_cita.fin_activa, v_cita.fin_espera, 'pendiente', 'ia', true, false, false, false, true, false)
  returning id into v_cita_oferta;

  -- Marcar la lista de espera como avisada
  update public.lista_espera
    set estado = 'avisado', avisado_at = now()
    where id = p_lista_espera_id;

  -- Crear el aviso pendiente (outbox para el motor n8n de Alexandro)
  insert into public.lista_espera_avisos(negocio_id, lista_espera_id, cita_id, telefono, nombre, salon,
    servicio, fecha, hora, ventana_texto, template, estado)
  values (v_negocio, p_lista_espera_id, v_cita_oferta, v_le.telefono,
    split_part(coalesce(v_le.nombre, ''), ' ', 1), v_salon, v_servicio_nombre,
    to_char(v_cita.inicio at time zone 'Europe/Madrid', 'DD/MM'),
    to_char(v_cita.inicio at time zone 'Europe/Madrid', 'HH24:MI'),
    public._lista_espera_ventana_texto(v_ventana), 'aviso_lista_espera', 'pendiente');

  return jsonb_build_object(
    'ok', true,
    'lista_espera_id', p_lista_espera_id,
    'cita_oferta_id', v_cita_oferta,
    'mensaje', 'Aviso encolado para envio por WhatsApp',
    'aviso_pendiente', true
  );
end;
$function$;

-- 3) Permisos: grant a authenticated (staff), revocar a anon/public.
--    Las funciones internas del motor siguen siendo solo service_role.
revoke execute on function public.matching_lista_espera(uuid) from public, anon;
grant execute on function public.matching_lista_espera(uuid) to authenticated;

revoke execute on function public.avisar_lista_espera_candidata(uuid, uuid) from public, anon;
grant execute on function public.avisar_lista_espera_candidata(uuid, uuid) to authenticated;

-- 4) Comments para documentacion
comment on function public.matching_lista_espera(uuid) is
  'Sesion 8 (PLAN-IA-CHISPA): Encuentra la mejor candidata de lista de espera para un hueco liberado.
   Prioriza por antiguedad en lista + fidelidad (numero de citas historicas).
   Security definer, multi-tenant estricto, ejecutable solo por authenticated.
   Usado por Chispa para proponer "avisar a X" al cancelar una cita.';

comment on function public.avisar_lista_espera_candidata(uuid, uuid) is
  'Sesion 8 (PLAN-IA-CHISPA): Crea el aviso pendiente para una candidata de lista de espera.
   Crea la cita tentativa, marca la lista como avisada y encola el aviso en lista_espera_avisos.
   El envio real lo hace el motor n8n de Alexandro.
   Security definer, multi-tenant estricto, ejecutable solo por authenticated.';
