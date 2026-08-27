-- Fix: las policies demo_block_* de categorias_servicio se crearon como PERMISSIVE
-- en migrations/categorias-servicio.sql. Las policies permissive se combinan con OR,
-- asi que NO bloqueaban nada: el visitante de la demo compartida pasaba igualmente por
-- "Users can ... in own negocio" y podia insertar/editar/borrar categorias.
--
-- El patron correcto (ver clientes/servicios y demo-agenda-interactive.sql) es
-- RESTRICTIVE: se combina con AND con el resto de policies, de modo que
-- is_shared_demo_visitor() = true bloquea la escritura aunque la policy de negocio
-- la permitiria. Las cuentas de pago no se ven afectadas (para ellas la funcion = false).
--
-- Aplicada en Supabase (proyecto vtrggiogjrhqtwbhbgia) el 2026-06-30.

drop policy if exists "demo_block_insert" on public.categorias_servicio;
create policy "demo_block_insert" on public.categorias_servicio
  as restrictive for insert to authenticated
  with check (not public.is_shared_demo_visitor());

drop policy if exists "demo_block_update" on public.categorias_servicio;
create policy "demo_block_update" on public.categorias_servicio
  as restrictive for update to authenticated
  using (not public.is_shared_demo_visitor()) with check (not public.is_shared_demo_visitor());

drop policy if exists "demo_block_delete" on public.categorias_servicio;
create policy "demo_block_delete" on public.categorias_servicio
  as restrictive for delete to authenticated
  using (not public.is_shared_demo_visitor());
