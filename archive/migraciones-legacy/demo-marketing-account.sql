-- Migracion: cuenta demo dedicada para prospeccion comercial (demomarketing)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Crea la cuenta demomarketing@mecha.app en el salon demo compartido
-- (demo_salon_001) con acceso COMPLETO tipo owner:
--   - plan 'estudio' -> plan de pago: sin limite de 3 visitas (use_demo_visit
--     solo limita free) y fuera del modo solo-lectura de visitantes
--     (is_shared_demo_visitor() exige plan free). NOTA: 'pro' no existe;
--     CHECK admite free|esencial|estudio (full se cae por profiles_plan_chk).
--   - role 'owner' -> permisos de gestion completos dentro del tenant demo.
--
-- APRENDIZAJES (verificado en remoto 16/08/2026):
--   * NO insertar fila en auth.identities: GoTrue falla con
--     "Database error querying schema" en el password grant si existe
--     (la cuenta demo.publico que funciona no tiene identity).
--   * Tokens de auth.users como '' (no NULL), igualando a cuentas reales.
--
-- Se aplica via Management API (scripts/crear-demo-marketing.mjs), que corre
-- como rol privilegiado y con mecha.identity_ctx para el trigger de identidad.
-- La re-siembra nocturna (resembrar_demo, pg_cron) mantiene los datos frescos.
-- Idempotente: guards NOT EXISTS en cada paso.

begin;

select set_config('mecha.identity_ctx', '1', true);

-- 1) Usuario de auth (confirmado, sin correo, SIN identity)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  email_change, phone_change, phone_change_token, recovery_token,
  reauthentication_token, email_change_token_new, email_change_token_current,
  confirmation_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated',
  'demomarketing@mecha.app', crypt('Demo2026!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nombre":"Demo Marketing"}'::jsonb,
  '', '', '', '', '', '', '', ''
where not exists (
  select 1 from auth.users u where u.email = 'demomarketing@mecha.app'
);

-- 2) Perfil en el tenant demo con owner/estudio
-- phone + codigo_postal obligatorios: profileComplete() de web/assets/auth.js
-- exige nombre_negocio+phone+cp para owners; sin ellos el login cae en
-- "Completa tu salon" en vez de entrar al software.
insert into public.profiles (id, email, nombre, nombre_negocio, negocio_id, role, plan, phone, codigo_postal)
select u.id, u.email, 'Demo Marketing', 'Salón Demo Mecha', 'demo_salon_001', 'owner', 'estudio', '600000000', '46001'
from auth.users u
where u.email = 'demomarketing@mecha.app'
  and not exists (
    select 1 from public.profiles p where p.id = u.id
  );

-- 2b) Si el perfil ya existia, asegurar owner/estudio y campos completos
update public.profiles
   set role = 'owner',
       plan = 'estudio',
       nombre_negocio = coalesce(nombre_negocio, 'Salón Demo Mecha'),
       phone = coalesce(nullif(btrim(phone), ''), '600000000'),
       codigo_postal = coalesce(nullif(btrim(codigo_postal), ''), '46001')
 where id in (select u.id from auth.users u where u.email = 'demomarketing@mecha.app');

commit;
