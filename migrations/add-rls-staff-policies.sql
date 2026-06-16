-- Migración: políticas RLS para Staff de Mecha
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia

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

