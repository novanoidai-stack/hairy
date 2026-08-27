-- migrations/fiscal-a0-config.sql
-- Identidad fiscal por negocio (obligado tributario). Multi-tenant estricto.
create table if not exists public.config_fiscal (
  negocio_id text primary key,
  nif text,
  razon_social text,
  domicilio_fiscal text,
  regimen_iva text not null default 'general',
  tipo_iva_defecto numeric not null default 21.0,
  territorio text not null default 'comun'
    check (territorio in ('comun','foral_pv','foral_navarra')),
  serie_defecto text not null default 'A',
  modalidad text not null default 'verifactu'
    check (modalidad in ('verifactu','no_verifactu')),
  aplica_verifactu boolean not null default true,   -- false si SII/modulos/foral
  proveedor_fiscal text,
  proveedor_estado text not null default 'no_configurado'
    check (proveedor_estado in ('no_configurado','sandbox','produccion')),
  apoderamiento_ok boolean not null default false,
  declaracion_responsable_ok boolean not null default false,
  activo boolean not null default false,            -- facturacion fiscal ACTIVA
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.config_fiscal enable row level security;

drop policy if exists config_fiscal_select_own on public.config_fiscal;
create policy config_fiscal_select_own on public.config_fiscal
  for select using (negocio_id = current_setting('app.negocio_id', true));

-- Upsert controlado (no exponemos INSERT/UPDATE directos a authenticated)
create or replace function public.upsert_config_fiscal(
  p_negocio_id text,
  p_nif text default null,
  p_razon_social text default null,
  p_domicilio_fiscal text default null,
  p_regimen_iva text default null,
  p_tipo_iva_defecto numeric default null,
  p_territorio text default null,
  p_serie_defecto text default null,
  p_modalidad text default null,
  p_aplica_verifactu boolean default null,
  p_proveedor_fiscal text default null
) returns public.config_fiscal as $$
declare v_row public.config_fiscal;
begin
  insert into public.config_fiscal as cf (negocio_id, nif, razon_social, domicilio_fiscal,
      regimen_iva, tipo_iva_defecto, territorio, serie_defecto, modalidad, aplica_verifactu, proveedor_fiscal)
  values (p_negocio_id, p_nif, p_razon_social, p_domicilio_fiscal,
      coalesce(p_regimen_iva,'general'), coalesce(p_tipo_iva_defecto,21.0),
      coalesce(p_territorio,'comun'), coalesce(p_serie_defecto,'A'),
      coalesce(p_modalidad,'verifactu'), coalesce(p_aplica_verifactu,true), p_proveedor_fiscal)
  on conflict (negocio_id) do update set
    nif = coalesce(p_nif, cf.nif),
    razon_social = coalesce(p_razon_social, cf.razon_social),
    domicilio_fiscal = coalesce(p_domicilio_fiscal, cf.domicilio_fiscal),
    regimen_iva = coalesce(p_regimen_iva, cf.regimen_iva),
    tipo_iva_defecto = coalesce(p_tipo_iva_defecto, cf.tipo_iva_defecto),
    territorio = coalesce(p_territorio, cf.territorio),
    serie_defecto = coalesce(p_serie_defecto, cf.serie_defecto),
    modalidad = coalesce(p_modalidad, cf.modalidad),
    aplica_verifactu = coalesce(p_aplica_verifactu, cf.aplica_verifactu),
    proveedor_fiscal = coalesce(p_proveedor_fiscal, cf.proveedor_fiscal),
    updated_at = now()
  returning * into v_row;
  return v_row;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.upsert_config_fiscal(text,text,text,text,text,numeric,text,text,text,boolean,text)
  from public, anon;

-- migrations/fiscal-a0-config.sql  (además de lo del plan F1 Task 1)
alter table public.config_fiscal add column if not exists num_serie_formato text not null default '{serie}/{ejercicio}/{numero6}';
alter table public.config_fiscal add column if not exists entorno_aeat text not null default 'preproduccion'
  check (entorno_aeat in ('preproduccion','produccion'));
alter table public.config_fiscal add column if not exists representacion_ok boolean not null default false;
alter table public.config_fiscal add column if not exists representacion_doc_url text;
comment on column public.config_fiscal.representacion_ok is 'El salon firmo el modelo de representacion (Anexo II, Res. 18 dic 2024) para que Mecha remita por el.';
