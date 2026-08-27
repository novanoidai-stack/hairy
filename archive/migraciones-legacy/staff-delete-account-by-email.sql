-- staff_delete_account_by_email: borrado de cuenta por correo electrónico para resolver huérfanos.
--
-- Si un usuario fue eliminado de profiles pero quedó en auth.users,
-- esta RPC permite borrarlo buscando directamente por el correo.
--
-- Adicionalmente, recrea los perfiles para usuarios de auth que no tengan perfil.

-- 1) Backfill para restaurar perfiles huérfanos y que aparezcan en el panel
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

-- 2) Función de borrado por correo
create or replace function public.staff_delete_account_by_email(target_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_user_id uuid;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  -- Buscar el ID en auth.users por el correo
  select id into target_user_id from auth.users where lower(email) = lower(trim(target_email)) limit 1;
  
  if target_user_id is null then
    -- Si no está en auth.users (raro si es huérfano de auth), buscar en public.profiles
    select id into target_user_id from public.profiles where lower(email) = lower(trim(target_email)) limit 1;
  end if;

  if target_user_id is null then
    raise exception 'account_not_found';
  end if;

  -- Llamar al borrado físico completo por ID
  perform public.staff_delete_account(target_user_id);
end;
$$;

-- round 4 de seguridad: revocar para público/anónimo, conceder a autenticados (staff check dentro)
revoke execute on function public.staff_delete_account_by_email(text) from public;
revoke execute on function public.staff_delete_account_by_email(text) from anon;
grant execute on function public.staff_delete_account_by_email(text) to authenticated;
