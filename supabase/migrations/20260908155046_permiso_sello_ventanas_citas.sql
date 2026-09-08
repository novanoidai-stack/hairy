-- El botón de cambiar el estado de una cita —y TODA escritura de citas con la
-- sesión del peluquero— devolvía 42501 "permission denied for function
-- ventanas_activas_cita". Reproducido el 8 sep 2026 contra producción con el
-- usuario E2E (rol owner): PATCH /rest/v1/citas -> 403 code 42501.
--
-- POR QUÉ: desde 20260905233000, todo INSERT/UPDATE de citas pasa por el sello
-- trg_citas_sellar_ventanas -> ventanas_ocupadas_de_cita() ->
-- ventanas_activas_cita(). Ese trigger es SECURITY INVOKER a propósito (la
-- defensa es que sea BEFORE e incondicional, no en nombre de quién corre), así
-- que la cadena entera corre con los permisos DE QUIEN ESCRIBE LA FILA.
--   * La firma de 4 argumentos estaba revocada a authenticated desde
--     20260831204047 §88 —entonces solo la llamaban RPCs SECURITY DEFINER—.
--   * El paso 5 (20260905130000) hizo que la firma de 5 argumentos (la del
--     sello) llamara DENTRO a la de 4 cuando la cita no tiene fases: la cadena
--     quedó pidiendo permisos que nadie le había concedido.
--   * En producción, además, la de 5 argumentos también estaba denegada
--     (deriva aplicada a mano desde el dashboard el 8 sep, versión remota
--     20260908150851 sin fichero en el repo).
-- El candado de solapes quedó intacto (es un índice sobre la columna
-- ventanas_ocupadas), pero ningún botón de la agenda que tocara citas
-- funcionaba: cambiar estado, mover, editar, guardar. Las RPC SECURITY DEFINER
-- (marcar_cita_no_show, crear_cita_publica...) seguían vivas, y por eso ni el
-- portal ni el no-show delataron el problema hasta que un peluquero fue a
-- cambiar un estado a mano.
--
-- SEGURIDAD: conceder EXECUTE a authenticated no abre nada nuevo.
--   * La de 4 argumentos es aritmética pura sobre sus 4 marcas temporales.
--   * La de 5 lee cita_fases como INVOKER: la RLS del llamante filtra las
--     filas de otros negocios, y su fallback son las marcas de la propia cita.
--   * anon sigue SIN permiso: el portal público escribe citas a través de las
--     RPC SECURITY DEFINER, nunca llamando a estas funciones directamente.
-- La envoltura ventanas_ocupadas_de_cita hoy funciona por el grant POR DEFECTO
-- de PUBLIC; los grants por defecto son justo los que una sesión de dashboard
-- pierde sin dejar rastro, así que se ata explícito aquí.

revoke all on function public.ventanas_activas_cita(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.ventanas_activas_cita(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.ventanas_activas_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.ventanas_activas_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.ventanas_ocupadas_de_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.ventanas_ocupadas_de_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
