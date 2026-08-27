-- Demo: la resiembra deja de duplicar citas.
--
-- El fallo: `resembrar_demo` borra las citas SIN cobro y despues reinserta el
-- guion del dia entero. Pero al final de la misma ejecucion crea un cobro para
-- cada cita `completada` que no lo tenga. Resultado: en la siguiente pasada del
-- cron esas citas YA tienen cobro, no se borran... y se vuelven a insertar.
-- Cada ejecucion anadia una copia mas. En la agenda eso se ve como UNA cita
-- partida en columnas finas (7, 12 carriles), que parecen citas distintas.
--
-- Arreglo: todas las inserciones del guion son idempotentes — solo insertan si
-- no existe ya una cita del mismo cliente + servicio + profesional + inicio.
-- La identidad de una cita del guion es esa tupla, no su id.

-- ---------------------------------------------------------------------------
-- 0) El guard antifraude exime al tenant de DEMO.
--
-- `prevent_delete_financial_records` prohibe borrar cobros y lineas (Ley
-- 11/2021, VeriFactu). Esta bien y se queda tal cual para los salones REALES.
-- Pero `demo_salon_001` es un salon ficticio de escaparate: sus cobros no son
-- registros fiscales de nadie, y sin poder borrarlos la demo no se puede
-- limpiar ni resembrar (los duplicados se quedan para siempre e inflan la Caja).
-- La exencion es explicita y de un solo tenant: cualquier otro negocio sigue
-- topandose con la excepcion de siempre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_delete_financial_records()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
begin
  if TG_TABLE_NAME = 'cobros' then
    v_negocio := OLD.negocio_id;
  else
    select co.negocio_id into v_negocio from public.cobros co where co.id = OLD.cobro_id;
  end if;

  if v_negocio = 'demo_salon_001' then
    return OLD;
  end if;

  raise exception 'No se permite eliminar registros financieros del POS (Ley Antifraude 11/2021).';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 1) Limpieza de los duplicados que ya hay (se queda la copia mas antigua).
-- ---------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by cliente_id, servicio_id, profesional_id, inicio
           order by created_at nulls last, id
         ) as n
    from public.citas
   where negocio_id = 'demo_salon_001'
), sobrantes as (
  select id from ranked where n > 1
)
delete from public.cobro_lineas cl
 using public.cobros co
 where cl.cobro_id = co.id
   and co.cita_id in (select id from sobrantes);

with ranked as (
  select id,
         row_number() over (
           partition by cliente_id, servicio_id, profesional_id, inicio
           order by created_at nulls last, id
         ) as n
    from public.citas
   where negocio_id = 'demo_salon_001'
)
delete from public.cobros where cita_id in (select id from ranked where n > 1);

with ranked as (
  select id,
         row_number() over (
           partition by cliente_id, servicio_id, profesional_id, inicio
           order by created_at nulls last, id
         ) as n
    from public.citas
   where negocio_id = 'demo_salon_001'
)
delete from public.cita_productos where cita_id in (select id from ranked where n > 1);

with ranked as (
  select id,
         row_number() over (
           partition by cliente_id, servicio_id, profesional_id, inicio
           order by created_at nulls last, id
         ) as n
    from public.citas
   where negocio_id = 'demo_salon_001'
)
delete from public.citas where id in (select id from ranked where n > 1);

-- ---------------------------------------------------------------------------
-- 2) Red de seguridad: que la BD no permita volver a duplicar el guion.
--    Parcial (solo el tenant demo) para no imponer nada a los salones reales,
--    donde dos citas identicas seguidas si pueden ser legitimas.
-- ---------------------------------------------------------------------------
create unique index if not exists citas_demo_guion_unico
  on public.citas (cliente_id, servicio_id, profesional_id, inicio)
  where negocio_id = 'demo_salon_001';

-- ---------------------------------------------------------------------------
-- 3) La funcion: cada insercion del guion pasa a ser idempotente.
--    `on conflict do nothing` SIN objetivo captura cualquier violacion de unico,
--    asi que basta con el indice parcial de arriba: si la cita del guion ya
--    existe (porque tenia cobro y no se borro), no se duplica.
--    Ojo con la cita de mechas: si no se inserta, `returning` no devuelve fila
--    y v_cita_mechas se queda null. Hay que recuperar la que ya estaba, o el
--    filtro `c.id <> v_cita_mechas` se vuelve NULL y deja de crear cobros.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resembrar_demo()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select id into v_carmen from public.clientes where negocio_id = v_negocio and nombre = 'Carmen Ruiz'    limit 1;
  select id into v_elena  from public.clientes where negocio_id = v_negocio and nombre = 'Elena Martínez' limit 1;
  select id into v_lucia  from public.clientes where negocio_id = v_negocio and nombre = 'Lucía Blanco'   limit 1;
  select id into v_sara   from public.clientes where negocio_id = v_negocio and nombre = 'Sara Domínguez' limit 1;
  select id into v_javier from public.clientes where negocio_id = v_negocio and nombre = 'Javier López'   limit 1;
  select id into v_pablo  from public.clientes where negocio_id = v_negocio and nombre = 'Pablo Navarro'  limit 1;
  select id into v_marcos from public.clientes where negocio_id = v_negocio and nombre = 'Marcos Sanz'    limit 1;
  select id into v_hugo   from public.clientes where negocio_id = v_negocio and nombre = 'Hugo Morales'   limit 1;

  if v_carlos is null or v_laura is null or v_maria is null or v_mechas is null
     or v_carmen is null or v_elena is null or v_lucia is null or v_sara is null
     or v_javier is null or v_pablo is null or v_marcos is null or v_hugo is null then
    return 'demo sin el reparto esperado: no se resiembra';
  end if;

  v_ancla := greatest(
               v_dia + interval '10 hours',
               least(
                 date_trunc('hour', v_ahora) + interval '30 minutes' * ceil(extract(minute from v_ahora) / 30.0),
                 v_dia + interval '18 hours'
               )
             );
  v_envivo := v_ancla >= v_ahora;
  v_estado := case when v_envivo then 'confirmada' else 'completada' end;

  delete from public.citas c
   where c.negocio_id = v_negocio
     and not exists (select 1 from public.cobros co where co.cita_id = c.id);

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
  on conflict do nothing
  returning id into v_cita_mechas;

  -- Si ya existia (tenia cobro y sobrevivio al borrado), la recuperamos: el
  -- resto de la funcion la usa como referencia.
  if v_cita_mechas is null then
    select id into v_cita_mechas
      from public.citas
     where negocio_id = v_negocio and cliente_id = v_carmen
       and servicio_id = v_mechas and profesional_id = v_maria and inicio = v_ancla
     limit 1;
  end if;

  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, confirmada_cliente, canal)
  values
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
     null, null, v_estado, false, 'whatsapp')
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

  insert into public.citas
    (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
  select * from (values
    (v_negocio, v_javier, v_cortec, v_carlos, v_dia + interval '9 hours',             v_dia + interval '9 hours 35 minutes',  'completada', true, 'manual'),
    (v_negocio, v_sara,   v_lavado, v_maria,  v_dia + interval '9 hours 45 minutes',  v_dia + interval '10 hours 5 minutes',  'completada', true, 'web'),
    (v_negocio, v_pablo,  v_barba,  v_carlos, v_dia + interval '10 hours 15 minutes', v_dia + interval '10 hours 30 minutes', 'completada', true, 'manual'),
    (v_negocio, v_elena,  v_cortes, v_laura,  v_dia + interval '11 hours',            v_dia + interval '11 hours 45 minutes', 'completada', true, 'whatsapp')
  ) as t(n, cl, sv, pr, ini, fin, est, conf, can)
  where t.fin <= v_ancla
  on conflict do nothing;

  with completadas as (
    select c.id, c.cliente_id, c.profesional_id, c.servicio_id, c.fin,
           (coalesce(s.precio, 0) * 100)::int as cents,
           row_number() over (order by c.inicio) as n
      from public.citas c
      join public.servicios s on s.id = c.servicio_id
     where c.negocio_id = v_negocio
       and c.estado = 'completada'
       and c.inicio >= v_dia and c.inicio < v_manana
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

  if v_ahora between v_dia + interval '10 hours' and v_dia + interval '20 hours' then
    insert into public.citas
      (negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, confirmada_cliente, canal)
    values
      (v_negocio, v_marcos, v_cortec, v_carlos,
       v_ahora - interval '40 minutes', v_ahora - interval '10 minutes',
       'confirmada', true, 'manual')
    on conflict do nothing;
  end if;

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
     null, null, 'pendiente', false, 'whatsapp')
  on conflict do nothing;

  select count(*) into v_n from public.citas where negocio_id = v_negocio;
  select count(*) into v_cobros from public.cobros where negocio_id = v_negocio and cobrado_at >= v_dia;
  return format('demo resembrada: %s citas, %s cobros de hoy, ancla %s (%s)',
                v_n, v_cobros, to_char(v_ancla at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'),
                case when v_envivo then 'en vivo' else 'dia cerrado' end);
end;
$function$;
