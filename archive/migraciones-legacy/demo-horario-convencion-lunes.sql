-- ---------------------------------------------------------------------------
-- El horario del salon de la demo estaba escrito un dia corrido.
--
-- `negocio_horarios.dia_semana` es 0 = LUNES: es lo que escribe Ajustes
-- (DAY_LABELS empieza en 'Lunes', app/(tabs)/configuracion.web.tsx) y lo que
-- leen la agenda (`(getDay()+6)%7` en AgendaCalendar.web.tsx) y
-- lib/organizarAgenda.ts. La OTRA tabla, `horarios_profesional`, si es
-- 0 = DOMINGO (extract(dow) de Postgres). Los dos scripts de siembra
-- (scripts/seed-demo-salon.sql, migrations/seed-salon-pruebas-mecha.sql)
-- escribieron `negocio_horarios` con la convencion equivocada.
--
-- Consecuencia visible en la demo: el LUNES —el dia mas cargado— salia con el
-- cartel "Salon cerrado", la rejilla entera rayada y las citas pintadas encima;
-- y el DOMINGO salia abierto de 9:00 a 14:30.
--
-- Que la convencion buena es 0 = LUNES se comprueba con un salon real
-- (florent_surez_peluqueros_15004): 0 cerrado, 1-4 de 9:30 a 20:00, 5 de 9:00 a
-- 14:30, 6 cerrado. Leido 0 = LUNES es una peluqueria normal (cierra lunes y
-- domingo, sabado por la mañana). Leido 0 = DOMINGO seria un salon cerrado los
-- sabados y con el viernes a media jornada, que no existe.
--
-- Aqui se deja el horario que SIEMPRE se quiso para la demo: cerrado el
-- domingo, de lunes a jueves 9:00-20:00 con pausa de comida, viernes hasta las
-- 20:30 y sabado solo por la mañana.
-- ---------------------------------------------------------------------------

insert into public.negocio_horarios
  (negocio_id, dia_semana, abierto, apertura, cierre, pausa_inicio, pausa_fin)
values
  ('demo_salon_001', 0, true,  '09:00', '20:00', '14:00', '15:00'),  -- lunes
  ('demo_salon_001', 1, true,  '09:00', '20:00', '14:00', '15:00'),  -- martes
  ('demo_salon_001', 2, true,  '09:00', '20:00', '14:00', '15:00'),  -- miercoles
  ('demo_salon_001', 3, true,  '09:00', '20:00', '14:00', '15:00'),  -- jueves
  ('demo_salon_001', 4, true,  '09:00', '20:30', '14:00', '15:00'),  -- viernes
  ('demo_salon_001', 5, true,  '09:00', '14:30', null,    null),     -- sabado
  ('demo_salon_001', 6, false, null,    null,    null,    null)      -- domingo
on conflict (negocio_id, dia_semana) do update
  set abierto      = excluded.abierto,
      apertura     = excluded.apertura,
      cierre       = excluded.cierre,
      pausa_inicio = excluded.pausa_inicio,
      pausa_fin    = excluded.pausa_fin,
      updated_at   = now();

-- `horarios_profesional` NO se toca: esa tabla ya esta bien (0 = DOMINGO, sin
-- fila para el domingo, turnos 9:00-14:00 y 15:00-20:00/20:30 y sabado
-- 9:00-14:30). Cuadra con el horario de arriba una vez corregido.
