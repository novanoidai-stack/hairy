-- Migración S08: Registro Universal (eventos_negocio)
-- "Todo queda registrado": bitácora inmutable de acciones IA por negocio.

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

-- RLS (patrón estándar profiles.negocio_id, coherente con las demás tablas)
ALTER TABLE public.eventos_negocio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de eventos del negocio" ON public.eventos_negocio;
CREATE POLICY "Lectura de eventos del negocio"
ON public.eventos_negocio
FOR SELECT
USING (
  negocio_id = (SELECT negocio_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
);

DROP POLICY IF EXISTS "Inserción de eventos del negocio" ON public.eventos_negocio;
CREATE POLICY "Inserción de eventos del negocio"
ON public.eventos_negocio
FOR INSERT
WITH CHECK (
  negocio_id = (SELECT negocio_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
);

-- Nota: sin políticas de UPDATE/DELETE para usuarios (inmutabilidad del registro).

-- Borrado RGPD: SECURITY DEFINER endurecido (SET search_path + solo owner/admin).
-- Solo el responsable del tratamiento puede ejecutar el derecho al olvido.
CREATE OR REPLACE FUNCTION public.rpc_borrar_eventos_rgpd(p_negocio_id text, p_entidad text, p_entidad_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negocio text;
  v_role text;
BEGIN
  SELECT negocio_id, role::text INTO v_negocio, v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_negocio IS NULL OR v_negocio <> p_negocio_id THEN
    RAISE EXCEPTION 'No autorizado: no perteneces a este negocio';
  END IF;

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'No autorizado: solo el propietario o administrador puede ejecutar borrados RGPD';
  END IF;

  DELETE FROM public.eventos_negocio
  WHERE negocio_id = p_negocio_id
    AND entidad = p_entidad
    AND entidad_id = p_entidad_id;
END;
$$;
