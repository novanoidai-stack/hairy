-- Los crons daban por bueno un presupuesto de 5 s que nadie eligio.
--
-- EL SINTOMA
-- `vigilancia_bd()` comprobacion 11 (bd/pgnet-latidos-perdidos) llevaba en
-- BLOQUEANTE: "pg_net pierde el 54 % de las llamadas". En 6 h: 24 respuestas,
-- 13 sin llegar (`status_code` NULL), 0 con error HTTP.
--
-- LO QUE NO ERA
-- No se pierden. `net._http_response.error_msg` lo dice entero:
--
--   Timeout of 5000 ms reached. Total time: 5002.02 ms
--   (DNS 148.7 ms, TCP/SSL handshake 51.7 ms, HTTP Request/Response 4798.8 ms)
--
-- O sea: la peticion sale, el DNS resuelve, el TLS negocia y la funcion recibe.
-- Lo que pasa es que tarda mas de 5 s en contestar y pg_net deja de esperar.
--
-- LA CAUSA RAIZ, Y ES UNA IRONIA
-- `net.http_post` declara `timeout_milliseconds integer DEFAULT 5000`. **Los
-- cinco crons que llaman a edge functions lo omiten**, asi que los cinco corren
-- con ese default. Nadie decidio 5 s: es el valor de fabrica de la libreria.
--
-- Y 5 s bastaban de sobra... mientras el cron no hiciera nada. El job
-- `vigilar-agenda` nacio apuntando a un tenant de pruebas VACIO
-- (`body := {'negocio_id':'prueba_46980'}`): contestaba al instante. El 29 ago
-- 2026, la migracion 20260829091811 le devolvio el alcance que se le habia
-- pedido --`body := '{}'`, o sea TODA la cartera-- porque llevaba 4.144
-- ejecuciones en verde vigilando un salon vacio. Ese arreglo multiplico el
-- trabajo por salon y nadie toco el presupuesto.
--
-- **El arreglo que le dio algo que mirar es el que lo puso por encima del
-- timeout.** No es un fallo del arreglo: es que el presupuesto nunca se eligio,
-- y un default solo es correcto por accidente.
--
-- MEDIDO EL 6 SEP 2026, no deducido:
--   * Llamando a la funcion a mano: 5.543 ms en frio, 1.117 / 1.208 / 2.177 ms
--     en caliente. El cron corre cada 15 min, asi que SIEMPRE arranca en frio.
--   * `function_edge_logs`, 6 h de ejecuciones reales: 2.445, 2.545, 2.564,
--     2.749, 2.806, 2.976, 3.299, 3.365, 3.486, 3.691, 4.279, 4.943, 4.968,
--     5.226, 5.684, 5.847, 5.913, 5.956, 6.214, 6.583, 6.850, 7.485, 7.848,
--     7.982, 8.162, 8.657 ms.
-- La mediana cae practicamente ENCIMA de los 5.000 ms. Por eso el fallo es de
-- ~50 % y parece aleatorio: es una moneda al aire contra el umbral.
--
-- EL TRABAJO SI SE HACIA (importa para no exagerar el impacto)
-- pg_net abandona la espera, pero la funcion sigue viva: la plataforma registra
-- ejecuciones completas de 5-8,7 s, y `hallazgos_ia` tiene escrituras a las
-- 21:00, que fue una de las llamadas expiradas. Lo que se perdia no eran los
-- hallazgos: era **poder distinguir un fallo de verdad de un timeout**, porque
-- los dos se guardan igual, como `status_code` NULL. Una vigilancia que no sabe
-- si vigilo es exactamente el canario mudo de la decision 10.
--
-- EL ARREGLO
-- Poner presupuesto explicito a los cinco. No es subir un numero hasta que deje
-- de quejarse: es elegir, por primera vez, cuanto se le concede a cada uno.
--   * vigilar-agenda cada 15 min -> 30 s (3,4x el peor caso medido, 8,7 s). Si
--     algun dia pasa de 30 s hay un problema de verdad, y la siguiente pasada
--     entra en 15 min de todas formas.
--   * los otros cuatro, diarios o mensuales -> 60 s. Recorren la cartera y
--     mandan correo, que es mas lento y mas variable, y como corren una vez al
--     dia un presupuesto ancho no cuesta nada.
-- pg_net es asincrono: un timeout mas largo no bloquea a nadie, solo mantiene la
-- peticion en vuelo mas tiempo.
--
-- POR QUE SE INYECTA EL PARAMETRO EN VEZ DE REESCRIBIR LOS COMANDOS
-- Reescribir a mano los cinco `net.http_post` significa volver a teclear la URL,
-- el `jsonb_build_object` de cabeceras y las DOS lecturas del vault. Un typo ahi
-- no falla hoy: falla el dia 1 del mes que viene, en el informe mensual, sin que
-- nadie lo vea. Asi que se toma el comando VIVO y se le añade un parametro antes
-- del `);` final, y despues se comprueba que quitandolo otra vez se recupera el
-- comando original caracter a caracter (salvo espacios). Si esa comprobacion no
-- pasa, la migracion aborta: es imposible que este cambio se lleve por delante
-- una URL o una credencial sin que salte.

do $mig$
declare
  r          record;
  v_nuevo    text;
  v_control  text;
  v_ms       integer;
  v_tocados  integer := 0;
  v_saltados integer := 0;
begin
  for r in
    select jobid, jobname, command
    from cron.job
    where command ilike '%net.http_post%'
    order by jobid
  loop
    -- Idempotencia: quien ya tiene presupuesto propio no se toca. Reaplicar esto
    -- no puede acumular parametros ni pisar un valor que alguien haya afinado.
    if r.command ilike '%timeout_milliseconds%' then
      v_saltados := v_saltados + 1;
      continue;
    end if;

    -- vigilar-agenda corre cada 15 min y su peor caso medido es 8,7 s; el resto
    -- son diarios/mensuales, mandan correo y merecen mas margen.
    v_ms := case when r.jobname = 'vigilar-agenda' then 30000 else 60000 end;

    -- El ancla es el cierre de la llamada al FINAL del comando. Anclado a `$`
    -- para que no pueda casar un `::jsonb` de enmedio (los hay: las cabeceras
    -- llevan jsonb_build_object).
    v_nuevo := regexp_replace(
      r.command,
      '::jsonb\s*\)\s*;\s*$',
      '::jsonb,' || E'\n      timeout_milliseconds := ' || v_ms || E'\n    );' || E'\n  '
    );

    if v_nuevo = r.command then
      raise exception 'El comando del job % (%) no acaba en la llamada a net.http_post que se esperaba: no se toca a ciegas. Mirarlo a mano.', r.jobid, r.jobname;
    end if;

    -- La red de seguridad: quitar lo inyectado tiene que devolver el original.
    -- Compara sin espacios porque la inyeccion reindenta la cola.
    v_control := regexp_replace(v_nuevo, ',\s*timeout_milliseconds\s*:=\s*[0-9]+', '', 'g');
    if regexp_replace(v_control, '\s+', '', 'g')
       is distinct from regexp_replace(r.command, '\s+', '', 'g') then
      raise exception 'La inyeccion de timeout_milliseconds ha cambiado algo mas del comando del job % (%). Abortado: aqui viven la URL y dos lecturas del vault.', r.jobid, r.jobname;
    end if;

    perform cron.alter_job(job_id := r.jobid, command := v_nuevo);
    v_tocados := v_tocados + 1;
    raise notice 'job % (%): timeout_milliseconds := % ms', r.jobid, r.jobname, v_ms;
  end loop;

  raise notice 'Crons con presupuesto explicito: % tocados, % ya lo tenian', v_tocados, v_saltados;
end
$mig$;

-- ── Comprobacion posterior ──────────────────────────────────────────────────
-- Que el bucle no lanzara excepcion no prueba que los cinco quedaran bien: si
-- manana alguien crea un cron nuevo copiando uno viejo, vuelve el agujero. Esto
-- exige el estado FINAL, no el recorrido.
do $check$
declare v_sin_timeout text;
begin
  select string_agg(jobname, ', ' order by jobid) into v_sin_timeout
  from cron.job
  where command ilike '%net.http_post%'
    and command not ilike '%timeout_milliseconds%';

  if v_sin_timeout is not null then
    raise exception 'Siguen sin presupuesto explicito: %. Con el default de 5000 ms de pg_net vuelven los latidos perdidos.', v_sin_timeout;
  end if;

  raise notice 'Los % crons con net.http_post llevan timeout explicito',
    (select count(*) from cron.job where command ilike '%net.http_post%');
end
$check$;
