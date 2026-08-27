-- =====================================================================
-- Mecha · Staff puede marcar un salon como PAGADO fuera de Stripe
-- =====================================================================
-- POR QUE
--
-- `profiles.suscripcion_estado` es lo unico que dice si un salon PAGA de verdad
-- (el plan por si solo no: un salon en prueba tambien tiene plan 'estudio').
-- Pero esa columna la escribe SOLO el webhook de Stripe
-- (`aplicar_suscripcion_stripe`, service_role). Consecuencia: un salon que paga
-- por transferencia, en efectivo o con un acuerdo aparte se queda en `null`
-- para siempre, y desde el panel de staff no habia forma de arreglarlo.
--
-- Eso ya molestaba (el badge de Cuentas no distinguia "paga" de "le dimos
-- acceso"), y desde `referidos-tope-30-y-meses-gratis.sql` ademas cuenta
-- dinero: el motor de referidos solo suma descendientes con suscripcion viva,
-- asi que un salon pagador fuera de Stripe no le daba descuento a su padrino.
--
-- REGLAS
--
-- 1. STRIPE MANDA. Si el salon tiene `stripe_subscription_id`, esta funcion se
--    niega: ese estado es del webhook y no se pisa a mano. Si se pisara, el
--    siguiente evento de Stripe lo revertiria y nadie entenderia por que.
-- 2. Se marca en la fila del OWNER, que es quien contrata (igual que hace
--    Stripe). El equipo hereda el plan, no el estado de cobro.
-- 3. No se puede marcar pagado un plan 'free': primero se le pone plan.
-- 4. Es REVERSIBLE de verdad: se guarda el estado anterior y al desmarcar se
--    restaura, en vez de adivinar a que estado volver.
-- 5. Queda RASTRO: quien lo marco, cuando y por que, en las columnas y en
--    eventos_negocio. Marcar a mano que alguien paga es una decision de dinero.
--
-- LO QUE NO ES
--   No es para regalar acceso. Para eso ya estan la prueba de 30 dias y
--   `staff_grant_full_access`: una cortesia NO es un cobro y no debe contar
--   como referido de pago. 'activa' significa siempre "este salon paga".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas del cobro manual
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists cobro_manual        boolean not null default false,
  add column if not exists cobro_manual_nota   text,
  add column if not exists cobro_manual_por    uuid,
  add column if not exists cobro_manual_en     timestamptz,
  add column if not exists cobro_manual_previo text;

comment on column public.profiles.cobro_manual is
  'true = el equipo marco a mano que este salon paga (fuera de Stripe: transferencia, efectivo, acuerdo). Sirve para no confundirlo con una suscripcion real de Stripe.';
comment on column public.profiles.cobro_manual_nota is
  'Por que se marco: "paga por transferencia trimestral", "acuerdo con la cadena X"...';
comment on column public.profiles.cobro_manual_previo is
  'suscripcion_estado que tenia antes de marcarlo. Al desmarcar se restaura, en vez de adivinar.';

-- ---------------------------------------------------------------------
-- 2) Guard: las columnas nuevas no las toca el cliente
--    La policy de UPDATE de profiles no restringe columnas: sin esto,
--    cualquiera se declara pagador con un update de su propia fila y se cuela
--    en el motor de referidos de su padrino.
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then
    return new;
  end if;
  new.role                   := old.role;
  new.negocio_id             := old.negocio_id;
  new.plan                   := old.plan;
  new.ia_nivel               := old.ia_nivel;
  new.trial_ends_at          := old.trial_ends_at;
  new.stripe_customer_id     := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.suscripcion_estado     := old.suscripcion_estado;
  new.periodo_fin            := old.periodo_fin;
  new.cobro_manual           := old.cobro_manual;
  new.cobro_manual_nota      := old.cobro_manual_nota;
  new.cobro_manual_por       := old.cobro_manual_por;
  new.cobro_manual_en        := old.cobro_manual_en;
  new.cobro_manual_previo    := old.cobro_manual_previo;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) RPC de staff
-- ---------------------------------------------------------------------
create or replace function public.staff_set_cobro_manual(
  p_profile uuid,
  p_pagado  boolean,
  p_nota    text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  prof   public.profiles;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select * into prof from public.profiles where id = p_profile;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Regla 1: Stripe manda.
  if prof.stripe_subscription_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'gestionado_por_stripe',
                              'suscripcion', prof.stripe_subscription_id);
  end if;

  -- Regla 2: el plan lo contrata el salon, y su fila es la del owner.
  if prof.role is distinct from 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'no_es_owner');
  end if;

  perform set_config('mecha.identity_ctx', '1', true);

  if coalesce(p_pagado, false) then
    -- Regla 3: no se marca pagado un plan que no existe.
    if coalesce(prof.plan, 'free') = 'free' then
      return jsonb_build_object('ok', false, 'reason', 'plan_free');
    end if;
    if prof.cobro_manual then
      -- Ya estaba marcado: solo se actualiza la nota, sin pisar el previo.
      update public.profiles
         set cobro_manual_nota = coalesce(v_nota, cobro_manual_nota),
             updated_at        = now()
       where id = p_profile
       returning * into prof;
    else
      update public.profiles
         set cobro_manual        = true,
             cobro_manual_previo = suscripcion_estado,
             cobro_manual_nota   = v_nota,
             cobro_manual_por    = auth.uid(),
             cobro_manual_en     = now(),
             suscripcion_estado  = 'activa',
             updated_at          = now()
       where id = p_profile
       returning * into prof;
    end if;
  else
    if not prof.cobro_manual then
      return jsonb_build_object('ok', false, 'reason', 'no_estaba_marcado');
    end if;
    -- Regla 4: se vuelve a lo que habia, no a lo que nos parezca.
    update public.profiles
       set suscripcion_estado  = cobro_manual_previo,
           cobro_manual        = false,
           cobro_manual_previo = null,
           cobro_manual_por    = auth.uid(),
           cobro_manual_en     = now(),
           cobro_manual_nota   = v_nota,
           updated_at          = now()
     where id = p_profile
     returning * into prof;
  end if;

  -- Regla 5: rastro. Marcar a mano que alguien paga es decision de dinero.
  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
  values
    (prof.negocio_id, 'cobro_manual', 'profiles', p_profile::text, 'staff',
     case when coalesce(p_pagado, false)
       then 'Marcado como pagado fuera de Stripe'
       else 'Retirada la marca de pagado fuera de Stripe' end,
     jsonb_build_object('pagado', coalesce(p_pagado, false),
                        'estado', prof.suscripcion_estado,
                        'por', auth.uid()),
     coalesce(v_nota, 'panel de staff'))
  on conflict do nothing;

  -- El motor de referidos depende de suscripcion_estado, y el trigger
  -- trg_profile_referral_event ya escucha esa columna. Se llama igualmente y a
  -- proposito: si algun dia alguien recorta las columnas del trigger, el
  -- descuento del padrino no se queda desactualizado en silencio.
  perform public.recompute_referral_chain(p_profile);

  return jsonb_build_object(
    'ok', true,
    'cobro_manual', prof.cobro_manual,
    'suscripcion_estado', prof.suscripcion_estado,
    'nota', prof.cobro_manual_nota
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Permisos (round 4: lo nuevo no nace ejecutable)
-- ---------------------------------------------------------------------
revoke all on function public.staff_set_cobro_manual(uuid, boolean, text) from public, anon;
grant execute on function public.staff_set_cobro_manual(uuid, boolean, text) to authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
