-- Migracion: bucket de fotos de servicios (catalogo del portal)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Las fotos de servicio se muestran en el portal de reserva PUBLICO (anonimo),
-- asi que el bucket es PUBLICO de lectura (a diferencia de cliente-fotos, privado).
-- La escritura queda restringida a la carpeta del propio negocio (primer segmento
-- del path = negocio_id), igual patron que el resto del proyecto.

insert into storage.buckets (id, name, public)
values ('servicio-fotos', 'servicio-fotos', true)
on conflict (id) do update set public = true;

-- INSERT: solo en la carpeta del negocio del usuario autenticado.
drop policy if exists servicio_fotos_insert on storage.objects;
create policy servicio_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'servicio-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- UPDATE: idem.
drop policy if exists servicio_fotos_update on storage.objects;
create policy servicio_fotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'servicio-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- DELETE: idem.
drop policy if exists servicio_fotos_delete on storage.objects;
create policy servicio_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'servicio-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- Lectura: el bucket es publico, se sirve por URL publica sin politica de SELECT.
