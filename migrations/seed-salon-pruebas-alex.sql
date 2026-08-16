-- Salon de pruebas de Alexandro (capa de IA), 16 ago 2026.
--
-- Misma historia que el de Carlos: la cuenta alexandruiscru07@gmail.com estaba
-- dentro de `florent_surez_peluqueros_15004` -el salon REAL de Jose- y ademas
-- como 'owner', asi que cualquier prueba de los agentes de WhatsApp/voz caia
-- sobre 772 clientas y una caja de verdad. Aqui se le monta tenant propio.
--
-- El catalogo (categorias, servicios, productos) se COPIA del salon de pruebas
-- de Carlos (`salon_pruebas_mecha`, ver seed-salon-pruebas-mecha.sql) para no
-- mantener dos listas iguales a mano. Ese seed tiene que existir antes.

do $$
begin
  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set negocio_id     = 'salon_pruebas_alex',
         nombre_negocio = 'Salon de Pruebas IA',
         role           = 'owner',
         plan           = 'estudio',
         ia_nivel       = 'completa',
         codigo_postal  = '15004',
         updated_at     = now()
   where email = 'alexandruiscru07@gmail.com';
end $$;

insert into public.negocio_config (negocio_id, config, updated_at)
select 'salon_pruebas_alex',
       config || jsonb_build_object(
         'nombre', 'Salon de Pruebas IA',
         'email', 'alexandruiscru07@gmail.com',
         'telefono', '981000001',
         'direccion', 'Rua de Pruebas 2, A Coruna'),
       now()
  from public.negocio_config where negocio_id = 'salon_pruebas_mecha'
on conflict (negocio_id) do nothing;

insert into public.negocio_horarios (negocio_id, dia_semana, abierto, apertura, cierre, pausa_inicio, pausa_fin)
select 'salon_pruebas_alex', dia_semana, abierto, apertura, cierre, pausa_inicio, pausa_fin
  from public.negocio_horarios where negocio_id = 'salon_pruebas_mecha';

-- Portal activo para poder reservar, pero FUERA del directorio publico.
insert into public.negocio_portal (
  negocio_id, slug, nombre_publico, direccion, telefono, idioma, portal_activo,
  mostrar_precios, color_acento, ciudad, provincia, codigo_postal, lat, lng,
  descripcion, directorio_visible, captcha_activo)
values (
  'salon_pruebas_alex', 'pruebasia', 'Salon de Pruebas IA',
  'Rua de Pruebas 2, A Coruna', '981000001', 'es', true,
  'catalogo', '#f4501e', 'A Coruna', 'A Coruna', '15004', 43.3641, -8.4108,
  'Salon de pruebas de la capa de IA. No es un negocio real.', false, false);

insert into public.profesionales (id, negocio_id, profile_id, nombre, color, activo, categoria, comision_pct, especialidades, telefono, email, tipo_relacion, rol_acceso)
values
  ('c3a00000-0000-4000-8000-000000000001', 'salon_pruebas_alex',
     (select id from public.profiles where email = 'alexandruiscru07@gmail.com'),
     'Alexandru Iscrulescu', '#f4501e', true, 'direccion', 0,
     array['color','corte'], '600200001', 'alexandruiscru07@gmail.com', 'empleado', 'owner'),
  ('c3a00000-0000-4000-8000-000000000002', 'salon_pruebas_alex', null,
     'Lucia Ferro', '#7c3aed', true, 'estilista_senior', 35,
     array['color','mechas'], '600200002', 'lucia.pruebasia@mechaa.es', 'empleado', 'employee'),
  ('c3a00000-0000-4000-8000-000000000003', 'salon_pruebas_alex', null,
     'Diego Mera', '#16a34a', true, 'oficial', 30,
     array['barberia','corte hombre'], '600200003', 'diego.pruebasia@mechaa.es', 'empleado', 'employee');

insert into public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
select p.id, d.dia, h.ini, case when d.dia = 6 then time '15:00' else h.fin end, h.turno
from public.profesionales p
cross join lateral (values (1),(2),(3),(4),(5),(6)) as d(dia)
cross join lateral (values
  ('09:30'::time, '14:00'::time, 1::smallint),
  ('16:00'::time, '20:00'::time, 2::smallint)
) as h(ini, fin, turno)
where p.negocio_id = 'salon_pruebas_alex'
  and not (d.dia = 6 and h.turno = 2);

with cat_ins as (
  insert into public.categorias_servicio (negocio_id, nombre, color, orden, activo)
  select 'salon_pruebas_alex', nombre, color, orden, activo
    from public.categorias_servicio where negocio_id = 'salon_pruebas_mecha'
  returning id, orden
)
insert into public.servicios (
  negocio_id, nombre, descripcion, duracion_activa_min, duracion_espera_min,
  duracion_activa_extra_min, precio, categoria, categoria_id, activo,
  reservable_online, min_antelacion_min, es_puntual, bonus_puntos)
select 'salon_pruebas_alex', s.nombre, s.descripcion, s.duracion_activa_min, s.duracion_espera_min,
       s.duracion_activa_extra_min, s.precio, s.categoria, ci.id, s.activo,
       s.reservable_online, s.min_antelacion_min, s.es_puntual, s.bonus_puntos
  from public.servicios s
  join public.categorias_servicio cs on cs.id = s.categoria_id
  join cat_ins ci on ci.orden = cs.orden
 where s.negocio_id = 'salon_pruebas_mecha';

with ins as (
  insert into public.productos (negocio_id, nombre, descripcion, categoria, precio_cents,
                                iva_porcentaje, stock_minimo, activo, codigo_barras, proveedor)
  select 'salon_pruebas_alex', nombre, descripcion, categoria, precio_cents,
         iva_porcentaje, stock_minimo, activo, null, proveedor
    from public.productos where negocio_id = 'salon_pruebas_mecha'
  returning id, nombre, stock_minimo
)
insert into public.inventario (negocio_id, producto_id, unidades, ubicacion)
select 'salon_pruebas_alex', i.id, i.stock_minimo + 2 + (abs(hashtext(i.nombre)) % 10), 'Vitrina'
  from ins i;

with nombres as (
  select nombre, i::int i from unnest(array[
    'Aitana Ferro','Bruno Salgado','Celia Nogueira','Dario Vilas','Erika Pardo',
    'Fran Loureiro','Gabriela Rios','Hector Puga','Ines Boado','Jorge Recouso',
    'Katia Ares','Leo Sanjurjo','Miriam Cabo','Noa Torreiro','Omar Feal',
    'Patricia Dono','Ruben Grana','Sara Verde','Telmo Iravedra','Valeria Nine',
    'Xoan Espino','Yaiza Couto','Zoe Aldao','Alvaro Rilo','Belen Fraga'
  ]) with ordinality as t(nombre, i)
)
insert into public.clientes (
  negocio_id, nombre, telefono, email, fecha_nacimiento, profesional_habitual_id,
  primera_visita, ultima_visita, total_visitas, canal_preferido, etiquetas,
  perfil_riesgo, bloqueado, consiente_ia, consiente_ia_origen, consiente_ia_fecha,
  ticket_medio, frecuencia_dias, idioma)
select 'salon_pruebas_alex', n.nombre,
       '6' || lpad(((n.i * 221873) % 100000000)::text, 8, '0'),
       case when n.i % 6 = 0 then null else lower(replace(n.nombre,' ','.')) || '@ejemplo.test' end,
       date '1970-01-01' + ((n.i * 411) % 11500),
       (select p.id from public.profesionales p where p.negocio_id='salon_pruebas_alex' order by p.nombre offset (n.i % 3) limit 1),
       current_date - ((n.i * 41) % 700) - 30,
       current_date - ((n.i * 13) % 60),
       2 + (n.i * 5) % 20,
       case n.i % 3 when 0 then 'whatsapp' when 1 then 'whatsapp' else 'telefono' end,
       case when n.i % 7 = 0 then array['vip'] when n.i % 4 = 0 then array['fiel'] else array[]::text[] end,
       'normal', false,
       -- Todas consienten la IA: es el tenant donde se prueban los agentes.
       true, 'portal', now() - ((n.i % 30) || ' days')::interval,
       round((18 + (n.i * 9) % 60)::numeric, 2),
       25 + (n.i * 7) % 60, 'es'
from nombres n;

-- Agenda de dos semanas para atras y dos para delante.
with profs as (
  select p.id, row_number() over (order by p.nombre)::int rn
    from public.profesionales p where p.negocio_id='salon_pruebas_alex'
),
serv as (
  select s.id, s.duracion_activa_min a, s.duracion_espera_min e, s.duracion_activa_extra_min x, c.orden cat
    from public.servicios s join public.categorias_servicio c on c.id = s.categoria_id
   where s.negocio_id='salon_pruebas_alex'
     and s.duracion_activa_min + s.duracion_espera_min + s.duracion_activa_extra_min <= 120
),
pool as (
  select p.rn, p.id pid, s.id sid, s.a, s.e, s.x,
         row_number() over (partition by p.rn order by s.id)::int srn,
         count(*) over (partition by p.rn)::int scnt
    from profs p
    join serv s on (p.rn = 1 and s.cat in (1,2,4))
                or (p.rn = 2 and s.cat in (6,1))
                or (p.rn = 3 and s.cat in (2,3,5,7))
),
clis as (
  select id, row_number() over (order by nombre)::int rn, count(*) over ()::int n
    from public.clientes where negocio_id='salon_pruebas_alex'
),
dias as (
  select d::date dia from generate_series(current_date - 14, current_date + 14, interval '1 day') d
   where extract(dow from d) between 1 and 6
),
base as (
  select d.dia, p.rn, p.id pid, s.k, s.hora,
         abs(hashtext('ia' || d.dia::text || p.rn::text || s.k::text)) h
    from dias d cross join profs p
    cross join (values (1, time '10:00'), (2, time '12:00'), (3, time '16:00'), (4, time '18:00')) s(k, hora)
   where not (extract(dow from d.dia) = 6 and s.k >= 3)
),
elegidas as (
  select b.*, sv.sid, sv.a, sv.e, sv.x, (b.dia + b.hora) at time zone 'Europe/Madrid' inicio
    from base b
    join lateral (select * from pool where pool.rn = b.rn and pool.srn = 1 + (b.h % pool.scnt) limit 1) sv on true
   where b.h % 5 <> 0
)
insert into public.citas (
  negocio_id, profesional_id, cliente_id, servicio_id, inicio, fin, fin_activa,
  estado, canal, created_at, confirmada_cliente, confirmacion_enviada, recordatorio_enviado, deposito_requerido)
select 'salon_pruebas_alex', e.pid,
       (select c.id from clis c where c.rn = 1 + (e.h % c.n) limit 1),
       e.sid, e.inicio,
       e.inicio + ((e.a + e.e + e.x) || ' minutes')::interval,
       e.inicio + (e.a || ' minutes')::interval,
       case when e.inicio + ((e.a + e.e + e.x) || ' minutes')::interval < now()
            then case when e.h % 19 = 0 then 'cancelada' else 'completada' end
            else case when e.h % 6 = 0 then 'pendiente' else 'confirmada' end end,
       case when e.h % 10 < 4 then 'manual' when e.h % 10 < 7 then 'web' else 'whatsapp' end,
       -- Repartido en el pasado: amontonarlo dispara el freno anti-abuso del portal.
       now() - ((5 + (e.h % 600)) || ' hours')::interval,
       e.inicio < now(), e.inicio < now() + interval '2 days', e.inicio < now() + interval '1 day', false
from elegidas e;
