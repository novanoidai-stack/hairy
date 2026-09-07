CREATE OR REPLACE FUNCTION public.guard_profile_identity_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  new.es_cuenta_demo         := old.es_cuenta_demo;
  new.cobro_manual           := old.cobro_manual;
  new.cobro_manual_previo    := old.cobro_manual_previo;
  new.cobro_manual_por       := old.cobro_manual_por;
  new.cobro_manual_en        := old.cobro_manual_en;
  new.cobro_manual_nota      := old.cobro_manual_nota;

  return new;
end;
$function$
