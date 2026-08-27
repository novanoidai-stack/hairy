-- =====================================================================
-- Mecha · Las 16 tablas internas dicen en voz alta que no son de nadie
-- =====================================================================
-- Tenian RLS activada y CERO politicas, o sea que ya denegaban todo a `anon` y
-- `authenticated`. El problema no era el comportamiento, era la ambiguedad:
-- "RLS sin politicas" no se distingue de "alguien se olvido de escribirlas", y
-- el linter las marcaba las 16 por ese motivo (`rls_enabled_no_policy`).
--
-- Con una politica RESTRICTIVE `using (false)` la intencion queda escrita y el
-- aviso desaparece. El comportamiento no cambia: quien escribe en estas tablas
-- es service_role (edge functions y crons) y las RPC `security definer`, y
-- ninguno de los dos pasa por RLS.
--
-- Junto con el `revoke` de grants de
-- `seguridad-multitenant-rpcs-que-se-fiaban-del-parametro.sql`, son dos
-- cerrojos: para dejarlas expuestas hay que quitar los permisos Y esta
-- politica, no solo desactivar la RLS de un descuido.
--
-- Comprobado antes de tocar nada: ningun cliente lee estas tablas
-- directamente (0 `from('<tabla>')` en app/, lib/, components/ y web/).
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'avisos_prueba','captcha_tokens','cita_pago_enlaces','cumpleanos_avisos',
    'errores_cliente','informes_periodicos_enviados','landing_chat_hits','latido_envios',
    'lista_espera_avisos','lista_espera_ofertas','rate_limit_hits','rpc_rate_hits',
    'salon_acceso','salones_externos','soporte_mensajes','stripe_webhook_eventos'
  ] loop
    execute format('drop policy if exists solo_service_role on public.%I', t);
    execute format(
      'create policy solo_service_role on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t);
  end loop;
end $$;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
