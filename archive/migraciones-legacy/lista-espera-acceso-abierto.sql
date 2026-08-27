-- Migration: lista-espera-acceso-abierto.sql
-- Sustituye a lista_espera_express_publica (rechaza clientes nuevos/no-VIP, e inserta un
-- estado 'pendiente' que viola el CHECK de la tabla, asi que hoy falla siempre). Acceso
-- abierto a cualquier cliente; la fidelidad ya no es gate de entrada, solo orden de cola.
-- Ver docs/superpowers/specs/2026-08-10-lista-espera-acceso-abierto-design.md

create or replace function public.lista_espera_unirse_publica(
  p_slug text,
  p_telefono text,
  p_cliente_nombre text,
  p_servicio_id uuid default null,
  p_profesional_id uuid default null,
  p_franja text default 'cualquiera',
  p_desde date default null,
  p_hasta date default null,
  p_consentimiento_datos boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_cliente uuid;
  v_prioridad smallint := 0;
  v_franja text;
begin
  if not coalesce(p_consentimiento_datos, false) then
    return jsonb_build_object('ok', false, 'error', 'Debes aceptar el tratamiento de datos para apuntarte.');
  end if;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Negocio no encontrado');
  end if;

  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Indica tu nombre.');
  end if;
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    return jsonb_build_object('ok', false, 'error', 'Indica un telefono valido.');
  end if;

  v_franja := case when p_franja in ('manana', 'tarde', 'cualquiera') then p_franja else 'cualquiera' end;

  -- Anti-abuso por negocio/canal, mismo umbral que crear_cita_publica.
  if (select count(*) from public.lista_espera where negocio_id = v_negocio and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'No es posible apuntarse en este momento. Llama al salon, por favor.');
  end if;

  -- 1. Resolver o crear cliente (mismo patron de find-or-create que crear_cita_publica).
  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) limit 1;

  if v_cliente is not null and exists (select 1 from public.clientes where id = v_cliente and bloqueado = true) then
    return jsonb_build_object('ok', false, 'error', 'No es posible completar la solicitud con estos datos. Por favor, contacta directamente con el salon.');
  end if;

  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono)
    values (v_negocio, left(trim(p_cliente_nombre), 120), trim(p_telefono))
    returning id into v_cliente;
  end if;

  -- Tope de solicitudes activas por cliente (evita acumular entradas sin limite).
  if (select count(*) from public.lista_espera where negocio_id = v_negocio and cliente_id = v_cliente and estado in ('esperando', 'avisado')) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes varias solicitudes activas en la lista de espera.');
  end if;

  -- 2. Prioridad = snapshot del nivel de fidelidad resuelto (automatico u override manual).
  v_prioridad := coalesce((public.obtener_nivel_cliente(v_cliente) -> 'nivel' ->> 'orden')::smallint, 0);

  -- 3. Insertar. estado debe ser 'esperando' (CHECK de la tabla).
  insert into public.lista_espera (
    negocio_id, cliente_id, nombre, telefono, servicio_id, profesional_id,
    franja, desde, hasta, estado, prioridad, nota
  ) values (
    v_negocio, v_cliente, left(trim(p_cliente_nombre), 120), trim(p_telefono), p_servicio_id, p_profesional_id,
    v_franja,
    coalesce(p_desde, current_date),
    coalesce(p_hasta, current_date + 21),
    'esperando',
    v_prioridad,
    'Alta desde el portal'
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.lista_espera_unirse_publica(text, text, text, uuid, uuid, text, date, date, boolean) from public;
grant execute on function public.lista_espera_unirse_publica(text, text, text, uuid, uuid, text, date, date, boolean) to anon, authenticated;

-- Limpieza: huerfanos tras eliminar el concepto de "cita expres" (auto-book +
-- gate de elegibilidad). lista_espera_unirse_publica (arriba) los sustituye.
drop function if exists public.lista_espera_express_publica(text, uuid, text, uuid, date, date);
drop function if exists public.disponibilidad_express_publica(text, uuid, text, uuid, integer);
drop function if exists public.crear_cita_publica_express(text, uuid, uuid, timestamptz, text, text, text, text, boolean, boolean, text);

alter table public.niveles_fidelizacion drop column if exists acceso_express;
alter table public.citas drop column if exists origen_express;
