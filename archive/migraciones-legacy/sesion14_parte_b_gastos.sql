-- ===============================================================================
-- SESIÓN 14 - PARTE B: MÓDULO DE GASTOS
-- ===============================================================================

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  concepto text not null,
  categoria text not null check (categoria in ('alquiler', 'suministros', 'producto', 'otros')),
  importe_cents integer not null check (importe_cents >= 0),
  fecha timestamptz not null default now(),
  es_recurrente boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_gastos_negocio_fecha on public.gastos(negocio_id, fecha);

-- RLS
alter table public.gastos enable row level security;

create policy "Lectura de gastos para admin/owner" on public.gastos
  for select to authenticated
  using (negocio_id in (select negocio_id from public.profiles where id = auth.uid() and role in ('admin', 'owner')));

create policy "Insertar gastos admin/owner" on public.gastos
  for insert to authenticated
  with check (negocio_id in (select negocio_id from public.profiles where id = auth.uid() and role in ('admin', 'owner')));

create policy "Actualizar gastos admin/owner" on public.gastos
  for update to authenticated
  using (negocio_id in (select negocio_id from public.profiles where id = auth.uid() and role in ('admin', 'owner')))
  with check (negocio_id in (select negocio_id from public.profiles where id = auth.uid() and role in ('admin', 'owner')));

create policy "Borrar gastos admin/owner" on public.gastos
  for delete to authenticated
  using (negocio_id in (select negocio_id from public.profiles where id = auth.uid() and role in ('admin', 'owner')));
