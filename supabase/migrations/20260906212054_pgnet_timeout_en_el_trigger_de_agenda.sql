-- El mismo agujero, pero en un trigger: agenda_ojos_notify tampoco pone plazo.
--
-- La migracion anterior (20260906211058) puso presupuesto explicito a los cinco
-- CRONS que llaman a edge functions. Al barrer despues por `pg_proc` --que es lo
-- que habia que haber hecho desde el principio, porque el agujero no es de los
-- crons sino de CUALQUIERA que llame a net.http_post-- aparecieron tres
-- funciones mas:
--
--   public.chispa_tts_keepwarm   YA pasaba timeout_milliseconds. Bien.
--   public.vigilancia_bd         falso positivo del grep: la cadena
--                                'net.http_post' esta en el TEXTO de la
--                                comprobacion 11, no en una llamada.
--   public.agenda_ojos_notify    llama a agenda-optimizador SIN plazo. Esta.
--
-- Y no la habria cazado el regex de la migracion anterior aunque se le hubiera
-- pasado: aquel se anclaba en `::jsonb );` y aqui el cuerpo se construye con
-- `jsonb_build_object(...)`. Dos formas de escribir lo mismo, un ancla que solo
-- conocia una. Anotado porque es el modo tipico en que un barrido se cree
-- completo.
--
-- POR QUE IMPORTA MENOS QUE EL CRON, Y AUN ASI IMPORTA
-- La llamada ya esta envuelta en `begin ... exception when others then null; end`,
-- asi que un fallo del aviso no puede tumbar la escritura del salon --eso estaba
-- bien pensado-- y hay un limitador de 60 s por negocio en agenda_ojos_latido.
-- Pero el trigger corre en HORARIO DE TRABAJO, cada vez que alguien toca la
-- agenda, y con el default de 5000 ms sus avisos entran en la misma loteria:
-- se pierden a la mitad y quedan en net._http_response como `status_code` NULL,
-- indistinguibles de un fallo de verdad. Hoy no se ven en la ventana de 6 h
-- porque de noche nadie toca la agenda; manana por la manana vuelven.
--
-- 30 s, el mismo presupuesto que vigilar-agenda: es el mismo tipo de trabajo
-- (analisis de la agenda de un salon) y el limitador ya impide que se dispare
-- mas de una vez por minuto y negocio.
--
-- SE INYECTA, NO SE REESCRIBE. Este cuerpo tiene historia: aqui vivio el bug del
-- 29 ago que leia `new.negocio_id` sobre `horarios_profesional` --una tabla que
-- no tiene esa columna-- y lanzaba 42703 tumbando TODA escritura de horarios.
-- Se arreglo leyendo la fila como jsonb. Volver a teclear el cuerpo para meter
-- un parametro es arriesgarse a deshacer eso sin querer. Asi que se toma la
-- definicion VIVA, se le añade el parametro y se comprueba que quitandolo otra
-- vez se recupera la original caracter a caracter. Si no cuadra, aborta.

do $mig$
declare
  v_def   text;
  v_nuevo text;
  v_ctrl  text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'agenda_ojos_notify';

  if v_def is null then
    raise exception 'public.agenda_ojos_notify() no existe: mirar antes de seguir';
  end if;

  -- Idempotencia.
  if v_def ilike '%timeout_milliseconds%' then
    raise notice 'agenda_ojos_notify ya tiene presupuesto explicito: no se toca';
    return;
  end if;

  v_nuevo := regexp_replace(
    v_def,
    $pat$('negocio_id', v_negocio\))(\s*)\);$pat$,
    $rep$\1,
      timeout_milliseconds := 30000
    );$rep$
  );

  if v_nuevo = v_def then
    raise exception 'No se encuentra la llamada a net.http_post en agenda_ojos_notify con la forma esperada. Su cuerpo desplegado ya no es el que describe esta migracion: mirarlo a mano, NO reconstruirlo de memoria.';
  end if;

  -- Quitar lo inyectado tiene que devolver el original, salvo espacios.
  v_ctrl := regexp_replace(v_nuevo, ',\s*timeout_milliseconds\s*:=\s*[0-9]+', '', 'g');
  if regexp_replace(v_ctrl, '\s+', '', 'g') is distinct from regexp_replace(v_def, '\s+', '', 'g') then
    raise exception 'La inyeccion ha cambiado algo mas del cuerpo de agenda_ojos_notify. Abortado: este trigger decide si se puede escribir en la agenda.';
  end if;

  execute v_nuevo;
  raise notice 'agenda_ojos_notify: timeout_milliseconds := 30000';
end
$mig$;

-- ── Comprobacion del INVARIANTE COMPLETO ────────────────────────────────────
-- No "los crons" ni "las funciones": TODO el que llame a net.http_post tiene que
-- decir cuanto espera. Esta es la comprobacion que, de haber existido, habria
-- hecho innecesarias las dos migraciones -- y la que hay que copiar a
-- vigilancia_bd() si esto se repite.
do $check$
declare
  v_crons     text;
  v_funciones text;
begin
  select string_agg(jobname, ', ' order by jobid) into v_crons
  from cron.job
  where command ilike '%net.http_post%'
    and command not ilike '%timeout_milliseconds%';

  select string_agg(n.nspname||'.'||p.proname, ', ' order by p.proname) into v_funciones
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema','net','cron','extensions')
    -- vigilancia_bd solo NOMBRA net.http_post en el texto de su comprobacion 11.
    and p.proname <> 'vigilancia_bd'
    and coalesce(p.prosrc,'') ilike '%net.http_post%'
    and coalesce(p.prosrc,'') not ilike '%timeout_milliseconds%';

  if v_crons is not null or v_funciones is not null then
    raise exception 'Siguen llamando a net.http_post sin plazo -- crons: [%], funciones: [%]. Con el default de 5000 ms vuelven los latidos perdidos.',
      coalesce(v_crons,'ninguno'), coalesce(v_funciones,'ninguna');
  end if;

  raise notice 'Todo llamador de net.http_post tiene presupuesto explicito: % cron(s) y % funcion(es)',
    (select count(*) from cron.job where command ilike '%net.http_post%'),
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname <> 'vigilancia_bd'
        and coalesce(p.prosrc,'') ilike '%net.http_post%');
end
$check$;
