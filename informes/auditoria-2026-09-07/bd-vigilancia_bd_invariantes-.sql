CREATE OR REPLACE FUNCTION public.vigilancia_bd_invariantes()
 RETURNS TABLE(clave text, nivel text, ambito text, titulo text, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k_corte constant timestamptz := '2026-08-31 21:00:00+00';
  k_corte_agenda constant timestamptz := '2026-08-31 22:00:00+00';
BEGIN
  RETURN QUERY
  WITH candado AS (
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'public.citas'::regclass
      AND c.conname = 'citas_solape_profesional_excl'
  ),
  control AS (
    SELECT
      (SELECT count(*) FROM candado) = 1
        AS existe,
      coalesce((SELECT position('ventanas_ocupadas' IN def) > 0 FROM candado), false)
        AS mide_por_ocupacion,
      ((SELECT substring(def FROM '''([0-9]{4}-[0-9]{2}-[0-9]{2} [^'']*)''::timestamp with time zone') FROM candado))::timestamptz
        IS NOT DISTINCT FROM k_corte_agenda
        AS mismo_corte,
      NOT EXISTS (
        SELECT 1 FROM public.citas c2
        WHERE c2.estado <> 'cancelada'
          AND c2.grupo_id IS NULL
          AND c2.profesional_id IS NOT NULL
          AND c2.ventanas_ocupadas IS NULL
      ) AS todas_selladas,
      coalesce((SELECT position('solape_forzado' IN def) > 0 FROM candado), false)
        AS exime_forzados
  )
  SELECT
    'bd-invariantes/agenda-vigilante-ciego',
    'bloqueante',
    'coherencia',
    'El vigilante de solapes de agenda se ha quedado ciego',
    'El vector 1 de vigilancia_bd_invariantes() mide los solapes con la misma nocion de '
    || '"ocupado" que el candado citas_solape_profesional_excl, y uno de sus controles ha '
    || 'caido. Mientras esto salga, un cero de bd-invariantes/agenda-solapada NO significa '
    || 'que no haya dobles reservas: significa que nadie esta mirando. Arreglar el control, '
    || 'nunca quitarlo. Los cinco deberian dar true: '
    || 'el_candado_existe=' || c.existe
    || ', sigue_midiendo_por_ocupacion=' || c.mide_por_ocupacion
    || ', mismo_corte_que_el_vigilante=' || c.mismo_corte
    || ', todas_las_citas_selladas=' || c.todas_selladas
    || ', exime_solapes_forzados=' || c.exime_forzados
    || '. Si ha caido "todas_las_citas_selladas", hay citas vivas con ventanas_ocupadas NULL: como NULL && x '
    || 'es NULL y no false, esas citas desaparecen del recuento sin ruido. Lo escribe el '
    || 'trigger trg_citas_sellar_ventanas en cada insert y cada update; si falta, mirar ese '
    || 'trigger antes que nada. Si ha caido "exime_solapes_forzados", el candado ya no '
    || 'reconoce citas.solape_forzado y la funcion de forzar un solape esta muerta: quien '
    || 'acepte el aviso recibira un 23P01 igual, y en pantalla parecera un bug del formulario.'
  FROM control c
  WHERE NOT (c.existe AND c.mide_por_ocupacion AND c.mismo_corte AND c.todas_selladas AND c.exime_forzados);

  RETURN QUERY
  SELECT
    'bd-invariantes/agenda-solapada:' || s.negocio_id,
    'bloqueante',
    'coherencia',
    s.negocio_id || ': ' || s.pares || ' par(es) de citas con el trabajo solapado',
    'Hay ' || s.pares || ' pares de citas vivas del mismo profesional cuyas VENTANAS DE '
    || 'TRABAJO se pisan (los reposos no cuentan: encajar ahi a otra clienta es correcto). '
    || 'Al menos una de cada par es posterior al 31 ago 2026, que es cuando entro el candado '
    || 'citas_solape_profesional_excl, asi que esto no es deuda historica: o el candado se ha '
    || 'caido, o el par esta A CABALLO del corte --una cita anterior y una posterior-- que es '
    || 'el unico solape que el candado no puede rechazar, porque la fila vieja no esta en su '
    || 'indice parcial. Ninguna de las dos esta marcada como solape_forzado, asi que no es '
    || 'deliberado. Mirar las dos citas y mover una: son dos clientas a la misma hora con '
    || 'la misma persona.'
  FROM (
    SELECT a.negocio_id, count(*) AS pares
    FROM public.citas a
    JOIN public.citas b
      ON a.profesional_id = b.profesional_id
     AND a.id < b.id
     AND a.estado <> 'cancelada' AND b.estado <> 'cancelada'
     AND a.grupo_id IS NULL AND b.grupo_id IS NULL
     AND a.profesional_id IS NOT NULL AND b.profesional_id IS NOT NULL
     AND a.solape_forzado IS NOT TRUE AND b.solape_forzado IS NOT TRUE
     AND a.ventanas_ocupadas && b.ventanas_ocupadas
    WHERE a.inicio >= k_corte_agenda OR b.inicio >= k_corte_agenda
    GROUP BY a.negocio_id
  ) s;

  RETURN QUERY
  SELECT
    'bd-invariantes/agenda-solapada-historica:' || s.negocio_id,
    'aviso',
    'coherencia',
    s.negocio_id || ': ' || s.pares || ' par(es) de citas solapadas anteriores al 31 ago 2026',
    'Hay ' || s.pares || ' pares de citas vivas con el trabajo solapado, las dos ANTERIORES '
    || 'al candado citas_solape_profesional_excl (31 ago 2026). Quedan exentas por decision de '
    || 'producto --el candado tiene esa misma fecha de corte-- y son la carrera del portal y '
    || 'las migraciones a mano de entonces. Deuda congelada: el trinquete solo baja. Si este '
    || 'numero SUBE, alguien esta insertando citas con fecha antigua y hay que mirar quien.'
  FROM (
    SELECT a.negocio_id, count(*) AS pares
    FROM public.citas a
    JOIN public.citas b
      ON a.profesional_id = b.profesional_id
     AND a.id < b.id
     AND a.estado <> 'cancelada' AND b.estado <> 'cancelada'
     AND a.grupo_id IS NULL AND b.grupo_id IS NULL
     AND a.profesional_id IS NOT NULL AND b.profesional_id IS NOT NULL
     AND a.ventanas_ocupadas && b.ventanas_ocupadas
    WHERE a.inicio < k_corte_agenda AND b.inicio < k_corte_agenda
    GROUP BY a.negocio_id
  ) s;

  RETURN QUERY
  SELECT
    'bd-invariantes/agenda-solape-forzado:' || s.negocio_id,
    'aviso',
    'coherencia',
    s.negocio_id || ': ' || s.citas || ' cita(s) con solape forzado a proposito',
    'Hay ' || s.citas || ' citas marcadas como solape_forzado: el salon eligio pisar otra cita '
    || 'aceptando el aviso. NO es un error y no hay nada que arreglar. Se lista porque es el '
    || 'unico punto del producto donde dos clientas comparten profesional a la misma hora, y '
    || 'porque un numero que crece de golpe significa una de dos cosas: que el aviso dejo de '
    || 'avisar, o que alguien esta forzando por sistema para esquivar la agenda. Cada una tiene '
    || 'su evento en eventos_negocio (tipo=solape_forzado) con quien y cuando.'
  FROM (
    SELECT c.negocio_id, count(*) AS citas
    FROM public.citas c
    WHERE c.solape_forzado IS TRUE
      AND c.estado <> 'cancelada'
    GROUP BY c.negocio_id
  ) s;

  RETURN QUERY
  SELECT
    'bd-invariantes/bono-negativo:' || b.id::text,
    'bloqueante',
    'coherencia',
    'Bono con ' || b.sesiones_disponibles || ' sesiones disponibles (' || b.negocio_id || ')',
    'El bono ' || b.id || ' tiene sesiones_disponibles=' || b.sesiones_disponibles
    || ' sobre ' || b.sesiones_totales || ' vendidas. Se consumieron mas sesiones de las que habia: '
    || 'una clienta pago por sesiones que el sistema conto por debajo de cero. Hay que reconstruir '
    || 'el saldo desde bono_sesiones y auditar las consumiciones.'
  FROM public.bonos b
  WHERE b.sesiones_disponibles < 0;

  RETURN QUERY
  SELECT
    'bd-invariantes/bono-sobrado:' || b.id::text,
    'aviso',
    'coherencia',
    'Bono con mas disponibles (' || b.sesiones_disponibles || ') que vendidas (' || b.sesiones_totales || ')',
    'El bono ' || b.id || ' tiene mas sesiones disponibles que totales: alguien edito a mano o el '
    || 'regalo de sesiones no paso por la columna total. Inofensivo para la clienta, pero el dato '
    || 'no cuadra y los informes de bonos vendidos mienten.'
  FROM public.bonos b
  WHERE b.sesiones_disponibles > b.sesiones_totales;

  RETURN QUERY
  SELECT
    'bd-invariantes/caja-descuadrada:' || c.id::text,
    'bloqueante',
    'coherencia',
    'Cobro ' || c.id || ' descuadrado por ' ||
      abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
        + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
        - c.total_cents) || ' cent',
    'El cobro ' || c.id || ' (' || c.negocio_id || ') no cumple el invariante de caja: '
    || 'efectivo + datafono + online + bizum = total_cents (el total ya incluye la '
    || 'propina; tolerancia 1 cent). Un cobro que no suma malmete el arqueo del dia '
    || 'y la base imponible de VeriFactu. Es POSTERIOR al arreglo del generador, '
    || 'asi que viene de codigo nuevo: mirar quien inserto ese cobro.'
  FROM public.cobros c
  WHERE c.created_at >= k_corte
    AND abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
          + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
          - c.total_cents) > 1;

  RETURN QUERY
  SELECT
    'bd-invariantes/caja-descuadrada-historica:' || s.negocio_id,
    'aviso',
    'coherencia',
    s.negocio_id || ': ' || s.n || ' cobro(s) descuadrado(s) anteriores al 31 ago 2026',
    'Hay ' || s.n || ' cobros que no cumplen el invariante de caja y son ANTERIORES al arreglo '
    || 'del generador de la demo (31 ago 2026). No se pueden corregir ni borrar: '
    || 'cobros_prevent_financial_updates lo impide (Ley Antifraude 11/2021), y esta bien que lo '
    || 'impida. Quedan como deuda congelada: el trinquete solo puede bajar. Si este numero SUBE, '
    || 'es que alguien ha insertado cobros con fecha antigua.'
  FROM (
    SELECT c.negocio_id, count(*) AS n
    FROM public.cobros c
    WHERE c.created_at < k_corte
      AND abs(coalesce(c.efectivo_cents,0) + coalesce(c.datafono_cents,0)
            + coalesce(c.online_cents,0) + coalesce(c.bizum_cents,0)
            - c.total_cents) > 1
    GROUP BY c.negocio_id
  ) s;

  RETURN;
END;
$function$
