-- fix-cobro-ambiguo-y-precio-cobrado.sql
-- Aplicada en remoto vía MCP (proyecto vtrggiogjrhqtwbhbgia) el 12 jul 2026.
--
-- BUG 1 (dinero): "No se pudo registrar el cobro" en TODO cobro normal.
--   crear_cobro_desde_cita tenia dos overloads: (uuid,text,int,int) y
--   (uuid,text,int,int,int,int) con DEFAULTs en los dos ultimos. Una llamada de
--   4 args (el cobro no-dividido, el caso comun) resolvia contra AMBAS =>
--   SQLSTATE 42725 "function ... is not unique". El overload de 6 args es un
--   superset (efectivo/datafono/mixto), asi que borramos el de 4 args.
--
-- BUG 2 (fidelizacion + lista de espera): funciones referenciaban la columna
--   inexistente precio_cobrado (en cobros o citas). El gasto real vive en
--   cobros.total_cents. Sin esto: nivel/logros siempre "Nuevo"/0 y
--   matching_lista_espera petaba (spam de "column precio_cobrado does not exist"
--   en cada apertura de ficha, porque la ficha llama obtener_nivel_cliente).

-- ── BUG 1 ────────────────────────────────────────────────────────────────────
drop function if exists public.crear_cobro_desde_cita(uuid, text, integer, integer);

-- ── BUG 2 ────────────────────────────────────────────────────────────────────
create or replace function public.obtener_nivel_cliente(p_cliente_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_negocio_id text; v_visitas integer; v_gastado_cents integer; v_nivel niveles_fidelizacion%rowtype;
begin
  select negocio_id into v_negocio_id from clientes where id = p_cliente_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); end if;
  select count(*) into v_visitas from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  select * into v_nivel from niveles_fidelizacion where negocio_id = v_negocio_id and activo = true and (v_visitas >= umbral_visitas or v_gastado_cents >= umbral_gastado_cents) order by orden desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'nivel', jsonb_build_object('nombre', 'Nuevo', 'color', '#9ca3af', 'orden', 0), 'visitas', v_visitas, 'gastado_cents', v_gastado_cents);
  end if;
  return jsonb_build_object('ok', true, 'nivel', jsonb_build_object('id', v_nivel.id, 'nombre', v_nivel.nombre, 'color', v_nivel.color, 'icono', v_nivel.icono, 'orden', v_nivel.orden), 'visitas', v_visitas, 'gastado_cents', v_gastado_cents);
end; $function$;

create or replace function public.verificar_logros_cliente(p_cliente_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_negocio_id text; v_visitas integer; v_gastado_cents integer; v_logro record; v_cumple boolean; v_condicion jsonb; v_desbloqueados integer := 0;
begin
  select negocio_id into v_negocio_id from clientes where id = p_cliente_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); end if;
  select count(*) into v_visitas from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  for v_logro in select * from logros where negocio_id = v_negocio_id and activo = true loop
    if exists (select 1 from logros_desbloqueados where cliente_id = p_cliente_id and logro_id = v_logro.id) then continue; end if;
    v_cumple := false; v_condicion := v_logro.condicion;
    case v_logro.tipo
      when 'primera_visita' then v_cumple := v_visitas >= 1;
      when 'visitas_multiple' then v_cumple := v_visitas >= coalesce((v_condicion->>'visitas')::integer, 0);
      when 'gastado_total' then v_cumple := v_gastado_cents >= coalesce((v_condicion->>'gastado_cents')::integer, 0);
      when 'sin_noshow' then v_cumple := not exists (select 1 from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'no_show' and inicio >= now() - (coalesce((v_condicion->>'meses_sin_noshow')::integer, 6) || ' months')::interval);
      else v_cumple := false;
    end case;
    if v_cumple then
      insert into logros_desbloqueados (negocio_id, cliente_id, logro_id, desbloqueado_en) values (v_negocio_id, p_cliente_id, v_logro.id, now());
      v_desbloqueados := v_desbloqueados + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'desbloqueados', v_desbloqueados, 'visitas', v_visitas, 'gastado_cents', v_gastado_cents);
end; $function$;

create or replace function public.matching_lista_espera(p_cita_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cita public.citas;
  v_negocio text;
  v_candidata public.lista_espera;
  v_servicio_nombre text;
  v_profesional_nombre text;
  v_num_citas bigint;
  v_gasto_total numeric;
begin
  select * into v_cita from public.citas where id = p_cita_id and estado = 'cancelada';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada_o_no_cancelada');
  end if;
  v_negocio := (select negocio_id from public.profiles where id = auth.uid());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'usuario_sin_negocio');
  end if;
  if v_cita.negocio_id <> v_negocio then
    return jsonb_build_object('ok', false, 'error', 'cita_de_otro_negocio');
  end if;
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
  select coalesce(nombre, '') into v_servicio_nombre
    from public.servicios where id = coalesce(v_candidata.servicio_id, v_cita.servicio_id);
  select coalesce(nombre, '') into v_profesional_nombre
    from public.profesionales where id = coalesce(v_candidata.profesional_id, v_cita.profesional_id);
  select coalesce(count(*), 0) into v_num_citas
    from public.citas
    where negocio_id = v_negocio
      and cliente_id = v_candidata.cliente_id
      and estado in ('confirmada', 'completada', 'cobrada');
  select coalesce(sum(total_cents), 0) into v_gasto_total
    from public.cobros
    where negocio_id = v_negocio
      and cliente_id = v_candidata.cliente_id;
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
