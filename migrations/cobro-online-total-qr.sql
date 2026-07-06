-- migrations/cobro-online-total-qr.sql
-- S1 del plan de pagos (informes/PLAN_PAGOS_MECHA.md): cobro del TOTAL del servicio en el
-- local por QR de mostrador + enlace anonimo "paga tu total", conciliado en el libro de
-- cobros (POS). Es el "POS-2 real" que el modelo de cobros ya anticipaba (metodo online/bizum).
--
-- Arquitectura:
--   - Reutiliza cita_pago_enlaces (token opaco) ampliado con `tipo` (senal|total).
--   - pagos.tipo='total' = importe pendiente a cobrar (precio - senal - descuento + propina).
--   - Al confirmar el webhook, registrar_cobro_online() crea el cobro (verdad fiscal/operativa),
--     nunca se pre-crea y actualiza (cobros es inmutable: trigger cobros_prevent_financial_updates).
--
-- ADITIVA. No toca el flujo de senal existente (crear-checkout-senal / resolver_enlace_pago).
-- Tras aplicar: pasar advisors de seguridad (regla del repo).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) cita_pago_enlaces: distinguir tipo de enlace (senal | total)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.cita_pago_enlaces
  add column if not exists tipo text not null default 'senal'
  check (tipo in ('senal','total'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2) enlace_pago_token(cita, tipo): get-or-create del token vivo POR TIPO.
--    Reemplaza la version de 1 argumento; el trigger de senal la llama con 1 arg
--    (usa el default 'senal'), asi que su comportamiento no cambia.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.enlace_pago_token(uuid);
create or replace function public.enlace_pago_token(p_cita_id uuid, p_tipo text default 'senal')
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
  v_negocio text;
begin
  if p_tipo not in ('senal','total') then
    raise exception 'tipo_invalido';
  end if;

  select token into v_token
    from public.cita_pago_enlaces
    where cita_id = p_cita_id and tipo = p_tipo and expira_at > now()
    order by created_at desc
    limit 1;
  if v_token is not null then
    return v_token;
  end if;

  select negocio_id into v_negocio from public.citas where id = p_cita_id;
  if v_negocio is null then
    raise exception 'cita_not_found';
  end if;

  insert into public.cita_pago_enlaces (token, cita_id, negocio_id, tipo)
  values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), p_cita_id, v_negocio, p_tipo)
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.enlace_pago_token(uuid, text) from public, anon, authenticated;
grant execute on function public.enlace_pago_token(uuid, text) to service_role;

-- Resolver token -> (cita_id, tipo). NULL si no existe o caducado. Para la edge de cobro.
create or replace function public.resolver_enlace_pago_full(p_token text)
returns table (cita_id uuid, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select cita_id, tipo from public.cita_pago_enlaces
  where token = p_token and expira_at > now()
  limit 1;
$$;
revoke all on function public.resolver_enlace_pago_full(text) from public, anon, authenticated;
grant execute on function public.resolver_enlace_pago_full(text) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) requerir_pago_total_cita: crea/actualiza el pago 'total' pendiente de una cita.
--    Importe = precio del/los servicio(s) - senal ya pagada - descuento + propina.
--    Analogo a requerir_senal_cita. Idempotente (get-or-update del pendiente).
--    Guarda propina/descuento/metodo en metadata para reconstruir el cobro luego.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.requerir_pago_total_cita(
  p_cita_id uuid,
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_metodo text default 'online'
)
returns public.pagos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_base int;
  v_senal int;
  v_prop int := greatest(0, coalesce(p_propina_cents, 0));
  v_desc int := greatest(0, coalesce(p_descuento_cents, 0));
  v_total int;
  v_pago public.pagos;
begin
  if p_metodo not in ('online','bizum') then raise exception 'metodo_invalido'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_not_found'; end if;

  -- Solo el negocio dueno (o el service_role, sin auth.uid()) puede pedirlo.
  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;

  -- Base = precio de servicio(s). En grupo, suma de precios; cabecera = primera del grupo.
  if v_cita.grupo_id is not null then
    select coalesce(sum(round(coalesce(s.precio, 0) * 100)::int), 0)
      into v_base
      from public.citas c
      left join public.servicios s on s.id = c.servicio_id
      where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1;
  else
    select coalesce(round(coalesce(s.precio, 0) * 100)::int, 0)
      into v_base from public.servicios s where s.id = v_cita.servicio_id;
    v_cabecera := v_cita.id;
  end if;

  -- Senal ya pagada online se DESCUENTA (nunca se suma).
  select coalesce(sum(importe_cents), 0) into v_senal
    from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pagado';

  v_total := greatest(0, coalesce(v_base, 0) - v_senal - v_desc) + v_prop;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'total' and estado = 'pendiente'
    limit 1;

  if found then
    update public.pagos
      set importe_cents = v_total,
          metadata = coalesce(metadata, '{}'::jsonb)
                     || jsonb_build_object('propina_cents', v_prop, 'descuento_cents', v_desc, 'metodo', p_metodo),
          updated_at = now()
      where id = v_pago.id returning * into v_pago;
  else
    insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado, metadata)
    values (v_cita.negocio_id, v_cabecera, v_cita.cliente_id, 'total', v_total, 'pendiente',
            jsonb_build_object('propina_cents', v_prop, 'descuento_cents', v_desc, 'metodo', p_metodo))
    returning * into v_pago;
  end if;

  return v_pago;
end;
$$;
revoke all on function public.requerir_pago_total_cita(uuid, integer, integer, text) from public, anon;
grant execute on function public.requerir_pago_total_cita(uuid, integer, integer, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) iniciar_cobro_online: accion del staff. Crea el pago 'total' pendiente + token,
--    devuelve el token para pintar el QR / enviar el enlace. Auth staff del negocio.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.iniciar_cobro_online(
  p_cita_id uuid,
  p_metodo text default 'online',
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_cita public.citas;
  v_pago public.pagos;
  v_token text;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;

  v_pago := public.requerir_pago_total_cita(p_cita_id, p_propina_cents, p_descuento_cents, p_metodo);
  if v_pago.id is null or coalesce(v_pago.importe_cents, 0) <= 0 then
    raise exception 'nada_que_cobrar';
  end if;

  -- El token cuelga de la cita cabecera (la que guarda el pago).
  v_token := public.enlace_pago_token(v_pago.cita_id, 'total');

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'pago_id', v_pago.id,
    'importe_cents', v_pago.importe_cents
  );
end;
$$;
revoke all on function public.iniciar_cobro_online(uuid, text, integer, integer) from public, anon;
grant execute on function public.iniciar_cobro_online(uuid, text, integer, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) pago_info_publica: getter anonimo por token para la pagina /app/pagar/[token].
--    Sin PII mas alla de lo imprescindible (salon + servicio). Importe server-side.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pago_info_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita_id uuid;
  v_tipo text;
  v_cita public.citas;
  v_importe int;
  v_salon text;
  v_servicio text;
  v_requiere_datos boolean;
  v_cli public.clientes;
begin
  select cita_id, tipo into v_cita_id, v_tipo
    from public.cita_pago_enlaces
    where token = p_token and expira_at > now()
    limit 1;
  if v_cita_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select * into v_cita from public.citas where id = v_cita_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select coalesce(np.nombre_publico, '') into v_salon
    from public.negocio_portal np where np.negocio_id = v_cita.negocio_id;
  select coalesce(s.nombre, '') into v_servicio
    from public.servicios s where s.id = v_cita.servicio_id;

  -- Importe: el pago pendiente de ese tipo (si existe); si no, 0.
  select importe_cents into v_importe
    from public.pagos
    where cita_id = v_cita_id and tipo = v_tipo and estado = 'pendiente'
    order by created_at desc limit 1;

  select * into v_cli from public.clientes where id = v_cita.cliente_id;
  v_requiere_datos := (v_cli.id is null)
    or coalesce(length(trim(v_cli.nombre)), 0) < 2
    or coalesce(length(public.normalizar_telefono(v_cli.telefono)), 0) < 7;

  return jsonb_build_object(
    'ok', true,
    'tipo', v_tipo,
    'salon', v_salon,
    'servicio', v_servicio,
    'inicio', v_cita.inicio,
    'importe_cents', coalesce(v_importe, 0),
    'moneda', 'EUR',
    'estado', v_cita.estado,
    'cobrada', coalesce(v_cita.cobrada, false),
    'requiere_datos', v_requiere_datos
  );
end;
$$;
revoke all on function public.pago_info_publica(text) from public;
grant execute on function public.pago_info_publica(text) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) completar_datos_pago_publico: el invitado rellena nombre/telefono/email y acepta
--    la politica antes de pagar. Escribe en el cliente de la cita + log de consentimiento.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.completar_datos_pago_publico(
  p_token text,
  p_nombre text,
  p_telefono text,
  p_email text default null,
  p_acepto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita_id uuid;
  v_cita public.citas;
  v_cli_id uuid;
begin
  if not p_acepto then
    return jsonb_build_object('ok', false, 'motivo', 'sin_consentimiento');
  end if;
  if coalesce(length(trim(p_nombre)), 0) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'nombre_invalido');
  end if;
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    return jsonb_build_object('ok', false, 'motivo', 'telefono_invalido');
  end if;

  select cita_id into v_cita_id
    from public.cita_pago_enlaces
    where token = p_token and expira_at > now()
    limit 1;
  if v_cita_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select * into v_cita from public.citas where id = v_cita_id;
  v_cli_id := v_cita.cliente_id;
  if v_cli_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cliente');
  end if;

  -- Rellenar datos minimos que falten (no piso datos ya buenos del salon).
  update public.clientes c set
    nombre   = case when coalesce(length(trim(c.nombre)), 0) < 2 then left(trim(p_nombre), 120) else c.nombre end,
    telefono = case when coalesce(length(public.normalizar_telefono(c.telefono)), 0) < 7 then trim(p_telefono) else c.telefono end,
    email    = coalesce(c.email, left(nullif(trim(p_email), ''), 200))
  where c.id = v_cli_id;

  -- Log de consentimiento (columnas + valores permitidos reales de consentimientos_cliente:
  -- metodo_obtencion en firma_digital|casilla|verbal_registrado|app -> 'casilla' = checkbox).
  insert into public.consentimientos_cliente (
    negocio_id, cliente_id, tipo, aceptado, revocado, metodo_obtencion, fecha
  ) values (
    v_cita.negocio_id, v_cli_id, 'tratamiento_datos', true, false, 'casilla', now()
  );

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.completar_datos_pago_publico(text, text, text, text, boolean) from public;
grant execute on function public.completar_datos_pago_publico(text, text, text, text, boolean) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) registrar_cobro_online: lo llama el webhook (service_role) al confirmarse el pago
--    'total'. Crea el cobro (verdad del libro) + marca la cita cobrada. Idempotente.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_cobro_online(p_pago_id uuid, p_metodo text default 'online')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.pagos;
  v_cita public.citas;
  v_precio numeric;
  v_nombre text;
  v_base_cents int;
  v_prop int;
  v_desc int;
  v_metodo text;
  v_cobro_id uuid;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado'; end if;
  if v_pago.cita_id is null then return null; end if;

  select * into v_cita from public.citas where id = v_pago.cita_id;
  if not found then return null; end if;

  -- Idempotencia: si la cita ya esta cobrada, devolver ese cobro sin duplicar.
  if v_cita.cobrada then
    return v_cita.cobro_id;
  end if;

  v_prop := greatest(0, coalesce((v_pago.metadata->>'propina_cents')::int, 0));
  v_desc := greatest(0, coalesce((v_pago.metadata->>'descuento_cents')::int, 0));
  v_metodo := coalesce(nullif(p_metodo, ''), v_pago.metadata->>'metodo', 'online');
  if v_metodo not in ('online','bizum') then v_metodo := 'online'; end if;

  select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cita.servicio_id;
  v_base_cents := coalesce(round(coalesce(v_precio, 0) * 100)::int, 0);

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_pago.importe_cents, v_prop, v_desc, v_metodo,
    0, 0, v_pago.importe_cents, 'portal', 'completado', 'pago:' || v_pago.id::text
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio'), v_base_cents, 1);

  -- El trigger cobros_marcar_cita ya marca cita.cobrada + cobro_id, pero lo dejamos explicito
  -- por si el trigger se deshabilitara; es idempotente.
  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id and cobrada = false;

  return v_cobro_id;
end;
$$;
revoke all on function public.registrar_cobro_online(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_cobro_online(uuid, text) to service_role;
