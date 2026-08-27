-- Migration: antifraude-cobros-rls.sql (Mega-Plan WS-7 V1)
-- Cerrar vectores de manipulacion de cobros desde el cliente.
--
-- Problema: los triggers de inmutabilidad (compliance-antifraude-inmutabilidad.sql)
-- blindan los campos financieros de un cobro YA registrado, PERO nada impide que un
-- cliente autenticado haga INSERT directo de cobros con cualquier importe, ni UPDATE
-- de cobrado_at/estado/metodo/origen. (WS-7 V2, en FASE 1, extendera el trigger para
-- proteger tambien esos campos; aqui cerramos el vector de escritura desde el cliente.)
--
-- Solucion V1: revocar INSERT/UPDATE/DELETE directos sobre cobros y cobro_lineas a
-- los roles de cliente (anon, authenticated). Todo cobro se crea/modifica por RPC
-- SECURITY DEFINER (crear_cobro_desde_cita, crear_cobro_walkin, pos-caja, online,
-- reembolsos, etc.), propiedad de postgres, que conservan el acceso. El rol
-- service_role (backends / edge functions) NO se ve afectado y sigue podiendo leer.
--
-- Verificacion previa (FASE 0): grep exhaustivo en tsx/ts/deno confirma CERO
-- escrituras directas a cobros/cobro_lineas desde el cliente o edge functions.
-- Aplicar acompanado de smoke de caja/cobro (ver Mega-Plan FASE 5).

-- 1. Revocar escritura directa desde roles de cliente.
revoke insert, update, delete on public.cobros from authenticated, anon;
revoke insert, update, delete on public.cobro_lineas from authenticated, anon;

-- 2. Defensa en profundidad: eliminar politicas RLS de escritura sobre cobros si
--    existieran (de modo que, aunque se re-grantearan privilegios en el futuro, el
--    cliente seguira sin poder escribir). El owner y service_role bypass RLS.
drop policy if exists cobros_insert_own on public.cobros;
drop policy if exists cobros_update_own on public.cobros;
drop policy if exists cobro_lineas_insert_own on public.cobro_lineas;
drop policy if exists cobro_lineas_update_own on public.cobro_lineas;

-- Nota: NO se tocan las politicas SELECT (el cliente sigue leyendo sus cobros para
-- caja/informes) ni el trigger de inmutabilidad. WS-7 V2 (FASE 1) extendera el
-- trigger cobros_prevent_financial_updates para proteger cobrado_at/estado/metodo/origen.
