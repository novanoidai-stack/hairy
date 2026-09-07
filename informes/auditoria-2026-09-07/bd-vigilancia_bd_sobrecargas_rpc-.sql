CREATE OR REPLACE FUNCTION public.vigilancia_bd_sobrecargas_rpc()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
