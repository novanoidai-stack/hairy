-- migrations/fiscal-a1-facturas.sql
-- Registro de facturacion VeriFactu (modalidad puro). Inmutable tras 'generada'.
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cobro_id uuid references public.cobros(id),

  estado text not null default 'borrador'
    check (estado in ('borrador','generada','aceptada','aceptada_con_errores','rechazada','anulada')),
  operacion text not null default 'alta' check (operacion in ('alta','anulacion')),
  factura_anulada_id uuid references public.facturas(id),
  factura_rectificada_id uuid references public.facturas(id),

  tipo text not null default 'F2' check (tipo in ('F1','F2','R1','R2','R3','R4','R5')),
  serie text not null,
  numero integer,                    -- se asigna al GENERAR (no en borrador) => sin huecos
  ejercicio integer not null,
  num_serie_completo text,           -- NumSerieFactura para la huella/XML (p.ej. 'A/2026/000123')
  fecha_expedicion date not null default current_date,
  fechahora_gen timestamptz,         -- FechaHoraHusoGenRegistro (fijado al generar)

  id_emisor text not null,           -- NIF del salon (IDEmisorFactura)
  nif_receptor text,
  nombre_receptor text,

  base_imponible_cents integer not null,
  tipo_iva numeric not null default 21.0,
  cuota_iva_cents integer not null,
  total_cents integer not null,

  huella text,                       -- <sum1:Huella> de ESTE registro (se fija al generar)
  huella_anterior text,              -- huella del registro inmediatamente anterior del negocio

  aeat_estado text,                  -- Correcto / AceptadoConErrores / Incorrecto (crudo AEAT)
  aeat_csv text,
  aeat_error_codigo text,
  aeat_error_desc text,
  qr_url text,
  payload_xml text,                  -- XML enviado (auditoria)
  respuesta jsonb,                   -- respuesta cruda AEAT
  entorno text,                      -- preproduccion | produccion

  created_at timestamptz not null default now(),
  unique (negocio_id, serie, ejercicio, numero)
);
create index if not exists facturas_negocio_gen on public.facturas(negocio_id, fechahora_gen);
create index if not exists facturas_cobro on public.facturas(cobro_id);
create index if not exists facturas_pendiente_envio on public.facturas(negocio_id)
  where estado = 'generada' and aeat_estado is null;
-- Una sola factura de alta por cobro
create unique index if not exists facturas_cobro_alta_unico
  on public.facturas(negocio_id, cobro_id) where cobro_id is not null and operacion='alta';

alter table public.facturas enable row level security;
drop policy if exists facturas_select_own on public.facturas;
create policy facturas_select_own on public.facturas
  for select using (negocio_id = current_setting('app.negocio_id', true));
-- Sin INSERT/UPDATE/DELETE para authenticated: todo via RPC security definer.

-- Inmutabilidad DELETE: nunca
create or replace function public.facturas_prevent_delete()
returns trigger as $$
begin
  raise exception 'No se permite eliminar registros de facturacion (RD 1007/2023 VeriFactu).';
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_delete_trigger on public.facturas;
create trigger facturas_prevent_delete_trigger before delete on public.facturas
  for each row execute function public.facturas_prevent_delete();

-- Inmutabilidad UPDATE: campos fiscales/huella intocables SIEMPRE.
-- Numero/huella/fechahora_gen: se fijan en el paso 'generada' (cuando OLD.estado='borrador').
create or replace function public.facturas_prevent_fiscal_updates()
returns trigger as $$
begin
  -- Campos economicos y de identidad: intocables siempre
  if OLD.negocio_id <> NEW.negocio_id
     or OLD.cobro_id is distinct from NEW.cobro_id
     or OLD.tipo <> NEW.tipo or OLD.operacion <> NEW.operacion
     or OLD.serie <> NEW.serie or OLD.ejercicio <> NEW.ejercicio
     or OLD.base_imponible_cents <> NEW.base_imponible_cents
     or OLD.cuota_iva_cents <> NEW.cuota_iva_cents
     or OLD.total_cents <> NEW.total_cents or OLD.tipo_iva <> NEW.tipo_iva
     or OLD.id_emisor <> NEW.id_emisor then
    raise exception 'Campos fiscales de una factura no son modificables (VeriFactu).';
  end if;
  -- numero/huella/huella_anterior/fechahora_gen/num_serie_completo: solo se pueden fijar al generar
  if OLD.estado <> 'borrador' then
    if OLD.numero is distinct from NEW.numero
       or OLD.huella is distinct from NEW.huella
       or OLD.huella_anterior is distinct from NEW.huella_anterior
       or OLD.fechahora_gen is distinct from NEW.fechahora_gen
       or OLD.num_serie_completo is distinct from NEW.num_serie_completo then
      raise exception 'La factura ya esta generada; la huella/numero no se pueden cambiar (VeriFactu).';
    end if;
  end if;
  return NEW;
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_fiscal_updates_trigger on public.facturas;
create trigger facturas_prevent_fiscal_updates_trigger before update on public.facturas
  for each row execute function public.facturas_prevent_fiscal_updates();

revoke execute on function public.facturas_prevent_delete() from public, anon, authenticated;
revoke execute on function public.facturas_prevent_fiscal_updates() from public, anon, authenticated;
