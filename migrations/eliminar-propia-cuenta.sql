-- Función para eliminar la propia cuenta de forma segura y completa
create or replace function public.eliminar_propia_cuenta()
returns boolean
language plpgsql
security definer -- Superuser context to write to auth schema
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Eliminar de auth.users. Esto cascada a public.profiles y todos sus datos relacionados
  delete from auth.users where id = v_user_id;
  return true;
end;
$$;

-- Restricción de permisos
revoke execute on function public.eliminar_propia_cuenta() from public;
grant execute on function public.eliminar_propia_cuenta() to authenticated;
