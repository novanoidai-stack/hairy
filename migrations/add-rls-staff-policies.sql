-- Redefinir funciones de chequeo a plpgsql para evitar inlining y recursión en RLS
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from public.staff s
    where lower(s.email) = lower(auth.jwt() ->> 'email')
  ) into v_exists;
  return v_exists;
end;
$$;

CREATE OR REPLACE FUNCTION public.is_team_member()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from public.profiles 
    where id = auth.uid() 
      and (
        role = 'admin' 
        or email ilike '%@novanoidai.com'
        or exists (
          select 1 from public.staff s
          where lower(s.email) = lower(profiles.email)
        )
        or lower(email) in (
          'novanoidai@gmail.com',
          'carlitosocanamartinez@gmail.com',
          'carlitoscanamartimez@gmail.com',
          'carletes2007cc@gmail.com',
          'alexandruiscru07@gmail.com'
        )
      )
  ) into v_exists;
  return v_exists;
end;
$$;

-- 1) Políticas para la tabla resenas
drop policy if exists resenas_staff_select on public.resenas;
create policy resenas_staff_select on public.resenas
  for select to authenticated
  using (public.is_staff());

-- 2) Políticas para la tabla negocio_portal
drop policy if exists negocio_portal_staff_select on public.negocio_portal;
create policy negocio_portal_staff_select on public.negocio_portal
  for select to authenticated
  using (public.is_staff());

-- 3) Políticas para la tabla staff (permitir al propio staff gestionar el equipo)
drop policy if exists "Staff can select all staff" on public.staff;
create policy "Staff can select all staff" on public.staff
  for select to authenticated
  using (public.is_staff());

drop policy if exists "Staff can insert staff" on public.staff;
create policy "Staff can insert staff" on public.staff
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists "Staff can delete staff" on public.staff;
create policy "Staff can delete staff" on public.staff
  for delete to authenticated
  using (public.is_staff());

-- 4) Funciones RPC seguras para gestionar miembros de staff sin RLS
create or replace function public.staff_add_member(
  member_email text,
  member_name text
)
returns public.staff
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_row public.staff;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  insert into public.staff (email, nombre)
  values (lower(trim(member_email)), trim(member_name))
  on conflict (email) do update
     set nombre = excluded.nombre
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.staff_add_member(text, text) from public, anon;
grant execute on function public.staff_add_member(text, text) to authenticated;

create or replace function public.staff_remove_member(
  member_email text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  delete from public.staff
   where lower(email) = lower(trim(member_email));

  return true;
end;
$$;

revoke all on function public.staff_remove_member(text) from public, anon;
grant execute on function public.staff_remove_member(text) to authenticated;


