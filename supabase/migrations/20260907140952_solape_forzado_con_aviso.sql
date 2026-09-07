-- SOLAPE FORZADO: el salon puede saltarse el candado, a sabiendas y dejando rastro.
--
-- Peticion 7 de Jose (6 sep 2026): "queremos evitar solapamientos, pero si ellos
-- por lo que sea quieren un solapamiento por la razon que sea, pues debemos de
-- dejarles, pero con un aviso bien claro y fuerte".
--
-- POR QUE NO SE PODIA ANTES
-- El candado no es una validacion de formulario que se salte con un `if`: es una
-- EXCLUDE USING gist, y Postgres rechaza el INSERT con 23P01 antes de que ningun
-- codigo nuestro opine. Se ha roto y re-arreglado TRES veces en seis dias
-- (20260831220000 -> 20260901153828 -> 20260905233000), asi que abrirlo a mano
-- cada vez que estorbe no es una opcion: hace falta una puerta explicita.
--
-- LA FORMA DE LA PUERTA YA ESTABA INVENTADA DENTRO DEL PROPIO CANDADO
-- Su WHERE ya exime a `grupo_id is not null`: las citas de grupo comparten
-- profesional a proposito y por eso salen del indice. `solape_forzado` es
-- exactamente el mismo mecanismo con otro nombre.
--
-- EL PRECIO, Y HAY QUE ASUMIRLO EXPLICITAMENTE
-- Una fila que sale de un indice PARCIAL no participa en el candado **en ninguna
-- direccion**. Una cita forzada no solo puede solaparse con lo que ya hay:
-- tampoco impide que otra se le ponga encima despues, porque el candado de esa
-- otra no la ve. No hay termino medio -- una EXCLUDE compara filas indexadas
-- contra filas indexadas, y no existe forma de decir "exime solo a este par".
-- "Forzada" significa, literalmente, fuera del candado.
--
-- Por eso la columna NO es un ajuste que se deje puesto: se marca cita a cita,
-- cada una es una decision, y cada una deja un evento.
--
-- QUIEN PUEDE FORZAR: cualquiera que pueda crear la cita.
-- Jose lo pidio asi con todas las letras ("si el profesional tiene, por la razon
-- que sea, que hacer un solapamiento forzado, la aplicacion debe de dejarle").
-- No se mete gate de rol: el control es el aviso y el rastro, no el permiso.

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------

alter table public.citas
  add column if not exists solape_forzado boolean not null default false;

comment on column public.citas.solape_forzado is
  'true = esta cita se creo pisando a otra a proposito, con el aviso aceptado. La saca del indice parcial de citas_solape_profesional_excl, y eso vale en LAS DOS DIRECCIONES: ni choca con lo que hay, ni impide que le pongan otra encima despues. No es un ajuste del salon: se marca cita a cita y cada vez deja un evento en eventos_negocio.';

-- ---------------------------------------------------------------------------
-- 2. El candado aprende la excepcion
-- ---------------------------------------------------------------------------
-- Mismo alcance que tenia (20260905233000): misma fecha de corte, misma nocion
-- de ocupado (`ventanas_ocupadas`, que sale de cita_fases), mismas exclusiones.
-- Lo unico que se anade es `solape_forzado is not true`.
--
-- `is not true` y no `= false`: la columna es NOT NULL hoy, pero si alguien la
-- hiciera nullable manana, `null = false` es null y la fila saldria del indice
-- sin que nadie lo pidiera. `is not true` solo deja fuera a las marcadas.

alter table public.citas drop constraint if exists citas_solape_profesional_excl;

alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (
    profesional_id with =,
    ventanas_ocupadas with &&
  )
  where (
    estado <> 'cancelada'
    and grupo_id is null
    and profesional_id is not null
    and solape_forzado is not true
    and inicio >= '2026-08-31 22:00:00+00'::timestamptz
  );

comment on constraint citas_solape_profesional_excl on public.citas is
  'Dos citas del mismo profesional no pueden solapar sus ventanas de TRABAJO. Los reposos no cuentan: encajar otra clienta ahi es el diferencial nº1 del producto. Desde el 5 sep 2026 la ocupacion sale de citas.ventanas_ocupadas (via cita_fases), asi que vale para cualquier numero de reposos. Desde el 7 sep 2026 exime tambien a las citas con solape_forzado: el salon puede pisar a proposito, con aviso y dejando rastro.';

-- ---------------------------------------------------------------------------
-- 3. El rastro
-- ---------------------------------------------------------------------------
-- Un solape forzado es una decision de negocio, no un detalle tecnico: manana
-- alguien preguntara por que dos clientas coincidieron. Sin esto, la unica
-- prueba seria un booleano sin fecha ni autor.
--
-- AFTER y no BEFORE: solo interesa lo que llego a guardarse de verdad.

create or replace function public.citas_registrar_solape_forzado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text;
begin
  -- Solo el flanco de subida: marcar dos veces la misma cita no son dos eventos.
  if new.solape_forzado is not true then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.solape_forzado is true then
    return null;
  end if;

  -- auth.uid() es null en llamadas internas (cron, service_role, portal): ahi el
  -- actor es 'sistema' y no se pierde el evento por no saber quien fue.
  v_actor := coalesce((select auth.uid())::text, 'sistema');

  insert into public.eventos_negocio (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos)
  values (
    new.negocio_id,
    'solape_forzado',
    'citas',
    new.id::text,
    v_actor,
    'Cita creada pisando a otra a proposito',
    jsonb_build_object(
      'cita_id',        new.id,
      'profesional_id', new.profesional_id,
      'inicio',         new.inicio,
      'fin',            new.fin,
      'operacion',      tg_op
    )
  );
  return null;
end;
$function$;

comment on function public.citas_registrar_solape_forzado() is
  'Deja un evento en eventos_negocio cada vez que una cita pasa a solape_forzado. Solo el flanco de subida: re-guardar una cita ya forzada no repite el evento.';

drop trigger if exists trg_citas_registrar_solape_forzado on public.citas;
create trigger trg_citas_registrar_solape_forzado
  after insert or update of solape_forzado on public.citas
  for each row execute function public.citas_registrar_solape_forzado();

-- ---------------------------------------------------------------------------
-- 4. El vigilante aprende a distinguir "se colo" de "lo forzamos"
-- ---------------------------------------------------------------------------
-- Sin esto, cada solape deliberado saldria como BLOQUEANTE en el vector 1b y la
-- CI se pondria roja por usar una funcion que acabamos de construir. Es
-- exactamente el ruido que el bloque D vino a quitar: un aviso que grita por algo
-- correcto es un aviso que se deja de mirar.
--
-- Se reescribe la funcion ENTERA a proposito (no se parchea por ancla): es la
-- unica forma de que el .sql del repo sea lo que corre de verdad. La version de
-- partida es la desplegada tras 20260906205757, leida con pg_get_functiondef().
--
-- CAMBIOS respecto a esa version, y solo estos tres:
--   * control 5 en 1a: el candado tiene que seguir eximiendo a los forzados. Si
--     alguien quita esa condicion, forzar deja de funcionar y el usuario recibe
--     un 23P01 sin explicacion. Un control positivo mas, en la linea del bloque D.
--   * 1b deja fuera los pares donde alguna de las dos esta forzada.
--   * 1d nuevo: los forzados, en aviso, para que se VEAN sin tumbar nada.

create or replace function public.vigilancia_bd_invariantes()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      ) AS todas_selladas,
      -- Control 5 (7 sep 2026). El candado tiene que seguir eximiendo a las
      -- citas forzadas. Si alguien quita esa condicion del WHERE, "forzar" deja
      -- de funcionar: el usuario acepta el aviso y recibe igualmente un 23P01
      -- que lib/errores.ts traduce como "elige otro hueco". Un fallo mudo del
      -- lado de la UI, invisible desde la base.
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

  -- 1b. Solapes VIVOS: a partir del corte manda el candado, asi que un solape
  -- aqui es una doble reserva que se ha colado. Basta con que UNA de las dos sea
  -- posterior al corte: el par "a caballo" (una cita de agosto y una de hoy) el
  -- candado no lo puede rechazar --la vieja no esta en su indice parcial-- y es
  -- justo el hueco que el vigilante tiene que cubrir.
  --
  -- Desde el 7 sep quedan fuera los pares con alguna cita forzada: esos son
  -- deliberados y salen en 1d. Si entraran aqui, usar una funcion del producto
  -- pondria la CI en rojo.
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

  -- 1d. Solapes DELIBERADOS (7 sep 2026). No son un fallo -- el salon los pidio,
  -- acepto el aviso y quedo el evento -- pero tienen que VERSE: son el unico sitio
  -- del producto donde dos clientas comparten profesional a la misma hora sin que
  -- nadie lo impida, y si un dia aparecen a cientos es que el aviso no esta
  -- avisando o que alguien automatizo el forzado.
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
