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
