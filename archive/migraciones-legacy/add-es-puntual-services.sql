-- Servicios puntuales: servicios rápidos creados al vuelo desde la creación de una
-- cita (casos extraordinarios, p. ej. cuando el responsable no está). Se guardan en
-- el catálogo marcados como puntuales para poder listarlos aparte en Configuración.
--
-- NOTA: la tabla real del catálogo es public.servicios (en español). NO existe una
-- tabla public.services; la versión anterior de esta migración apuntaba a `services`
-- y por eso nunca llegó a aplicarse. Aplicada en remoto el 19 jun 2026 como
-- migración `add_es_puntual_to_servicios`.
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS es_puntual boolean NOT NULL DEFAULT false;
