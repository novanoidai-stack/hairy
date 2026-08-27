-- staff_delete_account: borrado REAL de una cuenta desde el panel del staff.
--
-- Borra perfil + usuario de auth (liberando el correo) y limpia todos los datos del tenant
-- si el usuario es owner, o desvincula sus referencias si es empleado/admin, evitando errores de FK.

create or replace function public.staff_delete_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_email text;
  target_role text;
  target_negocio_id text;
  v_table text;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;

  -- obtener perfil y correo
  select p.email, p.role, p.negocio_id into target_email, target_role, target_negocio_id 
  from public.profiles p where p.id = target_user_id;

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

  -- Si la cuenta borrada es Propietario (owner), limpiar todos los datos de su negocio (RGPD)
  if target_role = 'owner' and target_negocio_id is not null then
    for v_table in
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'negocio_id'
    loop
      execute format('delete from public.%I where negocio_id = %L', v_table, target_negocio_id);
    end loop;
  end if;

  -- Desvincular ficha de profesional si existia
  update public.profesionales set profile_id = null where profile_id = target_user_id;

  -- Soltar referencias de auditoria / usuario que bloquearian el borrado por FK
  update public.inventario set modificado_por = null where modificado_por = target_user_id;
  update public.movimientos_inventario set creado_por = null where creado_por = target_user_id;

  -- Eliminar perfil y cuenta auth
  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;
end;
$$;

-- Permisos
revoke execute on function public.staff_delete_account(uuid) from public;
revoke execute on function public.staff_delete_account(uuid) from anon;
grant execute on function public.staff_delete_account(uuid) to authenticated;
