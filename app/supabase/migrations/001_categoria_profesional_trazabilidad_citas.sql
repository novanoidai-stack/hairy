-- Migración 001: Categoría de profesional + trazabilidad en citas
-- Ejecutar en Supabase SQL Editor del proyecto Hairy

-- 1. Añadir campo categoria a profesionales
ALTER TABLE profesionales
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'oficial'
  CHECK (categoria IN ('auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'));

-- 2. Añadir campos de trazabilidad a citas (RN-AG-021)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS modificado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS modificado_at timestamptz;

-- 3. Actualizar citas existentes: marcar creado_at si no existe (por si acaso)
-- (Si la tabla ya tiene created_at de Supabase, esto no es necesario)

-- Verificar que todo fue bien:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('profesionales', 'citas')
  AND column_name IN ('categoria', 'creado_por', 'modificado_por', 'modificado_at')
ORDER BY table_name, column_name;
