-- Demo SIEMPRE viva (2-3 ago 2026). APLICADA en remoto.
--
-- PROBLEMA: la agenda de la demo compartida (demo_salon_001) estaba anclada a
-- fechas fijas, asi que envejecia sola: al dia siguiente de sembrarla el
-- visitante se encontraba un dia casi vacio. Y la demo es el principal
-- argumento de venta de la landing (todos los CTA llevan alli). Ademas es
-- interactiva: si alguien la ensucia, se queda ensuciada.
--
-- SOLUCION: `public.resembrar_demo()` regenera la agenda del tenant demo
-- anclandola a la HORA DE LA VISITA, y un job de pg_cron la ejecuta cada
-- madrugada. Cada visitante ve un dia realista y coherente, y de paso se limpia
-- lo que hayan dejado los anteriores.
--
-- El dia sembrado enseña a proposito lo que diferencia a Mecha:
--   - una cita con REPOSO (mechas) y otra ENCAJADA dentro de ese reposo,
--   - lo ya pasado COMPLETADO (para que Caja e Informes tengan cifras y el
--     salon no parezca desatendido) y UN solo retraso pequeno y creible,
--   - citas de MAÑANA sin confirmar por el cliente (insignia de avisos),
--   - citas PENDIENTES (para probar la confirmacion en bloque de Chispa).
--
-- DOS COSAS QUE APRENDIMOS AL HACERLA:
--   1. No se pueden borrar citas con un cobro registrado: el trigger
--      cobros_prevent_financial_updates lo impide (Ley Antifraude 11/2021) al
--      intentar poner cobros.cita_id a NULL. Por eso el delete excluye esas.
--   2. Sembrar a horas fijas hacia que, visitando por la tarde, todas las citas
--      de la manana salieran como "retraso" de varias horas. De ahi el anclaje
--      relativo a now().
--
-- Es SECURITY DEFINER porque las policies demo_block_* impiden borrar citas al
-- visitante; el job corre como owner y si puede rehacerlas.

create or replace function public.resembrar_demo()
returns text
language plpgsql
security definer
set search_path to 'public'
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
  -- Clientes con nombre "de persona": la demo acumula pruebas tipo "tintin".
  select array_agg(id) into v_cli from (
    select id from public.clientes
    where negocio_id = v_negocio and nombre ~ '^[A-Z][a-z]+ [A-Z]'
    order by nombre limit 8
  ) c;
  if v_carlos is null or v_laura is null or v_maria is null or v_mechas is null or v_cli is null or array_length(v_cli, 1) < 6 then
    return 'demo sin catalogo suficiente: no se resiembra';
  end if;

  -- Ancla = proxima media hora, siempre dentro de 10:00-18:00 para que la cita
  -- estrella quepa entera en la jornada la visite quien la visite.
  v_ancla := greatest(
               v_dia + interval '10 hours',
               least(
                 date_trunc('hour', v_ahora) + interval '30 minutes' * ceil(extract(minute from v_ahora) / 30.0),
                 v_dia + interval '18 hours'
               )
             );

  -- Las citas con cobro NO se tocan (ver nota 1 de la cabecera).
  delete from public.citas c
   where c.negocio_id = v_negocio
     and not exists (select 1 from public.cobros co where co.cita_id = c.id);

  -- Cita estrella + la encajada en su reposo, y el resto de la tarde.
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
  -- Antes se calculaban restando horas al ancla y, corriendo el cron de
  -- madrugada (ancla pegada a las 10:00), caian antes de las 9 y se descartaban
  -- TODAS: la demo amanecia sin una sola cita completada.
  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select * from (values
    (v_negocio, v_cli[4], v_cortes, v_carlos, v_dia + interval '9 hours',             v_dia + interval '9 hours 35 minutes',  'completada', true, 'manual'),
    (v_negocio, v_cli[5], v_lavado, v_carlos, v_dia + interval '9 hours 45 minutes',  v_dia + interval '10 hours 5 minutes',  'completada', true, 'web'),
    (v_negocio, v_cli[6], v_barba,  v_laura,  v_dia + interval '10 hours 15 minutes', v_dia + interval '10 hours 30 minutes', 'completada', true, 'manual'),
    (v_negocio, v_cli[1], v_cortec, v_laura,  v_dia + interval '11 hours',            v_dia + interval '11 hours 25 minutes', 'completada', true, 'whatsapp')
  ) as t(n, cl, sv, pr, ini, fin, est, conf, can)
  where t.fin <= v_ancla;

  -- Un unico retraso, pequeno y creible (empezo hace 40 min y deberia haber
  -- acabado hace 10): suficiente para ensenar el aviso sin parecer un desastre.
  if v_ahora between v_dia + interval '10 hours' and v_dia + interval '20 hours' then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
    values
      (v_negocio, v_cli[6], v_cortes, v_carlos,
       v_ahora - interval '40 minutes', v_ahora - interval '10 minutes',
       'confirmada', true, 'manual');
  end if;

  -- MANANA: sin confirmar por el cliente + pendientes (para Chispa).
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
  return format('demo resembrada: %s citas, ancla %s', v_n, to_char(v_ancla at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'));
end;
$$;

-- Solo el job (owner) la ejecuta: ni anon ni los usuarios pueden dispararla.
revoke all on function public.resembrar_demo() from public, anon, authenticated;

-- Cada 2 HORAS, no una vez al dia: la funcion ancla el dia a la hora en que
-- corre, asi que con una sola pasada de madrugada el resto de la jornada se
-- quedaba desfasada (la cita estrella ya pasada, la tarde vacia). Cada 2 horas
-- el visitante siempre pilla un dia con sentido, y de paso se limpia lo que
-- hayan tocado los anteriores. El estado de lo ya pasado lo mantiene el cron
-- `autocompletar-citas` (cada 15 min), que completa lo que termino hace poco.
select cron.unschedule('resembrar-demo-diaria')
where exists (select 1 from cron.job where jobname = 'resembrar-demo-diaria');

select cron.schedule('resembrar-demo', '0 */2 * * *', $cron$select public.resembrar_demo();$cron$);
