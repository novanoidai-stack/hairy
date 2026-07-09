-- Migración: RPC staff_auditoria_completa (vista unificada de movimientos del negocio)
-- Devuelve todos los eventos, acciones de IA y auditoría de tokens de un negocio
-- para que el staff pueda ver el registro completo de actividad.

CREATE OR REPLACE FUNCTION public.staff_auditoria_completa(
  p_negocio_id text,
  p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
  tipo_fuente text, -- 'evento', 'accion_chispa', 'auditoria_ia'
  fecha timestamptz,
  usuario_id uuid,
  usuario_nombre text,
  usuario_email text,
  accion text,
  entidad text,
  entidad_id text,
  resumen text,
  detalles jsonb,
  metadata jsonb
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

  -- Union de todas las fuentes de datos
  RETURN QUERY
  -- 1. eventos_negocio
  SELECT
    'evento'::text AS tipo_fuente,
    e.creado_en AS fecha,
    NULL::uuid AS usuario_id,
    NULL::text AS usuario_nombre,
    NULL::text AS usuario_email,
    e.tipo AS accion,
    e.entidad,
    e.entidad_id,
    e.resumen,
    jsonb_build_object(
      'datos', e.datos,
      'resultado', e.resultado,
      'motivo', e.motivo
    ) AS detalles,
    jsonb_build_object(
      'actor', e.actor,
      'tipo', e.tipo
    ) AS metadata
  FROM public.eventos_negocio e
  WHERE
    e.negocio_id = p_negocio_id
    AND e.creado_en >= NOW() - (p_dias || ' days')::INTERVAL

  UNION ALL

  -- 2. chispa_acciones
  SELECT
    'accion_chispa'::text,
    a.creada_en,
    a.usuario_id,
    COALESCE(p.nombre, 'Desconocido'),
    COALESCE(p.email, ''),
    a.tipo_accion,
    'chispa'::text,
    a.target_id,
    COALESCE(a.target_label, a.tipo_accion),
    jsonb_build_object(
      'estado_previo', a.estado_previo,
      'reversible', a.reversible,
      'deshecha', a.deshecha
    ) AS detalles,
    jsonb_build_object(
      'deshecha_en', a.deshecha_en,
      'target_id', a.target_id
    ) AS metadata
  FROM public.chispa_acciones a
  LEFT JOIN public.profiles p ON p.id = a.usuario_id
  WHERE
    a.negocio_id = p_negocio_id
    AND a.creada_en >= NOW() - (p_dias || ' days')::INTERVAL

  UNION ALL

  -- 3. chispa_auditoria (tokens)
  SELECT
    'auditoria_ia'::text,
    aud.created_at,
    aud.usuario_id,
    COALESCE(up.nombre, 'Desconocido'),
    COALESCE(up.email, ''),
    aud.funcion_ia,
    aud.modelo,
    aud.superficie,
    COALESCE(aud.funcion_ia || ' (' || aud.modelo || ')', aud.funcion_ia),
    jsonb_build_object(
      'tokens_input', aud.tokens_input,
      'tokens_output', aud.tokens_output,
      'tokens_total', aud.tokens_total,
      'coste_usd', aud.coste_usd,
      'latencia_ms', aud.latencia_ms
    ) AS detalles,
    jsonb_build_object(
      'exito', aud.exito,
      'error', aud.error_mensaje,
      'proveedor', aud.proveedor,
      'contexto', aud.contexto
    ) AS metadata
  FROM public.chispa_auditoria aud
  LEFT JOIN public.profiles up ON up.id = aud.usuario_id
  WHERE
    aud.negocio_id = p_negocio_id
    AND aud.created_at >= NOW() - (p_dias || ' days')::INTERVAL;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_auditoria_completa(text, INTEGER) FROM public;
REVOKE ALL ON FUNCTION public.staff_auditoria_completa(text, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_auditoria_completa(text, INTEGER) TO authenticated;
