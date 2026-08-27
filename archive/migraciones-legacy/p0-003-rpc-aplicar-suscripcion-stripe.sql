-- P0-003 · RPC que el webhook usa para escribir el estado de la suscripcion
--
-- POR QUE UNA RPC Y NO UN UPDATE DIRECTO: el trigger guard_profile_identity_columns
-- revierte plan / trial_ends_at / columnas de Stripe salvo que este puesto el
-- contexto de servidor 'mecha.identity_ctx'. Un update desde el webhook con
-- service_role se ejecutaria SIN ERROR y no cambiaria nada. Esta funcion pone el
-- contexto dentro de la transaccion.
--
-- Depende de p0-002-suscripcion-mecha-campos-profiles.sql (columnas nuevas).
-- NO APLICADA TODAVIA.

begin;

create or replace function public.aplicar_suscripcion_stripe(
  p_stripe_customer_id     text,
  p_stripe_subscription_id text default null,
  p_estado                 text default null,
  p_periodo_fin            timestamptz default null,
  p_plan                   text default null,
  p_profile_id             uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Solo el backend. Nunca se concede a anon ni a authenticated.
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;

  if p_estado is not null and p_estado not in
     ('prueba','activa','pago_pendiente','impagada','cancelada','pausada') then
    raise exception 'estado de suscripcion no valido: %', p_estado;
  end if;

  if p_plan is not null and p_plan not in ('free','esencial','estudio') then
    raise exception 'plan no valido: %', p_plan;
  end if;

  -- En el alta llega el profile_id por metadata; despues se localiza por customer.
  select id into v_id from public.profiles
   where (p_profile_id is not null and id = p_profile_id)
      or (p_profile_id is null and stripe_customer_id = p_stripe_customer_id)
   limit 1;

  if v_id is null then
    raise exception 'perfil no encontrado para customer %', p_stripe_customer_id;
  end if;

  perform set_config('mecha.identity_ctx', '1', true);

  update public.profiles
     set stripe_customer_id     = coalesce(p_stripe_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
         suscripcion_estado     = coalesce(p_estado, suscripcion_estado),
         periodo_fin            = coalesce(p_periodo_fin, periodo_fin),
         plan                   = coalesce(p_plan, plan)
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid) from public, anon, authenticated;

commit;
