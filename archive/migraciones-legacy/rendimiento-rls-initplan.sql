-- Aplicada en remoto: 20260817112607_rendimiento_rls_initplan
-- ============================================================================
-- RENDIMIENTO (2/2): que las politicas RLS se evaluen una vez por CONSULTA y
-- no una vez por FILA.
--
-- Postgres solo puede sacar una llamada del bucle de filas (convertirla en un
-- InitPlan) si aparece dentro de un subselect. Escrita suelta -- auth.uid(),
-- is_shared_demo_visitor()... -- la ejecuta para cada fila examinada. Con 105
-- politicas llamando a is_shared_demo_visitor() y 167 a auth.uid(), cada
-- consulta multiplicaba su coste por el numero de filas de la tabla.
--
-- La correccion es puramente sintactica: se envuelve cada llamada en
-- (select ...). La logica, los roles, el caracter permisivo/restrictivo y el
-- resultado de cada politica quedan EXACTAMENTE igual; lo unico que cambia es
-- cuantas veces se ejecutan. Es la recomendacion oficial de Supabase para el
-- aviso `auth_rls_initplan`.
--
-- Resultado medido: el aviso auth_rls_initplan baja de 139 a 8 (los 8 que
-- quedan son otras dos tablas, que se arreglan aparte en
-- arreglo-rls-service-variants-y-pricing.sql). El plan de una consulta tipica
-- de agenda pasa a "One-Time Filter" + Index Scan, 0,19 ms.
--
-- El script es idempotente: si se vuelve a pasar, no encuentra nada que cambiar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._envolver_rls_tmp(expr text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  select case when expr is null then null else
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  -- deshacer envoltorios previos, para no anidar (select (select ...))
                  regexp_replace(expr, '\( *SELECT +((?:auth\.)?[a-z_]+\(\))(?: +AS +[a-z_]+)? *\)', '\1', 'gi'),
                'auth\.uid\(\)', '(select auth.uid())', 'g'),
              'auth\.jwt\(\)', '(select auth.jwt())', 'g'),
            'is_shared_demo_visitor\(\)', '(select is_shared_demo_visitor())', 'g'),
          'my_negocio_id_text\(\)', '(select my_negocio_id_text())', 'g'),
        'my_app_role\(\)', '(select my_app_role())', 'g'),
      'is_staff\(\)', '(select is_staff())', 'g'),
    'is_team_member\(\)', '(select is_team_member())', 'g')
  end
$fn$;

DO $$
DECLARE
  p              record;
  nuevo_qual     text;
  nuevo_check    text;
  ddl            text;
  reescritas     int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    nuevo_qual  := public._envolver_rls_tmp(p.qual);
    nuevo_check := public._envolver_rls_tmp(p.with_check);

    CONTINUE WHEN nuevo_qual IS NOT DISTINCT FROM p.qual
              AND nuevo_check IS NOT DISTINCT FROM p.with_check;

    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);

    ddl := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                  p.policyname,
                  p.tablename,
                  CASE WHEN p.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END,
                  p.cmd,
                  array_to_string(p.roles, ', '));

    -- USING solo donde la orden lo admite (INSERT solo lleva WITH CHECK).
    IF nuevo_qual IS NOT NULL THEN
      ddl := ddl || format(' USING (%s)', nuevo_qual);
    END IF;
    IF nuevo_check IS NOT NULL THEN
      ddl := ddl || format(' WITH CHECK (%s)', nuevo_check);
    END IF;

    EXECUTE ddl;
    reescritas := reescritas + 1;
  END LOOP;

  RAISE NOTICE 'Politicas RLS reescritas: %', reescritas;
END $$;

DROP FUNCTION public._envolver_rls_tmp(text);
