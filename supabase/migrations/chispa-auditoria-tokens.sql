-- Migración: Auditoría de tokens y costes de IA (Chispa)
-- Registra cada ejecución de IA con tokens consumidos y coste en dinero.
-- Permite al staff ver el gasto por negocio y por usuario individualmente.

CREATE TABLE IF NOT EXISTS public.chispa_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id text NOT NULL,
  usuario_id uuid NOT NULL,

  -- Identificación de la ejecución
  funcion_ia text NOT NULL, -- ej: 'asistente_agenda', 'organizar_agenda', 'analitica', etc.
  superficie text, -- pantalla desde la que se llamó (opcional)

  -- Modelo y tokens
  modelo text NOT NULL, -- ej: 'claude-haiku-4.5', 'claude-sonnet-5', 'gpt-4o', etc.
  proveedor text NOT NULL DEFAULT 'anthropic', -- 'anthropic', 'openai', 'openrouter', etc.
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,

  -- Coste en dinero (USD, calculado según precios del modelo)
  coste_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,

  -- Metadata
  exito BOOLEAN NOT NULL DEFAULT true,
  error_mensaje text,
  latencia_ms INTEGER, -- tiempo de respuesta en milisegundos

  -- Contexto (opcional, para debugging)
  contexto jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_chispa_auditoria_negocio_fecha ON public.chispa_auditoria(negocio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chispa_auditoria_usuario_fecha ON public.chispa_auditoria(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chispa_auditoria_funcion ON public.chispa_auditoria(funcion_ia);
CREATE INDEX IF NOT EXISTS idx_chispa_auditoria_modelo ON public.chispa_auditoria(modelo);

-- RLS: Solo el staff (is_staff()) puede leer, nadie excepto service_role puede escribir
ALTER TABLE public.chispa_auditoria ENABLE ROW LEVEL SECURITY;

-- Policy para el staff (is_staff())
DROP POLICY IF EXISTS "chispa_audit_select_staff" ON public.chispa_auditoria;
CREATE POLICY "chispa_audit_select_staff" ON public.chispa_auditoria
  FOR SELECT TO public
  USING (public.is_staff());

-- Nadie puede insertar directamente (solo service_role desde edge functions)
DROP POLICY IF EXISTS "chispa_audit_insert_none" ON public.chispa_auditoria;
CREATE POLICY "chispa_audit_insert_none" ON public.chispa_auditoria
  FOR INSERT TO public
  WITH CHECK (false);

-- Nadie puede update/delete (auditoría inmutable)
DROP POLICY IF EXISTS "chispa_audit_update_none" ON public.chispa_auditoria;
CREATE POLICY "chispa_audit_update_none" ON public.chispa_auditoria
  FOR UPDATE TO public
  WITH CHECK (false);

DROP POLICY IF EXISTS "chispa_audit_delete_none" ON public.chispa_auditoria;
CREATE POLICY "chispa_audit_delete_none" ON public.chispa_auditoria
  FOR DELETE TO public
  USING (false);

-- ---------------------------------------------------------------------------
-- RPC: registrar_auditoria_ia (llamada desde edge functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_auditoria_ia(
  p_negocio_id text,
  p_usuario_id uuid,
  p_funcion_ia text,
  p_modelo text,
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_coste_usd NUMERIC DEFAULT 0,
  p_superficie text DEFAULT NULL,
  p_exito BOOLEAN DEFAULT true,
  p_error_mensaje text DEFAULT NULL,
  p_latencia_ms INTEGER DEFAULT NULL,
  p_contexto jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validar que el usuario pertenece al negocio (defensa en profundidad)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_usuario_id AND negocio_id = p_negocio_id
  ) THEN
    RAISE EXCEPTION 'Usuario no pertenece al negocio indicado';
  END IF;

  INSERT INTO public.chispa_auditoria (
    negocio_id,
    usuario_id,
    funcion_ia,
    superficie,
    modelo,
    tokens_input,
    tokens_output,
    tokens_total,
    coste_usd,
    exito,
    error_mensaje,
    latencia_ms,
    contexto
  ) VALUES (
    p_negocio_id,
    p_usuario_id,
    p_funcion_ia,
    p_superficie,
    p_modelo,
    p_tokens_input,
    p_tokens_output,
    p_tokens_input + p_tokens_output,
    p_coste_usd,
    p_exito,
    p_error_mensaje,
    p_latencia_ms,
    p_contexto
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Grant para authenticated (edge functions usan la sesión del usuario)
REVOKE ALL ON FUNCTION public.registrar_auditoria_ia(
  text, uuid, text, text, INTEGER, INTEGER, NUMERIC, text, BOOLEAN, text, INTEGER, jsonb
) FROM public;
REVOKE ALL ON FUNCTION public.registrar_auditoria_ia(
  text, uuid, text, text, INTEGER, INTEGER, NUMERIC, text, BOOLEAN, text, INTEGER, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_auditoria_ia(
  text, uuid, text, text, INTEGER, INTEGER, NUMERIC, text, BOOLEAN, text, INTEGER, jsonb
) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: staff_auditoria_tokens (para el panel admin)
-- Devuelve estadísticas agregadas de tokens/coste por negocio y por usuario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_auditoria_tokens(
  p_negocio_id text DEFAULT NULL,
  p_dias INTEGER DEFAULT 30 -- últimos N días (default 30)
)
RETURNS TABLE (
  negocio_id text,
  negocio_nombre text,
  usuario_id uuid,
  usuario_email text,
  usuario_nombre text,
  funcion_ia text,
  modelo text,
  ejecuciones INTEGER,
  tokens_total BIGINT,
  coste_total_usd NUMERIC(10, 4)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo staff puede ejecutar
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email IN (
      SELECT email FROM public.staff
    )
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo staff';
  END IF;

  RETURN QUERY
  SELECT
    a.negocio_id,
    COALESCE(p.nombre_negocio, 'Sin nombre') AS negocio_nombre,
    a.usuario_id,
    COALESCE(up.email, 'Desconocido') AS usuario_email,
    COALESCE(up.nombre, 'Sin nombre') AS usuario_nombre,
    a.funcion_ia,
    a.modelo,
    COUNT(*) AS ejecuciones,
    SUM(a.tokens_total) AS tokens_total,
    SUM(a.coste_usd) AS coste_total_usd
  FROM public.chispa_auditoria a
  LEFT JOIN public.profiles p ON p.negocio_id = a.negocio_id AND p.role = 'owner'
  LEFT JOIN public.profiles up ON up.id = a.usuario_id
  WHERE
    a.created_at >= NOW() - (p_dias || ' days')::INTERVAL
    AND (p_negocio_id IS NULL OR a.negocio_id = p_negocio_id)
  GROUP BY
    a.negocio_id, p.nombre_negocio, a.usuario_id, up.email, up.nombre, a.funcion_ia, a.modelo
  ORDER BY
    a.negocio_id, a.usuario_id, a.funcion_ia, SUM(a.coste_usd) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_auditoria_tokens(text, INTEGER) FROM public;
REVOKE ALL ON FUNCTION public.staff_auditoria_tokens(text, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_auditoria_tokens(text, INTEGER) TO authenticated;
