-- Gasto de IA por salon para el panel de staff
--
-- Dos RPCs:
--   staff_gasto_ia_resumen(dias)            -> una fila por salon (lo que se ve)
--   staff_gasto_ia_llamadas(negocio, dias)  -> el desglose al desplegar un salon
--
-- El coste ya viene calculado y guardado en `chispa_auditoria.coste_usd` por la
-- edge function que hizo la llamada, con el precio real del modelo
-- (supabase/functions/shared/modelos.ts). Aqui NO se recalcula nada: si se
-- recalculara con una tabla de precios distinta volveriamos a tener dos verdades,
-- que es justo lo que hacia que el panel mintiera.
--
-- Solo staff. Ambas STABLE y con el chequeo dentro (no basta con la RLS de la
-- tabla porque son SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- Resumen por salon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_gasto_ia_resumen(
  p_dias integer DEFAULT 30
)
RETURNS TABLE (
  negocio_id text,
  negocio_nombre text,
  llamadas bigint,
  llamadas_fallidas bigint,
  tokens_input bigint,
  tokens_output bigint,
  coste_usd numeric,
  funciones_distintas bigint,
  modelos text[],
  primera timestamptz,
  ultima timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (select public.is_staff()) THEN
    RAISE EXCEPTION 'No autorizado: solo staff';
  END IF;

  RETURN QUERY
  SELECT
    a.negocio_id,
    COALESCE(
      (SELECT p.nombre_negocio FROM public.profiles p
        WHERE p.negocio_id = a.negocio_id AND p.role = 'owner'
        ORDER BY p.created_at NULLS LAST LIMIT 1),
      a.negocio_id
    ) AS negocio_nombre,
    count(*) AS llamadas,
    count(*) FILTER (WHERE a.exito IS FALSE) AS llamadas_fallidas,
    COALESCE(sum(a.tokens_input), 0) AS tokens_input,
    COALESCE(sum(a.tokens_output), 0) AS tokens_output,
    COALESCE(sum(a.coste_usd), 0)::numeric AS coste_usd,
    count(DISTINCT a.funcion_ia) AS funciones_distintas,
    array_agg(DISTINCT a.modelo) FILTER (WHERE a.modelo IS NOT NULL AND a.modelo <> 'ninguno') AS modelos,
    min(a.created_at) AS primera,
    max(a.created_at) AS ultima
  FROM public.chispa_auditoria a
  WHERE a.created_at >= now() - (p_dias || ' days')::interval
  GROUP BY a.negocio_id
  ORDER BY sum(a.coste_usd) DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_gasto_ia_resumen(integer) FROM public;
REVOKE ALL ON FUNCTION public.staff_gasto_ia_resumen(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_gasto_ia_resumen(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Desglose: una fila por llamada (lo que se ve al desplegar un salon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_gasto_ia_llamadas(
  p_negocio_id text,
  p_dias integer DEFAULT 30,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  creado timestamptz,
  funcion_ia text,
  superficie text,
  modelo text,
  tokens_input integer,
  tokens_output integer,
  coste_usd numeric,
  exito boolean,
  error_mensaje text,
  latencia_ms integer,
  usuario_email text,
  usuario_nombre text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (select public.is_staff()) THEN
    RAISE EXCEPTION 'No autorizado: solo staff';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    a.funcion_ia,
    a.superficie,
    a.modelo,
    a.tokens_input,
    a.tokens_output,
    a.coste_usd,
    a.exito,
    a.error_mensaje,
    a.latencia_ms,
    up.email,
    up.nombre
  FROM public.chispa_auditoria a
  LEFT JOIN public.profiles up ON up.id = a.usuario_id
  WHERE a.negocio_id = p_negocio_id
    AND a.created_at >= now() - (p_dias || ' days')::interval
  ORDER BY a.created_at DESC
  LIMIT least(greatest(p_limite, 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_gasto_ia_llamadas(text, integer, integer) FROM public;
REVOKE ALL ON FUNCTION public.staff_gasto_ia_llamadas(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_gasto_ia_llamadas(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.staff_gasto_ia_resumen(integer) IS
  'Panel staff: gasto de IA agregado por salon en los ultimos N dias.';
COMMENT ON FUNCTION public.staff_gasto_ia_llamadas(text, integer, integer) IS
  'Panel staff: desglose llamada a llamada del gasto de IA de un salon.';
