-- POS / Caja operativa (NO fiscal). Aplicada en remoto el 19 jun 2026 como
-- migracion `pos_caja_cobros_fichajes` (via MCP de Supabase).
--
-- Modelo de "dos capas" del informe ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md:
--   citas = verdad operativa · cobros = verdad financiera (enlazadas por cita_id).
-- Reparto: caja operativa (metodo como ETIQUETA efectivo/datafono/bizum, propina,
-- descuento, arqueo) = Carlos. Cobro electronico real + fiscalidad (VeriFactu) =
-- Alexandro/fiscalista. Hasta entonces: "recibo/comprobante", NUNCA "factura".

create table if not exists public.cobros (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cita_id uuid references public.citas(id) on delete set null,   -- null = walk-in sin cita
  grupo_id uuid,
  profesional_id uuid,
  cliente_id uuid,
  total_cents integer not null,
  propina_cents integer not null default 0,
  descuento_cents integer not null default 0,
  metodo text not null check (metodo in ('efectivo','datafono','online','bizum','mixto')),
  efectivo_cents integer not null default 0,
  datafono_cents integer not null default 0,
  online_cents integer not null default 0,
  origen text not null default 'pos'
    check (origen in ('manual','pos','portal','whatsapp','voz','buxi','ocr_tpv')),
  estado text not null default 'completado'
    check (estado in ('completado','anulado','reembolsado')),
  nota text,
  idempotency_key text,
  cobrado_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists cobros_cita_unico
  on public.cobros(cita_id) where cita_id is not null and estado = 'completado';
create index if not exists cobros_negocio_fecha on public.cobros(negocio_id, cobrado_at);

create table if not exists public.cobro_lineas (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros(id) on delete cascade,
  tipo text not null check (tipo in ('servicio','producto','suplemento')),
  ref_id uuid,
  nombre text not null,
  precio_cents integer not null,
  cantidad integer not null default 1
);
create index if not exists cobro_lineas_cobro on public.cobro_lineas(cobro_id);

alter table public.citas add column if not exists cobrada boolean not null default false;
alter table public.citas add column if not exists cobro_id uuid references public.cobros(id);

create table if not exists public.fichajes (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  profesional_id uuid,
  user_id uuid,
  tipo text not null check (tipo in ('entrada','salida')),
  marcado_at timestamptz not null default now(),
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists fichajes_negocio_fecha on public.fichajes(negocio_id, marcado_at);

-- RLS multi-tenant (espejo de citas)
alter table public.cobros enable row level security;
alter table public.cobro_lineas enable row level security;
alter table public.fichajes enable row level security;

create policy "cobros_select_own" on public.cobros for select
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "cobros_insert_own" on public.cobros for insert
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "cobros_update_own" on public.cobros for update
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "cobros_delete_own" on public.cobros for delete
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

create policy "cobro_lineas_select_own" on public.cobro_lineas for select
  using (exists (select 1 from public.cobros c where c.id = cobro_lineas.cobro_id
    and c.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));
create policy "cobro_lineas_insert_own" on public.cobro_lineas for insert
  with check (exists (select 1 from public.cobros c where c.id = cobro_lineas.cobro_id
    and c.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));
create policy "cobro_lineas_update_own" on public.cobro_lineas for update
  using (exists (select 1 from public.cobros c where c.id = cobro_lineas.cobro_id
    and c.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));
create policy "cobro_lineas_delete_own" on public.cobro_lineas for delete
  using (exists (select 1 from public.cobros c where c.id = cobro_lineas.cobro_id
    and c.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));

create policy "fichajes_select_own" on public.fichajes for select
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "fichajes_insert_own" on public.fichajes for insert
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "fichajes_update_own" on public.fichajes for update
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
create policy "fichajes_delete_own" on public.fichajes for delete
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));
