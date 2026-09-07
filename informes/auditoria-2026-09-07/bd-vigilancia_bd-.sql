CREATE OR REPLACE FUNCTION public.vigilancia_bd()
 RETURNS TABLE(clave text, nivel text, ambito text, titulo text, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_publicas text[] := array[
    'crear_solicitud_publica', 'check_landing_rate_limit', 'horas_llamada_ocupadas',
    'salon_directorio_publico', 'salones_externos_publico', 'buscar_salones_publico',
    'presupuesto_publico', 'pago_info_publica', 'aceptar_presupuesto_publico',
    'completar_datos_pago_publico', 'presupuesto_enviar_mensaje_publico',
    'resolver_enlace_pago', 'resolver_enlace_pago_full', 'citas_por_confirmar_telefono',
    'confirmar_cita_cliente', 'confirmar_cita_oferta', 'vigilancia_bd'
  ];
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  return query
  select
    'bd/vault-al-alcance:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() toca el Vault y la puede llamar cualquiera',
    'Es SECURITY DEFINER, lee vault.decrypted_secrets y tiene EXECUTE concedido a ' ||
    'anon o a authenticated, asi que se puede invocar por REST con la publishable key ' ||
    '(publica por diseno). Si devuelve el secreto, se filtra; si solo lo usa, es un ' ||
    'grifo de gasto abierto. Cerrar con: revoke execute on function public.' ||
    p.proname || '(...) from anon, authenticated, public;'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname <> 'vigilancia_bd'
    and p.prorettype <> 'trigger'::regtype
    and pg_get_functiondef(p.oid) ~* 'vault\.decrypted_secrets'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));

  return query
  with guardas as (
    select p.oid, p.proname, p.prosrc,
           p.prosrc ~* '(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor)\s*\(' as atada
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  expandida as (
    select g.oid, g.proname,
           g.atada or exists (
             select 1 from guardas h
             where h.atada and h.proname <> g.proname
               and g.prosrc ~* ('\m' || h.proname || '\M')
           ) as atada
    from guardas g
  )
  select
    'bd/rpc-sin-guard:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() no comprueba quien la llama',
    'Es SECURITY DEFINER, la puede llamar ' ||
    case when has_function_privilege('anon', p.oid, 'execute') then 'anon' else 'authenticated' end ||
    ' por REST (' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')) y ni ella ' ||
    'ni las funciones que usa mencionan auth.uid(), auth.role(), is_staff(), ' ||
    'my_negocio_id_text() ni exige_mi_negocio(). O recibe el ambito por parametro y ' ||
    'basta cambiar un id para operar sobre otro salon, o no lo recibe porque opera ' ||
    'sobre TODOS -- que es el caso peor. Arreglo: perform exige_mi_negocio(...) si la ' ||
    'llama la app, o revoke execute ... from anon, authenticated, public si solo la ' ||
    'llaman n8n y las edge functions con service_role.'
  from expandida e
  join pg_proc p on p.oid = e.oid
  where not e.atada
    and p.prosecdef
    and p.pronargs > 0
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and pg_get_function_identity_arguments(p.oid) !~* 'p_slug'
    and not (p.proname = any (v_publicas));

  return query
  select
    'bd/rls-sin-initplan:' || pol.tablename || '.' || pol.policyname,
    'aviso',
    'rendimiento',
    'La politica "' || pol.policyname || '" de ' || pol.tablename || ' llama a auth sin envolver',
    'Envolverla en (select ...): (select auth.uid()), (select my_negocio_id_text()), ' ||
    '(select is_shared_demo_visitor()). Suelta, Postgres la ejecuta una vez por FILA; ' ||
    'dentro de un subselect, una vez por consulta (InitPlan). is_staff() sin envolver ' ||
    'llego a provocar 24 M de seq scans sobre staff y 456 M de tuplas leidas en citas.'
  from (
    select tablename, policyname,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public'
  ) pol
  where regexp_count(pol.expr, 'auth\.(uid|jwt|role)\(\)')
      > regexp_count(pol.expr, '\( SELECT auth\.(uid|jwt|role)\(\)');

  return query
  select
    'bd/helper-volatil:' || p.proname,
    'bloqueante',
    'rendimiento',
    'El ayudante de RLS ' || p.proname || '() es VOLATILE',
    'Los ayudantes que usan las politicas van STABLE. Volatil, Postgres no puede ' ||
    'cachear el resultado y lo reevalua fila a fila: is_staff() volatil por si sola ' ||
    'provoco 24 M de seq scans. Anadir STABLE a la definicion.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_staff', 'my_negocio_id_text', 'is_shared_demo_visitor', 'exige_mi_negocio')
    and p.provolatile = 'v';

  return query
  with tipos_check as (
    select (regexp_matches(
             (select pg_get_constraintdef(con.oid)
                from pg_constraint con
                join pg_class c on c.oid = con.conrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'solicitudes'
                 and con.conname = 'solicitudes_tipo_check'),
             '''([a-z_]+)''::text', 'g'))[1] as tipo
  ),
  cuerpo_rpc as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'crear_solicitud_publica'
                      limit 1), '') as def
  )
  select
    'bd/solicitud-tipo-huerfano:' || t.tipo,
    'aviso',
    'landing',
    'El tipo de solicitud "' || t.tipo || '" esta en el CHECK y no en crear_solicitud_publica',
    'Anadir un tipo de solicitud obliga a tocar DOS sitios: la funcion ' ||
    'crear_solicitud_publica y el CHECK de la tabla solicitudes. Uno se ha quedado atras.'
  from tipos_check t, cuerpo_rpc c
  where t.tipo is not null and t.tipo <> '' and position(t.tipo in c.def) = 0;

  return query
  with def as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'recompute_referral_discount'
                      limit 1), '') as d
  ),
  leido as (
    select
      substring(d from 'v_tope\s+constant\s+numeric\s*:=\s*(\d+)')  as tope,
      substring(d from 'v_bono\s+constant\s+numeric\s*:=\s*(\d+)')  as bienvenida,
      substring(d from 'when 1 then (\d+)')                          as nivel1,
      substring(d from 'when 2 then (\d+)')                          as nivel2,
      substring(d from 'when 3 then (\d+)')                          as nivel3
    from def
  ),
  esperado(que, valor) as (
    values ('nivel1', '10'), ('nivel2', '4'), ('nivel3', '2'), ('tope', '30'), ('bienvenida', '15')
  )
  select
    'bd/referidos-' || e.que,
    'bloqueante',
    'referidos',
    'recompute_referral_discount() usa ' ||
      coalesce(case e.que
        when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
        when 'tope' then l.tope else l.bienvenida end, '(no se ha podido leer)') ||
      ' para ' || e.que || ' y deberia usar ' || e.valor,
    'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez: esta ' ||
    'funcion, #hermano de la landing, el modal Recomendar de la demo y TabReferidos. ' ||
    'Si la regla ha cambiado de verdad, actualiza tambien TABLA_REFERIDOS en ' ||
    'scripts/vigilantes/referidos.mjs.'
  from esperado e, leido l
  where coalesce(case e.que
          when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
          when 'tope' then l.tope else l.bienvenida end, '') is distinct from e.valor;

  return query
  select
    'bd/vigilancia-agenda-acotada',
    'bloqueante',
    'vigilancia',
    'El cron de vigilar-agenda solo mira el negocio "' ||
      coalesce(substring(j.command from '\"negocio_id\"\s*:\s*\"([^\"]+)\"'), substring(j.command from 'negocio_id''\s*,\s*''([^'']+)'''), '?') || '"',
    'La edge vigilar-agenda recorre todos los salones cuando el cuerpo NO trae ' ||
    'negocio_id. Con el negocio fijado, el resto de la cartera no tiene vigilancia ' ||
    'de agenda: ni solapes, ni retrasos, ni citas fuera de jornada. Quitar el ' ||
    'negocio_id del body del job (o dejar {}) para que vuelva a mirarlos a todos.'
  from cron.job j
  where j.command ~* 'vigilar-agenda'
    and j.active
    and (j.command ~* '\"negocio_id\"\s*:\s*\"[^\"]+\"'
      or j.command ~* 'negocio_id''\s*,\s*''[^'']+''');

  return query
  select
    'bd/vigilancia-agenda-sin-cron',
    'bloqueante',
    'vigilancia',
    'No hay ningun cron activo que dispare vigilar-agenda',
    'La vigilancia de agenda (solapes, retrasos, citas fuera de jornada) la escribe ' ||
    'la edge vigilar-agenda, y quien la despierta es un job de pg_cron. Sin job, ' ||
    'hallazgos_ia no recibe nada de agenda y el panel se queda en verde por silencio.'
  where not exists (select 1 from cron.job j where j.command ~* 'vigilar-agenda' and j.active);

  return query
  with disparadores as (
    select t.tgname, c.oid as tabla_oid, c.relname as tabla, p.proname as funcion, p.prosrc
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and not t.tgisinternal
      and p.prosrc !~* '\mTG_TABLE_NAME\M'
  ),
  campos as (
    select d.*, lower(m[1]) as campo
    from disparadores d,
         lateral regexp_matches(d.prosrc, '\m(?:new|old)\.([a-zA-Z_][a-zA-Z0-9_]*)', 'gi') as m
  )
  select distinct
    'bd/trigger-campo-inexistente:' || f.tabla || '.' || f.campo,
    'bloqueante',
    'seguridad',
    'El trigger ' || f.tgname || ' de ' || f.tabla || ' lee un campo que esa tabla no tiene (' || f.campo || ')',
    'La funcion ' || f.funcion || '() hace new.' || f.campo || ' / old.' || f.campo ||
    ' pero ' || f.tabla || ' no tiene esa columna. En PL/pgSQL eso no devuelve null: lanza ' ||
    '42703, y al ser FOR EACH ROW tumba el INSERT/UPDATE/DELETE entero. Leer la fila ' ||
    'como to_jsonb(coalesce(new, old))->>''campo'' devuelve null y no rompe.'
  from campos f
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = f.tabla_oid and a.attnum > 0 and not a.attisdropped
      and a.attname = f.campo
  );

  return query
  with multitenant as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'negocio_id'
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  )
  select
    'bd/rls-sin-tenant:' || m.relname || '.' || pol.policyname,
    'bloqueante',
    'seguridad',
    'La politica "' || pol.policyname || '" de ' || m.relname || ' no ata al salon',
    'Es PERMISIVA para ' || pol.roles::text || ' sobre una tabla con negocio_id, y su ' ||
    'expresion (' || left(coalesce(pol.qual, pol.with_check, '?'), 120) || ') no menciona ' ||
    'auth.uid(), is_staff(), my_negocio_id_text() ni exige_mi_negocio(). Multi-tenant roto: ' ||
    'cualquier usuario con sesion ve (o escribe) las filas de todos los salones. Asi estuvo ' ||
    'profiles hasta el 29 ago 2026: using(true) para SELECT, y role=''admin'' -- que mira la ' ||
    'fila DESTINO, no al llamante -- para UPDATE y DELETE.'
  from multitenant m
  join pg_policies pol on pol.schemaname = 'public' and pol.tablename = m.relname
  where pol.permissive = 'PERMISSIVE'
    and (pol.roles::text like '%authenticated%' or pol.roles::text like '%public%')
    and btrim(coalesce(pol.qual, pol.with_check, '')) not in ('false', '(false)')
    and coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') !~*
        '(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor|jornada_contexto|_campana_gestor)';

  return query
  with ventana as (
    select count(*) as total,
           count(*) filter (where status_code is null)  as sin_respuesta,
           count(*) filter (where status_code >= 400)   as errores
    from net._http_response
    where created > now() - interval '6 hours'
  )
  select
    'bd/pgnet-latidos-perdidos',
    case when (sin_respuesta + errores)::numeric / total > 0.5 then 'bloqueante' else 'aviso' end,
    'vigilancia',
    'pg_net pierde el ' ||
      round(100.0 * (sin_respuesta + errores) / total) || ' % de las llamadas',
    'En las ultimas 6 h: ' || total || ' respuestas, ' || sin_respuesta ||
    ' sin llegar (status_code NULL) y ' || errores || ' con error HTTP. Los crons y ' ||
    'los triggers llaman a las edge functions con net.http_post, que no espera ' ||
    'respuesta: pg_cron marca la ejecucion como "succeeded" igual. Si esto sube, la ' ||
    'vigilancia de agenda, los avisos de fin de prueba y los informes periodicos se ' ||
    'pierden sin que nada se ponga en rojo. Mirar net._http_response.error_msg.'
  from ventana
  where total >= 10 and (sin_respuesta + errores)::numeric / total > 0.2;

  -- 12. TABLA CON negocio_id SIN GATE DE SUSCRIPCION.
  return query
  with tablas_negocio as (
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'negocio_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'profiles', 'soporte_mensajes', 'errores_cliente',
        'audit_log', 'auditoria_registros', 'eventos_negocio',
        'chispa_auditoria', 'agenda_ojos_latido'
      )
  ),
  con_trigger as (
    select distinct tg.event_object_table as table_name
    from information_schema.triggers tg
    where tg.event_object_schema = 'public'
      and tg.action_statement ~* 'exige_negocio_con_acceso'
  )
  select
    'bd/tabla-sin-gate-suscripcion:' || tn.table_name,
    'bloqueante',
    'seguridad',
    'La tabla ' || tn.table_name || ' tiene negocio_id pero no tiene el trigger de gate de suscripcion',
    'Toda tabla con negocio_id debe bloquear escrituras si la suscripcion esta inactiva (trg_gate_suscripcion_exige_acceso). ' ||
    'Si es una tabla exenta de rastro/soporte, anadirla a la lista blanca de vigilancia_bd().'
  from tablas_negocio tn
  left join con_trigger ct on ct.table_name = tn.table_name
  where ct.table_name is null;

  -- 13. LA REGLA DE OCUPACION DE AGENDA, ESCRITA A MANO.
  -- Ver 20260901182749_vigilancia_bd_ocupacion_a_mano.sql para el porque.
  declare
    -- El predicado retirado por el paso 1 de la spec 1, generalizado sobre el
    -- alias: `\m` obliga a que el identificador empiece palabra, y por eso
    -- `p_fin_espera` (la forma canonica de ventanas_activas_cita) no casa.
    -- Que el segundo argumento sea a su vez un `coalesce(` es lo que deja fuera
    -- la forma plana de tres argumentos de los recursos.
    v_pat text :=
      'coalesce\s*\(\s*(\m[a-z_][a-z0-9_]*\.)?fin_espera\M\s*,\s*' ||
      'coalesce\s*\(\s*(\m[a-z_][a-z0-9_]*\.)?fin_activa\M\s*,\s*' ||
      '(\m[a-z_][a-z0-9_]*\.)?fin\M\s*\)\s*\)';
    -- Pegado a un `<` o un `>` por cualquiera de los dos lados = esta DECIDIENDO
    -- si dos tramos se pisan. El `[^=]` de la rama izquierda esta para no
    -- confundirse con el `=>` de los argumentos con nombre, que es como se
    -- escribe media agenda (`make_interval(mins => ...)`). `=` a secas no entra:
    -- una igualdad no decide un solape.
    v_pat_cmp text;
    -- Muestras de control. Sin ellas, un patron roto daria el mismo cero que un
    -- sistema sano.
    v_ctrl_mala    text := 'coalesce(zz.fin_espera, coalesce(zz.fin_activa, zz.fin)) < zz.fin';
    v_ctrl_costura text := 'coalesce(p_fin_espera, coalesce(p_fin_activa, p_fin))';
    v_ctrl_recurso text := 'coalesce(zz.fin_espera, zz.fin_activa, zz.inicio)';
  begin
    v_pat_cmp := '(' || v_pat || '\s*[<>]' || '|[^=][<>]\s*' || v_pat || ')';

    -- 13a. Controles positivos: el vigilante prueba que sigue viendo.
    -- Esta comprobacion es NEGATIVA (busca algo malo y espera no encontrarlo), y
    -- ese es el tipo que se pudre solo: un patron roto y un sistema sano dan el
    -- mismo cero. Aqui se le exige que reconozca lo que tiene que reconocer y
    -- que NO reconozca lo que no. Si falla, sale un bloqueante en vez de un
    -- verde -- y dice cual de los cinco controles ha caido, para no mandar a
    -- nadie a adivinar.
    return query
    with control as (
      select
        (v_ctrl_mala    ~*  v_pat)     as muestra_casa,
        (v_ctrl_mala    ~*  v_pat_cmp) as muestra_es_comparacion,
        (v_ctrl_costura !~* v_pat)     as costura_no_casa,
        (v_ctrl_recurso !~* v_pat)     as recurso_no_casa,
        exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'ventanas_activas_cita'
            and position(v_ctrl_costura in coalesce(p.prosrc, '')) > 0
        ) as costura_presente
    )
    select
      'bd/ocupacion-vigilante-ciego',
      'bloqueante',
      'coherencia',
      'El vigilante de ocupacion de agenda se ha quedado ciego',
      'La comprobacion 13 de vigilancia_bd() busca funciones que decidan ocupacion sin '
      'pasar por public.ventanas_activas_cita(), y uno de sus controles ha caido. '
      'Mientras esto salga, el cero de bd/ocupacion-a-mano NO significa que nadie decida '
      'ocupacion a mano: significa que nadie esta mirando. Arreglar el patron, nunca '
      'quitar la comprobacion. Controles (los cinco deberian dar true): '
      'reconoce_el_predicado_retirado=' || c.muestra_casa ||
      ', lo_ve_como_comparacion=' || c.muestra_es_comparacion ||
      ', no_confunde_la_costura=' || c.costura_no_casa ||
      ', no_confunde_los_recursos=' || c.recurso_no_casa ||
      ', la_costura_sigue_ahi=' || c.costura_presente || '.'
    from control c
    where not (
          c.muestra_casa
      and c.muestra_es_comparacion
      and c.costura_no_casa
      and c.recurso_no_casa
      and c.costura_presente
    );

    -- 13b. Quien decide ocupacion por su cuenta.
    return query
    select
      'bd/ocupacion-a-mano:' || p.proname,
      'bloqueante',
      'coherencia',
      'La funcion ' || p.proname || '() decide ocupacion de agenda a mano',
      'Compara a mano el borde del reposo en vez de preguntarle a '
      'public.ventanas_activas_cita(), que es donde vive la regla desde el 1 sep 2026 '
      '(migracion 20260901145526, paso 1 de la spec 1). Dos consecuencias, las dos '
      'silenciosas: el dia que la costura sepa leer cita_fases esta funcion se quedara '
      'fuera y seguira creyendo que una cita tiene un solo reposo; y mientras tanto '
      'cualquier arreglo de la regla hay que acordarse de copiarlo aqui. En agenda eso '
      'es ofrecer un hueco ocupado (se dobla una clienta) o bloquear un reposo libre '
      '(se pierde la venta vendible). Arreglo: cross join lateral '
      'public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v y '
      'comparar v.desde / v.hasta. NO envolverlo en un ayudante booleano: deja de '
      'inlinearse y se midio 59x mas lento.'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      -- Las muestras de control viven en este mismo cuerpo.
      and p.proname <> 'vigilancia_bd'
      -- La definicion canonica no se denuncia a si misma (y ademas no casa: usa
      -- parametros p_ sin cualificar).
      and p.proname <> 'ventanas_activas_cita'
      -- prosrc es null en los cuerpos BEGIN ATOMIC (hoy no se usa ninguno en el
      -- repo, pero un escaneo de prosrc a secas los dejaria pasar en silencio, y
      -- eso es justo lo que no puede hacer un vigilante). El coalesce solo llama
      -- a pg_get_functiondef cuando hace falta.
      and coalesce(p.prosrc, pg_get_functiondef(p.oid)) ~* v_pat_cmp;

    -- 13c. Quien no decide, pero deriva el borde del reposo a mano.
    return query
    select
      'bd/ocupacion-borde-a-mano:' || p.proname,
      'aviso',
      'coherencia',
      'La funcion ' || p.proname || '() deriva el borde del reposo a mano',
      'No decide ocupacion --por eso es aviso y no tumba la CI-- pero calcula por su '
      'cuenta donde acaba el reposo, con la misma expresion que retiro el paso 1 de la '
      'spec 1. Hoy son disponibilidad_publica y disponibilidad_publica_cadena, que la '
      'restan del slot para el reposo_disponible_min que el portal ensena como "te caben '
      'N minutos aqui". Con reposos multiples devolvera el borde del PRIMER reposo y se '
      'quedara corta. Necesita otra forma --el inicio de la siguiente ventana activa, no '
      'un maximo de cuatro marcas-- y le toca al paso 5 de la spec 1, medido como se '
      'midio el paso 1.'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname <> 'vigilancia_bd'
      and p.proname <> 'ventanas_activas_cita'
      and coalesce(p.prosrc, pg_get_functiondef(p.oid)) ~* v_pat
      and coalesce(p.prosrc, pg_get_functiondef(p.oid)) !~* v_pat_cmp;
  end;

end;
$function$
