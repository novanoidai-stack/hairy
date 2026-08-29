-- Capa 2 del diseno de vigilantes: los cuellos de botella de la base.
--
-- APLICADA EN REMOTO el 29 ago 2026 y registrada en schema_migrations, pero el
-- FICHERO no llego al repo: se aplico desde una sesion que no commiteo. Esto es
-- exactamente la deriva que la guardia de migraciones existe para cazar, solo
-- que al reves (aplicado sin fichero en vez de fichero sin aplicar). Se
-- reconstruye aqui LEYENDO pg_get_functiondef() de produccion, no de memoria,
-- para que el repo diga la verdad. Es idempotente: volver a aplicarla no cambia
-- nada.
--
-- DOS DECISIONES DE DISENO QUE NO SON OBVIAS. Van escritas aqui porque quien
-- toque los umbrales sin saberlas los va a romper.
--
-- 1. SE MIDE EN PROPORCION, NO EN TOTALES. `total_exec_time` de
--    pg_stat_statements es acumulado desde el ultimo reset y solo puede crecer.
--    Un umbral tipo "mas de 300 s" acabaria saltando SIEMPRE aunque no empeore
--    nada, y entonces se apaga el vigilante. Un vigilante montado sobre un
--    contador acumulado se pudre solo.
--
-- 2. PARA LOS SEQ SCANS LO QUE IMPORTA ES `seq_tup_read`, NO `seq_scan`. La
--    tabla `servicios` lleva 4 051 129 recorridos secuenciales... y tiene 181
--    filas: para una tabla asi Postgres prefiere el scan y hace bien, no falta
--    ningun indice. Contar scans denunciaria la tabla equivocada y dejaria
--    pasar `citas`, que es la que de verdad no escalara (476 M de filas leidas,
--    2 363 por recorrido sobre 2 001 filas).
--
-- TRAMPA YA PISADA, que costo una llamada fallida: pg_stat_statements vive en
-- el esquema `extensions`, NO en `public`. Como esta funcion es SECURITY
-- DEFINER y fija `search_path to 'public'` (que es lo correcto), hay que
-- nombrarla con esquema. La primera version se creo sin protestar y reventó en
-- la primera llamada con `relation "pg_stat_statements" does not exist`. Pasa
-- desapercibido si se prueba la consulta suelta, porque una sesion normal si
-- tiene `extensions` en su search_path.

-- El origen 'bd' distingue las corridas de la capa 2 de las de un PR. Si se
-- mezclaran con 'ci', nadie podria contestar "cuando se vigilo la base por
-- ultima vez", que es el mismo agujero que tapa la deteccion de canario mudo.
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'vigilancia_ejecuciones'
      and c.conname = 'vigilancia_ejecuciones_origen_check'
      and pg_get_constraintdef(c.oid) like '%''bd''%'
  ) then
    alter table public.vigilancia_ejecuciones
      drop constraint if exists vigilancia_ejecuciones_origen_check;
    alter table public.vigilancia_ejecuciones
      add constraint vigilancia_ejecuciones_origen_check
      check (origen = any (array['ci', 'canario', 'local', 'panel', 'bd']));
  end if;
end $$;

create or replace function public.vigilancia_bd_rendimiento()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_ms double precision;
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- Sin la extension no se ve NADA, y dar verde por ausencia de datos es peor
  -- que dar rojo. Se dice en voz alta, que es la regla del ancla perdida.
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
    return;
  end if;

  -- 1. SE COME LA BASE: mas del 10 % del tiempo total del periodo.
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

  -- 2. LENTA POR LLAMADA: cada persona que abre esa pantalla espera eso.
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
    and s.total_exec_time <= 0.10 * v_total_ms
  order by s.mean_exec_time desc;

  -- 3. SE LEE ENTERA. Ver la decision 2 de la cabecera: seq_tup_read, no seq_scan.
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

  -- 4. ALGUIEN ESPERANDO UN LOCK AHORA MISMO. Lo unico bloqueante de aqui.
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

revoke all on function public.vigilancia_bd_rendimiento() from public, anon;
grant execute on function public.vigilancia_bd_rendimiento() to authenticated, service_role;
