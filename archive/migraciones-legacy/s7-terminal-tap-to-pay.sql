-- S7.2 — Datafono virtual (Tap to Pay / Stripe Terminal), BACKEND.
-- El cobro presencial por NFC lo hace el movil del estilista con la SDK de Stripe Terminal.
-- Este backend expone: (1) contexto del staff para pedir un ConnectionToken con la cuenta Stripe
-- del salon (S5 mono-cuenta), (2) creacion del pago 'total' pendiente marcado pasarela='stripe_terminal'
-- para que el edge cree un PaymentIntent card_present, y (3) conciliacion: cuando ese PaymentIntent
-- llega a 'succeeded' (webhook), registrar_cobro_online lo registra como cobro por DATAFONO (no online).
-- No hay checkout.session en Terminal: la confirmacion ocurre en el dispositivo.
-- Aplicar al remoto via MCP como `s7_terminal_tap_to_pay`.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) terminal_contexto: el edge del ConnectionToken necesita saber a que negocio
--    pertenece el staff que llama, para firmar el token con SU cuenta Stripe.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.terminal_contexto()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_negocio text;
begin
  select negocio_id into v_negocio from public.profiles where id = auth.uid();
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'sin_perfil');
  end if;
  return jsonb_build_object('ok', true, 'negocio_id', v_negocio);
end;
$$;
revoke all on function public.terminal_contexto() from public, anon;
grant execute on function public.terminal_contexto() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) iniciar_cobro_terminal: accion del staff. Crea/reusa el pago 'total' pendiente
--    (via requerir_pago_total_cita) y lo marca pasarela='stripe_terminal' + canal terminal.
--    Devuelve lo que el edge necesita para el PaymentIntent card_present.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.iniciar_cobro_terminal(
  p_cita_id uuid,
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
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;

  -- metodo 'online' porque requerir_pago_total_cita solo admite online/bizum; el cobro real se
  -- registra como 'datafono' en la conciliacion. Aqui solo importa el importe.
  v_pago := public.requerir_pago_total_cita(p_cita_id, p_propina_cents, p_descuento_cents, 'online');
  if v_pago.id is null or coalesce(v_pago.importe_cents, 0) <= 0 then
    raise exception 'nada_que_cobrar';
  end if;

  update public.pagos
    set pasarela = 'stripe_terminal',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('canal', 'terminal'),
        updated_at = now()
    where id = v_pago.id;

  return jsonb_build_object(
    'ok', true,
    'pago_id', v_pago.id,
    'cita_id', v_pago.cita_id,
    'negocio_id', v_pago.negocio_id,
    'importe_cents', v_pago.importe_cents,
    'moneda', coalesce(nullif(v_pago.moneda, ''), 'EUR')
  );
end;
$$;
revoke all on function public.iniciar_cobro_terminal(uuid, integer, integer) from public, anon;
grant execute on function public.iniciar_cobro_terminal(uuid, integer, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) registrar_cobro_online: se generaliza para etiquetar bien el DATAFONO.
--    Cambio ADITIVO respecto a s4-cobro-online-grupo: se admite metodo 'datafono' y, en ese caso,
--    el importe va a datafono_cents (no online_cents) y origen='pos' (no 'portal'). El path
--    online/bizum queda IDENTICO. La logica de reparto de grupo no cambia.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_cobro_online(p_pago_id uuid, p_metodo text default 'online')
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_pago public.pagos;
  v_cab public.citas;
  v_prop int; v_desc int; v_metodo text;
  v_es_datafono boolean;
  v_origen text;
  v_base_total int; v_n int; v_i int := 0;
  v_acc_total int := 0; v_acc_prop int := 0;
  v_share int; v_pshare int;
  v_first uuid := null; v_cobro uuid;
  v_precio numeric; v_nombre text; v_base int;
  r record;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado'; end if;
  if v_pago.cita_id is null then return null; end if;

  select * into v_cab from public.citas where id = v_pago.cita_id;
  if not found then return null; end if;

  v_prop := greatest(0, coalesce((v_pago.metadata->>'propina_cents')::int, 0));
  v_desc := greatest(0, coalesce((v_pago.metadata->>'descuento_cents')::int, 0));
  v_metodo := coalesce(nullif(p_metodo, ''), v_pago.metadata->>'metodo', 'online');
  if v_metodo not in ('online','bizum','datafono') then v_metodo := 'online'; end if;
  v_es_datafono := (v_metodo = 'datafono');
  v_origen := case when v_es_datafono then 'pos' else 'portal' end;

  if v_cab.grupo_id is null then
    if v_cab.cobrada then return v_cab.cobro_id; end if;
    select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cab.servicio_id;
    v_base := coalesce(round(coalesce(v_precio,0)*100)::int, 0);
    insert into public.cobros (negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
      total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key)
    values (v_cab.negocio_id, v_cab.id, v_cab.grupo_id, v_cab.profesional_id, v_cab.cliente_id,
      v_pago.importe_cents, v_prop, v_desc, v_metodo, 0,
      case when v_es_datafono then v_pago.importe_cents else 0 end,
      case when v_es_datafono then 0 else v_pago.importe_cents end,
      v_origen, 'completado', 'pago:'||v_pago.id::text)
    returning id into v_cobro;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro, 'servicio', v_cab.servicio_id, coalesce(v_nombre,'Servicio'), v_base, 1);
    update public.citas set cobrada=true, cobro_id=v_cobro where id=v_cab.id and cobrada=false;
    return v_cobro;
  end if;

  -- GRUPO
  select coalesce(sum(round(coalesce(s.precio,0)*100)::int),0), count(*)
    into v_base_total, v_n
    from public.citas c left join public.servicios s on s.id=c.servicio_id
    where c.grupo_id = v_cab.grupo_id;

  for r in
    select c.id, c.profesional_id, c.cliente_id, c.negocio_id, c.servicio_id, c.cobrada,
           coalesce(round(coalesce(s.precio,0)*100)::int,0) as base, s.nombre
    from public.citas c left join public.servicios s on s.id=c.servicio_id
    where c.grupo_id = v_cab.grupo_id
    order by c.orden_en_grupo nulls first, c.inicio
  loop
    v_i := v_i + 1;
    if v_i < v_n then
      v_share  := case when v_base_total>0 then floor(v_pago.importe_cents::numeric * r.base / v_base_total)::int else 0 end;
      v_pshare := case when v_base_total>0 then floor(v_prop::numeric * r.base / v_base_total)::int else 0 end;
    else
      v_share  := v_pago.importe_cents - v_acc_total;
      v_pshare := v_prop - v_acc_prop;
    end if;
    v_acc_total := v_acc_total + v_share;
    v_acc_prop  := v_acc_prop + v_pshare;

    if r.cobrada then continue; end if;

    insert into public.cobros (negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
      total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key)
    values (r.negocio_id, r.id, v_cab.grupo_id, r.profesional_id, r.cliente_id,
      greatest(0, v_share), greatest(0, v_pshare), 0, v_metodo, 0,
      case when v_es_datafono then greatest(0, v_share) else 0 end,
      case when v_es_datafono then 0 else greatest(0, v_share) end,
      v_origen, 'completado', 'pago:'||v_pago.id::text||':'||r.id::text)
    returning id into v_cobro;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro, 'servicio', r.servicio_id, coalesce(r.nombre,'Servicio'), r.base, 1);
    update public.citas set cobrada=true, cobro_id=v_cobro where id=r.id and cobrada=false;
    if v_first is null then v_first := v_cobro; end if;
  end loop;

  return v_first;
end;
$function$;
revoke all on function public.registrar_cobro_online(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_cobro_online(uuid, text) to service_role;
