-- =====================================================================
-- Mecha · Referidos: llevar el descuento ya calculado hasta Stripe
-- =====================================================================
-- `referidos-tope-30-y-meses-gratis.sql` (23 ago 2026) calcula la ELEGIBILIDAD
-- (`descuento_pct`, `meses_gratis_ganados`) y lo dice por escrito: aplicarlo en
-- Stripe era otra tarea. Nunca se hizo, asi que hasta hoy un salon con un 30 %
-- ganado pagaba la cuota entera y el programa que anuncia la landing no se podia
-- cumplir. Esta migracion pone la mitad de servidor que faltaba.
--
-- REPARTO
--   Postgres  -> calcula cuanto descuento toca (ya existia).
--   Edge      -> `sincronizar-descuento-referidos` lo refleja en la suscripcion.
--   Esta RPC  -> el unico camino para apuntar que ya esta reflejado.
--
-- POR QUE UN CRON Y NO UN DISPARO EN CALIENTE
--   Tu descuento cambia cuando OTRO salon de tu red empieza (o deja) de pagar,
--   no cuando tu haces nada: no hay gesto de usuario al que engancharse. Y meter
--   una llamada a Stripe dentro del trigger de Postgres ataria la transaccion a
--   una red de terceros y dejaria la BD a merced de un timeout. Se reconcilia
--   una vez al dia, que es idempotente y se puede repetir sin dano.
--
-- LOS MESES GRATIS NO SE TOCAN AQUI
--   Se siguen canjeando a mano con `staff_canjear_meses_referido`. Solo se ganan
--   por encima del tope del 30 %, o sea que hoy no los tiene nadie.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Apuntar que el descuento ya esta reflejado en Stripe
--
--    `staff_set_referral_applied` no vale para esto: exige `is_staff()`, que
--    resuelve el email del JWT, y el cron llama con la service_role key (sin
--    email ni uid) -- daria `not_staff` siempre. Y el UPDATE directo tampoco,
--    porque `guard_referral_columns` revierte la columna salvo dentro del
--    contexto interno.
-- ---------------------------------------------------------------------
create or replace function public.marcar_descuento_referido_aplicado(
  p_profile  uuid,
  p_aplicado boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Solo el backend, igual que `aplicar_suscripcion_stripe`.
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;

  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles
     set descuento_referido_aplicado = coalesce(p_aplicado, false)
   where id = p_profile;
end;
$$;

comment on function public.marcar_descuento_referido_aplicado(uuid, boolean) is
  'La usa la edge sincronizar-descuento-referidos para apuntar que el descuento ya viaja en la suscripcion de Stripe. Solo service_role.';

-- Round 4: lo nuevo no nace ejecutable y no se abre a nadie mas que al backend.
revoke all on function public.marcar_descuento_referido_aplicado(uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Cron nocturno de reconciliacion
--    A las 3:40, entre los avisos de prueba (3:00) y la purga de errores (4:30).
-- ---------------------------------------------------------------------
select cron.unschedule('mecha_descuento_referidos')
where exists (select 1 from cron.job where jobname = 'mecha_descuento_referidos');

select cron.schedule(
  'mecha_descuento_referidos',
  '40 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/sincronizar-descuento-referidos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

notify pgrst, 'reload schema';
