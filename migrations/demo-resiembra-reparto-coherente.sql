-- ============================================================================
-- Demo compartida: que la re-siembra reparta un dia COHERENTE.
--
-- `resembrar_demo()` (pg_cron cada 2 h) elegia su reparto asi:
--
--     select id from clientes where nombre ~ '^[A-Z][a-z]+ [A-Z]' order by nombre limit 8
--
-- Es decir, las ocho primeras por orden alfabetico. Mientras el fichero tenia
-- ocho clientas daba igual; en cuanto se lleno de verdad (~280, que es lo que
-- hace falta para que Informes ensene graficas creibles) el dia de la demo paso
-- a ser "Aitor Fuentes, Alba Bello, Alba Bermudez, Alba Cabrera...": cinco Albas
-- seguidas, y a un senor le tocaba el corte de senora.
--
-- Cambios de esta migracion:
--  1. REPARTO FIJO por nombre. La demo tiene un guion (Carmen Ruiz es la clienta
--     de las mechas, que es la cita que abre el recorrido guiado) y el guion no
--     puede depender del orden alfabetico del fichero.
--  2. Servicios coherentes con cada persona: barba y corte de caballero para
--     ellos, color y corte de senora para ellas.
--  3. La cita de las mechas nace CON FORMULA Y CON PRODUCTOS. Dos pasos del
--     recorrido ("la formula de color, guardada" y "los productos que se lleva")
--     enseñaban pantallas vacias porque la cita se creaba pelada.
--  4. Si la re-siembra cae fuera del horario del salon (de noche, que es cuando
--     corre el cron), el bloque "en vivo" queda como COMPLETADA en vez de
--     confirmada. Antes quedaban cinco citas confirmadas con hora pasada y la
--     demo abria con una franja roja de "5 retrasos" tapando la cabecera.
-- ============================================================================

create or replace function public.resembrar_demo()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_negocio  text := 'demo_salon_001';
  v_dia      timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  v_manana   timestamptz := v_dia + interval '1 day';
  v_ahora    timestamptz := now();
  v_ancla    timestamptz;
  v_envivo   boolean;
  v_estado   text;
  v_carlos   uuid;  v_laura uuid;  v_maria uuid;
  v_mechas   uuid;  v_colorraiz uuid;  v_cortec uuid;  v_cortes uuid;  v_lavado uuid;  v_barba uuid;
  -- El reparto: cada quien con su nombre, no "la primera de la lista".
  v_carmen   uuid;  v_elena uuid;  v_lucia uuid;  v_sara uuid;
  v_javier   uuid;  v_pablo uuid;  v_marcos uuid;  v_hugo uuid;
  v_cita_mechas uuid;
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

  select id into v_carmen from public.clientes where negocio_id = v_negocio and nombre = 'Carmen Ruiz'      limit 1;
  select id into v_elena  from public.clientes where negocio_id = v_negocio and nombre = 'Elena Martínez'   limit 1;
  select id into v_lucia  from public.clientes where negocio_id = v_negocio and nombre = 'Lucía Blanco'     limit 1;
  select id into v_sara   from public.clientes where negocio_id = v_negocio and nombre = 'Sara Domínguez'   limit 1;
  select id into v_javier from public.clientes where negocio_id = v_negocio and nombre = 'Javier López'     limit 1;
  select id into v_pablo  from public.clientes where negocio_id = v_negocio and nombre = 'Pablo Navarro'    limit 1;
  select id into v_marcos from public.clientes where negocio_id = v_negocio and nombre = 'Marcos Sanz'      limit 1;
  select id into v_hugo   from public.clientes where negocio_id = v_negocio and nombre = 'Hugo Morales'     limit 1;

  if v_carlos is null or v_laura is null or v_maria is null or v_mechas is null
     or v_carmen is null or v_elena is null or v_lucia is null or v_sara is null
     or v_javier is null or v_pablo is null or v_marcos is null or v_hugo is null then
    return 'demo sin el reparto esperado: no se resiembra';
  end if;

  -- Ancla del "ahora mismo" de la demo: la media hora en curso, dentro del
  -- horario del salon. Si el cron corre de madrugada se queda en el tope.
  v_ancla := greatest(
               v_dia + interval '10 hours',
               least(
                 date_trunc('hour', v_ahora) + interval '30 minutes' * ceil(extract(minute from v_ahora) / 30.0),
                 v_dia + interval '18 hours'
               )
             );
  -- ¿El bloque anclado cae de verdad en el futuro? Si no, no puede quedarse en
  -- "confirmada": serian retrasos y la demo abriria en rojo.
  v_envivo := v_ancla >= v_ahora;
  v_estado := case when v_envivo then 'confirmada' else 'completada' end;

  -- Se conserva todo lo que ya tiene cobro (el historial largo que alimenta
  -- Informes y el historial de las fichas); se regenera solo el dia.
  delete from public.citas c
   where c.negocio_id = v_negocio
     and not exists (select 1 from public.cobros co where co.cita_id = c.id);

  -- --- Bloque anclado: lo que esta pasando "ahora" en el salon --------------
  -- La primera es la de las mechas de Carmen: tiene reposo (40 min activo, 35
  -- de reposo) y dentro de ese reposo entra el lavado de Sara con la MISMA
  -- profesional. Ese solape a proposito es el que explica el capitulo de los
  -- reposos y el aviso "en el reposo de esta cita".
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera,
     estado, confirmada_cliente, canal, formula_producto, formula_tono, formula_tiempo_min,
     formula_resultado, formula_notas, notas)
  values
    (v_negocio, v_carmen, v_mechas, v_maria,
     v_ancla, v_ancla + interval '75 minutes',
     v_ancla + interval '40 minutes', v_ancla + interval '75 minutes',
     v_estado, true, 'manual',
     'Igora Royal + Blondme',
     '9.1 + 10.1 (2:1) · oxidante 20 vol',
     35,
     'Rubio ceniza natural. Raiz difuminada, medios y puntas iluminados sin naranja.',
     'Matiz final con 10.1 diluido 5 min. La proxima vez, subir medio tono en medios.',
     'Retoque de balayage. Recordar crema barrera en la nuca (cuero sensible).')
  returning id into v_cita_mechas;

  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, confirmada_cliente, canal)
  values
    -- Dentro del reposo de las mechas, con Maria: el hueco productivo.
    (v_negocio, v_sara, v_lavado, v_maria,
     v_ancla + interval '45 minutes', v_ancla + interval '75 minutes',
     null, null, v_estado, true, 'whatsapp'),
    (v_negocio, v_lucia, v_colorraiz, v_laura,
     v_ancla + interval '30 minutes', v_ancla + interval '80 minutes',
     v_ancla + interval '50 minutes', v_ancla + interval '80 minutes',
     v_estado, true, 'manual'),
    (v_negocio, v_javier, v_cortec, v_carlos,
     v_ancla + interval '90 minutes', v_ancla + interval '115 minutes',
     null, null, v_estado, true, 'web'),
    (v_negocio, v_hugo, v_barba, v_carlos,
     v_ancla + interval '125 minutes', v_ancla + interval '140 minutes',
     null, null, v_estado, false, 'whatsapp');

  -- Los productos que se lleva Carmen: sin esto, el paso "los productos que se
  -- lleva" abria el catalogo del salon con la cita vacia.
  insert into public.cita_productos (negocio_id, cita_id, producto_id, nombre, precio_cents, cantidad)
  select v_negocio, v_cita_mechas, p.id, p.nombre, p.precio_cents, 1
    from public.productos p
   where p.negocio_id = v_negocio
     and p.nombre in ('Champú hidratante 300 ml', 'Mascarilla reparadora 250 ml');

  -- --- La manana ya trabajada (solo lo que cabe antes del ancla) ------------
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select * from (values
    (v_negocio, v_javier, v_cortec, v_carlos, v_dia + interval '9 hours',             v_dia + interval '9 hours 35 minutes',  'completada', true, 'manual'),
    (v_negocio, v_sara,   v_lavado, v_maria,  v_dia + interval '9 hours 45 minutes',  v_dia + interval '10 hours 5 minutes',  'completada', true, 'web'),
    (v_negocio, v_pablo,  v_barba,  v_carlos, v_dia + interval '10 hours 15 minutes', v_dia + interval '10 hours 30 minutes', 'completada', true, 'manual'),
    (v_negocio, v_elena,  v_cortes, v_laura,  v_dia + interval '11 hours',            v_dia + interval '11 hours 45 minutes', 'completada', true, 'whatsapp')
  ) as t(n, cl, sv, pr, ini, fin, est, conf, can)
  where t.fin <= v_ancla;

  -- Cobro de las completadas de HOY que aun no lo tengan: metodos mezclados y
  -- una propina, para que el arqueo de Caja y los ingresos de Informes no
  -- salgan a cero (dos pasos del recorrido guiado prometen justo eso).
  with completadas as (
    select c.id, c.cliente_id, c.profesional_id, c.servicio_id, c.fin,
           (coalesce(s.precio, 0) * 100)::int as cents,
           row_number() over (order by c.inicio) as n
      from public.citas c
      join public.servicios s on s.id = c.servicio_id
     where c.negocio_id = v_negocio
       and c.estado = 'completada'
       and c.inicio >= v_dia and c.inicio < v_manana
       -- La de las mechas se queda SIN cobrar a proposito: el paso "cobra aqui
       -- mismo" necesita una cita con el cobro por hacer.
       and c.id <> v_cita_mechas
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

  -- Un retraso de verdad, solo en horario de salon: la agenda avisa de la cita
  -- que se ha pasado de hora. Fuera de horario no se pone (seria un rojo eterno).
  if v_ahora between v_dia + interval '10 hours' and v_dia + interval '20 hours' then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
    values
      (v_negocio, v_marcos, v_cortec, v_carlos,
       v_ahora - interval '40 minutes', v_ahora - interval '10 minutes',
       'confirmada', true, 'manual');
  end if;

  -- --- Manana: mezcla de confirmadas y sin confirmar ------------------------
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, confirmada_cliente, canal)
  values
    (v_negocio, v_lucia, v_mechas, v_maria,
     v_manana + interval '10 hours', v_manana + interval '11 hours 15 minutes',
     v_manana + interval '10 hours 40 minutes', v_manana + interval '11 hours 15 minutes',
     'confirmada', false, 'whatsapp'),
    (v_negocio, v_marcos, v_cortec, v_carlos,
     v_manana + interval '11 hours', v_manana + interval '11 hours 35 minutes',
     null, null, 'confirmada', false, 'web'),
    (v_negocio, v_elena, v_colorraiz, v_laura,
     v_manana + interval '12 hours', v_manana + interval '12 hours 50 minutes',
     v_manana + interval '12 hours 20 minutes', v_manana + interval '12 hours 50 minutes',
     'confirmada', false, 'whatsapp'),
    (v_negocio, v_javier, v_cortec, v_carlos,
     v_manana + interval '16 hours', v_manana + interval '16 hours 25 minutes',
     null, null, 'pendiente', false, 'web'),
    (v_negocio, v_pablo, v_barba, v_laura,
     v_manana + interval '17 hours', v_manana + interval '17 hours 15 minutes',
     null, null, 'pendiente', false, 'whatsapp');

  select count(*) into v_n from public.citas where negocio_id = v_negocio;
  select count(*) into v_cobros from public.cobros where negocio_id = v_negocio and cobrado_at >= v_dia;
  return format('demo resembrada: %s citas, %s cobros de hoy, ancla %s (%s)',
                v_n, v_cobros, to_char(v_ancla at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'),
                case when v_envivo then 'en vivo' else 'dia cerrado' end);
end;
$function$;

revoke all on function public.resembrar_demo() from public, anon, authenticated;
