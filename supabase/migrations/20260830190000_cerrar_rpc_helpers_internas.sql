-- ===========================================================================
-- Migración: Revocar permisos públicos a helpers internos sin guarda explícita
-- Fecha: 2026-08-30 18:00:00
-- ===========================================================================

REVOKE ALL ON FUNCTION public.suscripcion_del_negocio(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.negocio_con_acceso(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recursos_capacidad_negocio(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recursos_ocupados_negocio(text, text, timestamptz, timestamptz, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recurso_hay_hueco_negocio(text, text, timestamptz, timestamptz, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.suscripcion_del_negocio(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.negocio_con_acceso(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recursos_capacidad_negocio(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recursos_ocupados_negocio(text, text, timestamptz, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recurso_hay_hueco_negocio(text, text, timestamptz, timestamptz, uuid) TO service_role;
