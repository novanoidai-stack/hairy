-- Función para eliminar la propia cuenta de forma segura y completa
create or replace function public.eliminar_propia_cuenta()
returns boolean
language plpgsql
security definer -- Superuser context to write to auth schema
set search_path = public
as $$
declare
  v_user_id uuid;
  v_negocio_id text;
  v_role text;
  v_table text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Obtener el negocio_id y el role del usuario
  select negocio_id, role into v_negocio_id, v_role
  from public.profiles
  where id = v_user_id;

  -- Si es el owner, eliminar todos los datos del negocio en todas las tablas (RGPD)
  if v_role = 'owner' and v_negocio_id is not null then
    for v_table in
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'negocio_id'
    loop
      execute format('delete from public.%I where negocio_id = %L', v_table, v_negocio_id);
    end loop;
  end if;

  -- Desvincular profesional y soltar referencias de auditoria / creador / modificador
  update public.profesionales set profile_id = null where profile_id = v_user_id;
  update public.inventario set modificado_por = null where modificado_por = v_user_id;
  update public.movimientos_inventario set creado_por = null where creado_por = v_user_id;
  update public.citas set creado_por = null where creado_por = v_user_id;
  update public.citas set modificado_por = null where modificado_por = v_user_id;
  update public.planes_ia set generado_por = null where generado_por = v_user_id;

  -- Eliminar de auth.users. Esto cascada a public.profiles y cualquier dato atado directamente por auth
  delete from auth.users where id = v_user_id;
  return true;
end;
$$;

-- Restricción de permisos
revoke execute on function public.eliminar_propia_cuenta() from public;
grant execute on function public.eliminar_propia_cuenta() to authenticated;
