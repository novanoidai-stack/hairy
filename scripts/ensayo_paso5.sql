-- Ensayo del paso 5 en una sola transaccion (begin ... rollback).
begin;

create temp table _informe (paso text, detalle text);

-- ---------------------------------------------------------------
-- 1. REFERENCIA ANTES: ventanas de la costura de 4 argumentos
-- ---------------------------------------------------------------
create temp table _viejas as
select c.id, c.inicio, c.fin, c.fin_activa, c.fin_espera,
       (select string_agg(desde::text || '>' || hasta::text, ',' order by desde)
          from public.ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin)) as vieja,
       (select count(*) from public.cita_fases f where f.cita_id = c.id and f.tipo = 'reposo') as reposos
  from public.citas c
 where c.inicio < c.fin;

-- Disponibilidad ANTES (14 dias, demo + salon real)
create temp table _disp_antes as
select 'demo' slug, d.dia_ts::date::text dia, (select count(*) from public.disponibilidad_publica('demo', null, d.dia_ts::date, null)) n
  from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts)
union all
select 'florentsuarez', d.dia_ts::date::text, (select count(*) from public.disponibilidad_publica('florentsuarez', null, d.dia_ts::date, null))
  from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts);

insert into _informe
select 'rendimiento_antes', 'ms=' || round(extract(epoch from (clock_timestamp() - t0)) * 1000)
  from (select clock_timestamp() t0) s,
       lateral (select count(*) from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts),
               lateral public.disponibilidad_publica('demo', null, d.dia_ts::date, null) h) c;

-- ---------------------------------------------------------------
-- 2. LA MIGRACION (cuerpo de 20260905130000)
-- ---------------------------------------------------------------

create or replace function public.ventanas_activas_cita(
  p_cita_id     uuid,
  p_inicio      timestamptz,
  p_fin_activa  timestamptz,
  p_fin_espera  timestamptz,
  p_fin         timestamptz
)
returns table (desde timestamptz, hasta timestamptz)
language sql
stable
set search_path to 'public'
as $function$
  with trabajo as (
    select f.inicio, f.fin
      from public.cita_fases f
     where f.cita_id = p_cita_id
       and f.tipo <> 'reposo'
       and f.inicio < f.fin
  )
  select t.inicio, t.fin from trabajo t
  union all
  select v.desde, v.hasta
    from public.ventanas_activas_cita(p_inicio, p_fin_activa, p_fin_espera, p_fin) v
   where not exists (select 1 from trabajo t2);
$function$;

do $parche$
declare
  r    record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'crear_cita_publica', 'crear_cita_publica_cadena', 'crear_cita_publica_grupo',
         'disponibilidad_publica', 'disponibilidad_publica_cadena',
         'modificar_cita_publica',
         'portal_dias_disponibles', 'portal_dias_disponibles_cadena')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin)' in v_def) = 0 then
      raise exception 'Ancla perdida en %', r.proname;
    end if;

    v_def := replace(
      v_def,
      'ventanas_activas_cita(c.inicio, c.fin_activa, c.fin_espera, c.fin)',
      'ventanas_activas_cita(c.id, c.inicio, c.fin_activa, c.fin_espera, c.fin)');

    execute v_def;
  end loop;
end;
$parche$;

-- ---------------------------------------------------------------
-- 3. Equivalencia por cita: vieja (guardada) vs nueva (con fases)
-- ---------------------------------------------------------------
insert into _informe
select 'equivalencia',
       'citas=' || count(*)
    || ' con_diferencia=' || count(*) filter (where difiere)
    || ' de_las_cuales_2reposos_o_mas=' || count(*) filter (where difiere and reposos >= 2)
    || ' de_las_cuales_menos_de_2_reposos=' || count(*) filter (where difiere and reposos < 2)
    || ' sin_ventanas_nuevas=' || count(*) filter (where difiere and nueva is null)
  from (
    select v.id, v.reposos, v.vieja,
           (select string_agg(desde::text || '>' || hasta::text, ',' order by desde)
              from public.ventanas_activas_cita(v.id, v.inicio, v.fin_activa, v.fin_espera, v.fin)) as nueva
      from _viejas v
  ) x, lateral (select (vieja is distinct from nueva) as difiere) l;

insert into _informe
select 'ejemplos_diferencia', coalesce(string_agg(left(e, 240), ' ;; '), 'ninguna')
  from (
    select v.id || ' reposos=' || v.reposos
         || ' vieja=[' || coalesce((select string_agg(to_char(desde at time zone 'UTC','HH24:MI') || '-' || to_char(hasta at time zone 'UTC','HH24:MI'), ' ')
              from public.ventanas_activas_cita(v.inicio, v.fin_activa, v.fin_espera, v.fin)),'') || ']'
         || ' nueva=[' || coalesce((select string_agg(to_char(desde at time zone 'UTC','HH24:MI') || '-' || to_char(hasta at time zone 'UTC','HH24:MI'), ' ')
              from public.ventanas_activas_cita(v.id, v.inicio, v.fin_activa, v.fin_espera, v.fin)),'') || ']' as e
      from _viejas v
     where v.vieja is distinct from
           (select string_agg(desde::text || '>' || hasta::text, ',' order by desde)
              from public.ventanas_activas_cita(v.id, v.inicio, v.fin_activa, v.fin_espera, v.fin))
     limit 4
  ) y;

-- ---------------------------------------------------------------
-- 4. Disponibilidad DESPUES + diff
-- ---------------------------------------------------------------
create temp table _disp_despues as
select 'demo' slug, d.dia_ts::date::text dia, (select count(*) from public.disponibilidad_publica('demo', null, d.dia_ts::date, null)) n
  from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts)
union all
select 'florentsuarez', d.dia_ts::date::text, (select count(*) from public.disponibilidad_publica('florentsuarez', null, d.dia_ts::date, null))
  from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts);

insert into _informe
select 'disponibilidad_diff',
       'dias_con_diferencia=' || count(*)
    || ' todas_a_mas=' || (count(*) filter (where d.n > a.n) = count(*))
    || ' ejemplos=' || coalesce(string_agg(slug || ' ' || dia || ': ' || a.n || '->' || d.n, ' ;; '), 'NINGUNA')
  from _disp_antes a join _disp_despues d using (slug, dia)
 where a.n <> d.n;

insert into _informe
select 'rendimiento_despues', 'ms=' || round(extract(epoch from (clock_timestamp() - t0)) * 1000)
  from (select clock_timestamp() t0) s,
       lateral (select count(*) from generate_series(current_date::timestamp, (current_date + 13)::timestamp, interval '1 day') d(dia_ts),
               lateral public.disponibilidad_publica('demo', null, d.dia_ts::date, null) h) c;

-- ---------------------------------------------------------------
-- 5. CRITERIO 3: hueco dentro del SEGUNDO reposo (cita aislada)
-- ---------------------------------------------------------------
do $block$
declare
  v_cita uuid;
  v_r2_ini timestamptz; v_r2_fin timestamptz;
  v_en_r2 text;
begin
  insert into public.citas (negocio_id, servicio_id, profesional_id, inicio, fin, estado, canal)
  values ('florent_surez_peluqueros_15004',
          '75c7c691-15b9-4f1d-8efe-bd630f82ca29',
          'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3',
          timezone('Europe/Madrid', '2026-09-15 12:40:00'),
          timezone('Europe/Madrid', '2026-09-15 14:50:00'),
          'confirmada', 'manual')
  returning id into v_cita;

  select inicio, fin into v_r2_ini, v_r2_fin
    from public.cita_fases where cita_id = v_cita and tipo = 'reposo' order by orden offset 1 limit 1;

  select string_agg(to_char(slot::timestamptz at time zone 'UTC','HH24:MI'), ',') into v_en_r2
    from public.disponibilidad_publica('florentsuarez', '7a62301f-55af-47c8-bae1-63fc939b0498'::uuid, '2026-09-15', 'a0e91421-2ac0-46f8-81cf-60e2c5fc7ad3'::uuid) h
   where h.slot::timestamptz >= v_r2_ini and h.slot::timestamptz + interval '15 minutes' <= v_r2_fin;

  insert into _informe values ('criterio3_segundo_reposo',
    'reposo2=[' || to_char(v_r2_ini at time zone 'UTC','HH24:MI') || ',' || to_char(v_r2_fin at time zone 'UTC','HH24:MI')
    || ') UTC huecos_15min_dentro=' || coalesce(v_en_r2, 'NINGUNO'));
end;
$block$;

select paso, detalle from _informe;

rollback;
