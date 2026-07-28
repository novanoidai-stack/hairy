-- Directorio publico de salones — FASE A: datos
--
-- Cimiento del directorio (/salones): la busqueda necesita ubicacion estructurada
-- y fotos del salon, y ninguna de las dos cosas existe hoy. negocio_portal solo
-- guarda `direccion` como texto libre, y el unico bucket de fotos con datos de
-- salon es servicio-fotos (fotos de servicio, no del local).
--
-- Esta migracion NO abre nada a anon: negocio_portal y negocio_fotos siguen sin
-- politica para anon, igual que hoy. La lectura publica del directorio ira por
-- RPC security definer en la fase B (regla 2 de CLAUDE.md: nunca SELECT directo
-- a anon).
--
-- Modelo de presencia: OPT-OUT. Todo portal activo entra en el directorio salvo
-- que el salon lo desactive (directorio_visible = false).

-- ---------------------------------------------------------------------------
-- 1. Ubicacion estructurada y presencia en el directorio
-- ---------------------------------------------------------------------------

alter table negocio_portal
  add column if not exists ciudad              text,
  add column if not exists provincia           text,
  add column if not exists codigo_postal       text,
  add column if not exists lat                 double precision,
  add column if not exists lng                 double precision,
  add column if not exists descripcion         text,
  add column if not exists directorio_visible  boolean not null default true;

comment on column negocio_portal.directorio_visible is
  'Opt-out del directorio publico. Por defecto true: todo portal activo aparece listado.';
comment on column negocio_portal.lat is
  'Latitud geocodificada desde la direccion. Null mientras no se geocodifique: el salon se busca por ciudad.';
comment on column negocio_portal.descripcion is
  'Texto libre del salon para su ficha en el directorio. No se usa en el portal de reserva.';

-- Coordenadas dentro de rango. Las filas existentes tienen null y pasan el check.
alter table negocio_portal
  drop constraint if exists negocio_portal_lat_check,
  drop constraint if exists negocio_portal_lng_check;
alter table negocio_portal
  add constraint negocio_portal_lat_check check (lat is null or (lat >= -90  and lat <= 90)),
  add constraint negocio_portal_lng_check check (lng is null or (lng >= -180 and lng <= 180));

-- Indices parciales: solo interesa buscar entre los que de verdad se listan.
create index if not exists idx_negocio_portal_ciudad
  on negocio_portal (lower(ciudad))
  where portal_activo and directorio_visible;

create index if not exists idx_negocio_portal_geo
  on negocio_portal (lat, lng)
  where portal_activo and directorio_visible;

-- ---------------------------------------------------------------------------
-- 2. Galeria de fotos del salon
-- ---------------------------------------------------------------------------
-- La ficha del directorio muestra 1 foto grande + 4 miniaturas. Tabla propia en
-- vez de un array en negocio_portal para poder ordenar y borrar una suelta.

create table if not exists negocio_fotos (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  text not null,
  url         text not null,
  alt         text,
  orden       smallint not null default 0,
  created_at  timestamptz not null default now()
);

comment on table negocio_fotos is
  'Fotos publicas del local para el directorio. Bucket salon-fotos (publico), carpeta por negocio_id.';

create index if not exists idx_negocio_fotos_negocio on negocio_fotos (negocio_id, orden);

alter table negocio_fotos enable row level security;

-- Solo el propio negocio gestiona sus fotos. Sin politica para anon: la lectura
-- publica se sirve por RPC en la fase B.
drop policy if exists negocio_fotos_owner_all on negocio_fotos;
create policy negocio_fotos_owner_all on negocio_fotos
  for all to authenticated
  using      (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()))
  with check (negocio_id = (select p.negocio_id from profiles p where p.id = auth.uid()));

-- El visitante de la demo compartida no escribe (mismo patron que negocio_config).
drop policy if exists negocio_fotos_demo_block_insert on negocio_fotos;
create policy negocio_fotos_demo_block_insert on negocio_fotos
  for insert to authenticated with check (not is_shared_demo_visitor());

drop policy if exists negocio_fotos_demo_block_update on negocio_fotos;
create policy negocio_fotos_demo_block_update on negocio_fotos
  for update to authenticated
  using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());

drop policy if exists negocio_fotos_demo_block_delete on negocio_fotos;
create policy negocio_fotos_demo_block_delete on negocio_fotos
  for delete to authenticated using (not is_shared_demo_visitor());

-- ---------------------------------------------------------------------------
-- 3. Bucket de fotos del salon
-- ---------------------------------------------------------------------------
-- Publico a proposito: estas fotos se ven en el directorio sin sesion. Mismo
-- patron que servicio-fotos (publico, escritura acotada a la carpeta del
-- negocio). NO confundir con cliente-fotos, que es privado y lleva datos
-- personales de clientas.

insert into storage.buckets (id, name, public)
values ('salon-fotos', 'salon-fotos', true)
on conflict (id) do nothing;

drop policy if exists salon_fotos_insert on storage.objects;
create policy salon_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'salon-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from profiles p where p.id = auth.uid())
  );

drop policy if exists salon_fotos_update on storage.objects;
create policy salon_fotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'salon-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from profiles p where p.id = auth.uid())
  );

drop policy if exists salon_fotos_delete on storage.objects;
create policy salon_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'salon-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from profiles p where p.id = auth.uid())
  );
