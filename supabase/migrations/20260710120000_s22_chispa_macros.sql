-- Migracion S22: Chispa Macros (Tools declarativas parametrizables)
-- Permite que la IA componga tools existentes en macros reutilizables y aprobadas.

CREATE TABLE IF NOT EXISTS public.chispa_macros (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  negocio_id text NOT NULL,
  nombre text NOT NULL, -- Ej: 'auditoria_matutina'
  descripcion text NOT NULL,
  parametros jsonb DEFAULT '[]'::jsonb NOT NULL, -- Array de definiciones de parametros
  pasos jsonb DEFAULT '[]'::jsonb NOT NULL, -- Array de llamadas a tools: { name: string, args_mapping: Record<string, string> }
  estado text DEFAULT 'revision' NOT NULL CHECK (estado IN ('borrador', 'revision', 'aprobado')),
  creado_por text NOT NULL, -- ID del usuario o 'ai_asistente'
  creado_en timestamptz DEFAULT now() NOT NULL,
  actualizado_en timestamptz DEFAULT now() NOT NULL,
  UNIQUE(negocio_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_chispa_macros_negocio ON public.chispa_macros(negocio_id);

ALTER TABLE public.chispa_macros ENABLE ROW LEVEL SECURITY;

-- Politicas RLS
DROP POLICY IF EXISTS "macros_select_own_negocio" ON public.chispa_macros;
CREATE POLICY "macros_select_own_negocio" ON public.chispa_macros
  FOR SELECT
  USING (
    negocio_id = current_setting('jwt.claims', true)::jsonb->>'negocio_id'
  );

DROP POLICY IF EXISTS "macros_insert_own_negocio" ON public.chispa_macros;
CREATE POLICY "macros_insert_own_negocio" ON public.chispa_macros
  FOR INSERT
  WITH CHECK (
    negocio_id = current_setting('jwt.claims', true)::jsonb->>'negocio_id'
  );

DROP POLICY IF EXISTS "macros_update_own_negocio" ON public.chispa_macros;
CREATE POLICY "macros_update_own_negocio" ON public.chispa_macros
  FOR UPDATE
  USING (
    negocio_id = current_setting('jwt.claims', true)::jsonb->>'negocio_id'
  )
  WITH CHECK (
    negocio_id = current_setting('jwt.claims', true)::jsonb->>'negocio_id'
  );

DROP POLICY IF EXISTS "macros_delete_own_negocio" ON public.chispa_macros;
CREATE POLICY "macros_delete_own_negocio" ON public.chispa_macros
  FOR DELETE
  USING (
    negocio_id = current_setting('jwt.claims', true)::jsonb->>'negocio_id'
  );

-- Trigger de actualizacion
CREATE OR REPLACE FUNCTION public.set_actualizado_en_chispa_macros()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizado_en_chispa_macros ON public.chispa_macros;
CREATE TRIGGER trigger_actualizado_en_chispa_macros
BEFORE UPDATE ON public.chispa_macros
FOR EACH ROW
EXECUTE FUNCTION public.set_actualizado_en_chispa_macros();
