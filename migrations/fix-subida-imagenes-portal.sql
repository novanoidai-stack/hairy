-- ---------------------------------------------------------------------------
-- fix-subida-imagenes-portal.sql
-- ---------------------------------------------------------------------------
-- Problema: el código llamaba a supabase.storage.from('negocio-fotos') que
-- nunca fue creado como bucket en Supabase, por lo que toda subida de fondo
-- de portal fallaba con "Bucket not found".
--
-- Solución:
--   1) Añadir el campo fondo_portal_url a negocio_portal si no existe.
--   2) Añadir la política SELECT (lectura pública) al bucket salon-fotos,
--      que es el bucket real usado para las fotos del salón. Sin esta política,
--      las imágenes del portal no se podían ver sin autenticación.
--   3) El código en configuracion.web.tsx ya fue actualizado para apuntar
--      a 'salon-fotos' con la subcarpeta 'fondo/' en lugar de 'negocio-fotos'.
-- ---------------------------------------------------------------------------

-- 1. Campo fondo_portal_url en negocio_portal
ALTER TABLE public.negocio_portal
  ADD COLUMN IF NOT EXISTS fondo_portal_url text;

COMMENT ON COLUMN public.negocio_portal.fondo_portal_url IS
  'URL pública de la imagen de fondo del portal de reservas del salón. Almacenada en bucket salon-fotos, carpeta negocio_id/fondo/.';

-- 2. Política SELECT pública para salon-fotos (necesaria para que las imágenes
--    sean accesibles sin sesión en el portal de reservas y en el directorio).
--    Las otras políticas (INSERT/UPDATE/DELETE) ya existen y están acotadas al
--    negocio_id del usuario autenticado.

drop policy if exists salon_fotos_select_public on storage.objects;
create policy salon_fotos_select_public on storage.objects
  for select to public
  using (bucket_id = 'salon-fotos');
