-- migrations/fiscal-a7-fix-rls-select.sql
-- Fix RLS: config_fiscal y facturas usaban current_setting('app.negocio_id') (un GUC que el app de
-- Hairy nunca setea) -> las tablas eran ILEGIBLES desde el frontend (SELECT devolvia vacio para todos).
-- Se alinean con el patron del resto del codebase: my_negocio_id_text(), igual que negocio_pasarela.
-- Escribir ya funcionaba (upsert_config_fiscal es SECURITY DEFINER); esto arregla la LECTURA para que
-- la UI de Fiscalidad / el libro de Facturacion puedan mostrar los datos del propio negocio.
-- Aplicado al remoto via MCP como `fiscal_fix_rls_select_my_negocio` (2026-07-14).
drop policy if exists config_fiscal_select_own on public.config_fiscal;
create policy config_fiscal_select_own on public.config_fiscal
  for select using (negocio_id = public.my_negocio_id_text());

drop policy if exists facturas_select_own on public.facturas;
create policy facturas_select_own on public.facturas
  for select using (negocio_id = public.my_negocio_id_text());
