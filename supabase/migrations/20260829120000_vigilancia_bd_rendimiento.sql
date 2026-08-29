-- Familia 3 del plan de fase 2: cuellos de botella de base de datos.
-- Y el origen 'bd' para las corridas programadas de vigilancia_bd().
--
-- QUE ANADE Y POR QUE
--
-- `vigilancia_bd()` vigila la FORMA (RPC sin guard, RLS sin InitPlan, ayudantes
-- volatiles). No vigila la REALIDAD: que consultas son lentas hoy, con datos de
-- produccion. Esto lo mide con pg_stat_statements (ya instalada).
--
-- LOS UMBRALES ESTAN MEDIDOS, NO INVENTADOS (29 ago 2026, 196 min de tiempo
-- acumulado de BD desde el reset de estadisticas del 30 mar):
--
--   > 10 % del tiempo total  -> 1 hallazgo   (notificaciones_pendientes, 15,4 %)
--   > 5 %                    -> 5 hallazgos  (demasiados para estrenar)
--   media > 200 ms y > 100 llamadas -> 3 hallazgos
--   media > 500 ms                  -> 1 hallazgo (se quedaria corto)
--   seq_tup_read > 50 M y > 500 filas -> 2 (clientes y citas)
--
-- DOS DECISIONES DE DISENO QUE NO SON OBVIAS
--
-- 1. SE MIDE EN PROPORCION, NO EN TOTALES ABSOLUTOS. `total_exec_time` es
--    acumulado desde el ultimo reset de estadisticas y solo puede crecer: un
--    umbral tipo "mas de 300 s" acaba saltando SIEMPRE, aunque no haya empeorado
--    nada. Un vigilante montado sobre un contador acumulado se pudre solo. El
--    porcentaje sobre el total del periodo si es estable.
--
-- 2. PARA LOS SEQ SCAN, LO QUE IMPORTA ES seq_tup_read, NO seq_scan. La tabla
--    `servicios` lleva 4.051.129 seq scans... y tiene 181 filas: para una tabla
--    asi Postgres prefiere el scan y hace bien, no falta ningun indice. Contar
--    scans denunciaria la tabla equivocada. `citas`, en cambio, lleva 476
--    MILLONES de filas leidas a 2.363 filas por scan sobre una tabla de 2.001:
--    se lee entera cada vez. Con un salon de verdad eso no escala, y es el mismo
--    patron que el incidente de `is_staff()` volatil (24 M de seq scans sobre
--    `staff`, 456 M de tuplas en `citas`).
--
-- Nivel: `aviso` en todo salvo los locks esperando, que no son deuda sino algo
-- que esta pasando AHORA MISMO.
--
-- TRAMPA YA PISADA: pg_stat_statements NO esta en `public`, esta en el esquema
-- `extensions` (Supabase pone ahi las extensiones). Como esta funcion fija
-- `search_path to 'public'` -- y debe fijarlo, es SECURITY DEFINER --, hay que
-- nombrarla con esquema: `extensions.pg_stat_statements`. Sin eso la funcion se
-- crea sin protestar y revienta en la PRIMERA llamada con
-- `relation "pg_stat_statements" does not exist`. Pasa desapercibido al probarla
-- suelta, porque una sesion normal SI tiene `extensions` en su search_path.

-- 1) El origen propio para las corridas programadas.
--
-- Sin esto, las corridas del workflow tendrian que mezclarse con las de los pull
-- requests bajo 'ci', y nadie podria contestar "¿cuando se vigilo la base por
-- ultima vez?" -- un panel en verde porque nadie esta mirando es peor que uno en
-- rojo, que es justo la razon de que exista la deteccion de canario mudo.
alter table public.vigilancia_ejecuciones
  drop constraint if exists vigilancia_ejecuciones_origen_check;

alter table public.vigilancia_ejecuciones
  add constraint vigilancia_ejecuciones_origen_check
  check (origen = any (array['ci'::text, 'canario'::text, 'local'::text, 'panel'::text, 'bd'::text]));


-- 2) Los cuellos de botella.
create or replace function public.vigilancia_bd_rendimiento()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_ms double precision;
begin
  -- Misma guarda que vigilancia_bd(): staff o service_role. Sin esto, cualquiera
  -- con la publishable key veria el texto de todas las consultas del producto.
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    return query select
      'bd-rendimiento/sin-pg-stat-statements'::text,
      'aviso'::text,
      'rendimiento'::text,
      'pg_stat_statements no esta instalada: no se puede medir nada'::text,
      ('Sin ella este vigilante no ve ninguna consulta y daria verde por ausencia de datos, ' ||
       'que es peor que darlo en rojo. Instalar con: create extension pg_stat_statements;')::text;
    return;
  end if;

  select sum(s.total_exec_time) into v_total_ms from extensions.pg_stat_statements s;
  if coalesce(v_total_ms, 0) = 0 then
    return;  -- estadisticas recien reseteadas: no hay nada que juzgar todavia
  end if;

  -- 2.1 Lo que se come la base de datos. Proporcion, no total (ver cabecera).
  return query
  select
    'bd-rendimiento/glotona:' || coalesce(f.nombre, left(md5(s.query), 8)),
    'aviso',
    'rendimiento',
    coalesce(f.nombre, 'una consulta') || ' se lleva el ' ||
      round((s.total_exec_time / v_total_ms * 100)::numeric, 1) || ' % del tiempo de la base',
    'En ' || s.calls || ' llamadas: ' || round(s.mean_exec_time::numeric, 1) || ' ms de media, ' ||
    'pico de ' || round(s.max_exec_time::numeric, 0) || ' ms, ' ||
    round((s.total_exec_time / 1000)::numeric, 0) || ' s en total. ' ||
    'Se mide en proporcion del periodo a proposito: los totales absolutos solo crecen y ' ||
    'cualquier umbral sobre ellos acabaria saltando siempre. Consulta: ' ||
    left(regexp_replace(s.query, '\s+', ' ', 'g'), 160)
  from extensions.pg_stat_statements s
  left join lateral (
    select coalesce(
      substring(s.query from '"public"\."([a-z_]+)"\s*\('),
      substring(s.query from 'public\.([a-z_]+)\s*\(')
    ) as nombre
  ) f on true
  where s.total_exec_time > 0.10 * v_total_ms
  order by s.total_exec_time desc;

  -- 2.2 Lo que tarda por llamada. Distinto de lo anterior: algo puede ser lento
  -- y no salir arriba porque se llama poco -- y al reves.
  return query
  select
    'bd-rendimiento/lenta:' || coalesce(f.nombre, left(md5(s.query), 8)),
    'aviso',
    'rendimiento',
    coalesce(f.nombre, 'una consulta') || ' tarda ' || round(s.mean_exec_time::numeric, 0) ||
      ' ms de media',
    'Con ' || s.calls || ' llamadas y un pico de ' || round(s.max_exec_time::numeric, 0) ||
    ' ms. Cada persona que abre esa pantalla espera eso. Consulta: ' ||
    left(regexp_replace(s.query, '\s+', ' ', 'g'), 160)
  from extensions.pg_stat_statements s
  left join lateral (
    select coalesce(
      substring(s.query from '"public"\."([a-z_]+)"\s*\('),
      substring(s.query from 'public\.([a-z_]+)\s*\(')
    ) as nombre
  ) f on true
  where s.mean_exec_time > 200 and s.calls > 100
    and s.total_exec_time <= 0.10 * v_total_ms   -- ya la denuncia la regla de arriba
  order by s.mean_exec_time desc;

  -- 2.3 Tablas que se leen enteras una y otra vez. seq_tup_read, no seq_scan
  -- (ver cabecera: `servicios` tiene 4 M de scans y 181 filas, y esta bien asi).
  return query
  select
    'bd-rendimiento/lectura-entera:' || t.relname,
    'aviso',
    'rendimiento',
    'La tabla ' || t.relname || ' se lee entera: ' ||
      round((t.seq_tup_read / 1000000.0)::numeric, 0) || ' M de filas recorridas',
    t.seq_scan || ' recorridos secuenciales que han leido ' || t.seq_tup_read || ' filas (' ||
    round((t.seq_tup_read::numeric / greatest(t.seq_scan, 1)), 0) || ' por recorrido) sobre una ' ||
    'tabla de ' || t.n_live_tup || ' filas, frente a ' || t.idx_scan || ' accesos por indice. ' ||
    'Hoy cuesta poco porque la tabla es pequena; con un salon de verdad esto crece al cuadrado. ' ||
    'Mirar que consulta la recorre y si le falta un indice (o si una politica RLS la obliga).'
  from pg_stat_user_tables t
  where t.seq_tup_read > 50000000 and t.n_live_tup > 500
  order by t.seq_tup_read desc;

  -- 2.4 Lo que esta pasando ahora mismo. Esto no es deuda: es un sintoma en vivo.
  return query
  select
    'bd-rendimiento/locks-esperando',
    'bloqueante',
    'rendimiento',
    count(*) || ' consulta(s) esperando un lock',
    'Alguien esta bloqueado ahora mismo. Si no se despeja solo, hay una transaccion ' ||
    'larga reteniendo un lock: mirar pg_stat_activity ordenado por query_start.'
  from pg_locks
  where not granted
  having count(*) > 0;

end;
$function$;

revoke all on function public.vigilancia_bd_rendimiento() from public;
revoke all on function public.vigilancia_bd_rendimiento() from anon;
grant execute on function public.vigilancia_bd_rendimiento() to authenticated;

comment on function public.vigilancia_bd_rendimiento() is
  'Familia 3 de los vigilantes: cuellos de botella medidos con pg_stat_statements. '
  'Umbrales calibrados contra produccion el 29 ago 2026. Solo staff o service_role.';


-- 3) La guardia de migraciones: que ficheros del repo NO constan aplicados.
--
-- POR QUE ES UNA RPC Y NO UNA CONSULTA DESDE LA EDGE FUNCTION
-- El esquema `supabase_migrations` no esta expuesto por PostgREST (comprobado:
-- `anon` no tiene ni USAGE sobre el), asi que un `.schema('supabase_migrations')`
-- desde supabase-js falla. Metiendo la consulta aqui, ademas, el SQL queda donde
-- se revisa -- en la migracion -- y no escondido dentro de una edge function.
--
-- OJO: que una version no conste NO significa que no se haya aplicado. Lo que se
-- aplica por el editor SQL del dashboard no deja registro. El 29 ago 2026 habia
-- dos asi y su efecto SI estaba en produccion, asi que quien llama pasa su lista
-- de exenciones (congelada en scripts/vigilantes/migraciones-conocidas.json, con
-- la prueba de cada una).
create or replace function public.migraciones_sin_aplicar(p_versiones text[])
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_faltan text[];
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  select coalesce(array_agg(v order by v), '{}')
    into v_faltan
  from unnest(coalesce(p_versiones, '{}')) as v
  where not exists (
    select 1 from supabase_migrations.schema_migrations m where m.version = v
  );

  return v_faltan;
end;
$function$;

revoke all on function public.migraciones_sin_aplicar(text[]) from public;
revoke all on function public.migraciones_sin_aplicar(text[]) from anon;
grant execute on function public.migraciones_sin_aplicar(text[]) to authenticated;

comment on function public.migraciones_sin_aplicar(text[]) is
  'Guardia de migraciones: de las versiones que se le pasan, cuales no constan en '
  'supabase_migrations.schema_migrations. Solo staff o service_role.';
