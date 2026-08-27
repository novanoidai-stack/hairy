-- Cupo horario de IA por usuario
--
-- Por que: las funciones de IA caras (migracion magica, vision) solo exigian
-- estar autenticado. Con ventanas de 1M de tokens, una sola cuenta en prueba
-- podia subir ficheros enormes en bucle y eso es dinero real, no una molestia.
-- Esconder el boton en el cliente no es un control de acceso: el limite tiene
-- que vivir en el servidor.
--
-- Se apoya en `chispa_auditoria`, que ya registra cada ejecucion. No hace falta
-- tabla nueva: contamos las ejecuciones de la ultima hora del usuario actual.
--
-- Nota de rendimiento: la funcion va STABLE (nunca VOLATILE) y el conteo se
-- apoya en idx_chispa_auditoria_usuario_fecha.

-- Indice compuesto para que el conteo por funcion sea directo.
CREATE INDEX IF NOT EXISTS idx_chispa_auditoria_usuario_funcion_fecha
  ON public.chispa_auditoria (usuario_id, funcion_ia, created_at DESC);

CREATE OR REPLACE FUNCTION public.cupo_ia_disponible(
  p_funcion text,
  p_max_hora integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario uuid := (select auth.uid());
  v_usadas integer;
BEGIN
  IF v_usuario IS NULL THEN
    RETURN false;
  END IF;

  -- El tenant de la demo es el escaparate: no se le corta.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_usuario AND negocio_id = 'demo_salon_001'
  ) THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_usadas
  FROM public.chispa_auditoria
  WHERE usuario_id = v_usuario
    AND funcion_ia = p_funcion
    AND created_at >= now() - interval '1 hour';

  RETURN v_usadas < p_max_hora;
END;
$$;

-- Desde el round 4 ninguna funcion nueva nace ejecutable por anon.
REVOKE ALL ON FUNCTION public.cupo_ia_disponible(text, integer) FROM public;
REVOKE ALL ON FUNCTION public.cupo_ia_disponible(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cupo_ia_disponible(text, integer) TO authenticated;

COMMENT ON FUNCTION public.cupo_ia_disponible(text, integer) IS
  'Devuelve false si el usuario actual ha superado p_max_hora ejecuciones de p_funcion en la ultima hora. demo_salon_001 exenta.';
