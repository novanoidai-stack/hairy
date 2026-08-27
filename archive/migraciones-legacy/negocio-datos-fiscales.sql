-- Migration: negocio-datos-fiscales.sql
-- Datos del EMISOR necesarios para generar tickets/facturas VeriFactu profesionales.
-- Se anaden a negocio_portal (ya tiene la informacion publica del portal) porque es
-- 1 fila por negocio y ya esta cubierta por sus politicas RLS (owner/admin editan).
--
-- Campos (Mega-Plan FASE 0 / WS-8): razon_social, nif, direccion_fiscal,
-- cp_fiscal, poblacion_fiscal. Todos opcionales: se rellenan desde Ajustes cuando
-- el negocio haga su alta fiscal; mientras tanto el ticket usa fallbacks honrados.

alter table public.negocio_portal
  add column if not exists razon_social text,
  add column if not exists nif text,
  add column if not exists direccion_fiscal text,
  add column if not exists cp_fiscal text,
  add column if not exists poblacion_fiscal text;

comment on column public.negocio_portal.razon_social is 'Razon social del emisor para tickets/facturas (alta fiscal pendiente si es null).';
comment on column public.negocio_portal.nif is 'NIF/CIF del emisor. Se usa como cifEmisor en el hash encadenado VeriFactu.';
comment on column public.negocio_portal.direccion_fiscal is 'Direccion fiscal del emisor (ticket).';
comment on column public.negocio_portal.cp_fiscal is 'Codigo postal fiscal del emisor (ticket).';
comment on column public.negocio_portal.poblacion_fiscal is 'Poblacion fiscal del emisor (ticket).';
