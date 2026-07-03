-- Aceptacion de la politica de privacidad por parte del staff/propietario que
-- usa el software (distinto del consentimiento de datos del cliente final al
-- reservar, que ya existe en consentimientos_cliente / citas.consentimiento_datos).
--
-- No hacia falta un RPC nuevo: la policy "Users can update own profile"
-- (UPDATE, auth.uid() = id, sin with_check) ya permite que cada usuario
-- actualice estas columnas de su propia fila.

alter table public.profiles
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_policy_version text;

comment on column public.profiles.privacy_accepted_at is
  'Cuando el usuario acepto la politica de privacidad del software (null = pendiente).';
comment on column public.profiles.privacy_policy_version is
  'Version de la politica aceptada (ver lib/legal.ts CURRENT_PRIVACY_POLICY_VERSION). Si no coincide con la version actual, se vuelve a pedir.';
