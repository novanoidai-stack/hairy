-- Demo compartida: que la CAJA y los INFORMES nunca salgan a cero.
--
-- `resembrar_demo()` ya creaba citas "completada" por la manana para que Caja
-- tuviera algo que cobrar, pero no creaba COBROS. Resultado: el arqueo del dia
-- y los ingresos de Informes marcaban 0,00 EUR siempre, justo en dos pasos del
-- recorrido guiado que prometen lo contrario ("el arqueo del dia, cuadrado
-- solo" / "ingresos cobrados de verdad").
--
-- Cambios respecto a la version anterior (todo dentro de demo_salon_001):
--  Tras crear las citas completadas de la manana, se les genera su cobro (con
--  metodos mezclados y una propina) y su linea de servicio.
--
--  Los cobros NO se borran: hay un trigger `prevent_delete_financial_records`
--  (Ley Antifraude 11/2021) que lo impide. Por eso solo se ANADEN los que
--  falten (`not exists`), y las citas con cobro sobreviven a la resiembra —lo
--  que de paso le da historico real a Informes—.
--
-- Idempotente: se puede volver a ejecutar tantas veces como haga falta.

create or replace function public.resembrar_demo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio  text := 'demo_salon_001';
  v_dia      timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  v_manana   timestamptz := v_dia + interval '1 day';
  v_ahora    timestamptz := now();
  v_ancla    timestamptz;
  v_carlos   uuid;  v_laura uuid;  v_maria uuid;
  v_mechas   uuid;  v_colorraiz uuid;  v_cortec uuid;  v_cortes uuid;  v_lavado uuid;  v_barba uuid;
  v_cli      uuid[];
  v_n        int;
  v_cobros   int;
begin
  select id into v_carlos from public.profesionales where negocio_id = v_negocio and nombre ilike 'Carlos%' limit 1;
  select id into v_laura  from public.profesionales where negocio_id = v_negocio and nombre ilike 'Laura%'  limit 1;
  select id into v_maria  from public.profesionales where negocio_id = v_negocio and nombre ilike 'Maria%'  limit 1;
  select id into v_mechas    from public.servicios where negocio_id = v_negocio and nombre ilike 'Mechas%'   limit 1;
  select id into v_colorraiz from public.servicios where negocio_id = v_negocio and nombre ilike 'Color%'    limit 1;
  select id into v_cortec    from public.servicios where negocio_id = v_negocio and nombre ilike 'Corte cab%' limit 1;
  select id into v_cortes    from public.servicios where negocio_id = v_negocio and nombre ilike 'Corte sen%' limit 1;
  select id into v_lavado    from public.servicios where negocio_id = v_negocio and nombre ilike 'Lavado%'   limit 1;
  select id into v_barba     from public.servicios where negocio_id = v_negocio and nombre ilike 'Barba%'    limit 1;
  select array_agg(id) into v_cli from (
    select id from public.clientes
    where negocio_id = v_negocio and nombre ~ '^[A-Z][a-z]+ [A-Z]'
    order by nombre limit 8
  ) c;
  if v_carlos is null or v_laura is null or v_maria is null or v_mechas is null or v_cli is null or array_length(v_cli, 1) < 6 then
    return 'demo sin catalogo suficiente: no se resiembra';
  end if;

  v_ancla := greatest(
               v_dia + interval '10 hours',
               least(
                 date_trunc('hour', v_ahora) + interval '30 minutes' * ceil(extract(minute from v_ahora) / 30.0),
                 v_dia + interval '18 hours'
               )
             );

  delete from public.citas c
   where c.negocio_id = v_negocio
     and not exists (select 1 from public.cobros co where co.cita_id = c.id);

  -- Cita estrella (reposo + cita encajada dentro) y el resto por venir.
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, confirmada_cliente, canal)
  values
    (v_negocio, v_cli[1], v_mechas, v_maria,
     v_ancla, v_ancla + interval '75 minutes',
     v_ancla + interval '40 minutes', v_ancla + interval '75 minutes',
     'confirmada', true, 'manual'),
    (v_negocio, v_cli[2], v_cortec, v_maria,
     v_ancla + interval '45 minutes', v_ancla + interval '70 minutes',
     null, null, 'confirmada', true, 'whatsapp'),
    (v_negocio, v_cli[3], v_colorraiz, v_laura,
     v_ancla + interval '30 minutes', v_ancla + interval '80 minutes',
     v_ancla + interval '50 minutes', v_ancla + interval '80 minutes',
     'confirmada', true, 'manual'),
    (v_negocio, v_cli[4], v_cortes, v_carlos,
     v_ancla + interval '90 minutes', v_ancla + interval '125 minutes',
     null, null, 'confirmada', true, 'web'),
    (v_negocio, v_cli[5], v_barba, v_laura,
     v_ancla + interval '100 minutes', v_ancla + interval '115 minutes',
     null, null, 'confirmada', false, 'whatsapp');

  -- Completadas en franjas FIJAS de manana: entran las que caben antes del
  -- ancla, asi que siempre hay al menos una (Caja e Informes nunca a cero).
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select * from (values
    (v_negocio, v_cli[4], v_cortes, v_carlos, v_dia + interval '9 hours',                  v_dia + interval '9 hours 35 minutes',  'completada', true, 'manual'),
    (v_negocio, v_cli[5], v_lavado, v_carlos, v_dia + interval '9 hours 45 minutes',       v_dia + interval '10 hours 5 minutes',  'completada', true, 'web'),
    (v_negocio, v_cli[6], v_barba,  v_laura,  v_dia + interval '10 hours 15 minutes',      v_dia + interval '10 hours 30 minutes', 'completada', true, 'manual'),
    (v_negocio, v_cli[1], v_cortec, v_laura,  v_dia + interval '11 hours',                 v_dia + interval '11 hours 25 minutes', 'completada', true, 'whatsapp')
  ) as t(n, cl, sv, pr, ini, fin, est, conf, can)
  where t.fin <= v_ancla;

  -- Cobro de las completadas de HOY que aun no lo tengan: metodos mezclados y
  -- una propina, para que el arqueo del dia tenga efectivo, datafono y propinas
  -- de verdad.
  with completadas as (
    select c.id, c.cliente_id, c.profesional_id, c.servicio_id, c.fin,
           (coalesce(s.precio, 0) * 100)::int as cents,
           row_number() over (order by c.inicio) as n
      from public.citas c
      join public.servicios s on s.id = c.servicio_id
     where c.negocio_id = v_negocio
       and c.estado = 'completada'
       and c.inicio >= v_dia and c.inicio < v_manana
       and not exists (select 1 from public.cobros co where co.cita_id = c.id)
  ), ins as (
    insert into public.cobros
      (negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents,
       metodo, efectivo_cents, datafono_cents, origen, estado, cobrado_at)
    select v_negocio, x.id, x.profesional_id, x.cliente_id, x.cents,
           case when x.n = 1 then 200 else 0 end,
           case when x.n % 2 = 1 then 'datafono' else 'efectivo' end,
           case when x.n % 2 = 1 then 0 else x.cents end,
           case when x.n % 2 = 1 then x.cents + (case when x.n = 1 then 200 else 0 end) else 0 end,
           'pos', 'completado', x.fin + interval '5 minutes'
      from completadas x
    returning id, cita_id, total_cents
  )
  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  select i.id, 'servicio', c.servicio_id, s.nombre, i.total_cents, 1
    from ins i
    join public.citas c on c.id = i.cita_id
    join public.servicios s on s.id = c.servicio_id;

  -- Un retraso pequeno y creible, solo si la hora acompana.
  if v_ahora between v_dia + interval '10 hours' and v_dia + interval '20 hours' then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
    values
      (v_negocio, v_cli[6], v_cortes, v_carlos,
       v_ahora - interval '40 minutes', v_ahora - interval '10 minutes',
       'confirmada', true, 'manual');
  end if;

  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, confirmada_cliente, canal)
  values
    (v_negocio, v_cli[2], v_mechas, v_maria,
     v_manana + interval '10 hours', v_manana + interval '11 hours 15 minutes',
     v_manana + interval '10 hours 40 minutes', v_manana + interval '11 hours 15 minutes',
     'confirmada', false, 'whatsapp'),
    (v_negocio, v_cli[4], v_cortes, v_carlos,
     v_manana + interval '11 hours', v_manana + interval '11 hours 35 minutes',
     null, null, 'confirmada', false, 'web'),
    (v_negocio, v_cli[5], v_colorraiz, v_laura,
     v_manana + interval '12 hours', v_manana + interval '12 hours 50 minutes',
     v_manana + interval '12 hours 20 minutes', v_manana + interval '12 hours 50 minutes',
     'confirmada', false, 'whatsapp'),
    (v_negocio, v_cli[6], v_cortec, v_carlos,
     v_manana + interval '16 hours', v_manana + interval '16 hours 25 minutes',
     null, null, 'pendiente', false, 'web'),
    (v_negocio, v_cli[1], v_barba, v_laura,
     v_manana + interval '17 hours', v_manana + interval '17 hours 15 minutes',
     null, null, 'pendiente', false, 'whatsapp');

  select count(*) into v_n from public.citas where negocio_id = v_negocio;
  select count(*) into v_cobros from public.cobros where negocio_id = v_negocio and cobrado_at >= v_dia;
  return format('demo resembrada: %s citas, %s cobros de hoy, ancla %s',
                v_n, v_cobros, to_char(v_ancla at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'));
end;
$$;
