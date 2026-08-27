-- ---------------------------------------------------------------------------
-- Limpieza de una sola pasada del historial de la demo: dejar CERO citas fuera
-- del horario del salon. Va detras de:
--   1. demo-horario-convencion-lunes.sql     (el horario, un dia corrido)
--   2. demo-resiembra-respeta-horario.sql    (la resiembra, de hoy en adelante)
-- Esto es lo de ANTES de hoy, que la resiembra ya no toca.
--
-- Habia tres cosas mezcladas:
--
-- A) DESFASE DE ZONA HORARIA. `scripts/seed-demo-salon.sql` construye las citas
--    con `(fecha + interval 'N hours')::timestamptz`. Ese cast interpreta la
--    hora en la zona del SERVIDOR (UTC), no en Europe/Madrid, asi que en verano
--    todo el historial salia dos horas tarde: la plantilla de 9,10,12,13,16,17,
--    18,19 se veia como 11:00-21:45 y el salon cierra a las 20:00. Se reencaja
--    reinterpretando la marca naive como hora de Madrid, que ademas cuadra sola
--    con el cambio de hora (en febrero el desfase era de una hora, no de dos).
--    El bloque solo actua si de verdad queda historial pasado el cierre, para
--    que no pueda correr las citas dos veces.
--
--    Los `cobros` NO se mueven: `cobros_prevent_financial_updates()` prohibe
--    tocar `cobrado_at` y no exime a la demo. Da igual a efectos practicos: el
--    desfase nunca cruza la medianoche, asi que el total por dia de Caja y de
--    Informes es exactamente el mismo.
--
-- B) SABADOS POR LA TARDE. El sabado cierra a las 14:30 y la plantilla del
--    historial usa las mismas ocho horas todos los dias, asi que cada sabado
--    tenia cuatro citas de 16:00 a 19:45. Fuera.
--
-- C) LO QUE DEJO LA RESIEMBRA VIEJA. Del 19 al 22 de agosto quedaron 20-24
--    citas por dia de las mismas cuatro clientas, repetidas cada hora (la
--    acumulacion que arregla demo-resiembra-respeta-horario.sql). Se borran y
--    esos dias se vuelven a sembrar con el patron del historial largo, que es
--    el que reparte clientas, servicios y profesionales de verdad.
--
-- Resultado medido tras aplicarlo: 0 citas fuera de horario en todo el tenant.
-- ---------------------------------------------------------------------------

-- --- A) Reencajar el historial en hora de Madrid ---------------------------
do $$
declare v_fuera int; v_movidas int;
begin
  select count(*) into v_fuera
    from public.citas c
    join public.negocio_horarios h
      on h.negocio_id = c.negocio_id
     and h.dia_semana = (extract(isodow from c.inicio at time zone 'Europe/Madrid')::int - 1)
   where c.negocio_id = 'demo_salon_001'
     and c.importe_final is not null
     and (c.fin at time zone 'Europe/Madrid')::time > h.cierre::time;

  if v_fuera = 0 then
    raise notice 'historico ya reencajado (0 citas pasado el cierre): no se toca';
    return;
  end if;

  update public.citas c
     set inicio     = ((c.inicio at time zone 'UTC')::timestamp) at time zone 'Europe/Madrid',
         fin        = ((c.fin    at time zone 'UTC')::timestamp) at time zone 'Europe/Madrid',
         fin_activa = case when c.fin_activa is not null
                      then ((c.fin_activa at time zone 'UTC')::timestamp) at time zone 'Europe/Madrid' end,
         fin_espera = case when c.fin_espera is not null
                      then ((c.fin_espera at time zone 'UTC')::timestamp) at time zone 'Europe/Madrid' end
   where c.negocio_id = 'demo_salon_001'
     and c.inicio < (now() at time zone 'Europe/Madrid')::date
     and c.importe_final is not null
     and c.metodo_pago is not null
     -- La firma del sembrado largo: en punto y en una de sus ocho horas.
     and extract(minute from c.inicio at time zone 'UTC') = 0
     and extract(hour   from c.inicio at time zone 'UTC') in (9,10,12,13,15,16,17,18,19);

  get diagnostics v_movidas = row_count;
  raise notice 'historico reencajado: % citas movidas (habia % pasado el cierre)', v_movidas, v_fuera;
end $$;

-- --- B y C) Borrar lo que sigue fuera de hora y las sobras de la resiembra ---
do $$
declare v_citas int; v_cobros int;
begin
  create temp table _borrar_citas on commit drop as
  with fuera as (
    select c.id
    from public.citas c
    join public.negocio_horarios h
      on h.negocio_id = c.negocio_id
     and h.dia_semana = (extract(isodow from c.inicio at time zone 'Europe/Madrid')::int - 1)
    where c.negocio_id = 'demo_salon_001'
      and c.inicio < (now() at time zone 'Europe/Madrid')::date
      and ( h.abierto = false
            or (c.inicio at time zone 'Europe/Madrid')::time < h.apertura::time
            or (c.fin    at time zone 'Europe/Madrid')::time > h.cierre::time
            or (h.pausa_inicio is not null
                and (c.fin    at time zone 'Europe/Madrid')::time > h.pausa_inicio::time
                and (c.inicio at time zone 'Europe/Madrid')::time < h.pausa_fin::time) )
  ), sobras as (
    -- Las citas del sembrado largo llevan importe_final; las de la resiembra no.
    select c.id from public.citas c
     where c.negocio_id = 'demo_salon_001'
       and c.inicio < (now() at time zone 'Europe/Madrid')::date
       and c.importe_final is null
  )
  select id from fuera union select id from sobras;

  update public.citas set cobro_id = null
   where id in (select id from _borrar_citas) and cobro_id is not null;

  -- Las lineas, a mano y antes: por el cascade del FK el guarda antifraude no
  -- encuentra el cobro padre, no aplica la exencion de la demo y aborta.
  delete from public.cobro_lineas cl
   where cl.cobro_id in (select co.id from public.cobros co
                          where co.negocio_id = 'demo_salon_001'
                            and co.cita_id in (select id from _borrar_citas));

  delete from public.cobros co
   where co.negocio_id = 'demo_salon_001'
     and co.cita_id in (select id from _borrar_citas);
  get diagnostics v_cobros = row_count;

  delete from public.citas c where c.id in (select id from _borrar_citas);
  get diagnostics v_citas = row_count;

  raise notice 'limpieza: % citas y % cobros borrados', v_citas, v_cobros;
end $$;

-- --- C bis) Volver a sembrar los dias que se quedaron huecos ----------------
-- Mismo patron que scripts/seed-demo-salon.sql, con dos diferencias: la hora se
-- construye EN MADRID (`at time zone`, no `::timestamptz`) y cada hueco tiene
-- que caber en la ventana del dia, asi que el sabado se corta solo a las 14:30.
with cli as (
  select id, row_number() over (order by nombre) - 1 as i, count(*) over () as n
  from public.clientes where negocio_id = 'demo_salon_001' and nombre <> 'Carmen Ruiz'
), srv as (
  select id, precio, row_number() over (order by precio desc) - 1 as i
  from public.servicios where negocio_id = 'demo_salon_001'
), pro as (
  select id, row_number() over (order by nombre) - 1 as i
  from public.profesionales where negocio_id = 'demo_salon_001'
), dias as (
  select d::date as f,
         ((now() at time zone 'Europe/Madrid')::date - d::date) as dd
  from generate_series(date '2026-08-18',
                       (now() at time zone 'Europe/Madrid')::date - 1,
                       interval '1 day') d
  -- Solo los dias que quedaron practicamente vacios.
  where (select count(*) from public.citas c
          where c.negocio_id = 'demo_salon_001'
            and (c.inicio at time zone 'Europe/Madrid')::date = d::date) < 4
), plantilla as (
  select * from (values
    (9,0,2,0), (10,4,0,0), (12,1,3,1), (13,3,4,1),
    (16,2,1,2), (17,5,5,2), (18,6,0,0), (19,7,3,1)
  ) as t(hora, ci, si, pi)
), filas as (
  select dias.f, dias.dd, plantilla.hora,
         ((plantilla.si + dias.dd / 3) % 6) as si,
         ((plantilla.pi + dias.dd / 5) % 3) as pi,
         row_number() over (order by dias.dd, plantilla.hora) as r
  from dias
  cross join plantilla
  join public.negocio_horarios h
    on h.negocio_id = 'demo_salon_001'
   and h.dia_semana = (extract(isodow from dias.f)::int - 1)
   and h.abierto
   and make_time(plantilla.hora, 0, 0)  >= h.apertura::time
   and make_time(plantilla.hora, 45, 0) <= h.cierre::time
   and (h.pausa_inicio is null
        or make_time(plantilla.hora, 45, 0) <= h.pausa_inicio::time
        or make_time(plantilla.hora, 0, 0)  >= h.pausa_fin::time)
  -- Ni todos los huecos llenos ni un dia perfecto: se cae una de cada cinco.
  where (dias.dd * 7 + plantilla.hora) % 5 <> 0
)
insert into public.citas (
  negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado,
  canal, cobrada, metodo_pago, importe_final, confirmada_cliente,
  formula_producto, formula_tono, formula_tiempo_min, formula_resultado
)
select 'demo_salon_001', cli.id, srv.id, pro.id,
  (filas.f + make_interval(hours => filas.hora)) at time zone 'Europe/Madrid',
  (filas.f + make_interval(hours => filas.hora, mins => 45)) at time zone 'Europe/Madrid',
  case when (filas.dd * 3 + filas.hora) % 29 = 0 then 'no_presentada'
       when (filas.dd * 3 + filas.hora) % 37 = 0 then 'cancelada'
       else 'completada' end,
  case when (filas.dd + filas.hora) % 4 = 0 then 'web'
       when (filas.dd + filas.hora) % 7 = 0 then 'whatsapp'
       else 'manual' end,
  ((filas.dd * 3 + filas.hora) % 29 <> 0 and (filas.dd * 3 + filas.hora) % 37 <> 0),
  case when (filas.dd + filas.hora) % 3 = 0 then 'efectivo'
       when (filas.dd + filas.hora) % 3 = 1 then 'datafono'
       else 'bizum' end,
  srv.precio, true,
  case when srv.i <= 1 then 'Igora Royal' end,
  case when srv.i = 0 then '9.1 + 10.1 (2:1)' when srv.i = 1 then '7.0 raiz' end,
  case when srv.i <= 1 then 35 end,
  case when srv.i = 0 then 'Rubio ceniza natural, sin dorados'
       when srv.i = 1 then 'Raiz cubierta, tono uniforme' end
from filas
join srv on srv.i = filas.si
join pro on pro.i = filas.pi
join cli on cli.i = (filas.r * 37) % cli.n
on conflict do nothing;

-- Su cobro, o la proxima pasada de resembrar_demo() se las lleva por delante.
insert into public.cobros (
  negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents,
  metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at
)
select 'demo_salon_001', c.id, c.profesional_id, c.cliente_id,
  round(c.importe_final * 100)::int,
  case when extract(day from c.inicio)::int % 6 = 0 then 200 else 0 end,
  c.metodo_pago,
  case when c.metodo_pago = 'efectivo' then round(c.importe_final * 100)::int else 0 end,
  case when c.metodo_pago = 'datafono' then round(c.importe_final * 100)::int else 0 end,
  case when c.metodo_pago = 'bizum'    then round(c.importe_final * 100)::int else 0 end,
  'pos', 'completado', c.fin
from public.citas c
where c.negocio_id = 'demo_salon_001'
  and c.cobrada
  and c.inicio < (now() at time zone 'Europe/Madrid')::date
  and not exists (select 1 from public.cobros o where o.cita_id = c.id);

insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
select co.id, 'servicio', c.servicio_id, s.nombre, co.total_cents, 1
from public.cobros co
join public.citas c on c.id = co.cita_id
join public.servicios s on s.id = c.servicio_id
where co.negocio_id = 'demo_salon_001'
  and not exists (select 1 from public.cobro_lineas l where l.cobro_id = co.id);

-- --- Los numeros de la ficha, recalculados desde el historial que queda ------
update public.clientes cl set
  total_visitas  = v.n,
  ultima_visita  = v.ultima,
  primera_visita = least(coalesce(cl.primera_visita, v.primera), v.primera)
from (
  select cliente_id, count(*)::int as n, max(inicio)::date as ultima, min(inicio)::date as primera
  from public.citas
  where negocio_id = 'demo_salon_001' and estado = 'completada'
  group by cliente_id
) v
where cl.negocio_id = 'demo_salon_001' and cl.id = v.cliente_id;

update public.clientes cl set ticket_medio = round(t.media::numeric, 2)
from (
  select o.cliente_id, avg(o.total_cents) / 100.0 as media
  from public.cobros o where o.negocio_id = 'demo_salon_001' group by o.cliente_id
) t
where cl.negocio_id = 'demo_salon_001' and cl.id = t.cliente_id;

-- --- Comprobacion: tiene que dar 0 ------------------------------------------
-- select count(*) from public.citas c
--   join public.negocio_horarios h on h.negocio_id = c.negocio_id
--    and h.dia_semana = (extract(isodow from c.inicio at time zone 'Europe/Madrid')::int - 1)
--  where c.negocio_id = 'demo_salon_001'
--    and ( h.abierto = false
--          or (c.inicio at time zone 'Europe/Madrid')::time < h.apertura::time
--          or (c.fin    at time zone 'Europe/Madrid')::time > h.cierre::time
--          or (h.pausa_inicio is not null
--              and (c.fin    at time zone 'Europe/Madrid')::time > h.pausa_inicio::time
--              and (c.inicio at time zone 'Europe/Madrid')::time < h.pausa_fin::time) );
