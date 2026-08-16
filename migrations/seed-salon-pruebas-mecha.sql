-- Salon de PRUEBAS de Carlos (tenant propio, fuera de produccion).
--
-- Por que existe: la cuenta carlitosocanamartinez@gmail.com estaba dentro de
-- `florent_surez_peluqueros_15004`, que es el salon REAL de Jose (772 clientas,
-- 71 servicios, cobros de verdad). Consecuencias que se veian a diario:
--   1. Al entrar salia la puerta "¿Quien eres?" con JOSE / SONIA / SUSANA / YAN,
--      porque ese negocio esta en modo compartido y la cuenta colgaba de el.
--   2. Cualquier prueba (crear citas, cobrar, tocar ajustes) caia sobre datos de
--      produccion de un cliente que ya factura con esto.
--
-- Este script crea `salon_pruebas_mecha` con datos realistas para poder probar
-- agenda, fichas, caja, informes, portal e inventario sin tocar a nadie mas.
-- Aplicado el 16 ago 2026. Se puede volver a lanzar: borra y resiembra SOLO
-- este negocio (menos los cobros, que son inmutables por ley; ver el paso 0).
--
-- OJO con dos cosas que se aprendieron aplicandolo:
--   * categorias_servicio.color NO es un hex: es un token del CHECK
--     (primary/success/warning/danger/cyan/rose/indigo/purple/teal/slate).
--   * las citas nacen con created_at repartido en el pasado a proposito. Si se
--     amontonan "hace un rato", saltan el freno anti-abuso de
--     crear_cita_publica (30 reservas web por salon y hora) y el portal deja de
--     aceptar reservas.

-- ============================================================
-- 0) Limpieza previa del tenant de pruebas (nunca toca otros)
-- ============================================================

do $$
declare
  v_neg text := 'salon_pruebas_mecha';
begin
  -- Los cobros NO se pueden borrar (trigger prevent_delete_financial_records,
  -- Ley Antifraude 11/2021) y arrastran las citas por clave ajena. Si la caja
  -- del salon de pruebas ya tiene movimientos, este script se planta en vez de
  -- dejar el tenant a medias.
  if exists (select 1 from public.cobros where negocio_id = v_neg) then
    raise exception 'El salon de pruebas ya tiene cobros registrados: son inmutables por diseno. Vacialos antes de resembrar.';
  end if;

  delete from public.citas where negocio_id = v_neg;
  delete from public.lista_espera where negocio_id = v_neg;
  delete from public.resenas where negocio_id = v_neg;
  delete from public.fichas_tecnicas_color where negocio_id = v_neg;
  delete from public.movimientos_inventario where negocio_id = v_neg;
  delete from public.inventario where negocio_id = v_neg;
  delete from public.productos where negocio_id = v_neg;
  delete from public.clientes where negocio_id = v_neg;
  delete from public.servicios where negocio_id = v_neg;
  delete from public.categorias_servicio where negocio_id = v_neg;
  delete from public.horarios_profesional hp using public.profesionales p
    where hp.profesional_id = p.id and p.negocio_id = v_neg;
  delete from public.profesionales where negocio_id = v_neg;
  delete from public.negocio_horarios where negocio_id = v_neg;
  delete from public.negocio_portal where negocio_id = v_neg;
  delete from public.negocio_config where negocio_id = v_neg;
end $$;

-- ============================================================
-- 1) La cuenta de Carlos sale de produccion y estrena salon
-- ============================================================
-- El trigger guard_profile_identity_columns congela negocio_id/plan salvo dentro
-- de un contexto marcado: por eso el set_config.

do $$
begin
  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set negocio_id     = 'salon_pruebas_mecha',
         nombre_negocio = 'Salon de Pruebas Mecha',
         role           = 'owner',
         plan           = 'estudio',
         ia_nivel       = 'completa',
         codigo_postal  = '15003',
         updated_at     = now()
   where email = 'carlitosocanamartinez@gmail.com';
end $$;

-- ============================================================
-- 2) Ficha del negocio: config, horarios y portal
-- ============================================================
-- La config va como literal JSON (jsonb_build_object se queda corto: Postgres
-- no admite mas de 100 argumentos por llamada y aqui hay muchos mas ajustes).

insert into public.negocio_config (negocio_id, config, updated_at)
values ('salon_pruebas_mecha', $json${
  "nombre": "Salon de Pruebas Mecha",
  "email": "carlitosocanamartinez@gmail.com",
  "telefono": "981000000",
  "direccion": "Rua de Pruebas 1, A Coruna",
  "moneda": "EUR",
  "timezone": "Europe/Madrid",
  "theme": "light",
  "brandColor": "#f4501e",
  "defaultView": "dia",
  "startOfWeek": "lun",
  "slotInterval": 15,
  "showOutsideHours": false,
  "compactEmpty": false,
  "solapamiento": "reposo",
  "aprovecharReposo": true,
  "alertaReposo": true,
  "alertaReposoUmbral": 3,
  "reposoMargen": 5,
  "antelacionGlobal": 60,
  "antelacionMax": 60,
  "permitirMismoDia": true,
  "noShowGrace": 15,
  "retrasoGrace": 10,
  "contadorRetraso": true,
  "recolocarRetraso": true,
  "confirmacionModo": "manual",
  "confirmacionTimeout": 120,
  "confirmacionNotificar": true,
  "completarManual": false,
  "comisionBase": 30,
  "comisionBaseImporte": "neto",
  "comisionPeriodo": "mensual",
  "comisionAddons": true,
  "comisionPropinas": false,
  "propinasActivo": true,
  "propinasSugeridas": [5, 10, 15],
  "bonusProducto": 10,
  "bonusObjetivo": true,
  "bonusObjetivoImporte": 250,
  "bonusEstrella": false,
  "notifConfirmacionActiva": true,
  "notifRecordatorioActiva": true,
  "notifRecordatorioHoras": 24,
  "notifResenaActiva": true,
  "notifSenalActiva": true,
  "notifRetrasoActiva": true,
  "notifCumpleanosActiva": true,
  "notifCumpleanosDescuentoPct": 10,
  "notifNoMolestar": true,
  "notifNoMolestarInicio": "22:00",
  "notifNoMolestarFin": "08:00",
  "depositoModoFianza": "cobro",
  "depositoModoClasificacion": "ambos",
  "depositoDinamicoActivo": false,
  "depositoFactorRiesgo": 2,
  "depositoVipExento": true,
  "depositoStaffExigir": false,
  "depositoNoShowCapturaAuto": true,
  "depositoUmbralAltoNoShows": 2,
  "depositoUmbralFiableCompletadas": 3,
  "listaEsperaMatchingActivo": false,
  "listaEsperaVentanaMin": 30,
  "listaEsperaAntelacionMinHoras": 4,
  "listaEsperaMaxBloqueoHoras": 2,
  "listaEsperaDesbloqueoDesde": "primer_aviso",
  "listaEsperaOfertaPideSenal": false,
  "listaEsperaAvisarCaducado": false,
  "asistenteAgendaActivo": true,
  "asistenteEffort": "high",
  "asistenteProfesionalEscribe": false,
  "briefingProactivoActivo": true,
  "chispaVozId": "ef_dora",
  "mi_jornada_mostrar_importes": true,
  "mi_jornada_mostrar_comision": true,
  "catalogoAlergias": ["Parafenilendiamina (PPD)","Amoniaco","Resorcina","Persulfatos","Fragancias","Niquel","Latex"],
  "plantillasNota": [],
  "plantillasFormula": []
}$json$::jsonb, now());

-- Lunes a sabado; domingo cerrado. dia_semana: 0 = domingo.
insert into public.negocio_horarios (negocio_id, dia_semana, abierto, apertura, cierre, pausa_inicio, pausa_fin)
values
  ('salon_pruebas_mecha', 0, false, null,    null,    null,    null),
  ('salon_pruebas_mecha', 1, true,  '09:30', '20:00', '14:00', '16:00'),
  ('salon_pruebas_mecha', 2, true,  '09:30', '20:00', '14:00', '16:00'),
  ('salon_pruebas_mecha', 3, true,  '09:30', '20:00', '14:00', '16:00'),
  ('salon_pruebas_mecha', 4, true,  '09:30', '20:30', '14:00', '16:00'),
  ('salon_pruebas_mecha', 5, true,  '09:30', '20:30', null,    null),
  ('salon_pruebas_mecha', 6, true,  '09:00', '15:00', null,    null);

-- Portal activo (para probar reservas) pero FUERA del directorio publico: un
-- salon de pruebas no puede aparecer en el marketplace junto a salones reales.
insert into public.negocio_portal (
  negocio_id, slug, nombre_publico, direccion, telefono, idioma, portal_activo,
  mostrar_precios, color_acento, ciudad, provincia, codigo_postal, lat, lng,
  descripcion, directorio_visible, captcha_activo)
values (
  'salon_pruebas_mecha', 'pruebas', 'Salon de Pruebas Mecha',
  'Rua de Pruebas 1, A Coruna', '981000000', 'es', true,
  'catalogo', '#f4501e', 'A Coruna', 'A Coruna', '15003', 43.3623, -8.4115,
  'Salon de pruebas del equipo Mecha. No es un negocio real.', false, false);

-- ============================================================
-- 3) Equipo
-- ============================================================

insert into public.profesionales (id, negocio_id, profile_id, nombre, color, activo, categoria, comision_pct, especialidades, telefono, email, tipo_relacion, rol_acceso)
values
  ('c1a00000-0000-4000-8000-000000000001', 'salon_pruebas_mecha',
     (select id from public.profiles where email = 'carlitosocanamartinez@gmail.com'),
     'Carlos Ocana', '#f4501e', true, 'direccion', 0,
     array['color','corte'], '600100001', 'carlitosocanamartinez@gmail.com', 'empleado', 'owner'),
  ('c1a00000-0000-4000-8000-000000000002', 'salon_pruebas_mecha', null,
     'Marta Ledo', '#7c3aed', true, 'estilista_senior', 35,
     array['color','mechas','tratamientos'], '600100002', 'marta.pruebas@mechaa.es', 'empleado', 'employee'),
  ('c1a00000-0000-4000-8000-000000000003', 'salon_pruebas_mecha', null,
     'Nuria Vidal', '#0ea5e9', true, 'oficial_mayor', 30,
     array['corte','peinado','recogidos'], '600100003', 'nuria.pruebas@mechaa.es', 'empleado', 'employee'),
  ('c1a00000-0000-4000-8000-000000000004', 'salon_pruebas_mecha', null,
     'Ivan Barreiro', '#16a34a', true, 'oficial', 30,
     array['barberia','corte hombre'], '600100004', 'ivan.pruebas@mechaa.es', 'autonomo', 'employee'),
  ('c1a00000-0000-4000-8000-000000000005', 'salon_pruebas_mecha', null,
     'Sabela Torres', '#f59e0b', true, 'auxiliar', 20,
     array['lavado','manicura'], '600100005', 'sabela.pruebas@mechaa.es', 'formacion', 'employee'),
  ('c1a00000-0000-4000-8000-000000000006', 'salon_pruebas_mecha', null,
     'Rocio Pena', '#ec4899', true, 'direccion', 0,
     array['recepcion'], '600100006', 'rocio.pruebas@mechaa.es', 'empleado', 'recepcion');

-- Turno partido de martes a sabado (el sabado solo manana). El lunes lo cubren
-- direccion y una oficial: asi la agenda no sale igual todos los dias.
-- Recepcion NO lleva horario de agenda a proposito: si lo tuviera, el portal la
-- ofreceria como profesional reservable y se llevaria huecos de servicios.
insert into public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
select p.id, d.dia, h.ini, h.fin, h.turno
from public.profesionales p
cross join lateral (values (1),(2),(3),(4),(5),(6)) as d(dia)
cross join lateral (values
  ('09:30'::time, '14:00'::time, 1::smallint),
  ('16:00'::time, '20:00'::time, 2::smallint)
) as h(ini, fin, turno)
where p.negocio_id = 'salon_pruebas_mecha'
  and p.rol_acceso <> 'recepcion'
  and not (d.dia = 6 and h.turno = 2)
  and not (d.dia = 1 and p.rol_acceso = 'employee' and p.nombre <> 'Nuria Vidal');

-- El sabado la manana se alarga hasta las 15:00.
update public.horarios_profesional hp
   set hora_fin = '15:00'
  from public.profesionales p
 where hp.profesional_id = p.id
   and p.negocio_id = 'salon_pruebas_mecha'
   and hp.dia_semana = 6;

-- ============================================================
-- 4) Catalogo: categorias y servicios
-- ============================================================

insert into public.categorias_servicio (id, negocio_id, nombre, color, orden, activo)
values
  ('c2a00000-0000-4000-8000-000000000001', 'salon_pruebas_mecha', 'Corte',                 'primary', 1, true),
  ('c2a00000-0000-4000-8000-000000000002', 'salon_pruebas_mecha', 'Color',                 'purple',  2, true),
  ('c2a00000-0000-4000-8000-000000000003', 'salon_pruebas_mecha', 'Mechas y decoloracion', 'indigo',  3, true),
  ('c2a00000-0000-4000-8000-000000000004', 'salon_pruebas_mecha', 'Peinado y recogidos',   'cyan',    4, true),
  ('c2a00000-0000-4000-8000-000000000005', 'salon_pruebas_mecha', 'Tratamientos',          'teal',    5, true),
  ('c2a00000-0000-4000-8000-000000000006', 'salon_pruebas_mecha', 'Barberia',              'success', 6, true),
  ('c2a00000-0000-4000-8000-000000000007', 'salon_pruebas_mecha', 'Manicura y pedicura',   'rose',    7, true),
  ('c2a00000-0000-4000-8000-000000000008', 'salon_pruebas_mecha', 'Depilacion',            'warning', 8, true),
  ('c2a00000-0000-4000-8000-000000000009', 'salon_pruebas_mecha', 'Maquillaje',            'danger',  9, true),
  ('c2a00000-0000-4000-8000-00000000000a', 'salon_pruebas_mecha', 'Extensiones',           'slate',  10, true);

-- duracion_espera_min = fase de REPOSO (el tinte actuando): el hueco se puede
-- aprovechar para otra clienta, que es la vertical del producto.
insert into public.servicios (
  negocio_id, nombre, descripcion, duracion_activa_min, duracion_espera_min,
  duracion_activa_extra_min, precio, categoria, categoria_id, activo,
  reservable_online, min_antelacion_min, es_puntual, bonus_puntos)
select 'salon_pruebas_mecha', s.nombre, s.descripcion, s.activa, s.espera, s.extra,
       s.precio, c.nombre, c.id, true, s.online, 60, false, s.puntos
from (values
  ('Corte mujer',                  'Lavado, corte y secado natural',        45,  0,  0,  24.00, 1, true,  10),
  ('Corte mujer + peinado',        'Corte con peinado a la plancha',        60,  0,  0,  32.00, 1, true,  12),
  ('Corte nino',                   'Hasta 12 anos',                         30,  0,  0,  14.00, 1, true,   5),
  ('Flequillo',                    'Retoque de flequillo',                  15,  0,  0,   8.00, 1, true,   2),
  ('Corte puntas',                 'Sanear puntas sin cambiar el largo',    30,  0,  0,  16.00, 1, true,   6),
  ('Color raiz',                   'Retoque de raiz con tinte',             25, 30, 15,  38.00, 2, true,  18),
  ('Color completo',               'Tinte de medios y puntas',              35, 35, 20,  52.00, 2, true,  24),
  ('Color sin amoniaco',           'Tinte de tono sobre tono',              30, 25, 15,  46.00, 2, true,  22),
  ('Cobertura de canas',           'Color con cobertura total',             30, 35, 15,  44.00, 2, true,  20),
  ('Bano de color',                'Brillo y matiz sin subir de tono',      20, 20, 10,  28.00, 2, true,  12),
  ('Matiz antiamarillo',           'Matizador para rubios',                 15, 15, 10,  22.00, 2, true,  10),
  ('Mechas balayage',              'Barrido a mano alzada',                 60, 45, 30, 110.00, 3, true,  45),
  ('Babylights',                   'Mechas finas de raiz a puntas',         70, 45, 30, 125.00, 3, true,  50),
  ('Mechas con papel',             'Mechas clasicas con papel de plata',    50, 40, 25,  85.00, 3, true,  38),
  ('Californianas',                'Degradado en medios y puntas',          55, 45, 25,  95.00, 3, true,  40),
  ('Decoloracion global',          'Cambio de base con decoloracion',       75, 50, 35, 140.00, 3, false, 55),
  ('Retoque de raiz decolorada',   'Raiz de rubio platino',                 45, 40, 25,  75.00, 3, true,  32),
  ('Peinado',                      'Lavado y peinado',                      30,  0,  0,  20.00, 4, true,   8),
  ('Ondas al agua',                'Peinado con ondas marcadas',            45,  0,  0,  32.00, 4, true,  14),
  ('Recogido de fiesta',           'Recogido para evento',                  60,  0,  0,  48.00, 4, true,  20),
  ('Recogido de novia',            'Prueba y recogido de novia',            90,  0,  0,  95.00, 4, false, 40),
  ('Plancha o rizador',            'Peinado con herramienta de calor',      30,  0,  0,  22.00, 4, true,   8),
  ('Hidratacion profunda',         'Mascarilla con vapor',                  30, 15,  0,  30.00, 5, true,  14),
  ('Botox capilar',                'Tratamiento reconstructor',             45, 20,  0,  55.00, 5, true,  24),
  ('Keratina',                     'Alisado de keratina',                   90, 30, 20, 130.00, 5, false, 50),
  ('Tratamiento anticaida',        'Ampollas y masaje',                     30,  0,  0,  35.00, 5, true,  15),
  ('Tratamiento anticaspa',        'Champu y locion especifica',            30,  0,  0,  28.00, 5, true,  12),
  ('Ritual de brillo',             'Sellado de cuticula',                   25, 10,  0,  26.00, 5, true,  12),
  ('Corte caballero',              'Corte a maquina y tijera',              30,  0,  0,  16.00, 6, true,   7),
  ('Corte + barba',                'Corte con arreglo de barba',            45,  0,  0,  24.00, 6, true,  11),
  ('Arreglo de barba',             'Perfilado y toalla caliente',           20,  0,  0,  12.00, 6, true,   5),
  ('Afeitado clasico',             'Navaja y toalla caliente',              30,  0,  0,  18.00, 6, true,   8),
  ('Rapado degradado',             'Fade a maquina',                        35,  0,  0,  18.00, 6, true,   8),
  ('Color barba',                  'Tinte de barba',                        20, 15,  0,  16.00, 6, true,   7),
  ('Manicura basica',              'Limado y esmaltado',                    30,  0,  0,  18.00, 7, true,   8),
  ('Manicura semipermanente',      'Esmalte de larga duracion',             45,  0,  0,  26.00, 7, true,  12),
  ('Pedicura basica',              'Limado y esmaltado de pies',            45,  0,  0,  24.00, 7, true,  10),
  ('Pedicura spa',                 'Exfoliacion, mascarilla y masaje',      60,  0,  0,  36.00, 7, true,  16),
  ('Retirada de esmaltado',        'Retirada de semipermanente',            20,  0,  0,   8.00, 7, true,   3),
  ('Cejas',                        'Diseno de cejas con cera o hilo',       15,  0,  0,   9.00, 8, true,   4),
  ('Labio superior',               'Depilacion con cera',                   10,  0,  0,   6.00, 8, true,   2),
  ('Depilacion facial completa',   'Cejas, labio y menton',                 25,  0,  0,  16.00, 8, true,   7),
  ('Maquillaje de dia',            'Maquillaje natural',                    45,  0,  0,  35.00, 9, true,  15),
  ('Maquillaje de noche',          'Maquillaje de evento',                  60,  0,  0,  48.00, 9, true,  20),
  ('Maquillaje de novia',          'Prueba y maquillaje del dia',           90,  0,  0, 110.00, 9, false, 45),
  ('Extensiones de queratina',     'Colocacion por mechon',                120,  0, 30, 210.00, 10, false, 70),
  ('Mantenimiento de extensiones', 'Revision y recolocacion',               75,  0,  0,  95.00, 10, false, 35)
) as s(nombre, descripcion, activa, espera, extra, precio, cat, online, puntos)
join public.categorias_servicio c
  on c.negocio_id = 'salon_pruebas_mecha'
 and c.orden = s.cat;

-- ============================================================
-- 5) Clientas
-- ============================================================

with nombres as (
  select nombre, i::int as i from unnest(array[
    'Ana Vazquez','Beatriz Lopez','Carmen Seoane','Daniela Rivas','Elena Ferreiro',
    'Fatima Souto','Gloria Bermudez','Helena Castro','Irene Pombo','Julia Naveira',
    'Laura Otero','Marta Doce','Nerea Quintela','Olalla Rey','Paula Nieto',
    'Raquel Miramontes','Sandra Deus','Tania Balboa','Uxia Lorenzo','Vanesa Cid',
    'Xiana Meis','Yolanda Prego','Zaira Facal','Alba Trigo','Berta Randulfe',
    'Cristina Barcia','Diana Lema','Estela Rioboo','Fabiola Casal','Gemma Vilar',
    'Hugo Randulfe','Ivan Sanmartin','Javier Amoedo','Kevin Neira','Lucas Bugallo',
    'Manuel Regueiro','Nicolas Pineiro','Oscar Beade','Pablo Curros','Quique Ledo',
    'Ramon Tojo','Sergio Fandino','Tomas Xestoso','Unai Berdullas','Victor Anido',
    'Adrian Corral','Brais Mosquera','Carlos Tenreiro','David Iglesias','Eloy Padin',
    'Silvia Mourelle','Rosa Bermejo','Nuria Caamano','Lidia Roca','Marina Espada',
    'Sonia Vilaboa'
  ]) with ordinality as t(nombre, i)
)
insert into public.clientes (
  negocio_id, nombre, telefono, email, fecha_nacimiento, profesional_habitual_id,
  notas, primera_visita, ultima_visita, total_visitas, canal_preferido, etiquetas,
  perfil_riesgo, alergias, bloqueado, bloqueo_motivo, consiente_ia, consiente_ia_origen,
  consiente_ia_fecha, ticket_medio, frecuencia_dias, idioma)
select
  'salon_pruebas_mecha',
  n.nombre,
  '6' || lpad(((n.i * 137891) % 100000000)::text, 8, '0'),
  case when n.i % 7 = 0 then null
       else lower(replace(n.nombre, ' ', '.')) || '@ejemplo.test' end,
  -- Uno de cada once cumple anos esta semana: asi hay con que probar el aviso
  -- de cumpleanos sin esperar un ano.
  case when n.i % 11 = 0
       then make_date(1990, extract(month from current_date)::int,
                      least(extract(day from current_date)::int + (n.i % 4), 28)::int)
       else date '1968-01-01' + ((n.i * 349) % 12400) end,
  (select p.id from public.profesionales p
    where p.negocio_id = 'salon_pruebas_mecha' and p.rol_acceso <> 'recepcion'
    order by p.nombre offset (n.i % 5) limit 1),
  case n.i % 9
    when 0 then 'Prefiere cita a primera hora.'
    when 3 then 'Cabello muy fino, cuidado con el calor.'
    when 6 then 'Viene siempre con su hija.'
    else null end,
  current_date - ((n.i * 53) % 900) - 30,
  current_date - ((n.i * 17) % 70),
  3 + (n.i * 7) % 28,
  case n.i % 4 when 0 then 'whatsapp' when 1 then 'whatsapp' when 2 then 'telefono' else 'email' end,
  case
    when n.i % 13 = 0 then array['vip','fiel']
    when n.i % 5  = 0 then array['fiel']
    when n.i % 8  = 0 then array['nueva']
    when n.i % 17 = 0 then array['riesgo']
    else array[]::text[] end,
  case when n.i % 17 = 0 then 'medio' when n.i % 29 = 0 then 'alto' else 'normal' end,
  case when n.i % 12 = 0 then 'Alergia a la parafenilendiamina (PPD)' else null end,
  n.i = 23,
  case when n.i = 23 then 'Tres ausencias seguidas sin avisar.' else null end,
  n.i % 3 <> 0,
  case when n.i % 3 <> 0 then 'portal' else null end,
  case when n.i % 3 <> 0 then now() - ((n.i % 40) || ' days')::interval else null end,
  round((18 + (n.i * 13) % 70)::numeric, 2),
  21 + (n.i * 11) % 70,
  'es'
from nombres n;

-- ============================================================
-- 6) Agenda: cinco semanas atras y tres por delante
-- ============================================================
-- Cada profesional atiende lo suyo (Ivan barberia, Marta color, Sabela unas...).
-- Los huecos van cada dos horas para que ningun servicio pise al siguiente.

with profs as (
  select p.id, row_number() over (order by p.nombre)::int rn
    from public.profesionales p
   where p.negocio_id = 'salon_pruebas_mecha' and p.rol_acceso <> 'recepcion'
),
serv as (
  select s.id, s.duracion_activa_min a, s.duracion_espera_min e, s.duracion_activa_extra_min x,
         s.precio, c.orden cat
    from public.servicios s
    join public.categorias_servicio c on c.id = s.categoria_id
   where s.negocio_id = 'salon_pruebas_mecha'
     and s.duracion_activa_min + s.duracion_espera_min + s.duracion_activa_extra_min <= 120
),
pool as (
  select p.rn, p.id pid, s.id sid, s.a, s.e, s.x, s.precio,
         row_number() over (partition by p.rn order by s.id)::int srn,
         count(*) over (partition by p.rn)::int scnt
    from profs p
    join serv s on (p.rn = 1 and s.cat in (1,2))      -- Carlos: corte y color
                or (p.rn = 2 and s.cat in (6))        -- Ivan: barberia
                or (p.rn = 3 and s.cat in (2,3,5))    -- Marta: color, mechas, tratamientos
                or (p.rn = 4 and s.cat in (1,4,9))    -- Nuria: corte, peinado, maquillaje
                or (p.rn = 5 and s.cat in (7,8))      -- Sabela: unas y depilacion
),
clis as (
  select id, row_number() over (order by nombre)::int rn, count(*) over ()::int n
    from public.clientes
   where negocio_id = 'salon_pruebas_mecha' and not bloqueado
),
dias as (
  select d::date dia from generate_series(current_date - 35, current_date + 21, interval '1 day') d
   where extract(dow from d) between 1 and 6
),
slots as (
  select * from (values (1, time '10:00'), (2, time '12:00'), (3, time '16:00'), (4, time '18:00')) v(k, hora)
),
base as (
  select d.dia, p.rn, p.id pid, s.k, s.hora,
         abs(hashtext(d.dia::text || p.rn::text || s.k::text)) h
    from dias d cross join profs p cross join slots s
   where not (extract(dow from d.dia) = 6 and s.k >= 3)   -- sabado solo manana
     and not (extract(dow from d.dia) = 1 and p.rn not in (1, 4))  -- lunes: equipo corto
),
elegidas as (
  select b.*, sv.sid, sv.a, sv.e, sv.x, sv.precio,
         (b.dia + b.hora) at time zone 'Europe/Madrid' as inicio
    from base b
    join lateral (
      select * from pool where pool.rn = b.rn and pool.srn = 1 + (b.h % pool.scnt) limit 1
    ) sv on true
   where b.h % 7 <> 0   -- un hueco de cada siete se queda libre
)
insert into public.citas (
  negocio_id, profesional_id, cliente_id, servicio_id, inicio, fin, fin_activa,
  estado, canal, notas, created_at, confirmada_cliente, confirmacion_enviada,
  recordatorio_enviado, deposito_requerido)
select
  'salon_pruebas_mecha', e.pid,
  (select c.id from clis c where c.rn = 1 + (e.h % c.n) limit 1),
  e.sid,
  e.inicio,
  e.inicio + ((e.a + e.e + e.x) || ' minutes')::interval,
  e.inicio + (e.a || ' minutes')::interval,
  case
    when e.inicio + ((e.a + e.e + e.x) || ' minutes')::interval < now() then
      case when e.h % 17 = 0 then 'cancelada'
           when e.h % 23 = 0 then 'no_presentada'
           else 'completada' end
    else
      case when e.h % 5 = 0 then 'pendiente' else 'confirmada' end
  end,
  case when e.h % 10 < 5 then 'manual' when e.h % 10 < 8 then 'web' else 'whatsapp' end,
  case when e.h % 19 = 0 then 'Avisa si llega tarde.' else null end,
  -- Repartido en el pasado: si se amontona, salta el freno anti-abuso del portal.
  now() - ((3 + (e.h % 700)) || ' hours')::interval,
  e.inicio < now(),
  e.inicio < now() + interval '2 days',
  e.inicio < now() + interval '1 day',
  false
from elegidas e;

-- ============================================================
-- 7) Caja: cobros de las dos ultimas semanas
-- ============================================================
-- Convenio de crear_cobro_desde_cita: total = base - descuento + propina, y el
-- reparto efectivo/datafono suma ese total.

with elegibles as (
  select c.id cita_id, c.profesional_id, c.cliente_id, c.servicio_id, c.inicio, c.fin,
         round(s.precio * 100)::int base, s.nombre snombre,
         abs(hashtext(c.id::text)) h
    from public.citas c join public.servicios s on s.id = c.servicio_id
   where c.negocio_id = 'salon_pruebas_mecha'
     and c.estado = 'completada'
     and c.inicio >= now() - interval '14 days'
     and coalesce(c.cobrada, false) = false
),
calc as (
  select e.*,
         case when e.h % 9 = 0 then 100 * ((e.h % 3) + 1) else 0 end propina,
         case when e.h % 13 = 0 then 200 else 0 end descuento,
         case when e.h % 10 < 4 then 'efectivo'
              when e.h % 10 < 9 then 'datafono'
              else 'mixto' end metodo
    from elegibles e
),
tot as (
  select c.*, greatest(0, c.base - c.descuento) + c.propina total from calc c
),
ins as (
  insert into public.cobros (
    negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents,
    descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents,
    origen, estado, cobrado_at, created_at)
  select 'salon_pruebas_mecha', t.cita_id, t.profesional_id, t.cliente_id, t.total,
         t.propina, t.descuento, t.metodo,
         case t.metodo when 'efectivo' then t.total when 'mixto' then t.total / 2 else 0 end,
         case t.metodo when 'datafono' then t.total when 'mixto' then t.total - (t.total / 2) else 0 end,
         0, 'pos', 'completado', t.fin + interval '5 minutes', t.fin + interval '5 minutes'
  from tot t
  returning id, cita_id, total_cents, metodo
),
lin as (
  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  select i.id, 'servicio', t.servicio_id, t.snombre, t.base, 1
    from ins i join tot t on t.cita_id = i.cita_id
  returning cobro_id
)
update public.citas c
   set cobrada = true, cobro_id = i.id, importe_final = round(i.total_cents / 100.0, 2), metodo_pago = i.metodo
  from ins i
 where c.id = i.cita_id;

-- ============================================================
-- 8) Inventario
-- ============================================================

with prods as (
  select * from (values
    ('Champu hidratante 300 ml',      'Cuidado',     1290, 'Kerastase',   3),
    ('Champu anticaida 250 ml',       'Cuidado',     1690, 'Vichy',       2),
    ('Champu matizador violeta',      'Cuidado',     1450, 'Fanola',      3),
    ('Champu sin sulfatos 400 ml',    'Cuidado',     1590, 'Olaplex',     3),
    ('Acondicionador reparador',      'Cuidado',     1390, 'Kerastase',   3),
    ('Mascarilla nutritiva 200 ml',   'Cuidado',     1990, 'Kerastase',   2),
    ('Mascarilla color protect',      'Cuidado',     1890, 'Wella',       2),
    ('Serum de puntas 50 ml',         'Cuidado',     1550, 'Moroccanoil', 2),
    ('Aceite de argan 100 ml',        'Cuidado',     2290, 'Moroccanoil', 2),
    ('Protector termico spray',       'Peinado',     1350, 'Ghd',         3),
    ('Laca fijacion fuerte 400 ml',   'Peinado',      990, 'Elnett',      4),
    ('Espuma volumen 250 ml',         'Peinado',     1090, 'Wella',       3),
    ('Cera moldeadora 75 ml',         'Peinado',     1190, 'American Crew', 3),
    ('Pasta mate 100 ml',             'Peinado',     1290, 'American Crew', 3),
    ('Gomina clasica 150 ml',         'Peinado',      890, 'Suavecito',   3),
    ('Spray texturizante',            'Peinado',     1450, 'Ghd',         2),
    ('Tinte 6.0 rubio oscuro',        'Coloracion',   790, 'Wella',       6),
    ('Tinte 7.1 rubio ceniza',        'Coloracion',   790, 'Wella',       6),
    ('Tinte 5.3 castano dorado',      'Coloracion',   790, 'Wella',       6),
    ('Tinte 4.0 castano medio',       'Coloracion',   790, 'Wella',       6),
    ('Oxigenada 20 vol 1 l',          'Coloracion',   950, 'Wella',       4),
    ('Oxigenada 30 vol 1 l',          'Coloracion',   950, 'Wella',       4),
    ('Decolorante polvo azul 500 g',  'Coloracion',  2190, 'Loreal',      3),
    ('Matizador antiamarillo 60 ml',  'Coloracion',  1090, 'Fanola',      3),
    ('Tratamiento de enlaces n3',     'Tratamiento', 2790, 'Olaplex',     2),
    ('Ampollas anticaida caja 12',    'Tratamiento', 3290, 'Vichy',       2),
    ('Keratina liquida 500 ml',       'Tratamiento', 4590, 'Cadiveu',     1),
    ('Botox capilar 500 ml',          'Tratamiento', 3890, 'Cadiveu',     1),
    ('Aceite para barba 30 ml',       'Barberia',    1390, 'Proraso',     3),
    ('Balsamo aftershave 100 ml',     'Barberia',    1190, 'Proraso',     3),
    ('Jabon de afeitar 150 ml',       'Barberia',     890, 'Proraso',     3),
    ('Cuchillas navaja caja 100',     'Barberia',     990, 'Derby',       2),
    ('Esmalte semipermanente rojo',   'Manicura',    1090, 'OPI',         3),
    ('Esmalte semipermanente nude',   'Manicura',    1090, 'OPI',         3),
    ('Top coat brillo',               'Manicura',     990, 'OPI',         2),
    ('Aceite de cuticulas 15 ml',     'Manicura',     690, 'OPI',         3),
    ('Guantes nitrilo caja 100',      'Material',     890, 'Generico',    4),
    ('Toallas desechables 100 u',     'Material',    1490, 'Generico',    3),
    ('Papel de plata peluqueria',     'Material',     790, 'Generico',    4),
    ('Capa de corte impermeable',     'Material',    1590, 'Generico',    2)
  ) as p(nombre, categoria, precio_cents, proveedor, stock_min)
),
ins as (
  insert into public.productos (negocio_id, nombre, descripcion, categoria, precio_cents,
                                iva_porcentaje, stock_minimo, activo, codigo_barras, proveedor)
  select 'salon_pruebas_mecha', p.nombre, null, p.categoria, p.precio_cents, 21,
         p.stock_min, true,
         '84' || lpad((abs(hashtext(p.nombre)) % 10000000000)::text, 11, '0'),
         p.proveedor
  from prods p
  returning id, nombre, stock_minimo
)
insert into public.inventario (negocio_id, producto_id, unidades, ubicacion)
select 'salon_pruebas_mecha', i.id,
       i.stock_minimo + 1 + (abs(hashtext(i.nombre)) % 14),
       case when abs(hashtext(i.nombre)) % 3 = 0 then 'Almacen' else 'Vitrina' end
from ins i;

-- Cuatro productos bajo minimo, para que la alerta de reposicion tenga con que.
update public.inventario iv
   set unidades = greatest(p.stock_minimo - 1, 0)
  from public.productos p
 where p.id = iv.producto_id
   and iv.negocio_id = 'salon_pruebas_mecha'
   and p.nombre in ('Tinte 6.0 rubio oscuro','Laca fijacion fuerte 400 ml',
                    'Aceite de argan 100 ml','Guantes nitrilo caja 100');

insert into public.movimientos_inventario (negocio_id, producto_id, tipo, unidades, motivo, created_at)
select 'salon_pruebas_mecha', p.id,
       case when (abs(hashtext(p.nombre)) + g) % 3 = 0 then 'entrada' else 'salida' end,
       1 + ((abs(hashtext(p.nombre)) + g) % 4),
       case when (abs(hashtext(p.nombre)) + g) % 3 = 0 then 'Pedido a proveedor' else 'Uso en cabina' end,
       now() - (((abs(hashtext(p.nombre)) + g) % 25) || ' days')::interval
  from public.productos p
  cross join generate_series(1, 2) g
 where p.negocio_id = 'salon_pruebas_mecha'
   and (abs(hashtext(p.nombre)) % 2) = 0;

-- ============================================================
-- 9) Fichas de color, resenas y lista de espera
-- ============================================================

insert into public.fichas_tecnicas_color (
  negocio_id, cliente_id, cita_id, profesional_id, tipo_servicio, marca_producto,
  formula, oxidante_volumen, oxidante_proporcion, tiempo_exposicion_min,
  tecnica_aplicacion, base_natural, porcentaje_canas, nivel_dano,
  resultado_color, resultado_satisfactorio, resultado_notas, cerrada, created_at)
select 'salon_pruebas_mecha', c.cliente_id, c.id, c.profesional_id,
       case s.nombre
         when 'Color raiz' then 'color_raiz'
         when 'Bano de color' then 'bano_color'
         when 'Matiz antiamarillo' then 'matiz'
         when 'Mechas balayage' then 'balayage'
         when 'Californianas' then 'balayage'
         when 'Babylights' then 'mechas'
         when 'Mechas con papel' then 'mechas'
         when 'Retoque de raiz decolorada' then 'decoloracion'
         else 'coloracion_global' end,
       case when h.v % 3 = 0 then 'Wella' when h.v % 3 = 1 then 'Loreal' else 'Schwarzkopf' end,
       jsonb_build_array(
         jsonb_build_object('numero', (6 + h.v % 3)::text || '.' || (h.v % 4)::text, 'gramos', (30 + (h.v % 3) * 10)::text),
         jsonb_build_object('numero', (7 + h.v % 2)::text || '.' || (1 + h.v % 3)::text, 'gramos', '20')
       ),
       (array[10, 20, 30, 40])[1 + h.v % 4],
       '1:1.5',
       nullif(s.duracion_espera_min, 0),
       case when cs.orden = 2 then array['raiz','medios'] else array['balayage','mechas'] end,
       (4 + h.v % 4)::text || '.0',
       (h.v % 6) * 10,
       1 + h.v % 3,
       case when h.v % 5 = 0 then 'Rubio ceniza uniforme' else 'Tono conseguido segun objetivo' end,
       h.v % 11 <> 0,
       case when h.v % 11 = 0 then 'Quedo mas calido de lo previsto, matizar en la proxima.' else null end,
       true,
       c.fin
  from public.citas c
  join public.servicios s on s.id = c.servicio_id
  join public.categorias_servicio cs on cs.id = s.categoria_id
  cross join lateral (select abs(hashtext(c.id::text)) v) h
 where c.negocio_id = 'salon_pruebas_mecha'
   and c.estado = 'completada'
   and cs.orden in (2, 3)
   and c.cliente_id is not null;

insert into public.resenas (
  negocio_id, cliente_id, cita_id, profesional_id, servicio_id, puntuacion,
  comentario, autor_nombre, fuente, visible, created_at,
  salon_trato_puntuacion, salon_productos_puntuacion, profesional_puntuacion)
select 'salon_pruebas_mecha', c.cliente_id, c.id, c.profesional_id, c.servicio_id,
       case when h.v % 12 = 0 then 3 when h.v % 5 = 0 then 4 else 5 end,
       (array[
         'Sali encantada, justo lo que buscaba.',
         'Muy buen trato y puntualidad.',
         'El color quedo precioso, repetire.',
         'Buen resultado aunque tuve que esperar un poco.',
         'Profesionales de verdad, se nota la diferencia.',
         'Me explicaron el cuidado en casa paso a paso.'
       ])[1 + h.v % 6],
       split_part(cl.nombre, ' ', 1),
       'web', true, c.fin + interval '2 days',
       case when h.v % 12 = 0 then 4 else 5 end,
       case when h.v % 7 = 0 then 4 else 5 end,
       case when h.v % 12 = 0 then 3 else 5 end
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  cross join lateral (select abs(hashtext(c.id::text)) v) h
 where c.negocio_id = 'salon_pruebas_mecha'
   and c.estado = 'completada'
   and c.inicio >= now() - interval '25 days'
   and h.v % 8 = 0;

insert into public.lista_espera (negocio_id, cliente_id, nombre, telefono, servicio_id, profesional_id, desde, hasta, franja, nota, estado, prioridad)
select 'salon_pruebas_mecha', cl.id, cl.nombre, cl.telefono,
       (select id from public.servicios where negocio_id='salon_pruebas_mecha' order by nombre offset (cl.rn % 20) limit 1),
       case when cl.rn % 3 = 0 then null
            else (select id from public.profesionales where negocio_id='salon_pruebas_mecha' and rol_acceso <> 'recepcion' order by nombre offset (cl.rn % 5) limit 1) end,
       current_date, current_date + 14,
       (array['manana','tarde','cualquiera'])[1 + cl.rn % 3],
       case when cl.rn % 2 = 0 then 'Avisar por WhatsApp si sale hueco.' else null end,
       'esperando', cl.rn % 3
  from (select id, nombre, telefono, row_number() over (order by nombre)::int rn
          from public.clientes where negocio_id='salon_pruebas_mecha' and not bloqueado) cl
 where cl.rn % 9 = 1;
