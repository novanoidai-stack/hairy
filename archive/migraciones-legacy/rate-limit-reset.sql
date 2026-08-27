-- Rate limiting para reset de contraseña
-- Previene flood y enumeración abusiva de emails
-- Max 3 intentos por email/hora

CREATE TABLE IF NOT EXISTS public.rate_limit_reset (
  email text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  window_start integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS para que solo la edge function pueda modificar
ALTER TABLE public.rate_limit_reset ENABLE ROW LEVEL SECURITY;

-- Política: nadie puede leer, solo service_role (usado por edge function)
DROP POLICY IF EXISTS rate_limit_reset_select ON public.rate_limit_reset;
CREATE POLICY rate_limit_reset_deny_select ON public.rate_limit_reset
  FOR SELECT TO public, anon, authenticated
  USING (false);

-- Política: solo service_role puede escribir (la edge function usa service_role)
DROP POLICY IF EXISTS rate_limit_reset_write ON public.rate_limit_reset;
CREATE POLICY rate_limit_reset_service_role ON public.rate_limit_reset
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Limpiar registros antiguos (más de 24h) - se puede ejecutar via cron si se desea
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_reset
  WHERE updated_at < now() - interval '24 hours';
END;
$$;

-- La función es invocable solo por service_role
REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
