-- ATRIBUCION: que corrida estreno cada hallazgo, y con que commit.
--
-- Familia 11 del plan maestro. Todo lo construido hasta ahora MIDE
-- (rendimiento, errores tragados, cuellos de la base, fallos silenciosos) pero
-- ninguna medida dice DESDE CUANDO. Sin eso cada aviso es un misterio: se sabe
-- que algo va mal y no desde que cambio. Con esto, "hay que refactorizar" se
-- convierte en "mira estas lineas".
--
-- La materia prima ya estaba: vigilancia_ejecuciones guarda commit_sha y rama
-- desde el primer dia. Lo que faltaba era el comparador.
--
-- QUE SE COMPARA, Y POR QUE ASI
-- Cada corrida se compara con la ANTERIOR DEL MISMO ORIGEN. No se mezclan
-- origenes a proposito: `ci` mide un espejo local, `canario` mide produccion y
-- `bd` mide la base. Un hallazgo que aparece en canario y no en ci puede ser
-- perfectamente normal (datos reales frente a datos de demo), asi que cruzarlos
-- inventaria regresiones que no existen.
--
-- LIMITACION HONESTA, y conviene no olvidarla: "la anterior del mismo origen"
-- no es lo mismo que "la ultima verde del padre del merge". Si una rama venia
-- ya rota, el delta le echa la culpa al commit que la midio, no al que la
-- rompio. Para la CI en master --que es donde importa-- las dos cosas
-- coinciden, porque las corridas van en fila. El bisect de verdad (11b) se
-- monta cuando haya serie que bisecar; esto da el 80 % con una decima parte del
-- trabajo.
--
-- El estado se calcula EN VIVO, no se guarda. Guardarlo obligaria a mantenerlo
-- sincronizado, y una columna que miente es peor que una consulta que tarda.

create or replace function public.staff_vigilancia_delta(
  p_origen text default 'ci',
  p_limite integer default 100
)
returns table(
  estado         text,          -- 'nuevo' | 'resuelto' | 'persiste'
  clave          text,
  nivel          text,
  ambito         text,
  titulo         text,
  fichero        text,
  linea          integer,
  commit_actual  text,
  commit_previo  text,
  rama           text,
  cuando         timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actual  bigint;
  v_previo  bigint;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  -- Las dos ultimas corridas de ese origen. Si solo hay una, todo es "nuevo":
  -- es la primera vez que se mira, no una regresion.
  select id into v_actual
    from public.vigilancia_ejecuciones
   where origen = p_origen
   order by creado_en desc
   limit 1;

  if v_actual is null then
    return;
  end if;

  select id into v_previo
    from public.vigilancia_ejecuciones
   where origen = p_origen and id < v_actual
   order by creado_en desc
   limit 1;

  return query
  with act as (
    select h.clave, h.nivel, h.ambito, h.titulo, h.fichero, h.linea
      from public.vigilancia_hallazgos h
     where h.ejecucion_id = v_actual
  ),
  pre as (
    select h.clave
      from public.vigilancia_hallazgos h
     where h.ejecucion_id = coalesce(v_previo, -1)
  ),
  meta as (
    select
      (select e.commit_sha from public.vigilancia_ejecuciones e where e.id = v_actual) as sha_act,
      (select e.commit_sha from public.vigilancia_ejecuciones e where e.id = v_previo) as sha_pre,
      (select e.rama       from public.vigilancia_ejecuciones e where e.id = v_actual) as rama_act,
      (select e.creado_en  from public.vigilancia_ejecuciones e where e.id = v_actual) as cuando_act
  )
  select
    case when p.clave is null then 'nuevo' else 'persiste' end,
    a.clave, a.nivel, a.ambito, a.titulo, a.fichero, a.linea,
    m.sha_act, m.sha_pre, m.rama_act, m.cuando_act
  from act a
  left join pre p on p.clave = a.clave
  cross join meta m

  union all

  -- Lo RESUELTO tambien se cuenta: es la unica forma de saber que un arreglo
  -- funciono, y de bajar una linea base con fundamento en vez de por corazonada.
  select
    'resuelto',
    h.clave, h.nivel, h.ambito, h.titulo, h.fichero, h.linea,
    m.sha_act, m.sha_pre, m.rama_act, m.cuando_act
  from public.vigilancia_hallazgos h
  cross join meta m
  where h.ejecucion_id = v_previo
    and not exists (select 1 from act a where a.clave = h.clave)

  order by 1, 3, 2   -- nuevo primero, y dentro por nivel
  limit greatest(p_limite, 1);
end;
$$;

-- CUANDO SE VIO POR PRIMERA VEZ CADA HALLAZGO VIVO.
-- Complementa al delta: el delta contesta "que ha cambiado ahora", esto
-- contesta "esto que llevo semanas viendo, desde cuando esta". Es lo que
-- convierte una lista de avisos en una lista con culpable.
create or replace function public.staff_vigilancia_origen_hallazgo(
  p_clave text
)
returns table(
  primera_vez   timestamptz,
  commit_sha    text,
  rama          text,
  origen        text,
  veces         bigint,
  ultima_vez    timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    min(e.creado_en),
    -- El commit de la corrida MAS ANTIGUA que lo vio: el sospechoso.
    (array_agg(e.commit_sha order by e.creado_en asc))[1],
    (array_agg(e.rama       order by e.creado_en asc))[1],
    (array_agg(e.origen     order by e.creado_en asc))[1],
    count(*),
    max(e.creado_en)
  from public.vigilancia_hallazgos h
  join public.vigilancia_ejecuciones e on e.id = h.ejecucion_id
  where h.clave = p_clave;
end;
$$;

revoke all on function public.staff_vigilancia_delta(text, integer)        from public, anon;
revoke all on function public.staff_vigilancia_origen_hallazgo(text)       from public, anon;
grant execute on function public.staff_vigilancia_delta(text, integer)     to authenticated;
grant execute on function public.staff_vigilancia_origen_hallazgo(text)    to authenticated;
