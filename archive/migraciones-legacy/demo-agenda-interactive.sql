-- Demo interactiva (no "solo vista").
-- Aplicada en Supabase (proyecto vtrggiogjrhqtwbhbgia) el 2026-06-04.
--
-- Objetivo: el usuario FREE (tenant compartido demo_salon_001) usa la agenda
-- como un usuario normal -crear y mover citas, bloqueos y add-ons- para probar
-- el producto de verdad, PERO no puede fastidiar la demo de los demas: no borra
-- la agenda compartida, no edita/borra clientes existentes, ni toca notas,
-- fichas, equipo, servicios, precios ni la configuracion del negocio.
--
-- Mecanismo: las policies demo_block_* son RESTRICTIVE (se combinan con AND) y
-- usan is_shared_demo_visitor(), que SOLO es true para cuentas free en
-- demo_salon_001 (y nunca para el owner semilla). Las cuentas de pago no se ven
-- afectadas: para ellas is_shared_demo_visitor() = false, asi que nunca bloquea.
--
-- Matriz resultante para el usuario demo:
--   citas, citas_historial, cita_addons, bloqueos, bloqueos_profesional
--        -> INSERT si, UPDATE si, DELETE no
--   clientes
--        -> INSERT si (reservar a un cliente nuevo), UPDATE no, DELETE no
--   notas_internas_cliente, fichas_tecnicas_color, consentimientos_cliente,
--   profesionales, horarios_profesional, duraciones_profesional,
--   professional_service_overrides, profesional_categorias_historial,
--   servicios, service_variants, service_addons, service_category_pricing,
--   servicios_combinables, negocio_config, negocio_horarios,
--   grupos_familiares, grupo_familiar_miembros, audit_log
--        -> bloqueo total (INSERT/UPDATE/DELETE no)

-- ============================================================
-- 1) ABRIR la agenda: quitar el bloqueo de INSERT/UPDATE donde queremos interaccion.
--    (Se conserva el bloqueo de DELETE para que nadie vacie la agenda compartida.)
-- ============================================================

drop policy if exists "demo_block_insert" on public.citas;
drop policy if exists "demo_block_update" on public.citas;

drop policy if exists "demo_block_insert" on public.citas_historial;
drop policy if exists "demo_block_update" on public.citas_historial;

drop policy if exists "demo_block_insert" on public.bloqueos_profesional;
drop policy if exists "demo_block_update" on public.bloqueos_profesional;

-- Clientes: permitir SOLO crear un cliente nuevo para poder reservar.
-- (Sigue bloqueado editar/borrar clientes existentes -> sin desfigurar la demo.)
drop policy if exists "demo_block_insert" on public.clientes;

-- ============================================================
-- 2) PROTEGER DELETE en las tablas de agenda que estaban totalmente abiertas.
-- ============================================================

create policy "demo_block_delete" on public.cita_addons
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());

create policy "demo_block_delete" on public.bloqueos
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());

-- ============================================================
-- 3) CERRAR tablas estructurales que estaban sin proteccion demo -> bloqueo total.
-- ============================================================

create policy "demo_block_insert" on public.horarios_profesional
  as restrictive for insert to authenticated
  with check (not is_shared_demo_visitor());
create policy "demo_block_update" on public.horarios_profesional
  as restrictive for update to authenticated
  using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());
create policy "demo_block_delete" on public.horarios_profesional
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());

create policy "demo_block_insert" on public.duraciones_profesional
  as restrictive for insert to authenticated
  with check (not is_shared_demo_visitor());
create policy "demo_block_update" on public.duraciones_profesional
  as restrictive for update to authenticated
  using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());
create policy "demo_block_delete" on public.duraciones_profesional
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());

create policy "demo_block_insert" on public.professional_service_overrides
  as restrictive for insert to authenticated
  with check (not is_shared_demo_visitor());
create policy "demo_block_update" on public.professional_service_overrides
  as restrictive for update to authenticated
  using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());
create policy "demo_block_delete" on public.professional_service_overrides
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());

create policy "demo_block_insert" on public.grupo_familiar_miembros
  as restrictive for insert to authenticated
  with check (not is_shared_demo_visitor());
create policy "demo_block_update" on public.grupo_familiar_miembros
  as restrictive for update to authenticated
  using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());
create policy "demo_block_delete" on public.grupo_familiar_miembros
  as restrictive for delete to authenticated
  using (not is_shared_demo_visitor());
