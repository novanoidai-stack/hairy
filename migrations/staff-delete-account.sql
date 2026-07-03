-- staff_delete_account: borrado REAL de una cuenta desde el panel del staff.
--
-- Contexto del bug (4 jul 2026): el panel hacia `from('profiles').delete()` en cliente,
-- pero profiles NO tiene politica DELETE, asi que RLS filtraba 0 filas y PostgREST
-- devolvia exito sin borrar nada. Ademas profiles.id no tiene FK a auth.users, con lo
-- que aunque el perfil cayera, el usuario de auth seguia vivo y el correo quedaba
-- bloqueado para siempre (signUp con email existente devuelve exito falso y no crea nada).
--
-- Este RPC borra perfil + usuario de auth (libera el correo). Guardas dentro:
-- solo staff, nunca a uno mismo, nunca cuentas del equipo ni las cuentas demo.
-- Sigue sin existir politica DELETE en profiles: el unico camino de borrado es este RPC.

create or replace function public.staff_delete_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_email text;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;

  -- el correo puede estar solo en auth.users si el perfil quedo huerfano
  select p.email into target_email from public.profiles p where p.id = target_user_id;
  if target_email is null then
    select u.email into target_email from auth.users u where u.id = target_user_id;
  end if;
  if target_email is null then
    raise exception 'account_not_found';
  end if;

  if exists (select 1 from public.staff s where lower(s.email) = lower(target_email)) then
    raise exception 'cannot_delete_staff';
  end if;

  if lower(target_email) in ('demo.publico@mecha.app', 'demo@hairy.app') then
    raise exception 'cannot_delete_demo';
  end if;

  -- soltar referencias de auditoria que bloquearian el borrado fisico
  -- (el resto de FKs a profiles ya son CASCADE o SET NULL)
  update public.inventario set modificado_por = null where modificado_por = target_user_id;
  update public.movimientos_inventario set creado_por = null where creado_por = target_user_id;
  delete from public.citas_historial where negocio_id = target_user_id;

  delete from public.profiles where id = target_user_id;
  -- libera el correo; identities/sessions caen en cascada dentro del esquema auth
  delete from auth.users where id = target_user_id;
end;
$$;

-- round 4 de seguridad: las funciones nuevas no nacen ejecutables por anon
revoke execute on function public.staff_delete_account(uuid) from public;
revoke execute on function public.staff_delete_account(uuid) from anon;
grant execute on function public.staff_delete_account(uuid) to authenticated;
