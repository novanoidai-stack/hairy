CREATE OR REPLACE FUNCTION public.vigilancia_bd_triggers_ciegos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
