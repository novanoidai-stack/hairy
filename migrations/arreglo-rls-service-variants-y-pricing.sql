-- Aplicada en remoto: 20260817112917_arreglo_rls_service_variants_y_pricing
-- ============================================================================
-- ARREGLO: service_variants y service_category_pricing tenian unas politicas
-- RLS que no funcionaban y ademas abrian un agujero.
--
-- Decian:
--   negocio_id = (current_setting('request.jwt.claims')::json ->> 'negocio_id')
--   OR negocio_id = 'prueba_46980'
--
-- Dos problemas:
--   1. El JWT de Supabase de este proyecto NO lleva el claim `negocio_id`
--      (comprobado: no hay custom access token hook). Asi que la primera rama
--      siempre da NULL -> falso, y NINGUN salon real podia leer ni escribir sus
--      variantes de servicio ni sus precios por categoria. Las dos tablas estan
--      vacias, que es justo lo que cabe esperar de una funcion que nunca llego a
--      funcionar (la usa Ajustes, app/(tabs)/configuracion.web.tsx).
--   2. La unica rama que SI funcionaba era el tenant de pruebas escrito a mano,
--      y como el rol era `public` (incluye anon), cualquiera sin identificarse
--      podia leer, insertar, modificar y borrar filas de 'prueba_46980'.
--
-- Se sustituyen por el mismo patron multi-tenant que usa el resto del esquema
-- (el negocio sale del perfil del usuario, no de un claim inexistente) y se
-- limitan a usuarios autenticados. Las politicas RESTRICTIVE demo_block_* que
-- ya existen sobre estas tablas siguen intactas y encima de estas.
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own negocio pricing"   ON public.service_category_pricing;
DROP POLICY IF EXISTS "Users can insert own negocio pricing" ON public.service_category_pricing;
DROP POLICY IF EXISTS "Users can update own negocio pricing" ON public.service_category_pricing;
DROP POLICY IF EXISTS "Users can delete own negocio pricing" ON public.service_category_pricing;

CREATE POLICY "pricing_select_own_negocio" ON public.service_category_pricing
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "pricing_insert_own_negocio" ON public.service_category_pricing
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "pricing_update_own_negocio" ON public.service_category_pricing
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()))
  WITH CHECK (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "pricing_delete_own_negocio" ON public.service_category_pricing
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()));

DROP POLICY IF EXISTS "read_own"   ON public.service_variants;
DROP POLICY IF EXISTS "insert_own" ON public.service_variants;
DROP POLICY IF EXISTS "update_own" ON public.service_variants;
DROP POLICY IF EXISTS "delete_own" ON public.service_variants;

CREATE POLICY "variants_select_own_negocio" ON public.service_variants
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "variants_insert_own_negocio" ON public.service_variants
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "variants_update_own_negocio" ON public.service_variants
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()))
  WITH CHECK (negocio_id = (select public.my_negocio_id_text()));

CREATE POLICY "variants_delete_own_negocio" ON public.service_variants
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (negocio_id = (select public.my_negocio_id_text()));
