-- P0-003b · Dos arreglos sobre lo que dejo P0-003.
--
-- 1) aplicar_suscripcion_stripe escribia el plan SOLO en la fila de quien paga y
--    no llamaba a sincronizar_plan_negocio. El salon pagaba, el owner subia a
--    Estudio y sus trabajadores se quedaban con el plan viejo hasta que alguien
--    de staff tocase algo a mano. El equipo hereda el plan del owner
--    (plan_del_negocio / sincronizar_plan_negocio); hay que propagarlo aqui.
--
-- 2) Falta el estado 'caducada' (la prueba se acabo sin contratar). No es lo
--    mismo que 'cancelada', que es darse de baja de una suscripcion que existio:
--    para medir la conversion de la prueba hay que poder distinguirlas.

begin;

alter table public.profiles drop constraint if exists profiles_suscripcion_estado_chk;
alter table public.profiles add constraint profiles_suscripcion_estado_chk
  check (
    suscripcion_estado is null or suscripcion_estado in
    ('prueba','activa','pago_pendiente','impagada','cancelada','pausada','caducada')
  );

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
  v_negocio text;
  v_role text;
begin
  -- Solo el backend. Nunca se concede a anon ni a authenticated.
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;

  if p_estado is not null and p_estado not in
     ('prueba','activa','pago_pendiente','impagada','cancelada','pausada','caducada') then
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
   where id = v_id
   returning negocio_id, role into v_negocio, v_role;

  -- El equipo hereda el plan del owner. sincronizar_plan_negocio copia desde la
  -- fila del owner, asi que solo tiene sentido cuando es el owner quien paga; por
  -- eso crear-checkout-suscripcion es owner-only.
  if p_plan is not null and v_role = 'owner' then
    perform public.sincronizar_plan_negocio(v_negocio);
  end if;

  return v_id;
end;
$$;

revoke all on function public.aplicar_suscripcion_stripe(text, text, text, timestamptz, text, uuid) from public, anon, authenticated;

commit;
