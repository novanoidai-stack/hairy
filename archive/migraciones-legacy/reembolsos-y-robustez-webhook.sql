-- migrations/reembolsos-y-robustez-webhook.sql
-- S2 del plan de pagos (informes/PLAN_PAGOS_MECHA.md): reembolsos + robustez del webhook.
--
-- - Reembolso de un cobro online (Stripe): la edge `reembolsar-cobro` autoriza con
--   `iniciar_reembolso_cobro` (staff), hace el refund en Stripe, y `registrar_reembolso`
--   (service_role) persiste: marca pago+cobro `reembolsado` y, via el trigger existente
--   `cobros_anular_desmarcar_cita`, la cita vuelve a "sin cobrar".
-- - El webhook llama tambien a `registrar_reembolso` en `charge.refunded`, asi que un
--   reembolso hecho desde el panel de Stripe tambien se refleja en Mecha. Idempotente.
--
-- Modelo: `cobros` es inmutable en importes, pero SI permite cambiar `estado` a
-- 'reembolsado' (el trigger antifraude solo bloquea campos monetarios). El reembolso de
-- senal revierte la cita a 'pendiente'. ADITIVA. Tras aplicar: advisors de seguridad.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) iniciar_reembolso_cobro: autoriza al staff y devuelve lo necesario para el refund.
--    Solo cobros online/bizum (los que tienen pago Stripe). Mismo patron de auth que
--    crear_cobro_desde_cita (profiles + auth.uid()).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.iniciar_reembolso_cobro(p_cobro_id uuid, p_importe_cents integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_cobro public.cobros;
  v_pago_id uuid;
  v_pago public.pagos;
  v_pi text;
  v_importe int;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'cobro_no_encontrado'; end if;
  if v_cobro.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cobro.estado <> 'completado' then raise exception 'cobro_no_reembolsable'; end if;
  if v_cobro.metodo not in ('online','bizum') then raise exception 'no_es_pago_online'; end if;

  -- El pago Stripe cuelga del cobro via idempotency_key = 'pago:'||pago_id (registrar_cobro_online).
  if v_cobro.idempotency_key is null or v_cobro.idempotency_key not like 'pago:%' then
    raise exception 'sin_pago_stripe';
  end if;
  v_pago_id := substring(v_cobro.idempotency_key from 6)::uuid;

  select * into v_pago from public.pagos where id = v_pago_id;
  if not found then raise exception 'pago_no_encontrado'; end if;

  v_pi := v_pago.metadata->>'payment_intent';
  if v_pi is null then raise exception 'sin_payment_intent'; end if;

  v_importe := least(coalesce(p_importe_cents, v_cobro.total_cents), v_cobro.total_cents);
  if v_importe <= 0 then raise exception 'importe_invalido'; end if;

  return jsonb_build_object(
    'ok', true,
    'pago_id', v_pago.id,
    'payment_intent', v_pi,
    'importe_cents', v_importe,
    'total_cents', v_cobro.total_cents,
    'moneda', coalesce(v_pago.moneda, 'EUR')
  );
end;
$$;
revoke all on function public.iniciar_reembolso_cobro(uuid, integer) from public, anon;
grant execute on function public.iniciar_reembolso_cobro(uuid, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) registrar_reembolso: persiste un reembolso (lo llama la edge tras el refund y tambien
--    el webhook en charge.refunded). Idempotente por refund_id. service_role only.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_reembolso(
  p_payment_intent text,
  p_importe_cents integer,
  p_refund_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.pagos;
  v_reembolso_id uuid;
  v_full boolean;
  v_cobro public.cobros;
begin
  if p_payment_intent is null or p_refund_id is null then return null; end if;

  -- Idempotencia: si ya registramos este refund, no duplicar.
  select id into v_reembolso_id from public.pagos
    where tipo = 'reembolso' and pasarela_ref = p_refund_id limit 1;
  if v_reembolso_id is not null then return v_reembolso_id; end if;

  -- Pago original (senal o total) por payment_intent.
  select * into v_pago from public.pagos
    where metadata->>'payment_intent' = p_payment_intent
      and tipo in ('senal','total')
    order by created_at desc limit 1;
  if not found then return null; end if;

  -- Fila de trazabilidad del reembolso.
  insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado,
                            pasarela, pasarela_ref, metodo, paid_at, metadata)
  values (v_pago.negocio_id, v_pago.cita_id, v_pago.cliente_id, 'reembolso',
          greatest(0, coalesce(p_importe_cents, v_pago.importe_cents)), 'pagado',
          'stripe', p_refund_id, v_pago.metodo, now(),
          jsonb_build_object('reembolso_de', v_pago.id, 'payment_intent', p_payment_intent))
  returning id into v_reembolso_id;

  v_full := coalesce(p_importe_cents, v_pago.importe_cents) >= v_pago.importe_cents;

  if v_full then
    update public.pagos set estado = 'reembolsado', updated_at = now() where id = v_pago.id;

    if v_pago.tipo = 'total' then
      -- Anular el cobro del libro. OJO: el trigger cobros_anular_desmarcar_cita NO existe en
      -- vivo (migracion no aplicada), asi que descobramos la cita explicitamente.
      select * into v_cobro from public.cobros
        where idempotency_key = 'pago:' || v_pago.id::text and estado = 'completado' limit 1;
      if found then
        update public.cobros set estado = 'reembolsado' where id = v_cobro.id;
        update public.citas set cobrada = false, cobro_id = null where id = v_cobro.cita_id;
      end if;
    elsif v_pago.tipo = 'senal' and v_pago.cita_id is not null then
      -- Reembolso de senal: la cita confirmada vuelve a pendiente (no se cancela sola).
      update public.citas
        set deposito_pagado = false, estado = 'pendiente'
        where id = v_pago.cita_id and estado = 'confirmada';
    end if;
  end if;

  return v_reembolso_id;
end;
$$;
revoke all on function public.registrar_reembolso(text, integer, text) from public, anon, authenticated;
grant execute on function public.registrar_reembolso(text, integer, text) to service_role;
