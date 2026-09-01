-- Vigilancia de sistema: triggers ciegos, sobrecargas de RPC y rutas de escritura.
--
-- POR QUE EXISTE (30 ago 2026)
-- Un trigger (trg_seed_fases_from_cita) hacia SELECT fases FROM public.servicios, pero
-- la columna "fases" nunca ha existido en esa tabla. PostgreSQL NO lo valida al crear
-- el trigger: el error 42703 salta EN TIEMPO DE EJECUCION, en el INSERT que lo dispara.
-- Resultado: ninguna cita se podia crear, en ningun sitio.
--
-- Al mismo tiempo, una migracion recreo crear_cita_publica con los parametros en otro
-- orden, creando dos sobrecargas. PostgREST no puede desambiguar y devuelve HTTP 300
-- PGRST203. Resultado: el portal publico de reservas roto.
--
-- Ninguno de los vigilantes existentes detectaba esto porque:
-- 1. vigilancia_bd() inspeccionaba esquema, no cuerpos de triggers
-- 2. No habia ningun vigilante que probara una escritura real
-- 3. No habia ningun vigilante que buscara sobrecargas de funciones
--
-- Estas tres funciones cierran esos huecos.
--
-- TRAMPAS DEL ESQUEMA REAL que esta migracion respeta (verificado en produccion
-- antes de escribirla, no de memoria):
--   * No existe ninguna tabla `negocios`: el tenant es `negocio_id` TEXT sin tabla
--     maestra. Un `select id from negocios` revienta con 42P01.
--   * `citas.canal` tiene CHECK: solo admite manual|web|whatsapp|instagram|
--     agente_voz|asistente_ia. Un canal 'vigilancia' violaria el CHECK y la prueba
--     daria un falso bloqueante en cada corrida.

-- ============================================================================
-- 1. TRIGGERS CIEGOS: columnas fantasma en cuerpos de funciones trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vigilancia_bd_triggers_ciegos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hallazgos jsonb := '[]'::jsonb;
  rec record;
  col_ref record;
  v_tbl_cols text[];
  v_ref_cols text[];
BEGIN
  -- Recorre todos los triggers no internos sobre tablas de public
  FOR rec IN
    SELECT
      t.tgname   AS trigger_name,
      c.relname  AS table_name,
      p.proname  AS func_name,
      pg_get_functiondef(p.oid) AS body
    FROM pg_trigger t
    JOIN pg_class c     ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p      ON t.tgfoid = p.oid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
  LOOP
    -- Columnas reales de la tabla del trigger
    SELECT array_agg(column_name::text) INTO v_tbl_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = rec.table_name;

    IF v_tbl_cols IS NULL THEN CONTINUE; END IF;

    -- ---- COMPROBACION 1: NEW.col / OLD.col contra la tabla del trigger ----
    -- El mismo 42703 de agenda_ojos_notify (new.negocio_id sobre una tabla que
    -- no lo tiene). En PL/pgSQL no da null: tumba la escritura entera.
    --
    -- MATIZ (aprendido en vivo el 30 ago con prevent_delete_financial_records):
    -- una funcion compartida por varias tablas se ramifica con TG_TABLE_NAME y
    -- la rama que lee la columna inexistente puede que nunca se ejecute para
    -- ESTA tabla. Eso no la hace inofensiva — es una mina que salta con el
    -- primer refactor — pero tampoco tumba nada hoy: baja a aviso. Sin
    -- ramificacion, cada referencia se ejecuta si o si: bloqueante.
    FOR col_ref IN
      SELECT DISTINCT lower((m)[1]) AS prefix, lower((m)[2]) AS col
      FROM regexp_matches(rec.body, '\m(new|old)\.([a-z_][a-z0-9_]*)', 'gi') AS m
    LOOP
      IF NOT (col_ref.col = ANY(v_tbl_cols)) THEN
        hallazgos := hallazgos || jsonb_build_object(
          'tipo',    'columna-fantasma-trigger',
          'nivel', CASE WHEN rec.body ~* 'tg_table_name' THEN 'aviso' ELSE 'bloqueante' END, 'ambito', 'base-de-datos',
          'trigger', rec.trigger_name,
          'tabla',   'public.' || rec.table_name,
          'funcion', rec.func_name,
          'columna', col_ref.col,
          'titulo',  format('Trigger "%s" referencia %s.%s y public.%s no tiene esa columna',
                            rec.trigger_name, upper(col_ref.prefix), col_ref.col, rec.table_name),
          'detalle', format(
            'El trigger "%s" en public.%s (funcion %s) referencia %s.%s, pero esa columna ' ||
            'no existe en la tabla.%s Para leer campos con seguridad, ' ||
            'to_jsonb(coalesce(new, old)) ->> ''campo''.',
            rec.trigger_name, rec.table_name, rec.func_name,
            upper(col_ref.prefix), col_ref.col,
            CASE WHEN rec.body ~* 'tg_table_name'
                 THEN ' La funcion se ramifica con TG_TABLE_NAME y esta rama quizas no se '
                    || 'ejecute para esta tabla hoy, pero es una mina: baja a aviso.'
                 ELSE ' El INSERT/UPDATE reventara con 42703 en tiempo de ejecucion '
                    || 'y TUMBARA la escritura entera (FOR EACH ROW).'
            END
          )
        );
      END IF;
    END LOOP;

    -- ---- COMPROBACION 2: SELECT col FROM [public.]otra_tabla ----
    -- El caso trg_seed_fases_from_cita: la columna fantasma no estaba en NEW sino
    -- en un SELECT a otra tabla. La comprobacion 9 de vigilancia_bd() no lo veia
    -- porque solo mira new.<campo>.
    FOR col_ref IN
      SELECT DISTINCT lower((m)[1]) AS col, lower((m)[2]) AS ref_table
      FROM regexp_matches(
        rec.body,
        'select\s+([a-z_][a-z0-9_]*)\s+(?:into\s+[a-z_][a-z0-9_]*\s+)?from\s+(?:public\.)?([a-z_][a-z0-9_]*)',
        'gi'
      ) AS m
    LOOP
      -- No validar contra tablas de sistema ni pseudo-tablas
      IF col_ref.ref_table IN ('pg_catalog', 'information_schema', 'pg_class',
                                'pg_namespace', 'pg_proc', 'pg_trigger',
                                'generate_series', 'unnest') THEN
        CONTINUE;
      END IF;

      SELECT array_agg(column_name::text) INTO v_ref_cols
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = col_ref.ref_table;

      IF v_ref_cols IS NOT NULL AND NOT (col_ref.col = ANY(v_ref_cols)) THEN
        hallazgos := hallazgos || jsonb_build_object(
          'tipo',              'columna-fantasma-cross-table',
          'nivel', 'bloqueante', 'ambito', 'base-de-datos',
          'trigger',           rec.trigger_name,
          'tabla_trigger',     'public.' || rec.table_name,
          'tabla_referenciada','public.' || col_ref.ref_table,
          'funcion',           rec.func_name,
          'columna',           col_ref.col,
          'titulo',            format('Trigger "%s": SELECT %s FROM public.%s y esa columna no existe',
                                      rec.trigger_name, col_ref.col, col_ref.ref_table),
          'detalle', format(
            'El trigger "%s" (funcion %s) hace SELECT %s FROM public.%s, pero la columna '
            '"%s" no existe en esa tabla. El trigger reventara con 42703 cuando se dispare. '
            'Este es EXACTAMENTE el patron del 30 ago 2026 que impedia crear citas.',
            rec.trigger_name, rec.func_name, col_ref.col, col_ref.ref_table, col_ref.col
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN hallazgos;
END;
$$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_triggers_ciegos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_triggers_ciegos() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_triggers_ciegos() IS
  'Detecta triggers que referencian columnas inexistentes (NEW/OLD.col y SELECT col FROM tabla). Un fallo aqui significa que la ruta de escritura esta rota en produccion.';


-- ============================================================================
-- 2. SOBRECARGAS RPC: lo que de verdad produce HTTP 300 en PostgREST
-- ============================================================================
-- PostgREST resuelve RPCs por NOMBRES de parametros, no por orden ni por tipos.
-- Solo hay ambiguedad real (PGRST203) cuando dos firmas comparten el MISMO
-- conjunto de nombres. Marcarias "cualquier sobrecarga" como bloqueante daria
-- falsos rojos eternos: cerrar_caja lleva dos firmas legitimas (3 y 4 argumentos)
-- desde hace meses. Lo que si es una incoherencia que avisa: que anon pueda
-- llamar a una firma de una funcion y a otra no.
CREATE OR REPLACE FUNCTION public.vigilancia_bd_sobrecargas_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hallazgos jsonb := '[]'::jsonb;
  rec record;
BEGIN
  -- ---- A) Ambiguedad REAL: dos firmas con el mismo conjunto de nombres ----
  FOR rec IN
    WITH firmas AS (
      SELECT
        p.proname,
        p.oid,
        (SELECT coalesce(array_agg(x ORDER BY x), '{}'::name[])
           FROM unnest(coalesce(p.proargnames, '{}'::name[])) AS x) AS nombres,
        pg_get_function_identity_arguments(p.oid) AS args,
        has_function_privilege('anon', p.oid, 'execute') AS anon_exec
      FROM pg_proc p
      JOIN pg_namespace ns ON p.pronamespace = ns.oid
      WHERE ns.nspname = 'public'
        AND p.prokind = 'f'
    )
    SELECT
      a.proname,
      a.args AS firma_a,
      b.args AS firma_b,
      (a.anon_exec OR b.anon_exec) AS alguna_anon
    FROM firmas a
    JOIN firmas b
      ON a.proname = b.proname
     AND a.oid < b.oid
     AND a.nombres = b.nombres
     AND cardinality(a.nombres) > 0
  LOOP
    hallazgos := hallazgos || jsonb_build_object(
      'tipo',     'sobrecarga-ambigua',
      'nivel', 'bloqueante', 'ambito', 'base-de-datos',
      'funcion',  rec.proname,
      'firmas',   to_jsonb(array[rec.firma_a, rec.firma_b]),
      'titulo',   format('public.%s tiene dos firmas con los mismos nombres de parametro: HTTP 300 PGRST203',
                         rec.proname),
      'detalle',  format(
        'public.%s tiene dos sobrecargas con el MISMO conjunto de nombres de parametro:%s' ||
        '  A) %s%s  B) %s%s' ||
        'PostgREST resuelve por nombres y no puede elegir entre las dos: cualquiera que ' ||
        'llame a la RPC por PostgREST recibe 300 PGRST203%s. Hay que hacer DROP FUNCTION ' ||
        'de la firma que sobre (la firma vieja, no la nueva).',
        rec.proname,
        CASE WHEN rec.alguna_anon THEN ' (y al menos una esta concedida a anon: la llama el portal publico).' ELSE '.' END,
        E'\n', rec.firma_a, E'\n', rec.firma_b,
        CASE WHEN rec.alguna_anon THEN ' y con ello el portal publico de reservas queda roto' ELSE '' END
      )
    );
  END LOOP;

  -- ---- B) Grants incoherentes entre sobrecargas: aviso ----
  -- La otra mitad del incidente del 30 ago: la firma nueva con el gate de
  -- suscripcion no estaba concedida a anon, asi que aunque se hubiera resuelto
  -- la ambiguedad, el gate no se aplicaba.
  FOR rec IN
    SELECT
      p.proname,
      count(*) AS sobrecargas,
      array_agg(pg_get_function_identity_arguments(p.oid) ORDER BY p.oid) AS firmas,
      array_agg(has_function_privilege('anon', p.oid, 'execute')::text ORDER BY p.oid) AS grants_anon
    FROM pg_proc p
    JOIN pg_namespace ns ON p.pronamespace = ns.oid
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'
    GROUP BY p.proname
    HAVING count(*) > 1
       AND bool_or(has_function_privilege('anon', p.oid, 'execute'))
       AND bool_or(NOT has_function_privilege('anon', p.oid, 'execute'))
  LOOP
    hallazgos := hallazgos || jsonb_build_object(
      'tipo',     'sobrecarga-grants-incoherentes',
      'nivel', 'aviso', 'ambito', 'base-de-datos',
      'funcion',  rec.proname,
      'sobrecargas', rec.sobrecargas,
      'titulo',   format('public.%s: anon puede llamar a una firma y a otra no', rec.proname),
      'detalle',  format(
        'public.%s tiene %s sobrecargas y los grants a anon no son homogeneos. Si la firma ' ||
        'que falta es la NUEVA (con gate o validacion dentro), el gate no se esta aplicando ' ||
        'porque las llamadas entran por la vieja. Firmas: %s. Grants a anon en el mismo orden: %s.',
        rec.proname, rec.sobrecargas,
        array_to_string(rec.firmas, ' | '),
        array_to_string(rec.grants_anon, ' | ')
      )
    );
  END LOOP;

  RETURN hallazgos;
END;
$$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_sobrecargas_rpc() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_sobrecargas_rpc() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_sobrecargas_rpc() IS
  'Detecta sobrecargas que PostgREST no puede desambiguar (mismo conjunto de nombres de parametro, HTTP 300 PGRST203) y grants incoherentes a anon entre firmas de una misma funcion.';


-- ============================================================================
-- 3. ESCRITURA CRITICA: prueba INSERT real en citas (y hace rollback)
-- ============================================================================
-- El unico hueco que ninguna capa cubria: NADIE escribia. Esteches todo el
-- esquema que quieras, si el INSERT revienta por un trigger, solo un INSERT
-- de verdad se entera. La prueba corre dentro de un bloque EXCEPTION que hace
-- rollback del sub-bloque: no deja datos. Los triggers que avisan por red
-- (pg_net) solo despachan en COMMIT, asi que tampoco se envia nada.
CREATE OR REPLACE FUNCTION public.vigilancia_bd_escritura_critica()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hallazgos jsonb := '[]'::jsonb;
  rec         record;
  v_negocio    text;
  v_profesional uuid;
  v_servicio   uuid;
  v_error      text;
  v_detail     text;
  v_sqlstate   text;
  v_context    text;
BEGIN
  -- Prefiere la DEMO a proposito: es el escaparate publico y el tenant disennado
  -- para que se le toque. Si no existiera, cualquier tenant con servicio activo.
  SELECT negocio_id INTO v_negocio
  FROM public.servicios
  WHERE negocio_id = 'demo_salon_001' AND activo = true
  LIMIT 1;

  IF v_negocio IS NULL THEN
    SELECT negocio_id INTO v_negocio
    FROM public.servicios
    WHERE activo = true
    LIMIT 1;
  END IF;

  IF v_negocio IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'tipo', 'sin-datos-para-probar', 'nivel', 'aviso', 'ambito', 'base-de-datos',
      'titulo', 'Escritura critica sin probar: no hay ningun servicio activo',
      'detalle', 'No hay ningun servicio activo en la base para construir la cita de prueba.'
    ));
  END IF;

  SELECT id INTO v_profesional
  FROM public.profesionales WHERE negocio_id = v_negocio AND activo = true LIMIT 1;
  SELECT id INTO v_servicio
  FROM public.servicios WHERE negocio_id = v_negocio AND activo = true LIMIT 1;

  IF v_profesional IS NULL OR v_servicio IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'tipo', 'sin-datos-para-probar', 'nivel', 'aviso', 'ambito', 'base-de-datos',
      'titulo', 'Escritura critica sin probar: falta profesional o servicio activo',
      'detalle', format('El negocio %s no tiene profesional o servicio activo para construir la cita de prueba.', v_negocio)
    ));
  END IF;

  -- ---- PRUEBA 1: Ciclo de vida completo en citas (INSERT -> UPDATE duración -> CANCELACIÓN) ----
  -- 400 dias en el futuro para no chocar con nada real; canal 'web' y estado
  -- 'pendiente' son valores validos de los CHECK de la tabla.
  DECLARE
    v_cita_id   uuid;
    v_fin_esperado timestamptz;
    v_fin_actual timestamptz;
  BEGIN
    -- 1.A: INSERT
    INSERT INTO public.citas (
      negocio_id, profesional_id, servicio_id,
      inicio, fin, estado, canal
    ) VALUES (
      v_negocio, v_profesional, v_servicio,
      now() + interval '400 days',
      now() + interval '400 days' + interval '30 minutes',
      'pendiente', 'web'
    ) RETURNING id INTO v_cita_id;

    -- 1.B: UPDATE de duración (alargar cita 30 min)
    -- Caza el bug del 30 ago: alargar una cita se revertia solo porque los triggers
    -- de sync sobre cita_fases recalculaban el fin desde las fases estaticas.
    v_fin_esperado := now() + interval '400 days' + interval '60 minutes';
    UPDATE public.citas
    SET fin = v_fin_esperado
    WHERE id = v_cita_id
    RETURNING fin INTO v_fin_actual;

    IF v_fin_actual IS DISTINCT FROM v_fin_esperado THEN
      RAISE EXCEPTION 'ALARGAMIENTO_REVERTIDO: Se alargó la cita a % pero tras triggers quedó en %',
        v_fin_esperado, v_fin_actual
        USING ERRCODE = 'VGREV';
    END IF;

    -- 1.C: Transición de estado a 'cancelada'
    UPDATE public.citas
    SET estado = 'cancelada'
    WHERE id = v_cita_id;

    -- Exito del ciclo completo: forzar rollback de la subtransaccion
    RAISE EXCEPTION USING ERRCODE = 'VG001';
  EXCEPTION
    WHEN SQLSTATE 'VG001' THEN
      -- Ciclo completo (INSERT -> UPDATE duracion -> CANCELACION) funciono sin errores. Todo bien.
      NULL;
    WHEN SQLSTATE 'VGREV' THEN
      GET STACKED DIAGNOSTICS
        v_error   = MESSAGE_TEXT,
        v_context = PG_EXCEPTION_CONTEXT;
      hallazgos := hallazgos || jsonb_build_object(
        'tipo',     'alargamiento-cita-revertido',
        'nivel', 'bloqueante', 'ambito', 'base-de-datos',
        'sqlstate', 'VGREV',
        'error',    v_error,
        'titulo',   'Alargar la duración de una cita se revierte solo (conflicto de triggers)',
        'detalle',  format(
          'Al modificar citas.fin para alargar la cita, los triggers de sync la sobreescriben. ' ||
          'Detalle: %s. Contexto: %s.',
          v_error, coalesce(left(v_context, 300), '(sin contexto)')
        )
      );
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_sqlstate = RETURNED_SQLSTATE,
        v_error    = MESSAGE_TEXT,
        v_detail   = PG_EXCEPTION_DETAIL,
        v_context  = PG_EXCEPTION_CONTEXT;
      hallazgos := hallazgos || jsonb_build_object(
        'tipo',     'escritura-cita-rota',
        'nivel', 'bloqueante', 'ambito', 'base-de-datos',
        'sqlstate', v_sqlstate,
        'error',    v_error,
        'titulo',   format('Ciclo de escritura en citas falla con %s: no se pueden crear/editar citas', v_sqlstate),
        'detalle',  format(
          'El ciclo de escritura en citas falla con %s: %s. Detalle: %s. Contexto: %s. ' ||
          'Esto tumba el alta o modificacion de citas en TODOS los canales (agenda, portal publico, WhatsApp).',
          v_sqlstate, v_error,
          coalesce(v_detail, '(sin detalle)'),
          coalesce(left(v_context, 300), '(sin contexto)')
        )
      );
  END;

  -- ---- PRUEBA 2: las RPC del portal publico concedidas a anon ----
  -- La otra mitad del 30 ago: la firma recreada no llevaba grant a anon y el
  -- portal no podia reservar aunque la logica estuviera bien.
  FOR rec IN
    SELECT f.rpc,
           EXISTS (
             SELECT 1 FROM pg_proc p
             JOIN pg_namespace ns ON p.pronamespace = ns.oid
             WHERE ns.nspname = 'public' AND p.proname = f.rpc
               AND has_function_privilege('anon', p.oid, 'execute')
           ) AS anon_puede
    FROM unnest(array['crear_cita_publica', 'portal_info', 'disponibilidad_publica']) AS f(rpc)
  LOOP
    IF NOT rec.anon_puede THEN
      hallazgos := hallazgos || jsonb_build_object(
        'tipo',    'rpc-sin-grant-anon',
        'nivel', 'bloqueante', 'ambito', 'base-de-datos',
        'funcion', rec.rpc,
        'titulo',  format('public.%s no tiene GRANT EXECUTE a anon: el portal publico roto', rec.rpc),
        'detalle', format(
          '%s no es ejecutable por anon en ninguna de sus firmas. El portal publico (/r/<slug>) ' ||
          'llama a esta RPC sin sesion: sin el grant, reservar rompe con 403/404 aunque la ' ||
          'logica de la funcion este perfecta. Desde el round 4 de seguridad los grants a anon ' ||
          'son explicitos: toda recreacion de la funcion tiene que repetir el grant.',
          rec.rpc
        )
      );
    END IF;
  END LOOP;

  RETURN hallazgos;
END;
$$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_escritura_critica() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_escritura_critica() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_escritura_critica() IS
  'Prueba que la ruta de escritura critica (INSERT en citas) funciona y que las RPC del portal tienen grant a anon. Hace rollback automatico: no deja datos de prueba.';
