-- Migración para añadir soporte a servicios puntuales
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS es_puntual boolean DEFAULT false;

-- Recrear la vista public.servicios de forma dinámica para incluir todas las columnas de public.services
-- Esto es compatible tanto con esquemas locales/antiguos como con producción/nuevos.
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO v_cols
  FROM information_schema.columns
  WHERE table_name = 'services' AND table_schema = 'public';

  EXECUTE 'CREATE OR REPLACE VIEW public.servicios AS SELECT ' || v_cols || ' FROM public.services;';
END;
$$;
