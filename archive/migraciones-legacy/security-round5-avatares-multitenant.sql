-- Round 5 de seguridad (2 ago 2026) — aislamiento multi-tenant del bucket `avatares`
-- y endurecimiento de la politica de auditoria de Chispa.
--
-- HALLAZGO 1 (multi-tenant, el grave):
-- `avatares` era el UNICO bucket cuyas politicas de escritura no comprobaban la
-- carpeta del negocio. Con `USING (bucket_id = 'avatares')` a secas para
-- UPDATE y DELETE, CUALQUIER usuario autenticado de CUALQUIER salon podia
-- sobrescribir o borrar las fotos de perfil del equipo de otro salon. El resto
-- de buckets (cliente-fotos, presupuestos, salon-fotos, servicio-fotos) ya
-- comprobaban `storage.foldername(name)[1] = negocio_id`; esto los iguala.
--
-- La app sube siempre a `<negocio_id>/<profesional_id>-<ts>.jpg`
-- (app/(tabs)/equipo.web.tsx), asi que la comprobacion de carpeta encaja sin
-- tocar el cliente. El bucket sigue siendo PUBLICO: las fotos se muestran con
-- getPublicUrl y esa lectura por URL publica no pasa por RLS, de modo que
-- restringir el SELECT solo limita LISTAR el bucket por API (que la app no
-- hace) — que es justo lo que avisaba el advisor `public_bucket_allows_listing`.
--
-- HALLAZGO 2 (higiene):
-- La politica UPDATE de `chispa_auditoria` declaraba solo WITH CHECK (false),
-- dejando el USING implicito en `true`. En la practica ninguna fila se podia
-- modificar (el WITH CHECK lo impedia), pero la forma incumple la regla del
-- proyecto de no dejar politicas de escritura con USING siempre cierto y
-- disparaba el advisor `rls_policy_always_true`. Se declara explicito.

begin;

-- ---------------------------------------------------------------------------
-- 1. Bucket `avatares`: escritura y listado acotados al negocio del usuario
-- ---------------------------------------------------------------------------
drop policy if exists "Permitir subida y edicion de avatares a usuarios autenticados" on storage.objects;
drop policy if exists "Permitir actualizar avatares a usuarios autenticados" on storage.objects;
drop policy if exists "Permitir borrar avatares a usuarios autenticados" on storage.objects;
drop policy if exists "Avatares accesibles publicamente" on storage.objects;

create policy avatares_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

create policy avatares_obj_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

create policy avatares_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- Listado por API solo dentro del propio salon. Las <img> siguen funcionando
-- para todo el mundo porque el bucket es publico (la URL publica no pasa por RLS).
create policy avatares_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. `chispa_auditoria`: la auditoria es inmutable, dicho explicitamente
-- ---------------------------------------------------------------------------
drop policy if exists chispa_audit_update_none on public.chispa_auditoria;

create policy chispa_audit_update_none on public.chispa_auditoria
  for update
  using (false)
  with check (false);

commit;
