-- ============================================================================
-- Salon de la DEMO COMPARTIDA (demo_salon_001): fichero y HISTORIAL.
--
-- Reparto de tareas (importante, aqui se perdio una tarde):
--   * EL DIA de la demo (hoy y manana) lo genera `public.resembrar_demo()`, que
--     corre por pg_cron cada 2 h. Si tocas las citas de hoy a mano, el cron te
--     las borra en la siguiente pasada. Ver migrations/demo-resiembra-*.sql.
--   * ESTE script pone lo que el cron NO toca: las fichas de las clientas y los
--     seis meses de historial con sus cobros. `resembrar_demo` respeta todo lo
--     que tenga cobro asociado, asi que este historial sobrevive a la resiembra.
--
-- Por que hizo falta: la demo es el escaparate y el recorrido guiado promete
-- cosas ("la formula de color guardada", "las graficas de informes", "todo lo
-- que ha pasado con ella") que sin datos enseñan pantallas vacias. El tenant
-- tenia 8 clientas sin un solo campo relleno y tres dias de citas.
--
-- Se aplica con el MCP de Supabase (o psql) sobre el proyecto vtrggiogjrhqtwbhbgia.
-- Es repasable: borra y regenera el historial anterior a ayer.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Los guardas antifraude del POS (Ley 11/2021) impiden borrar o modificar un
-- cobro registrado, y borrar una cita intenta poner a NULL el cita_id de su
-- cobro. Son guardas de TABLA, no de tenant, asi que hay que apagarlos un
-- momento para poder repasar la demo. Va dentro de la transaccion: si algo
-- falla, el ALTER se deshace con todo lo demas.
-- NUNCA hacer esto sobre datos de un salon real.
-- ---------------------------------------------------------------------------
alter table cobros disable trigger cobros_prevent_delete_trigger;
alter table cobros disable trigger cobros_prevent_financial_updates_trigger;
alter table cobro_lineas disable trigger cobro_lineas_prevent_delete_trigger;

delete from cobros where negocio_id = 'demo_salon_001';

-- Duplicados de siembras antiguas: la misma cita repetida hasta once veces, que
-- en la agenda se veian como once tarjetas de 20 px pegadas.
delete from citas c
using citas d
where c.negocio_id = 'demo_salon_001'
  and d.negocio_id = 'demo_salon_001'
  and c.cliente_id is not distinct from d.cliente_id
  and c.servicio_id is not distinct from d.servicio_id
  and c.inicio = d.inicio
  and c.id > d.id;

delete from cita_productos
where negocio_id = 'demo_salon_001'
  and cita_id in (select id from citas
                  where negocio_id = 'demo_salon_001'
                    and inicio < (current_date - 1)::timestamptz);
delete from citas
where negocio_id = 'demo_salon_001'
  and inicio < (current_date - 1)::timestamptz;

-- ---------------------------------------------------------------------------
-- 1. El REPARTO fijo: las ocho personas que salen en el recorrido guiado.
--
-- Carmen Ruiz es la clienta ESCAPARATE: es la que abre el capitulo de la ficha,
-- asi que es la unica que tiene que estar entera —formula, alergias, notas,
-- etiquetas, ticket medio y frecuencia—. Las demas se rellenan tambien para que
-- la lista no parezca un fichero recien estrenado.
--
-- Ojo: la pantalla de Clientes ya no abre `clientes[0]` (el primero por orden
-- alfabetico) sino al de ficha MAS COMPLETA, justo por esto. Ver
-- `clienteEscaparate` en app/(tabs)/clientes.web.tsx.
-- ---------------------------------------------------------------------------
update clientes set
  fecha_nacimiento = '1988-04-17',
  alergias = 'PPD (parafenilendiamina). Prueba de sensibilidad el 12/03/2026: negativa con tinte sin amoniaco. No aplicar decolorante directo sobre cuero cabelludo.',
  sensibilidades_cuero = 'Cuero cabelludo sensible en la nuca: proteger con crema barrera antes de decolorar.',
  notas = 'Balayage natural, nada de reflejos dorados: se le apagan a las tres semanas. Acabado ondulado con difusor. Le gusta que se le explique el tono antes de empezar. Suele venir jueves por la tarde.',
  bebida_preferida = 'Cafe con leche de avena',
  canal_preferido = 'whatsapp',
  etiquetas = array['VIP', 'Color', 'Fidelizada'],
  ticket_medio = 96.50,
  frecuencia_dias = 56,
  perfil_riesgo = 'normal',
  primera_visita = current_date - 520,
  consiente_ia = true,
  consiente_ia_origen = 'portal',
  consiente_ia_fecha = now() - interval '200 days',
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000001'
where negocio_id = 'demo_salon_001' and nombre = 'Carmen Ruiz';

update clientes set
  fecha_nacimiento = '1993-11-02', alergias = 'Ninguna conocida.',
  notas = 'Corte con capas largas. No quiere flequillo. Siempre pide secado liso.',
  bebida_preferida = 'Te verde', canal_preferido = 'whatsapp',
  etiquetas = array['Corte', 'Fidelizada'], ticket_medio = 41.00, frecuencia_dias = 45,
  primera_visita = current_date - 400,
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000003'
where negocio_id = 'demo_salon_001' and nombre = 'Elena Martínez';

update clientes set
  fecha_nacimiento = '1990-06-21', alergias = 'Alergia al niquel: cuidado con las pinzas metalicas.',
  notas = 'Color raiz cada seis semanas. Tapa canas en la sien. Prefiere que la atienda Laura.',
  canal_preferido = 'whatsapp', etiquetas = array['Color'], ticket_medio = 68.00,
  frecuencia_dias = 42, primera_visita = current_date - 300,
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000003'
where negocio_id = 'demo_salon_001' and nombre = 'Lucía Blanco';

update clientes set
  fecha_nacimiento = '1996-01-30',
  notas = 'Melena larga, se la cuida mucho. Compra mascarilla reparadora casi cada visita.',
  canal_preferido = 'email', etiquetas = array['Producto'], ticket_medio = 54.00,
  frecuencia_dias = 60, primera_visita = current_date - 260,
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000001'
where negocio_id = 'demo_salon_001' and nombre = 'Sara Domínguez';

update clientes set
  fecha_nacimiento = '1985-09-14',
  notas = 'Corte clasico con maquina del 2 a los lados. Barba cada dos visitas.',
  canal_preferido = 'whatsapp', etiquetas = array['Caballero'], ticket_medio = 24.00,
  frecuencia_dias = 28, primera_visita = current_date - 380,
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000002'
where negocio_id = 'demo_salon_001' and nombre = 'Javier López';

update clientes set
  fecha_nacimiento = '1992-03-08', notas = 'Barba con navaja. Muy puntual.',
  canal_preferido = 'whatsapp', etiquetas = array['Caballero', 'Barba'], ticket_medio = 21.00,
  frecuencia_dias = 24, primera_visita = current_date - 240,
  profesional_habitual_id = 'aa000000-0000-0000-0000-000000000002'
where negocio_id = 'demo_salon_001' and nombre in ('Pablo Navarro', 'Marcos Sanz', 'Hugo Morales');

-- ---------------------------------------------------------------------------
-- 2. Un fichero de verdad (~280 clientas).
--
-- No es capricho: con ocho clientas y seis meses de citas, cada una venia cada
-- dia y medio. Los numeros de la ficha (visitas, "vuelve cada X dias") salian
-- absurdos y era justo lo que se notaba raro.
-- ---------------------------------------------------------------------------
with nombres as (
  select unnest(array['Ana','Beatriz','Cristina','Daniela','Eva','Fátima','Gloria','Irene','Julia','Laura',
                      'Marta','Nuria','Olga','Patricia','Raquel','Silvia','Teresa','Vanesa','Yolanda','Zaira',
                      'Alba','Carla','Diana','Elsa','Gema','Inés','Lorena','Miriam','Noelia','Rocío',
                      'Adrián','Alberto','Álvaro','Bruno','César','Daniel','Diego','Eduardo','Fernando','Gonzalo']) n,
         generate_series(0, 39) ni
), apellidos as (
  select unnest(array['Gómez','Reyes','Santos','Bravo','Delgado','Cabrera','Mora','Vargas',
                      'Pastor','Gil','Crespo','Bello','Arias','Rivero','Solís','Duque']) a,
         generate_series(0, 15) ai
), todos as (
  select n || ' ' || a as nombre, ni * 16 + ai as idx from nombres cross join apellidos
)
insert into clientes (negocio_id, nombre, telefono, email, canal_preferido, perfil_riesgo)
select 'demo_salon_001', t.nombre,
       '+3462' || lpad((2000000 + t.idx)::text, 7, '0'),
       'cliente' || t.idx || '@ejemplo.com',
       case when t.idx % 3 = 0 then 'email' else 'whatsapp' end,
       'normal'
from todos t
where t.idx % 3 = 1
  and not exists (select 1 from clientes c where c.negocio_id = 'demo_salon_001' and c.nombre = t.nombre);

-- ---------------------------------------------------------------------------
-- 3. Seis meses de trabajo, repartidos por todo el fichero.
--
-- Sin esto Informes salia con una sola barra y las graficas vacias, que es lo
-- primero que mira quien esta valorando comprar.
-- ---------------------------------------------------------------------------
with cli as (
  select id, row_number() over (order by nombre) - 1 as i, count(*) over () as n
  from clientes where negocio_id = 'demo_salon_001' and nombre <> 'Carmen Ruiz'
), srv as (
  select id, precio, row_number() over (order by precio desc) - 1 as i
  from servicios where negocio_id = 'demo_salon_001'
), pro as (
  select id, row_number() over (order by nombre) - 1 as i
  from profesionales where negocio_id = 'demo_salon_001'
), dias as (
  select (current_date - d)::date as f, d
  from generate_series(2, 182) d
  where extract(dow from (current_date - d)) <> 0   -- domingo cerrado
), plantilla as (
  select * from (values
    (9,0,2,0), (10,4,0,0), (12,1,3,1), (13,3,4,1),
    (16,2,1,2), (17,5,5,2), (18,6,0,0), (19,7,3,1)
  ) as t(hora, ci, si, pi)
), filas as (
  select dias.f, dias.d, plantilla.hora,
         ((plantilla.si + dias.d / 3) % 6) as si,
         ((plantilla.pi + dias.d / 5) % 3) as pi,
         row_number() over (order by dias.d, plantilla.hora) as r
  from dias cross join plantilla
  -- Ni todos los huecos llenos ni un dia perfecto: se cae una de cada cinco.
  where (dias.d * 7 + plantilla.hora) % 5 <> 0
)
insert into citas (
  negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado,
  canal, cobrada, metodo_pago, importe_final, confirmada_cliente,
  formula_producto, formula_tono, formula_tiempo_min, formula_resultado
)
select 'demo_salon_001', cli.id, srv.id, pro.id,
  (filas.f + make_interval(hours => filas.hora))::timestamptz,
  (filas.f + make_interval(hours => filas.hora, mins => 45))::timestamptz,
  case when (filas.d * 3 + filas.hora) % 29 = 0 then 'no_presentada'
       when (filas.d * 3 + filas.hora) % 37 = 0 then 'cancelada'
       else 'completada' end,
  case when (filas.d + filas.hora) % 4 = 0 then 'web'
       when (filas.d + filas.hora) % 7 = 0 then 'whatsapp'
       else 'manual' end,
  ((filas.d * 3 + filas.hora) % 29 <> 0 and (filas.d * 3 + filas.hora) % 37 <> 0),
  case when (filas.d + filas.hora) % 3 = 0 then 'efectivo'
       when (filas.d + filas.hora) % 3 = 1 then 'datafono'
       else 'bizum' end,
  srv.precio, true,
  -- Solo las citas de color llevan formula: es lo que hace util el historial.
  case when srv.i <= 1 then 'Igora Royal' end,
  case when srv.i = 0 then '9.1 + 10.1 (2:1)' when srv.i = 1 then '7.0 raiz' end,
  case when srv.i <= 1 then 35 end,
  case when srv.i = 0 then 'Rubio ceniza natural, sin dorados'
       when srv.i = 1 then 'Raiz cubierta, tono uniforme' end
from filas
join srv on srv.i = filas.si
join pro on pro.i = filas.pi
-- El salto de 37 evita que a la misma clienta le toquen dias seguidos.
join cli on cli.i = (filas.r * 37) % cli.n;

-- ---------------------------------------------------------------------------
-- 4. El historial PROPIO de Carmen Ruiz: una clienta de color, cada ocho
--    semanas, con su formula anotada visita a visita. Es lo que se enseña en
--    "la formula de color, guardada" y en "todo lo que ha pasado con ella".
-- ---------------------------------------------------------------------------
with carmen as (select id from clientes where negocio_id = 'demo_salon_001' and nombre = 'Carmen Ruiz'),
maria as (select id from profesionales where negocio_id = 'demo_salon_001' and nombre = 'Maria Garcia'),
visitas as (select * from (values
  (28,  'Mechas Balayage + Matiz', 'Igora Royal + Blondme', '9.1 + 10.1 (2:1) · oxidante 20 vol', 'Rubio ceniza natural, raiz difuminada', 'Matiz de 10.1 los ultimos 5 min. Quedo perfecta.'),
  (56,  'Corte senora y peinado',  null, null, null, 'Solo puntas, mantiene largo.'),
  (84,  'Mechas Balayage + Matiz', 'Igora Royal + Blondme', '9.1 + 10.1 (2:1) · oxidante 20 vol', 'Rubio ceniza, medios iluminados', 'Se le habia calentado el medio: se corrigio con ceniza.'),
  (140, 'Color Raíz + Peinado',    'Igora Royal', '7.0 raiz · oxidante 20 vol', 'Raiz cubierta, tono uniforme', 'Cubrio bien las canas de la sien.'),
  (196, 'Mechas Balayage + Matiz', 'Igora Royal + Blondme', '9.1 + 10.1 (2:1) · oxidante 20 vol', 'Rubio ceniza natural', 'Primera vez con Blondme: mucho menos naranja.'),
  (252, 'Corte senora y peinado',  null, null, null, 'Corte de mantenimiento entre colores.'),
  (308, 'Color Raíz + Peinado',    'Igora Royal', '7.0 raiz · oxidante 20 vol', 'Raiz cubierta', 'Pidio secado con difusor.'),
  (364, 'Mechas Balayage + Matiz', 'Igora Royal', '9.1 · oxidante 20 vol', 'Rubio calido, se le doro a las 3 semanas', 'De aqui sale la nota de la ficha: nada de dorados.'),
  (420, 'Corte senora y peinado',  null, null, null, 'Primer corte con Maria.'),
  (476, 'Color Raíz + Peinado',    'Igora Royal', '7.0 raiz', 'Raiz cubierta', 'Prueba de sensibilidad hecha antes de empezar: negativa.')
) as t(dias, servicio, fprod, ftono, fres, fnotas))
insert into citas (
  negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, estado, canal,
  cobrada, metodo_pago, importe_final, confirmada_cliente,
  formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas
)
select 'demo_salon_001', carmen.id, s.id, maria.id,
  ((current_date - v.dias) + interval '15 hours')::timestamptz,
  ((current_date - v.dias) + interval '15 hours' + interval '75 minutes')::timestamptz,
  'completada',
  case when v.dias % 3 = 0 then 'web' else 'manual' end,
  true,
  case when v.dias % 2 = 0 then 'datafono' else 'bizum' end,
  s.precio, true,
  v.fprod, v.ftono, case when v.fprod is not null then 35 end, v.fres, v.fnotas
from visitas v
cross join carmen cross join maria
join servicios s on s.negocio_id = 'demo_salon_001' and s.nombre = v.servicio;

-- ---------------------------------------------------------------------------
-- 5. El cobro de cada cita cobrada (es lo que leen Informes, Caja y el arqueo).
--    Ademas es lo que hace que `resembrar_demo()` NO borre este historial: esa
--    funcion respeta las citas que tienen cobro.
-- ---------------------------------------------------------------------------
insert into cobros (
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
from citas c
where c.negocio_id = 'demo_salon_001'
  and c.cobrada
  and c.inicio < (current_date - 1)::timestamptz
  and not exists (select 1 from cobros o where o.cita_id = c.id);

-- ---------------------------------------------------------------------------
-- 6. Los numeros de la ficha, calculados DESDE el historial (no a mano, que es
--    como se acaba con una clienta de 121 visitas que "vuelve cada 56 dias").
-- ---------------------------------------------------------------------------
update clientes cl set
  total_visitas = v.n,
  ultima_visita = v.ultima,
  primera_visita = least(coalesce(cl.primera_visita, v.primera), v.primera)
from (
  select cliente_id, count(*)::int as n, max(inicio)::date as ultima, min(inicio)::date as primera
  from citas
  where negocio_id = 'demo_salon_001' and estado = 'completada'
  group by cliente_id
) v
where cl.negocio_id = 'demo_salon_001' and cl.id = v.cliente_id;

update clientes cl set ticket_medio = round(t.media::numeric, 2)
from (
  select o.cliente_id, avg(o.total_cents) / 100.0 as media
  from cobros o where o.negocio_id = 'demo_salon_001' group by o.cliente_id
) t
where cl.negocio_id = 'demo_salon_001' and cl.id = t.cliente_id;

-- ---------------------------------------------------------------------------
-- 7. Horario semanal de cada profesional, derivado del horario del salon.
--
-- Estaba VACIO, y de ahi sale la disponibilidad del portal publico: /r/demo
-- contestaba "no hay hueco libre en las proximas 3 semanas" a todo el mundo.
-- No se noto hasta que el recorrido guiado paso a enseñar el portal.
-- ---------------------------------------------------------------------------
insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
select p.id, nh.dia_semana, t.ini::time, t.fin::time, t.turno
from profesionales p
join negocio_horarios nh on nh.negocio_id = p.negocio_id and nh.abierto
join lateral (values
  (1::smallint, nh.apertura::text, coalesce(nh.pausa_inicio::text, nh.cierre::text)),
  (2::smallint, nh.pausa_fin::text, nh.cierre::text)
) t(turno, ini, fin) on t.ini is not null and t.fin is not null and t.ini::time < t.fin::time
where p.negocio_id = 'demo_salon_001' and p.activo
  and not exists (
    select 1 from horarios_profesional h
    where h.profesional_id = p.id and h.dia_semana = nh.dia_semana and h.turno = t.turno);

-- Guardas antifraude, de vuelta.
alter table cobros enable trigger cobros_prevent_delete_trigger;
alter table cobros enable trigger cobros_prevent_financial_updates_trigger;
alter table cobro_lineas enable trigger cobro_lineas_prevent_delete_trigger;

commit;

-- Y por ultimo, el dia de hoy (lo mismo que hara el cron en su proxima pasada):
select public.resembrar_demo();
