CREATE OR REPLACE FUNCTION public.vigilancia_bd_rendimiento()
 RETURNS TABLE(clave text, nivel text, ambito text, titulo text, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_ms double precision;
  v_desde timestamptz;
  v_dias double precision;
begin
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
    return;
  end if;

  select coalesce(
           (select d.stats_reset from pg_stat_database d where d.datname = current_database()),
           pg_postmaster_start_time())
    into v_desde;
  v_dias := greatest(extract(epoch from (now() - v_desde)) / 86400.0, 1.0);

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
    and s.query ~* '\mpublic\M'
  order by s.mean_exec_time desc;

  return query
  select
    'bd-rendimiento/lectura-entera:' || t.relname,
    'aviso',
    'rendimiento',
    'La tabla ' || t.relname || ' se lee entera: ' ||
      round((t.seq_tup_read / v_dias / 1000000.0)::numeric, 1) || ' M de filas al dia',
    t.seq_scan || ' recorridos secuenciales que han leido ' || t.seq_tup_read || ' filas (' ||
    round((t.seq_tup_read::numeric / greatest(t.seq_scan, 1)), 0) || ' por recorrido) sobre una ' ||
    'tabla de ' || t.n_live_tup || ' filas, frente a ' || t.idx_scan || ' accesos por indice, ' ||
    'en los ' || round(v_dias::numeric, 0) || ' dias que llevan contando desde ' ||
    to_char(v_desde, 'DD/MM/YYYY') || '. ' ||
    'Hoy cuesta poco porque la tabla es pequena; con un salon de verdad esto crece al cuadrado. ' ||
    'Mirar que consulta la recorre y si le falta un indice (o si una politica RLS la obliga).'
  from pg_stat_user_tables t
  where t.seq_tup_read / v_dias > 50000000 and t.n_live_tup > 500
  order by t.seq_tup_read desc;

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
$function$
