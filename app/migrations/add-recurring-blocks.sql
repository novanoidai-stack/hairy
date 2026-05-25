-- Add columns for recurring blocks (6.10) and conflict wizard (6.9)
ALTER TABLE bloqueos_profesional
  ADD COLUMN IF NOT EXISTS grupo_bloqueo_id uuid,
  ADD COLUMN IF NOT EXISTS recurrencia_padre_id uuid REFERENCES bloqueos_profesional(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrencia text;

-- Add cobro fields to citas (state simplification)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS cobrada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS importe_final numeric;

CREATE INDEX IF NOT EXISTS idx_bloqueos_grupo ON bloqueos_profesional(grupo_bloqueo_id);
CREATE INDEX IF NOT EXISTS idx_bloqueos_padre ON bloqueos_profesional(recurrencia_padre_id);
