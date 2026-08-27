-- Fotos de servicios por cliente (galeria de cortes/colores) para la ficha.
-- negocio_id es TEXT en este proyecto; el scoping multi-tenant usa el helper
-- public.my_negocio_id_text() (definido en roles-permisos.sql).

create table if not exists public.cliente_fotos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  negocio_id text not null,
  storage_path text not null,
  url text,
  servicio_id uuid,
  nota text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists cliente_fotos_cliente_idx on public.cliente_fotos(cliente_id, created_at desc);
create index if not exists cliente_fotos_negocio_idx on public.cliente_fotos(negocio_id);

alter table public.cliente_fotos enable row level security;

drop policy if exists cliente_fotos_select on public.cliente_fotos;
create policy cliente_fotos_select on public.cliente_fotos
  for select to authenticated
  using (negocio_id = public.my_negocio_id_text());

drop policy if exists cliente_fotos_insert on public.cliente_fotos;
create policy cliente_fotos_insert on public.cliente_fotos
  for insert to authenticated
  with check (negocio_id = public.my_negocio_id_text());

drop policy if exists cliente_fotos_delete on public.cliente_fotos;
create policy cliente_fotos_delete on public.cliente_fotos
  for delete to authenticated
  using (negocio_id = public.my_negocio_id_text());

-- Bucket de almacenamiento. Lectura publica (para mostrar <img>); escritura solo
-- autenticada. Las rutas se organizan como negocio_id/cliente_id/uuid.ext
insert into storage.buckets (id, name, public)
  values ('cliente-fotos', 'cliente-fotos', true)
  on conflict (id) do nothing;

drop policy if exists "cliente_fotos_obj_read" on storage.objects;
create policy "cliente_fotos_obj_read" on storage.objects
  for select using (bucket_id = 'cliente-fotos');

drop policy if exists "cliente_fotos_obj_insert" on storage.objects;
create policy "cliente_fotos_obj_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cliente-fotos');

drop policy if exists "cliente_fotos_obj_delete" on storage.objects;
create policy "cliente_fotos_obj_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cliente-fotos');
