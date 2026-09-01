-- Comprobacion 13 de vigilancia_bd(): nadie decide ocupacion de agenda a mano.
--
-- POR QUE EXISTE
--
-- El 1 sep 2026, el paso 1 de la spec 1 (20260901145526) llevo 8 funciones de
-- `public` que decidian ocupacion con un predicado escrito a mano a la costura
-- `public.ventanas_activas_cita()`. El dia que esa costura sepa leer
-- `cita_fases`, las 8 se vuelven multi-fase a la vez sin volver a tocarlas
-- (paso 5). Una novena funcion que vuelva a escribir el predicado en linea NO
-- se enteraria de ese cambio: seguiria creyendo que una cita tiene un solo
-- reposo. Y como el reposo es el hueco vendible --el diferencial nº 1 del
-- producto-- eso significa una de dos cosas, las dos silenciosas:
--   · ofrecer un hueco que en realidad esta ocupado (se dobla una clienta), o
--   · bloquear un reposo que estaba libre (se pierde la venta).
-- Ninguna de las dos rompe nada: la funcion devuelve un numero razonable y
-- sigue. Es exactamente la deriva que describe la decision 10 del CLAUDE.md,
-- "los invariantes repartidos son la fabrica de regresiones".
--
-- POR QUE EN LA CAPA 2 Y NO EN UN VIGILANTE DE scripts/
--
-- Porque el predicado inline VIVE, legitimamente, en las migraciones historicas
-- de `supabase/migrations/` y en `archive/migraciones-legacy/`: son el registro
-- de lo que se aplico entonces y no se reescriben. Un vigilante estatico que
-- leyera ficheros daria decenas de falsos positivos el primer dia, y un
-- vigilante que grita en falso el primer dia acaba apagado. Lo unico que
-- importa es **lo que corre hoy**, y eso solo lo sabe `pg_proc`.
--
-- QUE CUENTA COMO "A MANO" (y que no, que es la mitad dificil)
--
-- La firma del predicado retirado es, generalizada sobre el alias:
--
--     coalesce(<alias>.fin_espera, coalesce(<alias>.fin_activa, <alias>.fin))
--
-- El alias tiene que ser un comodin y no la letra `c`. La comprobacion final de
-- la propia 20260901145526 buscaba el literal con alias `c` y por eso dio 0:
-- se le escapaba `disponibilidad_publica`, que usa `c3` en el subselect de
-- `reposo_disponible_min`. Comprobado en produccion el 1 sep 2026 llamando al
-- portal de la demo: devuelve `reposo_disponible_min: 20`, o sea que ese trozo
-- esta vivo. Un ancla demasiado estrecha es un vigilante ciego con cara de
-- verde.
--
-- Quedan fuera dos formas, y las dos por su ESTRUCTURA, no por una lista de
-- nombres que envejezca:
--
--   · `public.ventanas_activas_cita` usa `coalesce(p_fin_espera, coalesce(
--     p_fin_activa, p_fin))`, con parametros escalares sin cualificar. El patron
--     exige que el identificador empiece palabra (`\m`), asi que `p_fin_espera`
--     no casa con `fin_espera`. Es la definicion canonica: si casara, el
--     vigilante se denunciaria a si mismo.
--   · `recurso_tramo_de_cita` y `recursos_ocupados_negocio` usan
--     `coalesce(c.fin_espera, c.fin_activa, c.inicio)` -- TRES argumentos
--     planos, no anidados. Deciden desde cuando un servicio retiene un RECURSO
--     segun `recurso_fase`, que es otra regla y no va por esta costura (van con
--     el paso 5). El patron exige que el segundo argumento sea a su vez un
--     `coalesce(`, asi que no casan.
--
-- DOS NIVELES, PORQUE HAY DOS COSAS DISTINTAS
--
--   bloqueante  el predicado pegado a un `<` o un `>` por cualquiera de los dos
--               lados: eso es DECIDIR si dos tramos se pisan. Es lo que retiro
--               el paso 1 y lo que no puede volver. (`=` a secas no cuenta: una
--               igualdad no decide un solape. Y la rama izquierda exige que el
--               operador no venga precedido de `=`, para no tomar por
--               comparacion el `=>` de `make_interval(mins => ...)`.)
--   aviso       el predicado en cualquier otro contexto: no decide ocupacion,
--               pero deriva a mano el borde del reposo. Hoy son
--               `disponibilidad_publica` y `disponibilidad_publica_cadena`, que
--               restan esa marca del slot para calcular `reposo_disponible_min`
--               ("te caben N minutos aqui"). Con reposos multiples daran el
--               borde del PRIMER reposo y se quedaran cortas. No se arregla
--               aqui: necesita otra forma (el inicio de la siguiente ventana
--               activa) y le toca al paso 5, medido como se midio el paso 1.
--
-- EL VIGILANTE NO PUEDE QUEDARSE CIEGO EN VERDE
--
-- Esta comprobacion es NEGATIVA: busca algo malo y espera no encontrarlo. Ese
-- es justo el tipo de vigilante que se pudre solo, porque un patron roto y un
-- sistema sano dan el mismo cero. Por eso lleva tres controles POSITIVOS que,
-- si fallan, emiten un bloqueante propio (`bd/ocupacion-vigilante-ciego`) en
-- lugar de un verde:
--   1. una muestra con el predicado retirado TIENE que casar el patron,
--   2. la forma canonica (`p_`) y la plana de tres argumentos NO pueden casarlo,
--   3. `public.ventanas_activas_cita` tiene que seguir existiendo y conservando
--      su forma canonica -- si la costura desaparece, no hay nada a lo que
--      llevar a las funciones y el resto de la comprobacion no significa nada.
-- Esas muestras de control viven en el cuerpo de `vigilancia_bd()`, asi que la
-- funcion se excluye a si misma del recorrido (igual que hace la comprobacion 1
-- con el Vault).
--
-- POR QUE UN PARCHE POR ANCLA Y NO UN `CREATE OR REPLACE` ENTERO
--
-- Mismo motivo que en 20260829092248 y 20260829092623, que anadieron asi las
-- comprobaciones 10 y 11: se parchea LO QUE CORRE, no lo que dice el repo. Una
-- funcion se reescribe desde el editor SQL del dashboard sin dejar rastro en
-- `schema_migrations` -- asi se descubrio el 30 ago que el guarda de identidad
-- desplegado no era el del repo. Reconstruir `vigilancia_bd()` entera desde el
-- fichero se llevaria por delante cualquier comprobacion que se le haya anadido
-- por fuera. El ancla es la cola de la comprobacion 12
-- (20260830155347_gate_suscripcion_triggers_y_portal.sql, aplicada). Si ese
-- bloque se reescribe, esto falla A GRITOS en vez de dejar la 13 fuera en
-- silencio.

do $mig$
declare
  v_def   text;
  v_ancla text :=
'  from tablas_negocio tn
  left join con_trigger ct on ct.table_name = tn.table_name
  where ct.table_name is null;';
  v_bloque text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'vigilancia_bd';

  if v_def is null then
    raise exception 'public.vigilancia_bd() no existe: la capa 2 no esta instalada';
  end if;

  -- Idempotencia: reaplicar esto no puede duplicar la comprobacion.
  if position('bd/ocupacion-a-mano' in v_def) > 0 then
    raise notice 'La comprobacion 13 ya esta en vigilancia_bd(): no se toca nada';
    return;
  end if;

  if position(v_ancla in v_def) = 0 then
    raise exception 'No se encuentra el ancla de la comprobacion 12 en vigilancia_bd(). Su cuerpo desplegado ya no es el de 20260830155347: mirarlo a mano antes de insistir, NO reconstruir la funcion desde el repo.';
  end if;

  v_bloque := v_ancla || $bloque$

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
  end;$bloque$;

  execute replace(v_def, v_ancla, v_bloque);
  raise notice 'Comprobacion 13 anadida a vigilancia_bd()';
end;
$mig$;


-- ── Prueba de vida ──────────────────────────────────────────────────────────
-- Que la comprobacion corre NO es que sirva. Se le pone delante una funcion
-- senuelo con el predicado retirado y un alias que no es `c` --`cit`, para
-- probar justo lo que se le escapaba a la comprobacion final del paso 1-- y se
-- exige que la vea. Luego se retira. Si algo falla, la excepcion tumba la
-- migracion entera y el senuelo se va con ella: no se instala un vigilante que
-- no ha demostrado ver.
do $test$
declare
  v_antes int;
  v_con_senuelo int;
  v_avisos int;
  v_ciego int;
begin
  -- vigilancia_bd() exige staff o service_role. En una migracion no hay JWT, asi
  -- que se declara el rol para esta transaccion y solo para ella.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Una sola llamada: vigilancia_bd() tarda ~1,3 s y el vigilante de rendimiento
  -- ya la tiene fichada.
  select
    count(*) filter (where clave like 'bd/ocupacion-a-mano:%'),
    count(*) filter (where clave like 'bd/ocupacion-borde-a-mano:%'),
    count(*) filter (where clave = 'bd/ocupacion-vigilante-ciego')
  into v_antes, v_avisos, v_ciego
  from public.vigilancia_bd();

  if v_ciego > 0 then
    raise exception 'Los controles positivos de la comprobacion 13 fallan nada mas instalarla';
  end if;

  raise notice 'Estado de hoy: % bloqueante(s) de ocupacion, % aviso(s) de borde', v_antes, v_avisos;

  create function public.senuelo_ocupacion_a_mano(p_desde timestamptz, p_hasta timestamptz)
  returns boolean language sql stable as $senuelo$
    select exists (
      select 1 from public.citas cit
      where cit.estado in ('pendiente','confirmada')
        and (
          (cit.inicio < p_hasta and coalesce(cit.fin_activa, cit.fin) > p_desde)
          or
          (coalesce(cit.fin_espera, coalesce(cit.fin_activa, cit.fin)) < cit.fin
           and coalesce(cit.fin_espera, coalesce(cit.fin_activa, cit.fin)) < p_hasta
           and cit.fin > p_desde)
        )
    );
  $senuelo$;

  select count(*) into v_con_senuelo
  from public.vigilancia_bd() where clave = 'bd/ocupacion-a-mano:senuelo_ocupacion_a_mano';

  drop function public.senuelo_ocupacion_a_mano(timestamptz, timestamptz);

  if v_con_senuelo <> 1 then
    raise exception 'La comprobacion 13 NO ve una funcion con el predicado inline y alias "cit" (esperado 1 hallazgo, obtenido %). El patron no vale: arreglarlo antes de instalarlo, o quedaria un cero que no significa nada.', v_con_senuelo;
  end if;

  raise notice 'Prueba de vida OK: la comprobacion 13 caza el predicado inline con alias distinto de c';
end;
$test$;
