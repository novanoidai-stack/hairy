-- Create table for professional availability blocks (vacations, meetings, sick leave, etc.)
CREATE TABLE IF NOT EXISTS bloqueos_profesional (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  negocio_id uuid NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('vacaciones', 'reunion', 'baja', 'formacion', 'descanso')),
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  motivo text,
  recurrencia text, -- NULL for one-time, or pattern like 'weekly', 'daily', 'custom'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bloqueos_profesional_id ON bloqueos_profesional(profesional_id);
CREATE INDEX IF NOT EXISTS idx_bloqueos_negocio_id ON bloqueos_profesional(negocio_id);
CREATE INDEX IF NOT EXISTS idx_bloqueos_tiempo ON bloqueos_profesional(inicio, fin);
