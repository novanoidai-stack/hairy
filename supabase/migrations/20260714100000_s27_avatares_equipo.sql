-- Añadir foto_perfil a profesionales
ALTER TABLE public.profesionales
ADD COLUMN foto_perfil text;

-- Crear bucket de almacenamiento "avatares" (si no existe)
-- Insertar en storage.buckets si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatares', 'avatares', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de seguridad para el bucket "avatares"
-- Permitir lectura pública
CREATE POLICY "Avatares accesibles publicamente"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatares' );

-- Permitir subida y actualización para usuarios autenticados
CREATE POLICY "Permitir subida y edicion de avatares a usuarios autenticados"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatares' );

CREATE POLICY "Permitir actualizar avatares a usuarios autenticados"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatares' );

CREATE POLICY "Permitir borrar avatares a usuarios autenticados"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'avatares' );
