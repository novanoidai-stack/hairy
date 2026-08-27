-- Roles de acceso del salon (Modular 3, seccion 7 / Fase 10.5).
-- Iteracion 1: anadir el rol 'recepcion', permitir a Direccion/Propietario
-- ver las cuentas de su negocio y cambiar su rol via RPC con las reglas del doc.
--
-- Aditiva y de bajo riesgo: amplia el CHECK de role (los valores actuales
-- siguen siendo validos), anade dos helpers SECURITY DEFINER, una policy de
-- SELECT (se suma por OR a "Users can view own profile") y una RPC.

-- 1) Ampliar el constraint de role para admitir 'recepcion'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['owner','admin','employee','recepcion']));

-- 2) Helpers del usuario actual (SECURITY DEFINER para no recursar sobre las
--    policies de profiles). negocio_id es TEXT en este proyecto.
create or replace function public.my_negocio_id_text()
returns text
language sql stable security definer set search_path to 'public'
as $function$
  select negocio_id from public.profiles where id = auth.uid()
$function$;

create or replace function public.my_app_role()
returns text
language sql stable security definer set search_path to 'public'
as $function$
  select role from public.profiles where id = auth.uid()
$function$;

-- 3) Direccion/Propietario pueden leer las cuentas de su propio negocio.
--    Se combina por OR con la policy existente "Users can view own profile",
--    asi que un profesional/recepcion sigue viendo solo su propia fila.
drop policy if exists "Direccion ve cuentas de su negocio" on public.profiles;
create policy "Direccion ve cuentas de su negocio" on public.profiles
  for select to authenticated
  using (
    negocio_id is not null
    and negocio_id = public.my_negocio_id_text()
    and public.my_app_role() in ('owner','admin')
  );

-- 4) Cambiar el rol de un miembro. Encapsula las reglas (RN-EQ-040/041).
create or replace function public.set_member_role(target_user_id uuid, new_role text)
returns public.profiles
language plpgsql security definer set search_path to 'public'
as $function$
declare
  caller public.profiles;
  target public.profiles;
  owners_count int;
begin
  select * into caller from public.profiles where id = auth.uid();
  if not found then raise exception 'no_profile'; end if;
  if caller.role not in ('owner','admin') then
    raise exception 'not_authorized';
  end if;

  if new_role not in ('owner','admin','employee','recepcion') then
    raise exception 'invalid_role';
  end if;

  select * into target from public.profiles where id = target_user_id;
  if not found then raise exception 'target_not_found'; end if;

  -- Mismo negocio (multi-tenant estricto).
  if target.negocio_id is distinct from caller.negocio_id then
    raise exception 'cross_tenant';
  end if;

  -- RN-EQ-041: solo un Propietario puede asignar o retirar el rol Propietario.
  if (new_role = 'owner' or target.role = 'owner') and caller.role <> 'owner' then
    raise exception 'owner_change_requires_owner';
  end if;

  -- No dejar al negocio sin Propietario.
  if target.role = 'owner' and new_role <> 'owner' then
    select count(*) into owners_count from public.profiles
      where negocio_id = caller.negocio_id and role = 'owner';
    if owners_count <= 1 then raise exception 'last_owner'; end if;
  end if;

  update public.profiles
     set role = new_role, updated_at = now()
   where id = target_user_id
   returning * into target;
  return target;
end;
$function$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
