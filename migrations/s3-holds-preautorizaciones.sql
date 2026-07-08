-- S3 — Holds / pre-autorizaciones (Pilar 3). Aplicado al remoto via MCP como
-- `s3_holds_preautorizaciones`. La senal se RETIENE (autoriza) en vez de cobrarse cuando el
-- negocio usa negocio_config.config->>'depositoModoFianza' = 'hold'. Estados nuevos de pago:
-- 'retenido' (autorizado en Stripe, PaymentIntent requires_capture, sin cobro) y 'liberado'
-- (hold cancelado/expirado, sin cobro). Capturar un hold -> 'pagado'.

alter table public.pagos drop constraint if exists pagos_estado_check;
alter table public.pagos add constraint pagos_estado_check
  check (estado = any (array['pendiente','pagado','fallido','reembolsado','cancelado','retenido','liberado']));

-- Colocacion del hold (idempotente): la llama el webhook al completar el checkout de fianza en
-- modo hold, y tambien en payment_intent.amount_capturable_updated. Marca el pago 'retenido',
-- guarda el payment_intent y confirma la cita (la retencion cubre el riesgo anti no-show).
-- NO marca deposito_pagado: no hay cobro todavia, solo retencion.
create or replace function public.registrar_hold_colocado(p_pago_id uuid, p_payment_intent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pago public.pagos;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then return; end if;

  update public.pagos
    set estado = 'retenido',
        pasarela = 'stripe',
        metadata = v_pago.metadata
                   || jsonb_build_object('fianza_modo','hold')
                   || case when p_payment_intent is not null
                           then jsonb_build_object('payment_intent', p_payment_intent)
                           else '{}'::jsonb end,
        updated_at = now()
    where id = p_pago_id and estado in ('pendiente','retenido');

  if v_pago.cita_id is not null then
    update public.citas set estado = 'confirmada'
      where id = v_pago.cita_id and estado = 'pendiente';
  end if;
end $$;

-- Autoriza (staff) la CAPTURA de un hold: valida el negocio del que llama y devuelve el
-- payment_intent + importe. Acepta pago_id o cita_id (resuelve la senal retenida de la cita).
create or replace function public.iniciar_captura_hold(
  p_pago_id uuid default null,
  p_cita_id uuid default null,
  p_importe_cents int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller_negocio text;
  v_pago public.pagos;
  v_pi text;
  v_importe int;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  if p_pago_id is not null then
    select * into v_pago from public.pagos where id = p_pago_id;
  elsif p_cita_id is not null then
    select * into v_pago from public.pagos
      where cita_id = p_cita_id and tipo = 'senal' and estado = 'retenido'
      order by created_at desc limit 1;
  else
    raise exception 'falta_referencia';
  end if;
  if not found then raise exception 'hold_no_encontrado'; end if;
  if v_pago.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_pago.tipo <> 'senal' or v_pago.estado <> 'retenido' then raise exception 'no_es_hold'; end if;

  v_pi := v_pago.metadata->>'payment_intent';
  if v_pi is null then raise exception 'sin_payment_intent'; end if;

  v_importe := least(coalesce(p_importe_cents, v_pago.importe_cents), v_pago.importe_cents);
  if v_importe <= 0 then raise exception 'importe_invalido'; end if;

  return jsonb_build_object('ok', true, 'pago_id', v_pago.id,
    'payment_intent', v_pi, 'importe_cents', v_importe);
end $$;

-- Autoriza (staff) la LIBERACION de un hold (el cliente asistio). Devuelve el payment_intent.
create or replace function public.iniciar_liberacion_hold(
  p_pago_id uuid default null,
  p_cita_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller_negocio text;
  v_pago public.pagos;
  v_pi text;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  if p_pago_id is not null then
    select * into v_pago from public.pagos where id = p_pago_id;
  elsif p_cita_id is not null then
    select * into v_pago from public.pagos
      where cita_id = p_cita_id and tipo = 'senal' and estado = 'retenido'
      order by created_at desc limit 1;
  else
    raise exception 'falta_referencia';
  end if;
  if not found then raise exception 'hold_no_encontrado'; end if;
  if v_pago.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_pago.tipo <> 'senal' or v_pago.estado <> 'retenido' then raise exception 'no_es_hold'; end if;

  v_pi := v_pago.metadata->>'payment_intent';
  if v_pi is null then raise exception 'sin_payment_intent'; end if;

  return jsonb_build_object('ok', true, 'pago_id', v_pago.id, 'payment_intent', v_pi);
end $$;

-- Concilia la CAPTURA de un hold (service_role; la edge la llama tras capturar en Stripe).
-- Idempotente: si ya esta 'pagado' no re-hace. Marca deposito_pagado (la penalizacion se cobro).
create or replace function public.registrar_captura_hold(p_pago_id uuid, p_importe_cents int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pago public.pagos;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then return; end if;
  if v_pago.estado = 'pagado' then return; end if;

  update public.pagos
    set estado = 'pagado',
        paid_at = now(),
        metodo = 'tarjeta',
        importe_cents = greatest(0, coalesce(p_importe_cents, v_pago.importe_cents)),
        metadata = v_pago.metadata || jsonb_build_object('hold_capturado', true),
        updated_at = now()
    where id = p_pago_id;

  if v_pago.cita_id is not null then
    update public.citas set deposito_pagado = true where id = v_pago.cita_id;
  end if;
end $$;

-- Concilia la LIBERACION de un hold (service_role; la edge tras cancelar en Stripe, o el
-- webhook payment_intent.canceled si el hold caduca ~7d). Idempotente.
create or replace function public.registrar_liberacion_hold(p_pago_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pagos set estado = 'liberado', updated_at = now()
    where id = p_pago_id and estado = 'retenido';
end $$;

-- Grants: staff (authenticated) puede autorizar; la conciliacion es solo service_role.
grant execute on function public.iniciar_captura_hold(uuid,uuid,int) to authenticated;
grant execute on function public.iniciar_liberacion_hold(uuid,uuid) to authenticated;
revoke execute on function public.registrar_hold_colocado(uuid,text) from anon, authenticated;
revoke execute on function public.registrar_captura_hold(uuid,int) from anon, authenticated;
revoke execute on function public.registrar_liberacion_hold(uuid) from anon, authenticated;
grant execute on function public.registrar_hold_colocado(uuid,text) to service_role;
grant execute on function public.registrar_captura_hold(uuid,int) to service_role;
grant execute on function public.registrar_liberacion_hold(uuid) to service_role;
