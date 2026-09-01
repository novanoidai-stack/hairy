-- Spec 1, paso 1: llevar las funciones que deciden ocupacion a la costura.
--
-- QUE HACE Y QUE NO
--
-- Sustituye el predicado de solape escrito a mano dentro de 8 funciones por una
-- llamada a `public.ventanas_activas_cita()`, que ya existe desde el 31 ago y hoy
-- solo usan dos funciones. **No cambia el comportamiento**: con una cita de un
-- solo reposo la costura devuelve exactamente los mismos tramos que el SQL inline.
--
-- Es el paso previo de la spec 1 (reposos multiples). El dia que
-- `ventanas_activas_cita` sepa leer `cita_fases`, estas 8 se vuelven multi-fase a
-- la vez, sin volver a tocarlas.
--
-- LA EQUIVALENCIA ESTA MEDIDA, NO SUPUESTA
--
-- El predicado inline era:
--
--   (c.inicio < HASTA and coalesce(c.fin_activa, c.fin) > DESDE)
--   or (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
--       and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < HASTA
--       and c.fin > DESDE)
--
-- que es, termino a termino, "¿alguna ventana de `ventanas_activas_cita` corta
-- [DESDE, HASTA)?". Comprobado sobre 763.476 comparaciones -- las 2.051 citas
-- reales mas una matriz sintetica de 35 combinaciones de NULL y de orden entre
-- las cuatro marcas, cruzadas con 61 desplazamientos y 6 duraciones: **0
-- discrepancias**. La matriz sintetica hace falta porque en produccion no hay ni
-- una cita con `fin_activa` o `fin_espera` a NULL, y ese es justo el caso que se
-- lee al reves (sin `fin_espera` NO hay reposo: la cita ocupa entera).
--
-- Y de extremo a extremo: `disponibilidad_publica` contra una copia con la
-- costura, mismos datos y mismo instante, 4 salones x sus servicios reservables
-- x 14 dias = 1.876 casos, 110.815 huecos. `except all` en los dos sentidos: 0.
--
-- POR QUE `cross join lateral` Y NO UN AYUDANTE BOOLEANO
--
-- Envolver la costura en un `cita_ocupa_ventana(...) -> boolean` queda mas
-- limpio y es una trampa de rendimiento: Postgres no puede inlinear una funcion
-- escalar cuyo cuerpo es un `EXISTS (SELECT ... FROM <funcion de conjunto>)`, asi
-- que el plan deja la llamada opaca en el `Join Filter` y se evalua por fila.
-- Medido sobre `salon_pruebas_mecha`, 14 dias de slots: **15 ms con el lateral,
-- 883 ms con el booleano (59x)**. Con el lateral, en cambio, la funcion SI se
-- inlinea y el plan sale `Hash Anti Join`. No cambiar esta forma.
--
-- POR QUE UN PARCHE POR ANCLA Y NO UN `CREATE OR REPLACE` ENTERO
--
-- Mismo motivo que en 20260831205630: se parchea **lo que corre**, no lo que dice
-- el repo. `crear_cita_publica` tiene 10 definiciones repartidas por migraciones y
-- `archive/migraciones-legacy/`, y varias de estas funciones se han retocado
-- despues de su ultima migracion versionada. Reconstruirlas enteras es como se
-- revierte un hotfix sin que nadie se entere -- que es exactamente el fallo que ya
-- costo una caida aqui. Se toca el trozo exacto y **se exige que el ancla exista**:
-- si el texto cambio, esto falla a gritos en vez de aplicarse a medias.
--
-- ALCANCE: 8 FUNCIONES, NO 20
--
-- El plan (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §5) contaba 20
-- funciones en el "grupo A". Contadas una a una, las que **deciden ocupacion con
-- el predicado inline** son 8; `crear_serie_citas` ya estaba en la costura. Las
-- otras 11 mencionan `fin_espera` sin decidir nada: `asignar_candidato_hueco` y
-- `_lista_espera_ofrecer` la nombran en la lista de columnas de un INSERT,
-- `responder_propuesta_cambio` desplaza las cuatro marcas por un delta,
-- `revisar_hueco_lista_espera` las recibe como parametros y no consulta `citas`,
-- y `procesar_lista_espera` es la maquina de estados de las ofertas.
--
-- Aparte quedan `recurso_tramo_de_cita` y `recursos_ocupados_negocio`: esas SI
-- deciden, pero **otra cosa** -- desde cuando un servicio retiene un recurso,
-- segun `recurso_fase`, que no es la regla de ocupacion del profesional. Meterlas
-- por esta costura seria cambiarles el significado. Van con el paso 5.

do $mig$
declare
  v_caso    jsonb;
  v_def     text;
  v_nuevo   text;
  v_hechas  int := 0;
  -- Las cuatro de disponibilidad comparten dos formas exactas (con y sin sangria
  -- extra); las cuatro de escritura tienen cada una la suya.
  v_casos   jsonb := jsonb_build_array(
    jsonb_build_object('fn', 'disponibilidad_publica',        'viejo', $a$      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
           and c.fin > gen.slot_tz)
        )$a$, 'nuevo', $b$      select 1 from public.citas c
      cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and v.desde < gen.slot_tz + make_interval(mins => gen.total)
        and v.hasta > gen.slot_tz$b$),

    jsonb_build_object('fn', 'portal_dias_disponibles',       'viejo', $a$      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
           and c.fin > gen.slot_tz)
        )$a$, 'nuevo', $b$      select 1 from public.citas c
      cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and v.desde < gen.slot_tz + make_interval(mins => gen.total)
        and v.hasta > gen.slot_tz$b$),

    jsonb_build_object('fn', 'disponibilidad_publica_cadena', 'viejo', $a$       select 1 from public.citas c
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and (
            (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
            or
            (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
             and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
             and c.fin > gen.slot_tz)
          )$a$, 'nuevo', $b$       select 1 from public.citas c
       cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and v.desde < gen.slot_tz + make_interval(mins => gen.total)
          and v.hasta > gen.slot_tz$b$),

    jsonb_build_object('fn', 'portal_dias_disponibles_cadena','viejo', $a$       select 1 from public.citas c
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and (
            (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
             and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
            or
            (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
             and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
             and c.fin > gen.slot_tz)
          )$a$, 'nuevo', $b$       select 1 from public.citas c
       cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
        where c.profesional_id = gen.profesional_id
          and c.estado in ('pendiente','confirmada')
          and v.desde < gen.slot_tz + make_interval(mins => gen.total)
          and v.hasta > gen.slot_tz$b$),

    jsonb_build_object('fn', 'crear_cita_publica',            'viejo', $a$    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_inicio)
      )$a$, 'nuevo', $b$    select 1 from public.citas c
    cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and v.desde < v_fin
      and v.hasta > p_inicio$b$),

    jsonb_build_object('fn', 'crear_cita_publica_cadena',     'viejo', $a$      select 1 from public.citas c
       where c.profesional_id = p_profesional_id
         and c.estado in ('pendiente','confirmada')
         and (
           (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > v_cursor)
           or (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
               and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
               and c.fin > v_cursor)
         )$a$, 'nuevo', $b$      select 1 from public.citas c
       cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
       where c.profesional_id = p_profesional_id
         and c.estado in ('pendiente','confirmada')
         and v.desde < v_fin
         and v.hasta > v_cursor$b$),

    jsonb_build_object('fn', 'crear_cita_publica_grupo',      'viejo', $a$      select 1 from public.citas c
      where c.profesional_id = v_prof_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
           and c.fin > p_inicio)
        )$a$, 'nuevo', $b$      select 1 from public.citas c
      cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
      where c.profesional_id = v_prof_id
        and c.estado in ('pendiente','confirmada')
        and v.desde < v_fin
        and v.hasta > p_inicio$b$),

    jsonb_build_object('fn', 'modificar_cita_publica',        'viejo', $a$    select 1 from public.citas c
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_nuevo_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_nuevo_inicio)
      )$a$, 'nuevo', $b$    select 1 from public.citas c
    cross join lateral public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin) v
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and v.desde < v_fin
      and v.hasta > p_nuevo_inicio$b$)
  );
begin
  for v_caso in select * from jsonb_array_elements(v_casos) loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = (v_caso->>'fn');

    if v_def is null then
      raise exception 'La funcion public.%() no existe: el censo del paso 1 esta mal', v_caso->>'fn';
    end if;

    -- Un ancla perdida es un hallazgo, no un verde.
    if position((v_caso->>'viejo') in v_def) = 0 then
      raise exception 'Ancla no encontrada en public.%(): su cuerpo desplegado ya no es el medido el 1 sep 2026. Revisar a mano antes de insistir.', v_caso->>'fn';
    end if;

    v_nuevo := replace(v_def, v_caso->>'viejo', v_caso->>'nuevo');

    if v_nuevo = v_def then
      raise exception 'El reemplazo en public.%() no cambio nada', v_caso->>'fn';
    end if;
    if position('coalesce(c.fin_espera' in v_nuevo) > 0 then
      raise exception 'Queda predicado inline en public.%() despues del parche', v_caso->>'fn';
    end if;
    if position('ventanas_activas_cita' in v_nuevo) = 0 then
      raise exception 'public.%() no quedo enganchada a la costura', v_caso->>'fn';
    end if;

    execute v_nuevo;
    v_hechas := v_hechas + 1;
  end loop;

  if v_hechas <> 8 then
    raise exception 'Se esperaban 8 funciones migradas, se migraron %', v_hechas;
  end if;

  raise notice 'Grupo A a la costura: % funciones', v_hechas;
end;
$mig$;

-- Comprobacion final: ninguna funcion de public decide ocupacion con el predicado
-- inline. Si alguien vuelve a escribirlo a mano, esta migracion ya no lo veria --
-- eso lo vigila `vigilancia_bd()`; esto solo cierra el estado de HOY.
do $chk$
declare
  v_quedan text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_quedan
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosrc like '%coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin))%';

  if v_quedan is not null then
    raise exception 'Todavia deciden ocupacion a mano: %', v_quedan;
  end if;
end;
$chk$;
