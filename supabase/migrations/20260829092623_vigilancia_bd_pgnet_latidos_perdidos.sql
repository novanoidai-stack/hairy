-- Comprobacion 11 de vigilancia_bd(): los latidos de pg_net que no llegan.
--
-- APLICADA EN REMOTO el 29 ago 2026 (version 20260829092623) y registrada en
-- schema_migrations, pero el FICHERO no llego al repo. Es la deriva del reves
-- que caza la guardia de migraciones: aplicado sin fichero, en vez de fichero
-- sin aplicar. Y es la peor de las dos, porque no se nota nunca -- el codigo
-- corre, todo va bien, y el repo describia una vigilancia_bd() de DIEZ
-- comprobaciones cuando la que corre tiene ONCE.
--
-- Se recupera aqui el SQL EXACTO que se aplico, leido de
-- supabase_migrations.schema_migrations.statements. No reconstruido de memoria,
-- y a proposito no reconstruido con pg_get_functiondef(): eso da el estado FINAL
-- fundido de todas las migraciones, y lo que falta aqui es UNA. Verificado
-- contra produccion el 30 ago 2026: la vigilancia_bd() viva emite once claves y
-- la ultima es bd/pgnet-latidos-perdidos.
--
-- POR QUE ES UN PARCHE POR ANCLA Y NO UN create or replace: asi se aplico y asi
-- encadena. El ancla es la cola del bloque 10, que anade
-- 20260829092248_rls_profiles_y_multitenant.sql, que va ANTES en orden de
-- fichero. Si alguien reescribe ese bloque, esto falla RUIDOSAMENTE (raise
-- exception) en vez de dejar la comprobacion 11 fuera en silencio: es
-- exactamente lo que debe hacer un ancla perdida.
do $$
declare
  v_def text;
  v_ancla text := 'is_shared_demo_visitor|jornada_contexto|_campana_gestor)'';';
  v_bloque text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'vigilancia_bd';

  if position(v_ancla in v_def) = 0 then
    raise exception 'no se encuentra el ancla de la comprobacion 10 en vigilancia_bd()';
  end if;

  v_bloque := v_ancla || '

  -- 11. LATIDOS DE pg_net QUE NO LLEGAN.
  -- net.http_post es "dispara y olvida": cron.job_run_details dice "succeeded"
  -- en cuanto la peticion se encola, mire lo que mire la respuesta. La respuesta
  -- vive en net._http_response y no la lee nadie. Medido el 28 ago 2026: de 31
  -- respuestas en 24 h, 6 con status_code NULL (no llegaron) y 4 errores HTTP.
  -- Un quinto de los latidos perdido en silencio agujerea toda la vigilancia que
  -- se dispara por cron o por trigger.
  return query
  with ventana as (
    select count(*) as total,
           count(*) filter (where status_code is null)  as sin_respuesta,
           count(*) filter (where status_code >= 400)   as errores
    from net._http_response
    where created > now() - interval ''6 hours''
  )
  select
    ''bd/pgnet-latidos-perdidos'',
    case when (sin_respuesta + errores)::numeric / total > 0.5 then ''bloqueante'' else ''aviso'' end,
    ''vigilancia'',
    ''pg_net pierde el '' ||
      round(100.0 * (sin_respuesta + errores) / total) || '' % de las llamadas'',
    ''En las ultimas 6 h: '' || total || '' respuestas, '' || sin_respuesta ||
    '' sin llegar (status_code NULL) y '' || errores || '' con error HTTP. Los crons y ''
    ''los triggers llaman a las edge functions con net.http_post, que no espera ''
    ''respuesta: pg_cron marca la ejecucion como "succeeded" igual. Si esto sube, la ''
    ''vigilancia de agenda, los avisos de fin de prueba y los informes periodicos se ''
    ''pierden sin que nada se ponga en rojo. Mirar net._http_response.error_msg.''
  from ventana
  where total >= 10 and (sin_respuesta + errores)::numeric / total > 0.2;';

  execute replace(v_def, v_ancla, v_bloque);
end $$;

-- Que la comprobacion corre y devuelve algo coherente (0 o 1 fila).
do $$
declare n int;
begin
  select count(*) into n from public.vigilancia_bd() where clave = 'bd/pgnet-latidos-perdidos';
  raise notice 'comprobacion 11 activa, hallazgos ahora: %', n;
end $$;