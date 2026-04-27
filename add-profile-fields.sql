-- Agregar campos a la tabla profiles para el nuevo registro
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS apellido text,
ADD COLUMN IF NOT EXISTS nombre_negocio text,
ADD COLUMN IF NOT EXISTS codigo_postal text;
