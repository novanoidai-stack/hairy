-- 28 ago 2026. Diecisiete funciones SECURITY DEFINER que reciben el negocio (o un
-- id del que se deduce) POR PARAMETRO, no comprueban nada por dentro, y tenian
-- EXECUTE concedido a `anon` y a `authenticated`. Cambiando un id se operaba
-- sobre cualquier salon. Las peores, verificadas ejecutandolas con `set local
-- role anon`:
--
--   listar_clientes_ia(p_negocio)        -> la cartera de clientes de cualquier salon:
--                                           nombre, ultima visita, total gastado,
--                                           no-shows, perfil de riesgo.
--   guardar_conexion_stripe(p_negocio_id, p_account_id)
--                                        -> ESCRIBE. Repunta la cuenta de Stripe de
--                                           cualquier salon a otra acct_...
--   agenda_briefing_operativa(p_negocio) -> estado operativo del salon.
--
-- COMO SE COLO. No es descuido de quien las escribio: el plan original de
-- agenda_briefing_operativa incluia su
--   `revoke execute ... from public, anon, authenticated`
-- (docs/superpowers/plans/2026-07-04-copiloto-fase3-briefing-proactivo.md:226).
-- Lo que pasa es que al cambiar la FIRMA de una funcion (anadir un parametro,
-- ponerle un default) Postgres crea una entrada nueva en pg_proc, con los grants
-- POR DEFECTO -- y en Supabase los de por defecto incluyen anon. El revoke de la
-- migracion vieja no viaja con ella. Por eso esto no se arregla una vez: se
-- vigila. Lo hace public.vigilancia_bd() a partir de ahora.
--
-- QUIEN LAS LLAMA DE VERDAD (comprobado uno a uno):
--   - Helpers internos, invocados desde otras funciones definer, que se ejecutan
--     como el dueno de la funcion y por tanto NO pierden el permiso:
--     _campana_audiencia, _lista_espera_mejor_candidato, _upsert_hallazgo,
--     agenda_briefing_operativa, jornada_resolver_profesional, jornada_tramos,
--     objetivo_valor_actual, procesar_hallazgos_negocio, sincronizar_plan_negocio,
--     mint_ticket_verifactu (la llama el trigger cobros_mint_ticket_trigger).
--     Los 24 llamantes son SECURITY DEFINER de postgres: comprobado.
--   - Edge functions y scripts, todos con service_role, que conserva su permiso:
--     guardar_conexion_stripe (stripe-connect-oauth), listar_clientes_ia
--     (agenda-asistente), registrar_auditoria_ia (shared/chispa-auditoria.ts),
--     registrar_respuesta_aeat (scripts/verifactu-worker-loop.ts),
--     plan_del_negocio (crear-checkout-suscripcion, portal-suscripcion),
--     marcar_presupuesto_enviado (n8n).
--   - Cron: recalcular_sugerencias_servicios (job mecha_sugerencias_servicios,
--     que corre como postgres).
--
-- COMPROBADO DESPUES DE APLICARLA, en las dos direcciones:
--   authenticated llamando directo    -> 42501 permission denied.
--   funcion definer de postgres llamandolas con la sesion en authenticated
--                                     -> sigue funcionando.
--
-- Se revoca por NOMBRE, recorriendo todas las sobrecargas, para que un cambio de
-- firma no deje una version suelta.

do $$
declare
  r record;
  v_nombres text[] := array[
    '_campana_audiencia',
    '_lista_espera_mejor_candidato',
    '_upsert_hallazgo',
    'agenda_briefing_operativa',
    'guardar_conexion_stripe',
    'jornada_resolver_profesional',
    'jornada_tramos',
    'listar_clientes_ia',
    'marcar_presupuesto_enviado',
    'mint_ticket_verifactu',
    'objetivo_valor_actual',
    'plan_del_negocio',
    'procesar_hallazgos_negocio',
    'recalcular_sugerencias_servicios',
    'registrar_auditoria_ia',
    'registrar_respuesta_aeat',
    'sincronizar_plan_negocio'
  ];
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (v_nombres)
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.firma);
    raise notice 'revocada: %', r.firma;
  end loop;
end $$;
