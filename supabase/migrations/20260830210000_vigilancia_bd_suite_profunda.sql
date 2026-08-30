-- ============================================================================
-- Vigilancia de Salud Profunda de Base de Datos PostgreSQL (10 Vectores Críticos)
-- ============================================================================
--
-- Implementa la suite de observabilidad profunda y auditoría continua para
-- PostgreSQL en MECHA OS:
--   Vector 1: Claves foráneas sin índice en columnas hijas (pg_constraint vs pg_index).
--   Vector 2: Contención de locks y transacciones bloqueadas (>5s en pg_stat_activity).
--   Vector 3: Tuplas muertas e hinchazón de tablas (bloat: n_dead_tup > 1000 y ratio > 20%).
--   Vector 4: Riesgo de desborde de secuencias numéricas (consumo >75% aviso, >90% bloqueante).
--   Vector 5: Cobertura 100% RLS en esquema public y search_path fijado en SECURITY DEFINER.
--   Vector 6: Saturación del pool de conexiones activas vs max_connections (>75% / >90%).
--   Vector 7: Estado de jobs en pg_cron (cron.job_run_details con estado 'failed').
--   Vector 8: Privacidad de buckets de Storage (cliente-fotos y sensibles public=false, RLS en storage.objects).
--   Vector 9: Continuidad criptográfica SHA-256 de VeriFactu (hash_anterior = lag(hash) y correlatividad numérica).
--   Vector 10: Detección de registros huérfanos relacionales (citas sin cliente, cobros sin cita, fases sin cita, bonos sin cliente).
--
-- Seguridad:
--   - SECURITY DEFINER con SET search_path = public
--   - Revocado de anon y public
--   - Concedido únicamente a authenticated y service_role
--   - Guarda de ejecución interna: exige is_staff() o auth.role() = 'service_role'
-- ============================================================================

create or replace function public.vigilancia_bd_profunda()
returns table (
  clave text,
  nivel text,
  ambito text,
  titulo text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- ==========================================================================
  -- VECTOR 1: Claves foráneas sin índice
  -- ==========================================================================
  return query
  with fk_columns as (
    select
      c.oid as child_oid,
      c.relname as child_table,
      con.conname as fk_name,
      con.conkey as fk_cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and con.contype = 'f'
  )
  select
    'bd-profunda/fk-sin-indice:' || fk.child_table || '.' || fk.fk_name as clave,
    'aviso'::text as nivel,
    'rendimiento'::text as ambito,
    'Clave foránea sin índice: ' || fk.child_table || '.' || fk.fk_name as titulo,
    'La clave foránea "' || fk.fk_name || '" en la tabla ' || fk.child_table ||
    ' no cuenta con un índice que cubra sus columnas hijas. Al borrar o actualizar en la tabla padre, se requerirá un escaneo secuencial en ' ||
    fk.child_table || '.' as detalle
  from fk_columns fk
  where not exists (
    select 1
    from pg_index i
    where i.indrelid = fk.child_oid
      and string_to_array(i.indkey::text, ' ')[1:array_length(fk.fk_cols, 1)] =
          string_to_array(array_to_string(fk.fk_cols, ' '), ' ')
  );

  -- ==========================================================================
  -- VECTOR 2: Contención de locks y transacciones bloqueadas (>5s)
  -- ==========================================================================
  return query
  select
    'bd-profunda/lock-contencion:' || a.pid::text as clave,
    'bloqueante'::text as nivel,
    'rendimiento'::text as ambito,
    'Contención de lock >5s en PID ' || a.pid::text as titulo,
    'Proceso PID ' || a.pid::text || ' (' || coalesce(a.usename, 'anon') || ') esperando lock (' ||
    coalesce(a.wait_event, 'Lock') || ') durante ' ||
    round(extract(epoch from (now() - a.state_change))::numeric, 1)::text || 's. Query: ' ||
    left(coalesce(a.query, '<sin query>'), 140) as detalle
  from pg_stat_activity a
  where a.wait_event_type = 'Lock'
    and a.state_change is not null
    and (now() - a.state_change) > interval '5 seconds'
    and a.pid <> pg_backend_pid();

  -- ==========================================================================
  -- VECTOR 3: Tuplas muertas e hinchazón de tablas (Bloat)
  -- ==========================================================================
  return query
  select
    'bd-profunda/bloat-tabla:' || t.relname as clave,
    'aviso'::text as nivel,
    'rendimiento'::text as ambito,
    'Hinchazón de tuplas muertas en ' || t.relname || ' (' || t.n_dead_tup::text || ' tuplas)' as titulo,
    'La tabla ' || t.relname || ' tiene ' || t.n_dead_tup::text || ' tuplas muertas (' ||
    round((t.n_dead_tup::numeric / (t.n_live_tup + t.n_dead_tup + 1) * 100), 1)::text ||
    '% del total). n_live_tup=' || t.n_live_tup::text || '. Último autovacuum: ' ||
    coalesce(t.last_autovacuum::text, 'nunca') || '. Se aconseja ejecutar VACUUM o revisar umbrales.' as detalle
  from pg_stat_user_tables t
  where t.schemaname = 'public'
    and t.n_dead_tup > 1000
    and (t.n_dead_tup::numeric / (t.n_live_tup + t.n_dead_tup + 1)) > 0.20;

  -- ==========================================================================
  -- VECTOR 4: Riesgo de desborde de secuencias numéricas
  -- ==========================================================================
  return query
  select
    'bd-profunda/secuencia-desborde:' || s.sequencename as clave,
    case
      when ((s.last_value::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0)) > 0.90
      then 'bloqueante'
      else 'aviso'
    end::text as nivel,
    'base-de-datos'::text as ambito,
    'Secuencia ' || s.sequencename || ' al ' ||
    round(((s.last_value::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0) * 100), 1)::text || '% de capacidad' as titulo,
    'La secuencia ' || s.sequencename || ' ha alcanzado el valor ' || s.last_value::text || ' de un máximo de ' ||
    s.max_value::text || '. Riesgo de interrupción por desbordamiento de secuencia. Migrar a BIGINT o reiniciar si es cíclica.' as detalle
  from pg_sequences s
  where s.schemaname = 'public'
    and s.max_value is not null
    and s.last_value is not null
    and s.max_value > s.min_value
    and ((s.last_value::numeric - s.min_value) / (s.max_value - s.min_value)) > 0.75;

  -- ==========================================================================
  -- VECTOR 5: Cobertura 100% RLS en esquema public y funciones definer seguras
  -- ==========================================================================
  -- 5.1 Tablas sin RLS
  return query
  select
    'bd-profunda/tabla-sin-rls:' || c.relname as clave,
    'bloqueante'::text as nivel,
    'seguridad'::text as ambito,
    'La tabla pública "' || c.relname || '" NO tiene RLS activa' as titulo,
    'Cualquier tabla en el esquema public debe tener Row Level Security activado para proteger el aislamiento multi-tenant. Activar con: ALTER TABLE public.' ||
    c.relname || ' ENABLE ROW LEVEL SECURITY;' as detalle
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  -- 5.2 Funciones SECURITY DEFINER sin search_path fijado
  return query
  select
    'bd-profunda/definer-sin-search-path:' || p.proname as clave,
    'bloqueante'::text as nivel,
    'seguridad'::text as ambito,
    'Función SECURITY DEFINER public.' || p.proname || '() sin search_path fijado' as titulo,
    'La función ' || p.proname || ' corre con privilegios elevados (SECURITY DEFINER) pero no tiene fijado un search_path seguro. Esto permite ataques de secuestro de esquemas. Corregir con: ALTER FUNCTION public.' ||
    p.proname || ' SET search_path = public;' as detalle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (
      p.proconfig is null
      or not exists (
        select 1 from unnest(p.proconfig) as cfg
        where cfg ~* '^search_path='
      )
    );

  -- ==========================================================================
  -- VECTOR 6: Saturación del pool de conexiones
  -- ==========================================================================
  return query
  with conn_stats as (
    select
      count(*)::int as activas,
      nullif(current_setting('max_connections', true)::int, 0) as max_conn
    from pg_stat_activity
  )
  select
    'bd-profunda/conexiones-saturacion' as clave,
    case when activas::numeric / max_conn > 0.90 then 'bloqueante' else 'aviso' end::text as nivel,
    'rendimiento'::text as ambito,
    'Pool de conexiones al ' || round((activas::numeric / max_conn * 100), 1)::text || '% (' || activas::text || '/' || max_conn::text || ')' as titulo,
    'Saturación de conexiones en PostgreSQL (' || activas::text || ' conexiones de ' || max_conn::text || ' máximas). Revisar clientes que no liberan conexiones o ajustar pooler.' as detalle
  from conn_stats
  where max_conn is not null
    and activas::numeric / max_conn > 0.75;

  -- ==========================================================================
  -- VECTOR 7: Estado de Crons (pg_cron)
  -- ==========================================================================
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    return query execute $sql$
      select
        'bd-profunda/cron-fallido:' || j.jobname,
        'bloqueante'::text,
        'vigilancia'::text,
        'El cron job "' || j.jobname || '" ha fallado en su última ejecución',
        'Última ejecución en estado "' || coalesce(d.status, 'desconocido') || '" a las ' ||
        coalesce(d.end_time::text, 'reciente') || '. Error: ' || coalesce(d.return_message, 'sin mensaje')
      from cron.job j
      join lateral (
        select status, return_message, end_time
        from cron.job_run_details
        where jobid = j.jobid
        order by end_time desc
        limit 1
      ) d on true
      where j.active and d.status = 'failed'
    $sql$;
  end if;

  -- ==========================================================================
  -- VECTOR 8: Privacidad de buckets de Storage y RLS en storage.objects
  -- ==========================================================================
  if to_regclass('storage.buckets') is not null then
    return query execute $sql$
      select
        'bd-profunda/bucket-publico:' || b.id,
        'bloqueante'::text,
        'seguridad'::text,
        'El bucket sensible "' || b.id || '" es PÚBLICO y debe ser PRIVADO',
        'Los buckets que contienen fotografías de clientes o documentos privados (como cliente-fotos) deben tener public = false y acceso gobernado por RLS.'
      from storage.buckets b
      where b.id in ('cliente-fotos', 'contratos-firmados', 'documentos-privados', 'nominas-empleados')
        and b.public
    $sql$;
  end if;

  if to_regclass('storage.objects') is not null then
    return query execute $sql$
      select
        'bd-profunda/storage-objects-sin-rls',
        'bloqueante'::text,
        'seguridad'::text,
        'storage.objects no tiene RLS activa',
        'La tabla de objetos de Storage debe tener Row Level Security activado para garantizar el aislamiento multi-tenant de archivos.'
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
        and c.relname = 'objects'
        and not c.relrowsecurity
    $sql$;
  end if;

  -- ==========================================================================
  -- VECTOR 9: Continuidad criptográfica SHA-256 de VeriFactu
  -- ==========================================================================
  if to_regclass('public.tickets_verifactu') is not null then
    return query execute $sql$
      with cadenas as (
        select
          id,
          negocio_id,
          nif_emisor,
          serie,
          numero,
          hash,
          hash_anterior,
          lag(hash) over (
            partition by negocio_id, coalesce(nif_emisor, ''), serie
            order by numero asc
          ) as hash_esperado_anterior,
          lag(numero) over (
            partition by negocio_id, coalesce(nif_emisor, ''), serie
            order by numero asc
          ) as numero_anterior
        from public.tickets_verifactu
        where formato_huella = 'aeat_v1'
      )
      select
        'bd-profunda/verifactu-cadena-rota:' || c.negocio_id || '.' || coalesce(c.serie, 'GEN') || '.' || c.numero::text,
        'bloqueante'::text,
        'fiscal'::text,
        'Cadena VeriFactu SHA-256 rota en ticket ' || coalesce(c.serie, '') || '-' || c.numero::text || ' (Salón: ' || c.negocio_id || ')',
        case
          when c.numero_anterior is not null and c.numero <> c.numero_anterior + 1
            then 'Salto en la numeración correlativa: número anterior=' || c.numero_anterior::text || ', actual=' || c.numero::text
          when c.hash_esperado_anterior is not null and c.hash_anterior <> c.hash_esperado_anterior
            then 'Discrepancia en huella criptográfica SHA-256: hash_anterior en registro=' || coalesce(c.hash_anterior, 'null') ||
                 ', hash calculado de la fila previa=' || coalesce(c.hash_esperado_anterior, 'null')
          else 'Ruptura en la cadena de registros VeriFactu'
        end
      from cadenas c
      where (c.hash_esperado_anterior is not null and c.hash_anterior <> c.hash_esperado_anterior)
         or (c.numero_anterior is not null and c.numero <> c.numero_anterior + 1)
    $sql$;
  end if;

  -- ==========================================================================
  -- VECTOR 10: Detección de registros huérfanos relacionales
  -- ==========================================================================
  -- 10.1 Citas sin cliente
  if to_regclass('public.citas') is not null and to_regclass('public.clientes') is not null then
    return query execute $sql$
      select
        'bd-profunda/huerfano:citas-sin-cliente',
        'bloqueante'::text,
        'coherencia'::text,
        count(*)::text || ' cita(s) referencian un cliente inexistente',
        'Existen registros en public.citas cuyo cliente_id no existe en public.clientes.'
      from public.citas c
      where c.cliente_id is not null
        and not exists (select 1 from public.clientes cl where cl.id = c.cliente_id)
      having count(*) > 0
    $sql$;
  end if;

  -- 10.2 Cobros sin cita
  if to_regclass('public.cobros') is not null and to_regclass('public.citas') is not null then
    return query execute $sql$
      select
        'bd-profunda/huerfano:cobros-sin-cita',
        'bloqueante'::text,
        'coherencia'::text,
        count(*)::text || ' cobro(s) con cita_id inexistente',
        'Existen registros en public.cobros cuyo cita_id no existe en public.citas.'
      from public.cobros c
      where c.cita_id is not null
        and not exists (select 1 from public.citas cit where cit.id = c.cita_id)
      having count(*) > 0
    $sql$;
  end if;

  -- 10.3 Cita_servicios sin cita (si la tabla existe)
  if to_regclass('public.cita_servicios') is not null and to_regclass('public.citas') is not null then
    return query execute $sql$
      select
        'bd-profunda/huerfano:cita-servicios-sin-cita',
        'bloqueante'::text,
        'coherencia'::text,
        count(*)::text || ' cita_servicios huérfano(s)',
        'Existen registros en public.cita_servicios cuyo cita_id no existe en public.citas.'
      from public.cita_servicios cs
      where cs.cita_id is not null
        and not exists (select 1 from public.citas cit where cit.id = cs.cita_id)
      having count(*) > 0
    $sql$;
  end if;

  -- 10.4 Cita_fases sin cita (si la tabla existe)
  if to_regclass('public.cita_fases') is not null and to_regclass('public.citas') is not null then
    return query execute $sql$
      select
        'bd-profunda/huerfano:cita-fases-sin-cita',
        'bloqueante'::text,
        'coherencia'::text,
        count(*)::text || ' cita_fases huérfana(s)',
        'Existen fases en public.cita_fases cuyo cita_id no existe en public.citas.'
      from public.cita_fases cf
      where cf.cita_id is not null
        and not exists (select 1 from public.citas cit where cit.id = cf.cita_id)
      having count(*) > 0
    $sql$;
  end if;

  -- 10.5 Bonos sin cliente
  if to_regclass('public.bonos') is not null and to_regclass('public.clientes') is not null then
    return query execute $sql$
      select
        'bd-profunda/huerfano:bonos-sin-cliente',
        'bloqueante'::text,
        'coherencia'::text,
        count(*)::text || ' bono(s) referencian un cliente inexistente',
        'Existen registros en public.bonos cuyo cliente_id no existe en public.clientes.'
      from public.bonos b
      where b.cliente_id is not null
        and not exists (select 1 from public.clientes cl where cl.id = b.cliente_id)
      having count(*) > 0
    $sql$;
  end if;

end;
$$;

revoke all on function public.vigilancia_bd_profunda() from public, anon;
grant execute on function public.vigilancia_bd_profunda() to authenticated, service_role;

comment on function public.vigilancia_bd_profunda() is
  'Vigilante de salud profunda de Postgres: los 10 vectores críticos (FKs sin índice, '
  'contención de locks >5s, tuplas muertas/bloat, desborde secuencias, RLS 100% y search_path '
  'definer, saturación pool conexiones, estado crons, privacidad buckets storage, continuidad '
  'VeriFactu SHA-256, detección de registros huérfanos). Solo staff o service_role.';
