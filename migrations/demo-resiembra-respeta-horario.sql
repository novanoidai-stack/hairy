-- ---------------------------------------------------------------------------
-- La resiembra de la demo tenia dos fallos que se veian a simple vista.
--
-- 1) NO MIRABA EL HORARIO. Sembraba "hoy" y "mañana" pasara lo que pasara, asi
--    que un domingo (el salon cierra) la agenda salia con 22 citas pintadas
--    sobre la rejilla rayada de "fuera de jornada", y un sabado (cierra a las
--    14:30) con citas hasta las 20:20. Ahora el dia escaparate es HOY si el
--    salon abre y, si no, el PROXIMO dia que abra (mirando negocio_horarios y
--    cierres_negocio), y ninguna cita se sale de la ventana del dia ni cae
--    dentro de la pausa de comida.
--
-- 2) SE ACUMULABA. El unico borrado era "las citas que no tengan cobro", pero
--    la propia funcion le creaba el cobro a cada cita en cuanto pasaba a
--    'completada'. Como el cron corre cada 2 h, cada pasada dejaba cinco citas
--    inmunes al borrado de la siguiente: el dia acababa con 22-24 citas de las
--    mismas cuatro clientas, repetidas cada hora. Ahora el material de
--    escaparate (de hoy en adelante) se borra ENTERO —cobros incluidos— y se
--    vuelve a generar. Se puede porque `prevent_delete_financial_records()`
--    exime a `demo_salon_001`; en cualquier otro salon seguiria prohibido.
--
-- Lo que NO se toca: las citas anteriores a hoy. Ahi viven el historial largo
-- de `scripts/seed-demo-salon.sql` y los dias de escaparate ya vividos, que se
-- quedan con su cobro y son los que alimentan Informes.
-- ---------------------------------------------------------------------------

create or replace function public.resembrar_demo()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_negocio  text := 'demo_salon_001';
  v_ahora    timestamptz := now();
  v_hoy      date := (now() at time zone 'Europe/Madrid')::date;

  -- Dia escaparate (el que ve quien entra) y el siguiente dia abierto.
  v_dia_f    date;
  v_sig_f    date;
  v_desde    timestamptz;   -- medianoche de hoy: de aqui en adelante se regenera todo

  -- Ventana del dia escaparate y del siguiente.
  v_abre     timestamptz;  v_cierra   timestamptz;
  v_pi       timestamptz;  v_pf       timestamptz;
  v_abre2    timestamptz;  v_cierra2  timestamptz;
  v_pi2      timestamptz;  v_pf2      timestamptz;

  v_apert    time;  v_cier    time;  v_pausa_i  time;  v_pausa_f  time;

  -- El bloque escaparate ocupa 140 min desde el ancla (la ultima cita empieza
  -- a +125 y acaba a +140): el ancla no puede pasar de cierre-140.
  v_bloque   constant interval := interval '140 minutes';
  v_ancla    timestamptz;
  v_suelo    timestamptz;
  v_tope     timestamptz;

  v_carlos   uuid;  v_laura uuid;  v_maria uuid;
  v_mechas   uuid;  v_colorraiz uuid;  v_cortec uuid;  v_cortes uuid;  v_lavado uuid;  v_barba uuid;
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
  -- 'Corte sen%' NO casaba con "Corte señora y peinado" (la ñ), asi que
  -- v_cortes salia null y la cita de Elena se creaba SIN SERVICIO en cada
  -- pasada: sin precio, sin cobro y sin nombre en la agenda. 'Corte se%' no es
  -- ambiguo, el otro corte empieza por "Corte ca".
  select id into v_cortes    from public.servicios where negocio_id = v_negocio and nombre ilike 'Corte se%' limit 1;
  select id into v_lavado    from public.servicios where negocio_id = v_negocio and nombre ilike 'Lavado%'   limit 1;
  select id into v_barba     from public.servicios where negocio_id = v_negocio and nombre ilike 'Barba%'    limit 1;

  select id into v_carmen from public.clientes where negocio_id = v_negocio and nombre = 'Carmen Ruiz'    limit 1;
  select id into v_elena  from public.clientes where negocio_id = v_negocio and nombre = 'Elena Martínez' limit 1;
  select id into v_lucia  from public.clientes where negocio_id = v_negocio and nombre = 'Lucía Blanco'   limit 1;
  select id into v_sara   from public.clientes where negocio_id = v_negocio and nombre = 'Sara Domínguez' limit 1;
  select id into v_javier from public.clientes where negocio_id = v_negocio and nombre = 'Javier López'   limit 1;
  select id into v_pablo  from public.clientes where negocio_id = v_negocio and nombre = 'Pablo Navarro'  limit 1;
  select id into v_marcos from public.clientes where negocio_id = v_negocio and nombre = 'Marcos Sanz'    limit 1;
  select id into v_hugo   from public.clientes where negocio_id = v_negocio and nombre = 'Hugo Morales'   limit 1;

  -- Los SEIS servicios entran en el guarda, no solo las mechas: si falta uno,
  -- la cita que lo usaba se creaba con servicio_id null y en la agenda salia
  -- una cita sin nombre, sin precio y sin cobro posible.
  if v_carlos is null or v_laura is null or v_maria is null
     or v_mechas is null or v_colorraiz is null or v_cortec is null
     or v_cortes is null or v_lavado is null or v_barba is null
     or v_carmen is null or v_elena is null or v_lucia is null or v_sara is null
     or v_javier is null or v_pablo is null or v_marcos is null or v_hugo is null then
    return 'demo sin el reparto esperado: no se resiembra';
  end if;

  -- --- Que dia se enseña -----------------------------------------------------
  -- Hoy si el salon abre; si no, el primer dia que abra (mirando el horario
  -- semanal y los cierres puntuales). Sin esto, un domingo la demo enseñaba un
  -- dia cerrado lleno de citas.
  select d::date into v_dia_f
    from generate_series(v_hoy::timestamp, (v_hoy + 14)::timestamp, interval '1 day') d
   where coalesce((select h.abierto from public.negocio_horarios h
                    where h.negocio_id = v_negocio
                      and h.dia_semana = (extract(isodow from d)::int - 1)), true)
     and not exists (select 1 from public.cierres_negocio c
                      where c.negocio_id = v_negocio and c.fecha = d::date)
   order by d
   limit 1;

  if v_dia_f is null then
    return 'demo sin ningun dia abierto en 14 dias: no se resiembra';
  end if;

  select d::date into v_sig_f
    from generate_series((v_dia_f + 1)::timestamp, (v_dia_f + 15)::timestamp, interval '1 day') d
   where coalesce((select h.abierto from public.negocio_horarios h
                    where h.negocio_id = v_negocio
                      and h.dia_semana = (extract(isodow from d)::int - 1)), true)
     and not exists (select 1 from public.cierres_negocio c
                      where c.negocio_id = v_negocio and c.fecha = d::date)
   order by d
   limit 1;

  -- --- Ventana de cada uno de los dos dias -----------------------------------
  v_apert := null; v_cier := null; v_pausa_i := null; v_pausa_f := null;
  select h.apertura, h.cierre, h.pausa_inicio, h.pausa_fin
    into v_apert, v_cier, v_pausa_i, v_pausa_f
    from public.negocio_horarios h
   where h.negocio_id = v_negocio
     and h.dia_semana = (extract(isodow from v_dia_f)::int - 1);
  v_abre   := (v_dia_f + coalesce(v_apert, time '09:00')) at time zone 'Europe/Madrid';
  v_cierra := (v_dia_f + coalesce(v_cier,  time '20:00')) at time zone 'Europe/Madrid';
  v_pi := case when v_pausa_i is not null then (v_dia_f + v_pausa_i) at time zone 'Europe/Madrid' end;
  v_pf := case when v_pausa_f is not null then (v_dia_f + v_pausa_f) at time zone 'Europe/Madrid' end;

  if v_sig_f is not null then
    v_apert := null; v_cier := null; v_pausa_i := null; v_pausa_f := null;
    select h.apertura, h.cierre, h.pausa_inicio, h.pausa_fin
      into v_apert, v_cier, v_pausa_i, v_pausa_f
      from public.negocio_horarios h
     where h.negocio_id = v_negocio
       and h.dia_semana = (extract(isodow from v_sig_f)::int - 1);
    v_abre2   := (v_sig_f + coalesce(v_apert, time '09:00')) at time zone 'Europe/Madrid';
    v_cierra2 := (v_sig_f + coalesce(v_cier,  time '20:00')) at time zone 'Europe/Madrid';
    v_pi2 := case when v_pausa_i is not null then (v_sig_f + v_pausa_i) at time zone 'Europe/Madrid' end;
    v_pf2 := case when v_pausa_f is not null then (v_sig_f + v_pausa_f) at time zone 'Europe/Madrid' end;
  end if;

  -- --- El ancla del bloque escaparate ----------------------------------------
  -- Si el dia enseñado es hoy, el bloque arranca en la proxima media hora (asi
  -- la cita estrella esta EN VIVO y el visitante ve la linea de "ahora" entre
  -- citas). Si es un dia futuro, a dos horas de abrir. En los dos casos se
  -- respeta la ventana: nunca antes de una hora despues de abrir, nunca tan
  -- tarde que el bloque se salga del cierre, y nunca a caballo de la pausa.
  v_suelo := v_abre + interval '60 minutes';
  v_tope  := v_cierra - v_bloque;
  -- A media hora en punto: un dia corto (sabado) daba topes como las 12:10.
  v_tope  := date_trunc('hour', v_tope)
             + interval '30 minutes' * floor(extract(minute from v_tope) / 30.0);
  if v_tope < v_suelo then v_tope := v_suelo; end if;

  if v_dia_f = v_hoy then
    v_ancla := least(
                 greatest(
                   date_trunc('hour', v_ahora) + interval '30 minutes' * ceil(extract(minute from v_ahora) / 30.0),
                   v_suelo),
                 v_tope);
  else
    v_ancla := least(v_abre + interval '2 hours', v_tope);
  end if;

  if v_pi is not null and v_pf is not null
     and v_ancla < v_pf and v_ancla + v_bloque > v_pi then
    -- El bloque pisa la comida: se va detras si cabe, y si no, delante.
    if v_pf + v_bloque <= v_cierra then
      v_ancla := v_pf;
    else
      v_ancla := greatest(v_pi - v_bloque, v_abre);
    end if;
  end if;

  -- --- Borrado: de hoy en adelante se regenera todo ---------------------------
  -- Incluye los cobros. Sin esto la funcion se pisaba a si misma: dejaba cinco
  -- citas cobradas por pasada y el dia se llenaba (ver cabecera del fichero).
  v_desde := (v_hoy::timestamp) at time zone 'Europe/Madrid';

  update public.citas
     set cobro_id = null
   where negocio_id = v_negocio and inicio >= v_desde and cobro_id is not null;

  -- Las lineas van ANTES y a mano, no por el cascade del FK: el guarda
  -- `prevent_delete_financial_records()` mira el negocio de la linea saltando a
  -- su cobro, y en el cascade ese cobro ya no existe, asi que la exencion de la
  -- demo no se aplicaba y saltaba "No se permite eliminar registros financieros".
  delete from public.cobro_lineas cl
   where cl.cobro_id in (select co.id from public.cobros co
                          where co.negocio_id = v_negocio
                            and co.cita_id in (select c.id from public.citas c
                                                where c.negocio_id = v_negocio
                                                  and c.inicio >= v_desde));

  delete from public.cobros co
   where co.negocio_id = v_negocio
     and co.cita_id in (select c.id from public.citas c
                         where c.negocio_id = v_negocio and c.inicio >= v_desde);

  -- El barrido de "citas sin cobro" se queda en la ultima semana. Antes iba
  -- sin limite y se comia el historial de canceladas y no presentadas que
  -- siembra scripts/seed-demo-salon.sql (esas citas no llevan cobro): dos horas
  -- despues de sembrar, la demo ya no tenia ni una sola cita cancelada.
  delete from public.citas c
   where c.negocio_id = v_negocio
     and (c.inicio >= v_desde
          or (c.inicio >= v_desde - interval '7 days'
              and not exists (select 1 from public.cobros co where co.cita_id = c.id)));

  -- --- Bloque escaparate: la cita estrella y su alrededor ---------------------
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera,
     estado, confirmada_cliente, canal, formula_producto, formula_tono, formula_tiempo_min,
     formula_resultado, formula_notas, notas)
  values
    (v_negocio, v_carmen, v_mechas, v_maria,
     v_ancla, v_ancla + interval '75 minutes',
     v_ancla + interval '40 minutes', v_ancla + interval '75 minutes',
     case when v_ancla + interval '75 minutes' <= v_ahora then 'completada' else 'confirmada' end,
     true, 'manual',
     'Igora Royal + Blondme',
     '9.1 + 10.1 (2:1) · oxidante 20 vol',
     35,
     'Rubio ceniza natural. Raiz difuminada, medios y puntas iluminados sin naranja.',
     'Matiz final con 10.1 diluido 5 min. La proxima vez, subir medio tono en medios.',
     'Retoque de balayage. Recordar crema barrera en la nuca (cuero sensible).')
  on conflict do nothing
  returning id into v_cita_mechas;

  if v_cita_mechas is null then
    select id into v_cita_mechas
      from public.citas
     where negocio_id = v_negocio and cliente_id = v_carmen
       and servicio_id = v_mechas and profesional_id = v_maria and inicio = v_ancla
     limit 1;
  end if;

  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera,
     estado, confirmada_cliente, canal)
  select v_negocio, t.cl, t.sv, t.pr, t.ini, t.fin, t.act, t.esp,
         case when t.fin <= v_ahora then 'completada' else 'confirmada' end,
         t.conf, t.can
    from (values
      (v_sara,  v_lavado,    v_maria,
       v_ancla + interval '45 minutes',  v_ancla + interval '75 minutes',
       null::timestamptz, null::timestamptz, true,  'whatsapp'),
      (v_lucia, v_colorraiz, v_laura,
       v_ancla + interval '30 minutes',  v_ancla + interval '80 minutes',
       v_ancla + interval '50 minutes',  v_ancla + interval '80 minutes', true,  'manual'),
      (v_javier, v_cortec,   v_carlos,
       v_ancla + interval '90 minutes',  v_ancla + interval '115 minutes',
       null::timestamptz, null::timestamptz, true,  'web'),
      (v_hugo,  v_barba,     v_carlos,
       v_ancla + interval '125 minutes', v_ancla + interval '140 minutes',
       null::timestamptz, null::timestamptz, false, 'whatsapp')
    ) as t(cl, sv, pr, ini, fin, act, esp, conf, can)
   where t.ini >= v_abre and t.fin <= v_cierra
     and (v_pi is null or t.fin <= v_pi or t.ini >= v_pf)
  on conflict do nothing;

  insert into public.cita_productos (negocio_id, cita_id, producto_id, nombre, precio_cents, cantidad)
  select v_negocio, v_cita_mechas, p.id, p.nombre, p.precio_cents, 1
    from public.productos p
   where p.negocio_id = v_negocio
     and v_cita_mechas is not null
     and p.nombre in ('Champú hidratante 300 ml', 'Mascarilla reparadora 250 ml')
     and not exists (
       select 1 from public.cita_productos cp
        where cp.cita_id = v_cita_mechas and cp.producto_id = p.id
     );

  -- --- La mañana del dia: lo que ya ha pasado (o lo que viene, si el dia es
  --     futuro). Solo entra lo que termina antes del bloque escaparate, que es
  --     lo que evita que se solapen en la misma columna.
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select v_negocio, t.cl, t.sv, t.pr, t.ini, t.fin,
         case when t.fin <= v_ahora then 'completada' else 'confirmada' end,
         true, t.can
    from (values
      (v_javier, v_cortec, v_carlos, v_abre,                          v_abre + interval '35 minutes',  'manual'),
      (v_sara,   v_lavado, v_maria,  v_abre + interval '45 minutes',  v_abre + interval '65 minutes',  'web'),
      (v_pablo,  v_barba,  v_carlos, v_abre + interval '75 minutes',  v_abre + interval '90 minutes',  'manual'),
      (v_elena,  v_cortes, v_laura,  v_abre + interval '120 minutes', v_abre + interval '165 minutes', 'whatsapp')
    ) as t(cl, sv, pr, ini, fin, can)
   where t.fin <= v_ancla
     and t.ini >= v_abre and t.fin <= v_cierra
     and (v_pi is null or t.fin <= v_pi or t.ini >= v_pf)
  on conflict do nothing;

  -- --- La tarde: solo lo que empieza DESPUES del bloque escaparate, para que
  --     el dia no se quede en una mañana suelta. Un sabado (cierra a las 14:30)
  --     esto no entra: se cae solo con el filtro de la ventana.
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select v_negocio, t.cl, t.sv, t.pr, t.ini, t.fin,
         case when t.fin <= v_ahora then 'completada' else 'confirmada' end,
         true, t.can
    from (values
      (v_marcos, v_cortec,    v_carlos, v_abre + interval '420 minutes', v_abre + interval '455 minutes', 'web'),
      (v_elena,  v_colorraiz, v_laura,  v_abre + interval '480 minutes', v_abre + interval '530 minutes', 'manual'),
      (v_sara,   v_lavado,    v_maria,  v_abre + interval '540 minutes', v_abre + interval '570 minutes', 'whatsapp')
    ) as t(cl, sv, pr, ini, fin, can)
   where t.ini >= v_ancla + v_bloque
     and t.ini >= v_abre and t.fin <= v_cierra
     and (v_pi is null or t.fin <= v_pi or t.ini >= v_pf)
  on conflict do nothing;

  -- --- El cobro de lo ya completado (es lo que leen Caja, el arqueo e Informes)
  with completadas as (
    select c.id, c.cliente_id, c.profesional_id, c.servicio_id, c.fin,
           (coalesce(s.precio, 0) * 100)::int as cents,
           row_number() over (order by c.inicio) as n
      from public.citas c
      join public.servicios s on s.id = c.servicio_id
     where c.negocio_id = v_negocio
       and c.estado = 'completada'
       and c.inicio >= v_desde
       and (v_cita_mechas is null or c.id <> v_cita_mechas)
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

  -- --- La cita que acaba de terminar (para que el dia se note vivo) -----------
  if v_dia_f = v_hoy
     and v_ahora - interval '40 minutes' >= v_abre
     and v_ahora - interval '10 minutes' <= v_cierra
     and (v_pi is null
          or v_ahora - interval '10 minutes' <= v_pi
          or v_ahora - interval '40 minutes' >= v_pf) then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
    values
      (v_negocio, v_marcos, v_cortec, v_carlos,
       v_ahora - interval '40 minutes', v_ahora - interval '10 minutes',
       'confirmada', true, 'manual')
    on conflict do nothing;
  end if;

  -- --- El dia siguiente que el salon abre ------------------------------------
  if v_sig_f is not null then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera,
       estado, confirmada_cliente, canal)
    select v_negocio, t.cl, t.sv, t.pr, t.ini, t.fin, t.act, t.esp, t.est, false, t.can
      from (values
        (v_lucia,  v_mechas,    v_maria,
         v_abre2 + interval '60 minutes',  v_abre2 + interval '135 minutes',
         v_abre2 + interval '100 minutes', v_abre2 + interval '135 minutes', 'confirmada', 'whatsapp'),
        (v_marcos, v_cortec,    v_carlos,
         v_abre2 + interval '120 minutes', v_abre2 + interval '155 minutes',
         null::timestamptz, null::timestamptz, 'confirmada', 'web'),
        (v_elena,  v_colorraiz, v_laura,
         v_abre2 + interval '180 minutes', v_abre2 + interval '230 minutes',
         v_abre2 + interval '210 minutes', v_abre2 + interval '230 minutes', 'confirmada', 'whatsapp'),
        (v_javier, v_cortec,    v_carlos,
         v_abre2 + interval '420 minutes', v_abre2 + interval '445 minutes',
         null::timestamptz, null::timestamptz, 'pendiente', 'web'),
        (v_pablo,  v_barba,     v_laura,
         v_abre2 + interval '480 minutes', v_abre2 + interval '495 minutes',
         null::timestamptz, null::timestamptz, 'pendiente', 'whatsapp')
      ) as t(cl, sv, pr, ini, fin, act, esp, est, can)
     where t.ini >= v_abre2 and t.fin <= v_cierra2
       and (v_pi2 is null or t.fin <= v_pi2 or t.ini >= v_pf2)
    on conflict do nothing;
  end if;

  select count(*) into v_n from public.citas where negocio_id = v_negocio;
  select count(*) into v_cobros from public.cobros where negocio_id = v_negocio and cobrado_at >= v_desde;
  return format('demo resembrada: %s citas, %s cobros del dia escaparate, dia %s (%s), siguiente %s, ancla %s',
                v_n, v_cobros,
                to_char(v_dia_f, 'YYYY-MM-DD'),
                case when v_dia_f = v_hoy then 'hoy' else 'hoy el salon cierra' end,
                coalesce(to_char(v_sig_f, 'YYYY-MM-DD'), '-'),
                to_char(v_ancla at time zone 'Europe/Madrid', 'HH24:MI'));
end;
$function$;
