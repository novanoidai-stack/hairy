-- La RPC de la suscripcion tambien sella el addon de IA
--
-- Desde la reestructura del 7 ago 2026 la IA es un addon aparte del plan
-- (profiles.ia_nivel) y se cobra como una SEGUNDA LINEA de la misma suscripcion
-- de Stripe. El webhook ya sabe leer esa linea, pero aplicar_suscripcion_stripe
-- no tenia por donde escribirla: el plan se sellaba y el addon se quedaba en
-- 'ninguna' aunque el salon lo estuviera pagando.
--
-- POR QUE SIGUE SIENDO UNA RPC Y NO UN UPDATE: guard_profile_identity_columns
-- congela plan y tambien ia_nivel. Un update desde el webhook con service_role
-- se ejecutaria SIN ERROR y no cambiaria nada. Esta funcion pone el contexto
-- 'mecha.identity_ctx' dentro de la transaccion.
--
-- Depende de p0-003-rpc-aplicar-suscripcion-stripe.sql y de
-- ia-addon-separado-del-plan.sql (columna ia_nivel + guard extendido).

begin;

-- La firma vieja se borra a proposito. El parametro nuevo lleva default, asi que
-- si se dejaran las dos una llamada de 6 argumentos seria ambigua y Postgres
-- podria resolver a la que no toca (la que ignora el addon).
drop function if exists public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid);

create or replace function public.aplicar_suscripcion_stripe(
  p_stripe_customer_id     text,
  p_stripe_subscription_id text default null,
  p_estado                 text default null,
  p_periodo_fin            timestamptz default null,
  p_plan                   text default null,
  p_profile_id             uuid default null,
  p_ia_nivel               text default null
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

  if p_ia_nivel is not null and p_ia_nivel not in ('ninguna','whatsapp','voz','completa') then
    raise exception 'nivel de IA no valido: %', p_ia_nivel;
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

  -- coalesce en todo: el webhook manda solo lo que ese evento sabe. Un
  -- invoice.paid no dice nada del addon y no debe borrarlo.
  update public.profiles
     set stripe_customer_id     = coalesce(p_stripe_customer_id, stripe_customer_id),
         stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
         suscripcion_estado     = coalesce(p_estado, suscripcion_estado),
         periodo_fin            = coalesce(p_periodo_fin, periodo_fin),
         plan                   = coalesce(p_plan, plan),
         ia_nivel               = coalesce(p_ia_nivel, ia_nivel)
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid, text)
  from public, anon, authenticated;

commit;

-- Comprobacion despues de aplicar: debe devolver UNA fila, la de 7 argumentos.
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'aplicar_suscripcion_stripe';
