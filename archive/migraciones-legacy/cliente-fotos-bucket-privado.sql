-- Migracion: fotos de clientas — bucket privado + politicas por negocio
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- APLICADA en remoto el 10/06/2026 via MCP (apply_migration: cliente_fotos_bucket_privado)
--
-- Antes: bucket PUBLICO con SELECT para public (cualquiera podia listar y ver
-- las fotos antes/despues de las clientas de TODOS los salones — dato personal,
-- RGPD) e INSERT/DELETE para cualquier authenticated sobre todo el bucket
-- (un usuario de un salon podia borrar las fotos de otro).
--
-- Ahora: bucket privado; cada negocio solo ve/sube/borra dentro de su carpeta
-- (las rutas son negocio_id/cliente_id/archivo). La app pinta las fotos con
-- URLs firmadas (createSignedUrls) en vez de URLs publicas.

update storage.buckets set public = false where id = 'cliente-fotos';

drop policy if exists cliente_fotos_obj_read on storage.objects;
create policy cliente_fotos_obj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cliente-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists cliente_fotos_obj_insert on storage.objects;
create policy cliente_fotos_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cliente-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists cliente_fotos_obj_delete on storage.objects;
create policy cliente_fotos_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cliente-fotos'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );
