begin;

create temp table _informe (paso text, detalle text);

-- Estado ANTES
insert into _informe
select 'antes', 'citas=' || (select count(*) from public.citas)
     || ' fases=' || (select count(*) from public.cita_fases)
     || ' por_tipo=' || coalesce((select string_agg(tipo || ':' || n, ', ') from
            (select tipo, count(*) n from public.cita_fases group by 1) x), 'sin fases')
     || ' citas_sin_fases=' || (select count(*) from public.citas c
            where not exists (select 1 from public.cita_fases f where f.cita_id = c.id))
     || ' citas_con_2_reposos=' || (select count(*) from (
            select cita_id from public.cita_fases where tipo = 'reposo'
            group by cita_id having count(*) >= 2) y);

-- ============ MIGRACION (cuerpo de 20260905110000) ============

create or replace function public.resumir_citas_desde_fases()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 2 then
    return null;
  end if;

  execute format(
    'update public.citas c
        set inicio     = r.ini,
            fin        = r.fin,
            fin_activa = r.fa,
            fin_espera = r.fe
       from (
         select f.cita_id,
                min(f.inicio)                                        as ini,
                max(f.fin)                                           as fin,
                coalesce(min(f.inicio) filter (where f.tipo = %L),
                         max(f.fin))                                 as fa,
                coalesce(min(f.fin)    filter (where f.tipo = %L),
                         max(f.fin))                                 as fe
           from public.cita_fases f
          where f.cita_id in (%s)
          group by f.cita_id
       ) r
      where c.id = r.cita_id
        and (c.inicio, c.fin, c.fin_activa, c.fin_espera)
            is distinct from (r.ini, r.fin, r.fa, r.fe)',
    'reposo', 'reposo',
    case tg_op
      when 'INSERT' then 'select cita_id from insertadas'
      when 'DELETE' then 'select cita_id from borradas'
      else               'select cita_id from insertadas union select cita_id from borradas'
    end);

  return null;
end;
$function$;

drop trigger if exists trg_resumir_fases_ins on public.cita_fases;
drop trigger if exists trg_resumir_fases_upd on public.cita_fases;
drop trigger if exists trg_resumir_fases_del on public.cita_fases;
create trigger trg_resumir_fases_ins
  after insert on public.cita_fases
  referencing new table as insertadas
  for each statement execute function public.resumir_citas_desde_fases();
create trigger trg_resumir_fases_upd
  after update on public.cita_fases
  referencing new table as insertadas old table as borradas
  for each statement execute function public.resumir_citas_desde_fases();
create trigger trg_resumir_fases_del
  after delete on public.cita_fases
  referencing old table as borradas
  for each statement execute function public.resumir_citas_desde_fases();

create or replace function public.resync_fases_de_cita()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_marcas jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.inicio         is not distinct from old.inicio
 and new.fin            is not distinct from old.fin
 and new.fin_activa     is not distinct from old.fin_activa
 and new.fin_espera     is not distinct from old.fin_espera
 and new.profesional_id is not distinct from old.profesional_id then
    return null;
  end if;

  select jsonb_object_agg(orden::text, jsonb_build_object('i', iniciada_at, 'c', cerrada_at))
    into v_marcas
  from public.cita_fases
  where cita_id = new.id and (iniciada_at is not null or cerrada_at is not null);

  perform public.sembrar_fases_de_cita(new.id);

  if v_marcas is not null then
    update public.cita_fases f
       set iniciada_at = nullif(v_marcas -> f.orden::text ->> 'i', '')::timestamptz,
           cerrada_at  = nullif(v_marcas -> f.orden::text ->> 'c', '')::timestamptz
     where f.cita_id = new.id
       and v_marcas ? f.orden::text;
  end if;

  return null;
end;
$function$;

create or replace function public.citas_normalizar_fases()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_activa int;
  v_espera int;
begin
  if new.inicio is null or new.fin is null then
    return new;
  end if;

  select coalesce(s.duracion_activa_min, 0), coalesce(s.duracion_espera_min, 0)
    into v_activa, v_espera
    from public.servicios s
   where s.id = new.servicio_id;

  if new.fin_activa is null then
    new.fin_activa := case
      when coalesce(v_activa, 0) > 0
        then least(new.inicio + make_interval(mins => v_activa), new.fin)
      else new.fin
    end;
  end if;

  if new.fin_espera is null then
    new.fin_espera := least(
      new.fin_activa + make_interval(mins => coalesce(v_espera, 0)), new.fin);
  end if;

  new.fin_activa := greatest(new.inicio, least(new.fin_activa, new.fin));
  new.fin_espera := greatest(new.fin_activa, least(new.fin_espera, new.fin));
  return new;
end;
$function$;

delete from public.cita_fases;

with cubiertas as (
  select distinct c.id
    from public.citas c
    join public.servicios s on s.id = c.servicio_id
   cross join lateral public.fases_de_plantilla(s.fases, c.inicio, c.fin) f
   where s.fases is not null
     and c.inicio < c.fin
),
clasicas as (
  select c.*
    from public.citas c
    left join cubiertas k on k.id = c.id
   where k.id is null
     and c.inicio < c.fin
)
insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin,
                               profesional_id, recurso_tipo, etiqueta)
select c.negocio_id, c.id, f.orden, f.tipo, f.inicio, f.fin,
       c.profesional_id, f.recurso_tipo, f.etiqueta
  from public.citas c
  join public.servicios s on s.id = c.servicio_id
 cross join lateral public.fases_de_plantilla(s.fases, c.inicio, c.fin) f
 where s.fases is not null
   and c.inicio < c.fin
union all
select negocio_id, id, 1, 'activa', inicio, fin_activa, profesional_id, null, 'Aplicacion'
  from clasicas
 where fin_activa is not null and fin_espera is not null and fin_espera > fin_activa
union all
select negocio_id, id, 2, 'reposo', fin_activa, fin_espera, profesional_id, null, 'Reposo tecnico'
  from clasicas
 where fin_activa is not null and fin_espera is not null
   and fin_espera > fin_activa and fin_espera <= fin
union all
select negocio_id, id, 3, 'activa', fin_espera, fin, profesional_id, null, 'Lavado y peinado'
  from clasicas
 where fin_activa is not null and fin_espera is not null
   and fin_espera > fin_activa and fin > fin_espera
union all
select negocio_id, id, 1, 'activa', inicio, fin, profesional_id, null, 'Servicio'
  from clasicas
 where not (fin_activa is not null and fin_espera is not null and fin_espera > fin_activa);

-- ============ FIN MIGRACION ============

insert into _informe
select 'despues', 'fases=' || (select count(*) from public.cita_fases)
     || ' por_tipo=' || coalesce((select string_agg(tipo || ':' || n, ', ') from
            (select tipo, count(*) n from public.cita_fases group by 1) x), 'sin fases')
     || ' citas_sin_fases=' || (select count(*) from public.citas c
            where not exists (select 1 from public.cita_fases f where f.cita_id = c.id))
     || ' citas_con_2_reposos=' || (select count(*) from (
            select cita_id from public.cita_fases where tipo = 'reposo'
            group by cita_id having count(*) >= 2) y);

insert into _informe
select 'regresion', coalesce(string_agg(nivel || ' | ' || titulo || ' | ' || left(detalle, 200), ' ;; '),
                             '0 filas: foto intacta')
  from public.regresion_citas_fases_v2();

insert into _informe
select 'marcas_vs_foto', 'citas_en_foto=' || count(*)
     || ' duracion_cambiada=' || count(*) filter (where (c.fin - c.inicio) is distinct from (f.fin - f.inicio))
     || ' alguna_marca_cambiada=' || count(*) filter (where (c.inicio, c.fin, c.fin_activa, c.fin_espera)
                                                       is distinct from (f.inicio, f.fin, f.fin_activa, f.fin_espera))
     || ' || de_las_cambiadas: con_plantilla=' || count(*) filter (where (c.inicio, c.fin, c.fin_activa, c.fin_espera)
                                                       is distinct from (f.inicio, f.fin, f.fin_activa, f.fin_espera)
                                                      and s.fases is not null)
     || ' sin_plantilla=' || count(*) filter (where (c.inicio, c.fin, c.fin_activa, c.fin_espera)
                                                       is distinct from (f.inicio, f.fin, f.fin_activa, f.fin_espera)
                                                      and s.fases is null)
     || ' ejemplo=' || coalesce((select string_agg(left(y.d, 160), ' ;; ') from (
            select c.id || ' fa:' || f.fin_activa || '->' || c.fin_activa
                 || ' fe:' || f.fin_espera || '->' || c.fin_espera || ' plantilla:' || (s.fases is not null) as d
              from public.citas c
              join respaldos.citas_antes_de_fases_v2 f on f.id = c.id
              left join public.servicios s on s.id = c.servicio_id
             where (c.inicio, c.fin, c.fin_activa, c.fin_espera)
                   is distinct from (f.inicio, f.fin, f.fin_activa, f.fin_espera)
             limit 3) y), 'ninguna')
  from public.citas c
  join respaldos.citas_antes_de_fases_v2 f on f.id = c.id
  left join public.servicios s on s.id = c.servicio_id;

-- SONDA 1: crear una cita de una mecha con DOS reposos y ver el resumen
insert into _informe
select 'sonda_cita_2reposos',
       'servicio=' || s.id || ' fases_plantilla=' || jsonb_array_length(s.fases)
  from public.servicios s
 where s.negocio_id = 'florent_surez_peluqueros_15004'
   and s.fases is not null
   and (select count(*) from jsonb_array_elements(s.fases) e where e->>'tipo' = 'reposo') >= 2
 order by s.nombre
 limit 1;

create temp table _prueba (
  servicio_id uuid, profesional_id uuid, cita_id uuid,
  n_reposos int, marcas text, tras_estirar text, fases_detalle text
);

do $block$
declare
  v_serv public.servicios;
  v_prof uuid;
  v_cita uuid;
  v_n int;
  v_ini timestamptz; v_fin timestamptz; v_fa timestamptz; v_fe timestamptz;
  v_ini2 timestamptz; v_fin2 timestamptz; v_fe2 timestamptz;
  v_r1_fin timestamptz;
begin
  select * into v_serv from public.servicios
   where negocio_id = 'florent_surez_peluqueros_15004'
     and fases is not null
     and (select count(*) from jsonb_array_elements(fases) e where e->>'tipo' = 'reposo') >= 2
   order by nombre limit 1;

  select profesional_id into v_prof from public.citas
   where negocio_id = 'florent_surez_peluqueros_15004'
   order by created_at desc nulls last limit 1;

  insert into public.citas (negocio_id, servicio_id, profesional_id, cliente_id,
                            inicio, fin, estado, canal)
  values (v_serv.negocio_id, v_serv.id, v_prof, null,
          now() + interval '2 days' + interval '10 hours',
          now() + interval '2 days' + interval '10 hours'
            + make_interval(mins => (select sum((e->>'min')::int)::int from jsonb_array_elements(v_serv.fases) e)),
          'confirmada', 'manual')
  returning id into v_cita;

  select count(*) into v_n from public.cita_fases
   where cita_id = v_cita and tipo = 'reposo';

  select inicio, fin, fin_activa, fin_espera into v_ini, v_fin, v_fa, v_fe
    from public.citas where id = v_cita;

  -- SONDA 2: estirar el PRIMER reposo 10 min. No puede mover inicio ni fin,
  -- y el segundo reposo no se toca.
  select fin into v_r1_fin from public.cita_fases
   where cita_id = v_cita and tipo = 'reposo' order by orden limit 1;

  update public.cita_fases
     set fin = fin + interval '10 minutes'
   where cita_id = v_cita and tipo = 'reposo' and fin = v_r1_fin;

  -- y desplazar el arranque de la fase siguiente (la activa que viene despues)
  update public.cita_fases nf
     set inicio = v_r1_fin + interval '10 minutes'
   where cita_id = v_cita and orden = (
     select min(orden) from public.cita_fases
      where cita_id = v_cita and orden > (select min(orden) from public.cita_fases
                                           where cita_id = v_cita and tipo = 'reposo'));

  select inicio, fin, fin_espera into v_ini2, v_fin2, v_fe2
    from public.citas where id = v_cita;

  insert into _prueba values (
    v_serv.id, v_prof, v_cita, v_n,
    'inicio=' || v_ini || ' fin=' || v_fin || ' fa=' || v_fa || ' fe=' || v_fe,
    'inicio_igual=' || (v_ini = v_ini2) || ' fin_igual=' || (v_fin = v_fin2)
      || ' fe_estiro=' || (v_fe2 = v_fe + interval '10 minutes'),
    (select string_agg(x.t, ' ') from (
       select orden || ':' || tipo || ' [' || inicio::time || ',' || fin::time || ')' as t
         from public.cita_fases where cita_id = v_cita order by orden) x)
  );

  delete from public.citas where id = v_cita;
end;
$block$;

select paso, detalle from _informe
union all
select 'prueba',
       'n_reposos=' || n_reposos || ' || ' || marcas || ' || tras_estirar: '
       || tras_estirar || ' || ' || coalesce(fases_detalle, '')
  from _prueba;

rollback;
