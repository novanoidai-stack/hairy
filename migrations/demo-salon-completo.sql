-- El salon de DEMO, completo: como un salon de verdad ya en marcha.
--
-- La demo es el escaparate, y estaba a medio vestir: 5 claves de configuracion
-- de las ~70 que usa Ajustes, cero categorias de servicio (asi que el portal
-- agrupaba TODO bajo "Otros servicios"), ni una foto, ni un bloqueo, ni una
-- campaña, ni un gasto. Media docena de pantallas del recorrido guiado salian
-- vacias, que es la peor forma de enseñar un producto.
--
-- Las imagenes son ILUSTRACIONES propias (`scripts/generar-fotos-demo.mjs` ->
-- `web/demo-fotos/*.svg`, servidas por Vercel desde el propio dominio): fotos
-- de banco de personas reales presentadas como empleadas de un salon que no
-- existe es un problema de derechos de imagen, y ademas caducan o cambian de
-- licencia. Un salon real sube las suyas desde Ajustes y Equipo.
--
-- Ojo: `resembrar_demo()` (cron cada 2 h) solo toca citas, cobros y clientes.
-- Nada de este fichero se pierde en la resiembra.

-- ---------------------------------------------------------------------------
-- 1) Catalogo: categorias, fotos, descripciones. Y una errata visible.
-- ---------------------------------------------------------------------------
insert into public.categorias_servicio (negocio_id, nombre, color, orden, activo)
values
  ('demo_salon_001', 'Color y mechas', 'rose',  1, true),
  ('demo_salon_001', 'Corte y peinado','indigo',2, true),
  ('demo_salon_001', 'Barbería',       'slate', 3, true)
on conflict do nothing;

-- Salia asi en el portal PUBLICO.
update public.servicios set nombre = 'Corte señora y peinado'
 where negocio_id='demo_salon_001' and nombre = 'Corte senora y peinado';

update public.servicios s set
  foto_url     = d.foto,
  descripcion  = d.descripcion,
  categoria_id = c.id
from (values
  ('Mechas Balayage + Matiz',   '/demo-fotos/servicio-mechas.svg',    'Mechas a mano alzada con matiz personalizado. Incluye lavado, tratamiento post-color y secado.', 'Color y mechas'),
  ('Color Raíz + Peinado',      '/demo-fotos/servicio-color.svg',     'Retoque de raíz con tu fórmula guardada, lavado y peinado de acabado.',                          'Color y mechas'),
  ('Corte caballero y peinado', '/demo-fotos/servicio-corte-cab.svg', 'Corte a tijera o máquina, lavado y peinado con producto.',                                       'Corte y peinado'),
  ('Corte señora y peinado',    '/demo-fotos/servicio-corte-sra.svg', 'Estudio de tu tipo de rostro, corte, lavado y peinado.',                                          'Corte y peinado'),
  ('Lavado y peinado',          '/demo-fotos/servicio-lavado.svg',    'Lavado con masaje capilar y peinado a tu gusto: liso, ondas o recogido sencillo.',                'Corte y peinado'),
  ('Barba express con navaja',  '/demo-fotos/servicio-barba.svg',     'Perfilado de barba a navaja con toalla caliente y aceite hidratante.',                            'Barbería')
) as d(nombre, foto, descripcion, cat)
join public.categorias_servicio c
  on c.negocio_id = 'demo_salon_001' and c.nombre = d.cat
where s.negocio_id = 'demo_salon_001' and s.nombre = d.nombre;

insert into public.service_variants (negocio_id, servicio_id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, activo)
select 'demo_salon_001', s.id, v.nombre, v.precio, v.activa, v.espera, v.extra, true
from public.servicios s
join (values
  ('Mechas Balayage + Matiz', 'Pelo largo',     110::numeric, 90, 35, 20),
  ('Mechas Balayage + Matiz', 'Pelo corto',      75::numeric, 55, 30, 15),
  ('Color Raíz + Peinado',    'Con tratamiento', 68::numeric, 55, 25, 20)
) as v(srv, nombre, precio, activa, espera, extra) on v.srv = s.nombre
where s.negocio_id='demo_salon_001'
  and not exists (select 1 from public.service_variants sv where sv.servicio_id=s.id and sv.nombre=v.nombre);

-- ---------------------------------------------------------------------------
-- 2) Equipo: foto, especialidades, contacto y comision.
-- ---------------------------------------------------------------------------
update public.profesionales p set
  foto_perfil    = d.foto,
  especialidades = d.esp,
  telefono       = d.tel,
  email          = d.email,
  comision_pct   = d.com,
  categoria      = d.cat
from (values
  ('Maria Garcia',     '/demo-fotos/equipo-maria.svg',  array['Color','Mechas','Colorimetría'],       '600 111 222', 'maria@salondemo.es',  35::numeric, 'direccion'),
  ('Carlos Rodríguez', '/demo-fotos/equipo-carlos.svg', array['Barbería','Corte caballero','Navaja'], '600 333 444', 'carlos@salondemo.es', 30::numeric, 'oficial_mayor'),
  ('Laura Fernández',  '/demo-fotos/equipo-laura.svg',  array['Corte señora','Peinados','Recogidos'], '600 555 666', 'laura@salondemo.es',  28::numeric, 'oficial')
) as d(nombre, foto, esp, tel, email, com, cat)
where p.negocio_id = 'demo_salon_001' and p.nombre = d.nombre;

-- Bloqueos: es justo la zona que enfoca el paso de Equipo del recorrido.
-- Relativos a hoy para que nunca queden en el pasado.
insert into public.bloqueos_profesional (negocio_id, profesional_id, inicio, fin, tipo, motivo)
select 'demo_salon_001', p.id, d.ini, d.fin, d.tipo, d.motivo
from public.profesionales p
join (values
  ('Maria Garcia',     (date_trunc('day', now()) + interval '12 days'),         (date_trunc('day', now()) + interval '26 days'),         'vacaciones', 'Vacaciones de verano'),
  ('Carlos Rodríguez', (date_trunc('day', now()) + interval '3 days 16 hours'), (date_trunc('day', now()) + interval '3 days 20 hours'), 'formacion',  'Curso de barbería clásica'),
  ('Laura Fernández',  (date_trunc('day', now()) + interval '6 days 9 hours'),  (date_trunc('day', now()) + interval '6 days 11 hours'), 'reunion',    'Visita del comercial de color'),
  ('Laura Fernández',  (date_trunc('day', now()) + interval '20 days'),         (date_trunc('day', now()) + interval '22 days'),         'baja',       'Baja médica')
) as d(nombre, ini, fin, tipo, motivo) on d.nombre = p.nombre
where p.negocio_id = 'demo_salon_001'
  and not exists (select 1 from public.bloqueos_profesional b where b.profesional_id = p.id and b.motivo = d.motivo);

insert into public.objetivos_profesional (negocio_id, profesional_id, metrica, objetivo_valor, bonus_cents, activo)
select 'demo_salon_001', p.id, d.metrica, d.valor, d.bonus, true
from public.profesionales p
join (values
  ('Maria Garcia',     'ingresos',   3200::numeric, 15000),
  ('Carlos Rodríguez', 'servicios',   120::numeric, 10000),
  ('Laura Fernández',  'productivo',   75::numeric,  8000)
) as d(nombre, metrica, valor, bonus) on d.nombre = p.nombre
where p.negocio_id='demo_salon_001'
  and not exists (select 1 from public.objetivos_profesional o where o.profesional_id = p.id);

insert into public.comisiones_tramos (negocio_id, nivel, umbral_min_cents, umbral_max_cents, porcentaje, activo)
select * from (values
  ('demo_salon_001', 1,      0, 200000, 28::numeric, true),
  ('demo_salon_001', 2, 200000, 350000, 32::numeric, true),
  ('demo_salon_001', 3, 350000,   null, 36::numeric, true)
) as v(negocio_id,nivel,mn,mx,pct,activo)
where not exists (select 1 from public.comisiones_tramos t where t.negocio_id='demo_salon_001' and t.nivel = v.nivel);

-- ---------------------------------------------------------------------------
-- 3) Identidad del salon y portal publico.
-- ---------------------------------------------------------------------------
-- Las fotos van en RELATIVO para que carguen en cualquier origen (local, vista
-- previa de Vercel, produccion). La unica que sigue absoluta es `logo_url`, y
-- no por descuido: las edge functions `enviar-presupuesto` y
-- `responder-mensaje-bandeja` la meten en el <img> de un CORREO, donde una ruta
-- relativa no resuelve contra nada. Ver migrations/demo-fotos-rutas-relativas.sql.
update public.negocio_portal set
  logo_url         = 'https://www.mechaa.es/demo-fotos/logo-salon.svg',
  fondo_portal_url = '/demo-fotos/fondo-portal.svg',
  direccion        = 'Calle de la Demostración 12, bajo',
  ciudad           = 'Madrid',
  telefono         = '+34 910 000 000',
  web              = 'https://www.mechaa.es'
where negocio_id = 'demo_salon_001';

insert into public.negocio_fotos (negocio_id, url, alt, orden)
values
  ('demo_salon_001','/demo-fotos/fondo-portal.svg','El salón por dentro',1),
  ('demo_salon_001','/demo-fotos/servicio-mechas.svg','Zona de color',2),
  ('demo_salon_001','/demo-fotos/servicio-lavado.svg','Lavacabezas',3),
  ('demo_salon_001','/demo-fotos/servicio-barba.svg','Rincón de barbería',4)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4) Configuracion completa (de 5 claves a ~80). Los valores son los de un
--    salon en marcha, no los de fabrica: si no, Ajustes se ve "sin tocar".
-- ---------------------------------------------------------------------------
update public.negocio_config set config = config || '{
  "nombre": "Salón Demo Mecha",
  "direccion": "Calle de la Demostración 12, bajo · Madrid",
  "telefono": "+34 910 000 000",
  "email": "hola@salondemo.es",
  "timezone": "Europe/Madrid",
  "brandColor": "#f4501e",
  "theme": "dark",
  "slotInterval": 15, "defaultView": "dia", "startOfWeek": "lun",
  "showOutsideHours": false, "compactEmpty": true,
  "antelacionGlobal": 120, "antelacionMax": 60, "permitirMismoDia": true,
  "solapamiento": "reposo",
  "confirmacionModo": "auto", "confirmacionTimeout": 120, "confirmacionNotificar": true,
  "noShowGrace": 15, "retrasoGrace": 10, "contadorRetraso": true, "recolocarRetraso": true,
  "completarManual": false,
  "reposoMargen": 5, "alertaReposo": true, "alertaReposoUmbral": 3, "aprovecharReposo": true,
  "comisionBase": 30, "comisionBaseImporte": "neto", "comisionAddons": true,
  "comisionPropinas": false, "comisionPeriodo": "mensual",
  "bonusProducto": 10, "bonusObjetivo": true, "bonusObjetivoImporte": 250, "bonusEstrella": true,
  "mi_jornada_mostrar_importes": true, "mi_jornada_mostrar_comision": true,
  "control_horario_exigir_fichaje": true, "control_horario_bloquear": false,
  "control_horario_jornada_semanal": 40, "control_horario_zona": "Europe/Madrid",
  "notifConfirmacionActiva": true, "notifRecordatorioActiva": true, "notifRecordatorioHoras": 24,
  "notifResenaActiva": true, "notifSenalActiva": true, "notifRetrasoActiva": true,
  "notifCumpleanosActiva": true, "notifCumpleanosDescuentoPct": 10,
  "notifNoMolestar": true, "notifNoMolestarInicio": "22:00", "notifNoMolestarFin": "08:00",
  "listaEsperaMatchingActivo": true, "listaEsperaVentanaMin": 30,
  "listaEsperaMaxBloqueoHoras": 2, "listaEsperaAntelacionMinHoras": 4,
  "listaEsperaDesbloqueoDesde": "primer_aviso",
  "listaEsperaOfertaPideSenal": false, "listaEsperaAvisarCaducado": true,
  "depositoDinamicoActivo": true, "depositoModoClasificacion": "ambos",
  "depositoFactorRiesgo": 2, "depositoUmbralFiableCompletadas": 3,
  "depositoUmbralAltoNoShows": 2, "depositoStaffExigir": false,
  "depositoVipExento": true, "depositoModoFianza": "cobro", "depositoNoShowCapturaAuto": true,
  "propinasActivo": true, "propinasSugeridas": [5, 10, 15],
  "catalogoAlergias": ["Parafenilendiamina (PPD)","Amoniaco","Resorcina","Persulfatos","Fragancias","Niquel","Latex"],
  "plantillasFormula": [
    {"nombre":"Rubio ceniza","producto":"Igora Royal + Blondme","tono":"9.1 + 10.1 (2:1)","tiempo":35},
    {"nombre":"Cobrizo cálido","producto":"Igora Royal","tono":"7.77 + 8.4 (1:1)","tiempo":30},
    {"nombre":"Cobertura de canas","producto":"Igora Absolutes","tono":"6.0 + 6.11","tiempo":40}
  ],
  "plantillasNota": [
    "Cuero cabelludo sensible: usar crema barrera en la nuca.",
    "Prefiere secado sin plancha.",
    "Avisar 24 h antes por WhatsApp."
  ]
}'::jsonb
where negocio_id = 'demo_salon_001';

-- ---------------------------------------------------------------------------
-- 5) Modulos que el recorrido enseña y estaban a cero.
-- ---------------------------------------------------------------------------
insert into public.campanas (negocio_id, nombre, canal, mensaje, segmento, estado, total_destinatarios)
select * from (values
  ('demo_salon_001','Vuelve al color · septiembre','whatsapp','Hola {nombre}, tu color toca retoque. Te guardamos hueco esta semana con un 10% de bienvenida de vuelta.','{"tipo":"sin_visita_dias","dias":60}'::jsonb,'enviada',48),
  ('demo_salon_001','Cumpleaños del mes','whatsapp','¡Felicidades {nombre}! Este mes tienes un 10% en cualquier servicio. Te esperamos.','{"tipo":"cumpleanos_mes"}'::jsonb,'enviada',12),
  ('demo_salon_001','Huecos de última hora','whatsapp','Nos ha quedado un hueco hoy a las {hora}. ¿Te viene bien, {nombre}?','{"tipo":"lista_espera"}'::jsonb,'borrador',0)
) as v(negocio_id,nombre,canal,mensaje,segmento,estado,total)
where not exists (select 1 from public.campanas c where c.negocio_id='demo_salon_001' and c.nombre = v.nombre);

insert into public.gastos (negocio_id, concepto, categoria, importe_cents, fecha, es_recurrente)
select * from (values
  ('demo_salon_001','Alquiler del local','alquiler',   120000, (current_date - 5),  true),
  ('demo_salon_001','Luz y agua','suministros',         18400, (current_date - 8),  true),
  ('demo_salon_001','Pedido de color Igora','producto', 42600, (current_date - 12), false),
  ('demo_salon_001','Toallas y capas','otros',           7900, (current_date - 20), false),
  ('demo_salon_001','Gestoría','otros',                 12100, (current_date - 3),  true)
) as v(negocio_id,concepto,categoria,importe,fecha,rec)
where not exists (select 1 from public.gastos g where g.negocio_id='demo_salon_001' and g.concepto = v.concepto);

insert into public.movimientos_inventario (negocio_id, producto_id, tipo, unidades, motivo)
select 'demo_salon_001', p.id, v.tipo, v.uds, v.motivo
from public.productos p
cross join (values ('entrada', 12, 'Pedido al proveedor'), ('salida', 3, 'Venta en mostrador')) as v(tipo, uds, motivo)
where p.negocio_id='demo_salon_001'
  and not exists (select 1 from public.movimientos_inventario m where m.producto_id = p.id and m.motivo = v.motivo);

insert into public.presupuesto_conceptos (negocio_id, nombre, precio_cents, activo)
select * from (values
  ('demo_salon_001','Extensiones de queratina (por 50 uds)', 28000, true),
  ('demo_salon_001','Peinado de novia',                      15000, true),
  ('demo_salon_001','Prueba de peinado',                      6000, true),
  ('demo_salon_001','Cambio de color completo',              19000, true),
  ('demo_salon_001','Tratamiento de reconstrucción',           4500, true),
  ('demo_salon_001','Desplazamiento a domicilio',              4000, true)
) as v(negocio_id, nombre, precio, activo)
where not exists (select 1 from public.presupuesto_conceptos p where p.negocio_id='demo_salon_001' and p.nombre = v.nombre);

insert into public.cierres_negocio (negocio_id, fecha, motivo)
select 'demo_salon_001', v.fecha::date, v.motivo
from (values
  ((date_trunc('year', now()) + interval '11 months 24 days'), 'Nochebuena'),
  ((date_trunc('year', now()) + interval '11 months 25 days'), 'Navidad'),
  ((date_trunc('year', now()) + interval '0 months 0 days'),   'Año Nuevo'),
  ((date_trunc('day', now()) + interval '45 days'),            'Cierre por vacaciones del salón')
) as v(fecha, motivo)
where not exists (select 1 from public.cierres_negocio c where c.negocio_id='demo_salon_001' and c.fecha = v.fecha::date);

-- ---------------------------------------------------------------------------
-- 6) Fichas de clienta: consentimientos, notas internas y bonos.
-- ---------------------------------------------------------------------------
insert into public.config_fiscal (negocio_id, nif, razon_social, domicilio_fiscal, regimen_iva,
  tipo_iva_defecto, territorio, serie_defecto, modalidad, aplica_verifactu,
  proveedor_estado, apoderamiento_ok, declaracion_responsable_ok, activo, entorno_aeat)
values ('demo_salon_001', 'B00000000', 'Salón Demo Mecha S.L.',
  'Calle de la Demostración 12, bajo · 28001 Madrid', 'general',
  21, 'comun', 'A', 'verifactu', true, 'sandbox', false, true, true, 'preproduccion')
on conflict (negocio_id) do nothing;

insert into public.consentimientos_cliente (negocio_id, cliente_id, tipo, aceptado, fecha, metodo_obtencion, version_texto)
select 'demo_salon_001', c.id, v.tipo, true, now() - (v.dias || ' days')::interval, v.metodo, 'v1.2'
from public.clientes c
join (values
  ('Carmen Ruiz',    'tratamiento_datos',          'casilla',        120),
  ('Carmen Ruiz',    'ficha_tecnica',              'firma_digital',  120),
  ('Carmen Ruiz',    'comunicaciones_comerciales', 'casilla',        120),
  ('Lucía Blanco',   'tratamiento_datos',          'casilla',         90),
  ('Lucía Blanco',   'ficha_tecnica',              'firma_digital',   90),
  ('Elena Martínez', 'tratamiento_datos',          'casilla',         60),
  ('Elena Martínez', 'uso_promocional_imagen',     'firma_digital',   45)
) as v(nombre, tipo, metodo, dias) on v.nombre = c.nombre
where c.negocio_id='demo_salon_001'
  and not exists (select 1 from public.consentimientos_cliente x where x.cliente_id=c.id and x.tipo=v.tipo);

insert into public.notas_internas_cliente (negocio_id, cliente_id, contenido)
select 'demo_salon_001', c.id, v.nota
from public.clientes c
join (values
  ('Carmen Ruiz',    'Cuero cabelludo sensible en la nuca: siempre crema barrera antes del color.'),
  ('Lucía Blanco',   'Suele llegar 10 min tarde. Dejarle margen si es la última de la mañana.'),
  ('Elena Martínez', 'No quiere plancha: secado con difusor y producto de rizo.'),
  ('Javier López',   'Prefiere a Carlos. Corte máquina 2 a los lados, tijera arriba.')
) as v(nombre, nota) on v.nombre = c.nombre
where c.negocio_id='demo_salon_001'
  and not exists (select 1 from public.notas_internas_cliente n where n.cliente_id=c.id);

insert into public.bonos (negocio_id, cliente_id, servicio_id, sesiones_totales, sesiones_disponibles, precio_cents, fecha_caducidad, estado)
select 'demo_salon_001', c.id, s.id, v.total, v.disp, v.precio, now() + (v.dias||' days')::interval, v.estado
from public.clientes c
cross join lateral (select id from public.servicios where negocio_id='demo_salon_001' and nombre='Lavado y peinado' limit 1) s
join (values
  ('Carmen Ruiz',    5, 3, 7200, 180, 'activo'),
  ('Lucía Blanco',   5, 1, 7200, 120, 'activo'),
  ('Elena Martínez', 5, 0, 7200,  30, 'agotado')
) as v(nombre, total, disp, precio, dias, estado) on v.nombre = c.nombre
where c.negocio_id='demo_salon_001'
  and not exists (select 1 from public.bonos b where b.cliente_id=c.id);

-- ---------------------------------------------------------------------------
-- 7) Ficha tecnica de color y fidelizacion.
--    La ficha de color es LA pantalla vertical del producto (lo que no tiene
--    ningun software generalista) y estaba a cero en el escaparate.
-- ---------------------------------------------------------------------------
insert into public.fichas_tecnicas_color (negocio_id, cliente_id, profesional_id, tipo_servicio,
  marca_producto, formula, oxidante_volumen, oxidante_proporcion, tiempo_exposicion_min,
  tecnica_aplicacion, base_natural, color_previo, porcentaje_canas, nivel_dano,
  resultado_color, resultado_satisfactorio, resultado_notas, cerrada)
select 'demo_salon_001', c.id, p.id, v.tipo, v.marca, v.formula::jsonb, v.vol, v.prop, v.tiempo,
       v.tecnica, v.base, v.previo, v.canas, v.dano, v.resultado, true, v.notas, true
from (values
  ('Carmen Ruiz','Maria Garcia','balayage','Igora Royal + Blondme',
   '[{"tono":"9.1","partes":2},{"tono":"10.1","partes":1}]',20,'1:2',35,
   array['balayage','papel'],'6','Rubio oscuro con reflejos',15,2,
   'Rubio ceniza natural, raiz difuminada',
   'Matiz final con 10.1 diluido 5 min. La proxima vez subir medio tono en medios.'),
  ('Lucia Blanco','Laura Fernandez','color_raiz','Igora Absolutes',
   '[{"tono":"6.0","partes":1},{"tono":"6.11","partes":1}]',20,'1:1',40,
   array['raiz'],'6','Castano con canas',45,1,
   'Castano uniforme, canas cubiertas',
   'Cobertura completa. Repetir en 5 semanas.'),
  ('Elena Martinez','Laura Fernandez','matiz','Blondme',
   '[{"tono":"Ice","partes":1}]',10,'1:2',15,
   array['medios','puntas'],'8','Rubio con tendencia naranja',5,3,
   'Rubio frio sin naranja',
   'Puntas castigadas: mascarilla de reconstruccion antes del matiz.')
) as v(cliente, prof, tipo, marca, formula, vol, prop, tiempo, tecnica, base, previo, canas, dano, resultado, notas)
join public.clientes c on c.negocio_id='demo_salon_001' and c.nombre = v.cliente
join public.profesionales p on p.negocio_id='demo_salon_001' and p.nombre = v.prof
where not exists (select 1 from public.fichas_tecnicas_color x where x.cliente_id = c.id);

insert into public.recompensas_canjeadas (negocio_id, cliente_id, recompensa_id, canjeado_en, estado)
select 'demo_salon_001', c.id, r.id, now() - (v.dias||' days')::interval, v.estado
from (values ('Carmen Ruiz', 30, 'usado'), ('Lucia Blanco', 12, 'canjeado')) as v(nombre, dias, estado)
join public.clientes c on c.negocio_id='demo_salon_001' and c.nombre = v.nombre
cross join lateral (select id from public.recompensas where negocio_id='demo_salon_001' order by created_at limit 1) r
where not exists (select 1 from public.recompensas_canjeadas x where x.cliente_id = c.id);

insert into public.logros_desbloqueados (negocio_id, cliente_id, logro_id, desbloqueado_en)
select 'demo_salon_001', c.id, l.id, now() - (v.dias||' days')::interval
from (values ('Carmen Ruiz', 60), ('Lucia Blanco', 40), ('Elena Martinez', 20)) as v(nombre, dias)
join public.clientes c on c.negocio_id='demo_salon_001' and c.nombre = v.nombre
cross join lateral (select id from public.logros where negocio_id='demo_salon_001' order by orden nulls last limit 1) l
where not exists (select 1 from public.logros_desbloqueados x where x.cliente_id = c.id);

-- Servicios que se hacen seguidos: alimenta la sugerencia de encadenado en la
-- AGENDA (distinto de `servicios_sugeridos`, que es el del portal publico).
insert into public.servicios_combinables (negocio_id, servicio_origen_id, servicio_destino_id, orden_sugerido)
select 'demo_salon_001', o.id, d.id, 1
from (values
  ('Mechas Balayage + Matiz','Lavado y peinado'),
  ('Color Raiz + Peinado','Lavado y peinado'),
  ('Corte caballero y peinado','Barba express con navaja')
) as v(origen, destino)
join public.servicios o on o.negocio_id='demo_salon_001' and o.nombre = v.origen
join public.servicios d on d.negocio_id='demo_salon_001' and d.nombre = v.destino
where not exists (select 1 from public.servicios_combinables sc where sc.servicio_origen_id=o.id and sc.servicio_destino_id=d.id);
