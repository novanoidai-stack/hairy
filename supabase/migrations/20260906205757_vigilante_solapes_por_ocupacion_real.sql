-- El vigilante de solapes medía el bloque entero. El candado ya no.
--
-- ES LA CUARTA VEZ QUE ESTE PAR SE DESINCRONIZA, y por eso esta migración lleva
-- más comentario que código. Que la próxima persona lo lea antes de tocarlo.
--
-- LA HISTORIA
--   * 20260831220000 creó el candado con `tstzrange(inicio, fin)`: el bloque
--     entero de la cita.
--   * 20260901153828 lo corrigió al MULTIRANGO de las ventanas activas, porque
--     durante el reposo químico el profesional está LIBRE y encajar ahí a otra
--     clienta es el diferencial nº1 del producto.
--   * 20260905233000 lo volvió a corregir: la ocupación sale ya de
--     `citas.ventanas_ocupadas`, que sale de `cita_fases`, y vale para cualquier
--     número de reposos.
--   * El vector 1 de `vigilancia_bd_invariantes()` **no se enteró de ninguna de
--     las tres**. Sigue con el `tstzrange(a.inicio, a.fin) && tstzrange(b.inicio,
--     b.fin)` del 31 de agosto.
--
-- QUÉ DENUNCIABA DE MÁS, medido contra producción el 6 sep 2026:
--
--     método                          pares
--     bloque entero (el que corría)      31
--     ocupación real                     24
--     ------------------------------------
--     falsos positivos                    7
--
-- Y no son siete errores de redondeo: son siete veces que el vigilante llamó
-- "doble reserva" a que el producto funcione. El par de `salon_pruebas_mecha` es
-- el caso entero en tres líneas:
--
--     cita B  10:30-11:15, ocupa [10:30, 11:00)   <- reposo de 11:00 a 11:15
--     cita A  11:00-11:30, ocupa [11:00, 11:30)   <- clienta encajada EN el reposo
--     bloques: se solapan          ocupaciones: se tocan, no se solapan
--
-- Eso es exactamente el "tiempo muerto productivo" que vende Mecha, denunciado
-- como incidencia por el vigilante que debería protegerlo.
--
-- LO SEGUNDO: EL VECTOR NO FILTRABA POR LA FECHA DE CORTE
--
-- El candado exime a lo anterior a `2026-08-31 22:00:00+00` por decisión de
-- producto: los pares históricos se quedan. El vigilante no lo sabía, así que
-- denunciaba 24 pares que NADIE va a arreglar nunca. Un aviso que no puede bajar
-- es un aviso que se deja de mirar -- la misma lección que ya obligó a poner
-- trinquete al descuadre de caja en 20260831205823, seis días antes, en esta
-- misma función.
--
-- Se separa igual que allí, y por el mismo motivo:
--   · anterior al corte  -> aviso agregado por negocio, deuda congelada. Solo
--                           puede bajar; si SUBE es que alguien está insertando
--                           citas con fecha antigua.
--   · a partir del corte -> BLOQUEANTE. Ahí el candado manda, así que un solape
--                           vivo significa que se ha colado por algún lado.
--
-- EL AGUJERO QUE APARECE AL FILTRAR, Y QUE HAY QUE CUBRIR AQUÍ
--
-- Una EXCLUDE parcial solo compara filas que están DENTRO del índice. Un par "a
-- caballo" del corte -- una cita de agosto y una de hoy sobre el mismo hueco --
-- no lo puede rechazar el candado: la vieja no está indexada, así que la nueva no
-- choca con nada. Hoy hay 0 pares así, pero el hueco es estructural y la cartera
-- de Jose tiene 24 pares de agosto donde podría abrirse.
--
-- Por eso el bloqueante NO exige que las dos citas sean posteriores al corte,
-- sino que **al menos una** lo sea. Así el vigilante cubre justo lo que el
-- candado no alcanza, que es para lo que está.
--
-- BLOQUE E (petición 7 de Jose): cuando exista `citas.solape_forzado`, las citas
-- marcadas salen de este recuento -- serán un solape querido y avisado, no una
-- incidencia. El `where` del bloqueante tendrá que añadir
-- `and not coalesce(a.solape_forzado,false) and not coalesce(b.solape_forzado,false)`.
-- La columna la crea el bloque E en su propia migración, no esta. Su criterio de
-- aceptación dice que el vigilante se actualiza en el MISMO commit que la
-- columna: este comentario es la deuda que eso salda.
--
-- POR QUÉ ESTA VEZ NO SE VOLVERÁ A DESINCRONIZAR EN SILENCIO
--
-- Las tres veces anteriores el par se separó sin que nada fallara, porque las dos
-- mitades dan un número razonable por separado. Un vigilante que compara contra
-- una regla escrita en otro sitio necesita comprobar que la otra regla sigue
-- diciendo lo mismo, o el día que cambie seguirá dando verde midiendo lo que ya
-- no toca. La comprobación 1a lee el candado DESPLEGADO (`pg_get_constraintdef`,
-- no el repo) y exige que exista, que siga indexando `ventanas_ocupadas` y que su
-- corte sea este mismo. Si algo de eso cambia, sale un BLOQUEANTE que dice cuál
-- de los controles ha caído, en vez de un cero que no significa nada.
--
-- Probado escenario a escenario el 6 sep 2026 contra producción: candado
-- ausente, candado que vuelve a medir por bloques, corte movido y corte que deja
-- de ser un literal. Los cuatro caen; el estado de hoy pasa los cuatro.
--
-- El cuarto control es el de la columna: `NULL && cualquier_cosa` es NULL, no
-- false, así que una cita sin sellar no sale en NINGÚN par y desaparece del
-- recuento sin ruido. Hoy son 0 de 1.770 citas vivas -- el trigger
-- `trg_citas_sellar_ventanas` la escribe siempre --, pero apoyarse en eso sin
-- comprobarlo es justo cómo se construye un cero que no significa nada.
--
-- Vectores 2 (bonos) y 3 (arqueo de caja): copiados VERBATIM de la definición
-- desplegada, leída con pg_get_functiondef() antes de escribir esto. No se toca
-- una coma. El fichero del repo (20260831205823) tenía menos comentario que lo
-- que corría de verdad; se conserva lo que corría.

CREATE OR REPLACE FUNCTION public.vigilancia_bd_invariantes()
RETURNS TABLE(clave text, nivel text, ambito text, titulo text, detalle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Momento en que se arreglo el generador de la demo (migracion
  -- 20260831205630_resembrar_demo_cobro_con_propina_cuadrado). Todo cobro
  -- anterior es deuda CONGELADA e irreparable; todo cobro posterior que no
  -- cuadre es una regresion de verdad.
  k_corte constant timestamptz := '2026-08-31 21:00:00+00';
  -- El corte del candado citas_solape_profesional_excl. NO es el mismo que el de
  -- caja y no tiene por que serlo: aquel marca cuando se arreglo el generador de
  -- cobros, este cuando se puso el candado de agenda. Si alguien mueve el del
  -- candado y no este, la comprobacion 1a lo dice a gritos.
  k_corte_agenda constant timestamptz := '2026-08-31 22:00:00+00';
BEGIN
  -- ---- VECTOR 1: citas solapadas del mismo profesional ----
  --
  -- La ocupacion es `citas.ventanas_ocupadas`, NO el bloque de la cita. Durante
  -- el reposo el profesional esta libre y encajar ahi a otra clienta es el
  -- diferencial nº1 del producto: medirlo por bloques lo denuncia como error.
  -- Misma nocion de "ocupado" que el candado; si una cambia, cambian las dos.

  -- 1a. Controles positivos. Este vector es NEGATIVO (busca algo malo y espera no
  -- encontrarlo), que es el tipo de vigilante que se pudre solo: una regla rota y
  -- un sistema sano dan el mismo cero. Aqui se le exige demostrar que sigue
  -- midiendo contra el candado de verdad, el DESPLEGADO, no el del repo.
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
      -- `is not distinct from` y no `=`: si el regex deja de casar, substring da
      -- NULL y un `=` daria NULL, que en el WHERE de abajo no emite fila. O sea:
      -- el ancla perdida saldria como verde. Es exactamente el fallo que este
      -- bloque existe para no cometer.
      ((SELECT substring(def FROM '''([0-9]{4}-[0-9]{2}-[0-9]{2} [^'']*)''::timestamp with time zone') FROM candado))::timestamptz
        IS NOT DISTINCT FROM k_corte_agenda
        AS mismo_corte,
      NOT EXISTS (
        SELECT 1 FROM public.citas c2
        WHERE c2.estado <> 'cancelada'
          AND c2.grupo_id IS NULL
          AND c2.profesional_id IS NOT NULL
          AND c2.ventanas_ocupadas IS NULL
      ) AS todas_selladas
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
    || 'nunca quitarlo. Los cuatro deberian dar true: '
    || 'el_candado_existe=' || c.existe
    || ', sigue_midiendo_por_ocupacion=' || c.mide_por_ocupacion
    || ', mismo_corte_que_el_vigilante=' || c.mismo_corte
    || ', todas_las_citas_selladas=' || c.todas_selladas
    || '. Si ha caido el ultimo, hay citas vivas con ventanas_ocupadas NULL: como NULL && x '
    || 'es NULL y no false, esas citas desaparecen del recuento sin ruido. Lo escribe el '
    || 'trigger trg_citas_sellar_ventanas en cada insert y cada update; si falta, mirar ese '
    || 'trigger antes que nada.'
  FROM control c
  WHERE NOT (c.existe AND c.mide_por_ocupacion AND c.mismo_corte AND c.todas_selladas);

  -- 1b. Solapes VIVOS: a partir del corte manda el candado, asi que un solape
  -- aqui es una doble reserva que se ha colado. Basta con que UNA de las dos sea
  -- posterior al corte: el par "a caballo" (una cita de agosto y una de hoy) el
  -- candado no lo puede rechazar --la vieja no esta en su indice parcial-- y es
  -- justo el hueco que el vigilante tiene que cubrir.
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
    || 'indice parcial. Mirar las dos citas y mover una: son dos clientas a la misma hora con '
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
     AND a.ventanas_ocupadas && b.ventanas_ocupadas
    WHERE a.inicio >= k_corte_agenda OR b.inicio >= k_corte_agenda
    GROUP BY a.negocio_id
  ) s;

  -- 1c. Deuda historica congelada, con trinquete. El candado exime a lo anterior
  -- al corte por decision de producto, asi que estos pares no los va a arreglar
  -- nadie: en aviso y agregados, para que no tapen el bloqueante de arriba. El
  -- numero solo puede bajar; si SUBE es que alguien inserta citas con fecha
  -- antigua, y eso si hay que mirarlo.
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

  -- ---- VECTOR 2: bonos imposibles ----
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

  -- ---- VECTOR 3: arqueo de caja ----
  -- efectivo + datafono + online + bizum = total_cents (tolerancia 1 cent).
  -- OJO CON LA CONVENCION, verificada contra CobroSheet.tsx y contra los datos:
  -- total_cents YA INCLUYE la propina.
  --
  -- TRINQUETE POR FECHA (31 ago 2026). Un cobro NO SE PUEDE ARREGLAR: lo impide
  -- cobros_prevent_financial_updates (Ley Antifraude 11/2021), y tampoco se puede
  -- borrar. Asi que un descuadre historico bloquearia la CI para siempre y sin
  -- accion posible -- que es justo como se consigue que se deje de mirar el panel.
  -- Los 7 que habia los fabricaba `resembrar_demo()` a razon de uno al dia
  -- (propina dentro de datafono_cents pero fuera de total_cents); el generador se
  -- arreglo en 20260831205630. Lo anterior queda congelado en aviso agregado; lo
  -- posterior es bloqueante, porque ya solo puede venir de codigo nuevo.
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
$function$;

REVOKE ALL ON FUNCTION public.vigilancia_bd_invariantes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vigilancia_bd_invariantes() TO authenticated;

COMMENT ON FUNCTION public.vigilancia_bd_invariantes() IS
  'Invariantes de datos en reposo: solapes de agenda, saldos de bonos imposibles y arqueo de caja. El dinero y el tiempo de las clientas, no el esquema. Los solapes se miden por citas.ventanas_ocupadas --la misma nocion de "ocupado" que el candado citas_solape_profesional_excl-- y no por el bloque de la cita: el reposo NO ocupa. Los dos trinquetes (agenda y caja) llevan corte por fecha: lo anterior es deuda congelada en aviso, lo posterior bloquea. La comprobacion 1a vigila que este vector y el candado no se desincronicen, que ya ha pasado tres veces.';

-- ── Prueba de vida ──────────────────────────────────────────────────────────
-- Que la funcion compile no es que mida bien. Si algo de esto falla, la excepcion
-- tumba la migracion entera: no se instala un vigilante que no ha demostrado ver.
--
-- Las dos primeras pruebas van sobre un par SINTETICO, no sobre los datos de hoy.
-- A proposito: una asercion contra el estado de la tabla ('tienen que salir 31 y
-- 24') convierte la migracion en no reejecutable --el dia que la deuda se limpie
-- dejaria de aplicar-- y ademas no prueba el predicado, prueba los datos. El par
-- sintetico es el caso real de salon_pruebas_mecha, que es el que da nombre a
-- todo esto.
DO $test$
DECLARE
  -- cita B 10:30-11:15 con reposo de 11:00 a 11:15 -> solo trabaja hasta las 11:00
  b_bloque constant tstzrange := tstzrange('2026-08-18 10:30+00', '2026-08-18 11:15+00');
  b_ocupa  constant tstzmultirange := tstzmultirange(tstzrange('2026-08-18 10:30+00', '2026-08-18 11:00+00'));
  -- cita A 11:00-11:30, encajada justo EN el reposo de B
  a_bloque constant tstzrange := tstzrange('2026-08-18 11:00+00', '2026-08-18 11:30+00');
  a_ocupa  constant tstzmultirange := tstzmultirange(tstzrange('2026-08-18 11:00+00', '2026-08-18 11:30+00'));
  -- y una que si pisa el trabajo de A, para que el predicado no valga por decir
  -- que no a todo
  z_ocupa  constant tstzmultirange := tstzmultirange(tstzrange('2026-08-18 11:15+00', '2026-08-18 11:45+00'));

  v_bloque     integer;
  v_ocupacion  integer;
  v_bloqueante integer;
  v_historico  integer;
  v_ciego      integer;
BEGIN
  -- 1. El metodo viejo denuncia el encaje en el reposo. Si esto dejara de ser
  -- cierto, el cambio no arreglaria nada y habria que revisar el porque de arriba.
  IF NOT (a_bloque && b_bloque) THEN
    RAISE EXCEPTION 'La prueba de vida ya no reproduce el falso positivo: medir por bloques deberia denunciar el encaje en el reposo.';
  END IF;

  -- 2. El metodo nuevo NO lo denuncia, pero SI ve un solape de trabajo de verdad.
  -- Las dos mitades juntas: un predicado que dijera que no a todo pasaria la
  -- primera y fallaria la segunda.
  IF (a_ocupa && b_ocupa) THEN
    RAISE EXCEPTION 'El predicado nuevo sigue denunciando el encaje en el reposo: mide ocupacion como si el reposo ocupara.';
  END IF;
  IF NOT (a_ocupa && z_ocupa) THEN
    RAISE EXCEPTION 'El predicado nuevo no ve un solape de trabajo real: dice que no a todo, que es la forma silenciosa de estar roto.';
  END IF;

  -- 3. Los controles positivos tienen que pasar contra el candado desplegado.
  SELECT
    count(*) FILTER (WHERE v.clave LIKE 'bd-invariantes/agenda-solapada:%'),
    count(*) FILTER (WHERE v.clave LIKE 'bd-invariantes/agenda-solapada-historica:%'),
    count(*) FILTER (WHERE v.clave = 'bd-invariantes/agenda-vigilante-ciego')
  INTO v_bloqueante, v_historico, v_ciego
  FROM public.vigilancia_bd_invariantes() v;

  IF v_ciego > 0 THEN
    RAISE EXCEPTION 'Los controles positivos del vector 1 fallan nada mas instalarlo: el vigilante no puede demostrar que mide contra el candado desplegado. Llamar a vigilancia_bd_invariantes() y leer el detalle de bd-invariantes/agenda-vigilante-ciego.';
  END IF;

  -- 4. Y el estado de hoy, solo informativo: es la medicion que justifica el
  -- cambio, no una condicion para aplicarlo.
  WITH vivas AS (
    SELECT id, profesional_id, inicio, fin, ventanas_ocupadas
    FROM public.citas
    WHERE estado <> 'cancelada' AND grupo_id IS NULL AND profesional_id IS NOT NULL
  )
  SELECT
    count(*) FILTER (WHERE tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)),
    count(*) FILTER (WHERE a.ventanas_ocupadas && b.ventanas_ocupadas)
  INTO v_bloque, v_ocupacion
  FROM vivas a JOIN vivas b
    ON a.profesional_id = b.profesional_id AND a.id < b.id
   AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin);

  RAISE NOTICE 'Prueba de vida OK. Por bloques: % pares. Por ocupacion real: % pares (% falsos positivos retirados). Emite hoy % bloqueante(s) y % aviso(s) de deuda historica.',
    v_bloque, v_ocupacion, v_bloque - v_ocupacion, v_bloqueante, v_historico;
END;
$test$;
