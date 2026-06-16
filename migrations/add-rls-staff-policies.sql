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

