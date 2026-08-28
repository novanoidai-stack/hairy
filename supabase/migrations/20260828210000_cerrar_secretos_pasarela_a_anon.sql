-- URGENTE (28 ago 2026). Las tres funciones que devuelven la clave secreta de la
-- pasarela de pago de un salon tenian EXECUTE concedido EXPLICITAMENTE a `anon`
-- y a `authenticated`, son SECURITY DEFINER y no comprueban nada por dentro:
--
--   pasarela_stripe_secret(p_negocio_id)          -> Stripe secret key del salon
--   pasarela_redsys_secret(p_negocio_id)          -> clave Redsys del salon
--   pasarela_stripe_webhook_secret(p_negocio_id)  -> webhook signing secret
--
-- Con la publishable key (publica por diseno, esta en el codigo de la landing) y
-- un negocio_id, cualquiera podia pedir por REST la clave secreta de Stripe de
-- ese salon y operar su cuenta: cobros, reembolsos, payouts. Los negocio_id no
-- son uuid: son cadenas cortas derivadas del nombre del salon (9 de los 11 que
-- hay miden entre 11 y 30 caracteres) y los nombres estan en el marketplace
-- publico. Cualquier usuario autenticado, ademas, conoce el suyo de entrada.
--
-- Verificado antes de tocar nada con `set local role anon` y un negocio_id
-- inventado: devolvia null, no un error de permisos. Y despues: 42501,
-- permission denied.
--
-- Quien las usa DE VERDAD son edge functions (crear-checkout-cobro,
-- crear-checkout-senal, capturar-hold, liberar-hold, reembolsar-cobro,
-- stripe-webhook, redsys-notificacion), todas con claveServicio() -> service_role,
-- que conserva su permiso. No hay ni un llamante en el cliente.
--
-- Lo encontro el primer pase de los vigilantes (scripts/vigilantes/ +
-- public.vigilancia_bd()), y a partir de ahora lo vigila ese mismo, para que no
-- vuelva a colarse en silencio.

revoke execute on function public.pasarela_stripe_secret(text)         from anon, authenticated, public;
revoke execute on function public.pasarela_redsys_secret(text)         from anon, authenticated, public;
revoke execute on function public.pasarela_stripe_webhook_secret(text) from anon, authenticated, public;

comment on function public.pasarela_stripe_secret(text) is
  'Devuelve la Stripe secret key del salon desde el Vault. SOLO service_role: la '
  'llaman edge functions. NO conceder a anon ni a authenticated (28 ago 2026).';
comment on function public.pasarela_redsys_secret(text) is
  'Devuelve la clave Redsys del salon desde el Vault. SOLO service_role. '
  'NO conceder a anon ni a authenticated (28 ago 2026).';
comment on function public.pasarela_stripe_webhook_secret(text) is
  'Devuelve el webhook signing secret de Stripe del salon. SOLO service_role. '
  'NO conceder a anon ni a authenticated (28 ago 2026).';
