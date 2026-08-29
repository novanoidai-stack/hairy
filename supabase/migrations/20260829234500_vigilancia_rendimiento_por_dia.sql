-- vigilancia_bd_rendimiento(): medir el RITMO, no el acumulado de por vida.
--
-- Los dos primeros hallazgos que dio esta funcion en el panel fueron:
--   "La tabla citas se lee entera: 477 M de filas recorridas"
--   "La tabla clientes se lee entera: 72 M de filas recorridas"
-- Las dos frases son ciertas y las dos son inutiles, porque no dicen DESDE
-- CUANDO. Los contadores de pg_stat_user_tables no se reinician: el reloj de
-- este proyecto arranco el 30 mar 2026, asi que esas cifras son **152 dias** de
-- historia. Repartidas: 3,7 M de filas al dia en citas y 0,6 M en clientes. Es
-- decir, nada.
--
-- Peor todavia: buena parte de ese acumulado es la tormenta de sondeos de
-- useAvisos que se arreglo el 29 ago 2026 (decision 7bis de CLAUDE.md, la RPC
-- avisos_del_negocio). El problema ESTABA RESUELTO y el panel lo seguia
-- pintando en rojo -- y lo iba a seguir pintando para siempre, porque un total
-- acumulado no baja nunca. Un vigilante que no puede volver a verde no informa
-- de nada: solo ensena a no mirarlo.
--
-- La comprobacion 1 de esta misma funcion ya avisaba de esta trampa en su
-- propio comentario ("los totales absolutos solo crecen y cualquier umbral
-- sobre ellos acabaria saltando siempre"). La 3 cayo igualmente. Aqui se le
-- aplica la misma medicina: dividir por la ventana real y decir cual es.
--
-- Cambios:
--   2. LENTA POR LLAMADA: deja fuera las consultas que no tocan `public`.
--      Delataba `SELECT name FROM pg_timezone_names` y el catalogo de
--      extensiones -- las dos del panel de Supabase, no del producto -- bajo el
--      titular "cada persona que abre esa pantalla espera eso". No hay tal
--      persona. Todo lo que espera un usuario de verdad pasa por PostgREST o
--      por una RPC nuestra, y las dos nombran `public`. Comprobado contra los
--      tres hallazgos vivos: filtra los dos del dashboard y conserva
--      `resembrar_demo`, que si es nuestro y si es lento.
--   3. SE LEE ENTERA: filas por DIA en vez de filas desde el principio de los
--      tiempos, y la ventana escrita en el propio aviso.

create or replace function public.vigilancia_bd_rendimiento()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total_ms double precision;
  v_desde timestamptz;
  v_dias double precision;
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

  -- Ventana real de los contadores de pg_stat_user_tables. NO es el arranque
  -- del servidor: estas estadisticas sobreviven a los reinicios, asi que el
  -- origen es el ultimo reset de la base (y si nunca lo hubo, el arranque).
  select coalesce(
           (select d.stats_reset from pg_stat_database d where d.datname = current_database()),
           pg_postmaster_start_time())
    into v_desde;
  v_dias := greatest(extract(epoch from (now() - v_desde)) / 86400.0, 1.0);

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
  --    Solo lo NUESTRO: ver la cabecera. Una consulta del panel de Supabase al
  --    catalogo no la espera ningun usuario.
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

  -- 3. SE LEE ENTERA. Ver la decision 2 de la cabecera: seq_tup_read, no
  --    seq_scan. Y POR DIA: ver la cabecera de esta migracion.
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

comment on function public.vigilancia_bd_rendimiento() is
  'Capa 2 del sistema de vigilancia, rama de rendimiento. Mide por ventana (proporcion del '
  'periodo o filas por dia), nunca por acumulado de por vida: un contador que solo sube acaba '
  'saltando siempre y no puede volver a verde. Solo audita consultas de public.';
