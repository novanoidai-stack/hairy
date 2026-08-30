-- Elimina la sobrecarga legada de vender_bono (p_servicio_id text, sesion 14)
-- que convive con la actual (p_servicio_id uuid, 20260818000000).
--
-- POR QUE (30 ago 2026): PostgREST resuelve RPCs por NOMBRES de parametros.
-- Las dos firmas comparten los mismos cinco nombres, asi que cualquier llamada
-- desde la app recibia HTTP 300 PGRST203 ("Could not choose the best candidate
-- function"): vender un bono desde el POS estaba roto en silencio. Lo cazo el
-- vigilante nuevo bd-sobrecargas-rpc (vigilancia_bd_sobrecargas_rpc) en su
-- primera corrida contra produccion.
--
-- La firma que sobra es la VIEJA (text): la app (components/pos/VentaBonoModal)
-- manda el uuid del servicio, y la migracion 20260818000000 ya definia la
-- version uuid como la buena, con sus grants.

drop function if exists public.vender_bono(uuid, text, integer, integer, text);
