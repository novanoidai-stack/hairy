-- Punto 2 del Dossier de Requisitos Innegociables: Ficha de Cliente con Historial Real

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS alergias text,
  ADD COLUMN IF NOT EXISTS notas_generales text;

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS formula_producto text,
  ADD COLUMN IF NOT EXISTS formula_tono text,
  ADD COLUMN IF NOT EXISTS formula_tiempo_min int,
  ADD COLUMN IF NOT EXISTS formula_resultado text,
  ADD COLUMN IF NOT EXISTS formula_notas text;
