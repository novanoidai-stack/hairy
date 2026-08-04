-- P0-002 · Campos de suscripcion de Mecha en profiles
--
-- ALCANCE: esto es la suscripcion DE MECHA AL SALON (39/59 €/mes), que se cobra
-- SIEMPRE en la cuenta Stripe de PLATAFORMA (STRIPE_SECRET_KEY). No confundir con
-- los cobros del salon a su clienta, que van por BYOP mono-cuenta con la clave del
-- propio salon guardada en Vault (ver supabase/functions/_shared/stripeNegocio.ts).
-- Ninguna funcion que toque estas columnas debe usar stripeParaNegocio().
--
-- NO APLICADA TODAVIA. Revisar y aplicar con Alexandro.

begin;

alter table public.profiles
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists suscripcion_estado     text,
  add column if not exists periodo_fin            timestamptz;

comment on column public.profiles.stripe_customer_id     is 'Customer de la cuenta Stripe de plataforma (Mecha), no del salon.';
comment on column public.profiles.stripe_subscription_id is 'Suscripcion de Mecha al salon. Null mientras el salon esta en el mes de prueba.';
comment on column public.profiles.suscripcion_estado     is 'Estado efectivo de acceso. Lo escribe SOLO el webhook (service_role).';
comment on column public.profiles.periodo_fin             is 'Fin del periodo pagado en curso: hasta cuando tiene acceso si deja de pagar.';

-- 'prueba' cubre el mes gratis sin tarjeta, que no crea nada en Stripe.
-- El resto son espejo de los estados de Stripe que nos importan.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_suscripcion_estado_chk') then
    alter table public.profiles
      add constraint profiles_suscripcion_estado_chk
      check (suscripcion_estado is null or suscripcion_estado in
        ('prueba', 'activa', 'pago_pendiente', 'impagada', 'cancelada', 'pausada'));
  end if;
end $$;

create unique index if not exists profiles_stripe_customer_id_uniq
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_uniq
  on public.profiles (stripe_subscription_id) where stripe_subscription_id is not null;

-- Para el panel semanal (B10-106): "salones de pago" y "quien caduca esta semana".
create index if not exists profiles_suscripcion_estado_idx
  on public.profiles (suscripcion_estado, periodo_fin) where suscripcion_estado is not null;

-- ---------------------------------------------------------------------------
-- CRITICO. La policy "Users can update own profile" es UPDATE USING (auth.uid() = id)
-- sin WITH CHECK y sin restriccion de columnas: un usuario puede escribir CUALQUIER
-- columna de su propia fila. Hoy no es explotable porque el trigger
-- guard_profile_identity_columns revierte role / negocio_id / plan.
-- Si se anaden las columnas de suscripcion sin extender ese guard, cualquier cliente
-- se regala el acceso de pago con un solo update. Se extiende aqui.
-- De paso se protege trial_ends_at, que HOY no lo esta: en cuanto P0-005 lo rellene,
-- sin esto cualquiera se alarga el mes gratis indefinidamente.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then
    return new;
  end if;
  new.role                   := old.role;
  new.negocio_id             := old.negocio_id;
  new.plan                   := old.plan;
  new.trial_ends_at          := old.trial_ends_at;
  new.stripe_customer_id     := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.suscripcion_estado     := old.suscripcion_estado;
  new.periodo_fin            := old.periodo_fin;
  return new;
end;
$$;

commit;

-- Comprobacion posterior sugerida:
--   1) Los advisors de seguridad de Supabase no deben anadir ERRORes nuevos.
--   2) Con un JWT de usuario normal:
--        update profiles set suscripcion_estado='activa' where id = auth.uid();
--      debe ejecutarse SIN error pero dejar el valor como estaba (lo revierte el trigger).
