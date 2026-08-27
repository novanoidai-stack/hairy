-- Crear automaticamente el profile al registrarse un usuario.
-- Aplicada en Supabase (proyecto vtrggiogjrhqtwbhbgia) el 2026-06-04.
--
-- Problema: solo la edge function signup-free creaba la fila en public.profiles.
-- Los usuarios que entraban por otra via (Google OAuth, alta manual desde el
-- panel de Supabase, etc.) quedaban en auth.users SIN profile, asi que:
--   - no aparecian en el panel de staff ("Cuentas" lee de public.profiles), y
--   - is_shared_demo_visitor() no podia clasificarlos (sin negocio_id).
--
-- Solucion: un trigger SECURITY DEFINER sobre auth.users que crea el profile
-- en el alta, sea cual sea la via de registro. Por defecto el usuario nuevo
-- cae en el tenant compartido de la demo (demo_salon_001) como owner free,
-- exactamente igual que signup-free. Si el alta trae metadata (nombre, salon,
-- telefono) se respeta; si no, se derivan valores razonables del email.
--
-- on conflict (id) do nothing -> idempotente y compatible con signup-free
-- (si la edge function ya inserto el profile, el trigger no lo pisa).

-- ============================================================
-- 1) Funcion: rellena public.profiles a partir de auth.users.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, nombre, nombre_negocio, negocio_id, phone, role, plan)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    nullif(btrim(new.raw_user_meta_data->>'salon'), ''),
    'demo_salon_001',
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    'free'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ============================================================
-- 2) Trigger: dispara la funcion en cada alta de auth.users.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3) Backfill: profiles para usuarios que ya existian sin profile.
--    (Mismo criterio que el trigger; idempotente.)
-- ============================================================

insert into public.profiles (id, email, nombre, nombre_negocio, negocio_id, phone, role, plan)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'nombre'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''),
    'Usuario'
  ),
  nullif(btrim(u.raw_user_meta_data->>'salon'), ''),
  'demo_salon_001',
  nullif(btrim(u.raw_user_meta_data->>'telefono'), ''),
  'owner',
  'free'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
