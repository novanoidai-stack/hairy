-- Migración S08: Registro Universal

CREATE TABLE IF NOT EXISTS public.eventos_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  tipo text not null,
  entidad text,
  entidad_id text,
  actor text not null,
  resumen text not null,
  datos jsonb default '{}'::jsonb,
  resultado text,
  motivo text,
  creado_en timestamp with time zone default now()
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_eventos_negocio_id_fecha ON public.eventos_negocio(negocio_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_eventos_negocio_tipo ON public.eventos_negocio(negocio_id, tipo);
CREATE INDEX IF NOT EXISTS idx_eventos_entidad ON public.eventos_negocio(entidad, entidad_id);

-- Políticas RLS
ALTER TABLE public.eventos_negocio ENABLE ROW LEVEL SECURITY;

-- Política de Lectura
CREATE POLICY "Lectura de eventos del negocio" 
ON public.eventos_negocio
FOR SELECT 
USING (
  negocio_id = (SELECT negocio_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
);

-- Política de Inserción
CREATE POLICY "Inserción de eventos del negocio" 
ON public.eventos_negocio
FOR INSERT 
WITH CHECK (
  negocio_id = (SELECT negocio_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
);

-- Nota: No se crean políticas de UPDATE o DELETE generales para usuarios para garantizar la inmutabilidad

-- Borrado RGPD: RPC para borrar rastros de una entidad (ej. cliente) cuando se solicita olvido
CREATE OR REPLACE FUNCTION rpc_borrar_eventos_rgpd(p_negocio_id text, p_entidad text, p_entidad_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validamos que quien llama tiene acceso al negocio (admin o el propio sistema)
  -- Nota: en producción real se suele validar con auth.uid() y rol
  IF (SELECT negocio_id FROM public.profiles WHERE id = auth.uid() LIMIT 1) = p_negocio_id THEN
    DELETE FROM public.eventos_negocio 
    WHERE negocio_id = p_negocio_id 
      AND entidad = p_entidad 
      AND entidad_id = p_entidad_id;
  END IF;
END;
$$;
