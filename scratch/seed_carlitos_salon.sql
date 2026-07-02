-- =====================================================================
-- SEED SCRIPT: Carlitos' Salon (nose_03801)
-- =====================================================================

-- 1. Create Profile Records for Workers in Profiles
INSERT INTO public.profiles (id, email, role, negocio_id, nombre, created_at, updated_at)
VALUES
  ('c314b75f-4fbd-405b-800d-1482e5dbf6ed', 'carlitos-empleado@mecha.es', 'employee', 'nose_03801', 'Juan Barbero', now(), now()),
  ('8fe2488f-8017-4dc7-81f8-79b4c4d4eff9', 'carlitos-recepcion@mecha.es', 'recepcion', 'nose_03801', 'Ana Recepción', now(), now()),
  ('72de0f08-2df2-42bc-95c2-62c997ca45c0', 'carlitos-admin@mecha.es', 'admin', 'nose_03801', 'Diego Estilista', now(), now())
ON CONFLICT (id) DO UPDATE
SET role = EXCLUDED.role, negocio_id = EXCLUDED.negocio_id, nombre = EXCLUDED.nombre;

-- 2. Link Professionals to their corresponding Profiles
UPDATE public.profesionales SET profile_id = '84ca88ba-00d0-43db-bbeb-58217176c316' WHERE id = '2dfc9977-6647-49ba-9148-2f4ff474edc2'; -- Carlos
UPDATE public.profesionales SET profile_id = 'c314b75f-4fbd-405b-800d-1482e5dbf6ed' WHERE id = '9262cf4e-f767-4062-b607-bc0bb33c3617'; -- Juan
UPDATE public.profesionales SET profile_id = '8fe2488f-8017-4dc7-81f8-79b4c4d4eff9' WHERE id = '799fdbbe-f3f3-43dc-90d1-e07c318f53c5'; -- Ana
UPDATE public.profesionales SET profile_id = '72de0f08-2df2-42bc-95c2-62c997ca45c0' WHERE id = 'ce8507c8-f40f-4b60-9de6-769594b40bb6'; -- Diego

-- 3. Clear Existing base Schedules and Blockages to start clean for this salon
DELETE FROM public.horarios_profesional WHERE profesional_id IN (
  '2dfc9977-6647-49ba-9148-2f4ff474edc2', '9262cf4e-f767-4062-b607-bc0bb33c3617',
  '799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 'ce8507c8-f40f-4b60-9de6-769594b40bb6'
);
DELETE FROM public.bloqueos_profesional WHERE profesional_id IN (
  '2dfc9977-6647-49ba-9148-2f4ff474edc2', '9262cf4e-f767-4062-b607-bc0bb33c3617',
  '799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 'ce8507c8-f40f-4b60-9de6-769594b40bb6'
);

-- 4. Seed Base Schedules (horarios_profesional)
-- 1 = Lun, 2 = Mar, 3 = Mié, 4 = Jue, 5 = Vie, 6 = Sáb, 0 = Dom
-- Carlos (Lun-Vie 09:30-19:30, Sáb 09:00-14:00)
INSERT INTO public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno) VALUES
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 1, '09:30', '19:30', 1),
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 2, '09:30', '19:30', 1),
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 3, '09:30', '19:30', 1),
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 4, '09:30', '19:30', 1),
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 5, '09:30', '19:30', 1),
  ('2dfc9977-6647-49ba-9148-2f4ff474edc2', 6, '09:00', '14:00', 1);

-- Juan (Mar-Sáb 10:00-20:00)
INSERT INTO public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno) VALUES
  ('9262cf4e-f767-4062-b607-bc0bb33c3617', 2, '10:00', '20:00', 1),
  ('9262cf4e-f767-4062-b607-bc0bb33c3617', 3, '10:00', '20:00', 1),
  ('9262cf4e-f767-4062-b607-bc0bb33c3617', 4, '10:00', '20:00', 1),
  ('9262cf4e-f767-4062-b607-bc0bb33c3617', 5, '10:00', '20:00', 1),
  ('9262cf4e-f767-4062-b607-bc0bb33c3617', 6, '09:00', '19:00', 1);

-- Ana (Lun-Vie 09:00-18:00)
INSERT INTO public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno) VALUES
  ('799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 1, '09:00', '18:00', 1),
  ('799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 2, '09:00', '18:00', 1),
  ('799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 3, '09:00', '18:00', 1),
  ('799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 4, '09:00', '18:00', 1),
  ('799fdbbe-f3f3-43dc-90d1-e07c318f53c5', 5, '09:00', '18:00', 1);

-- Diego (Lun-Vie 11:00-21:00, Sáb 09:00-18:00)
INSERT INTO public.horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno) VALUES
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 1, '11:00', '21:00', 1),
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 2, '11:00', '21:00', 1),
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 3, '11:00', '21:00', 1),
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 4, '11:00', '21:00', 1),
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 5, '11:00', '21:00', 1),
  ('ce8507c8-f40f-4b60-9de6-769594b40bb6', 6, '09:00', '18:00', 1);


-- 5. Seed waitlist (lista_espera)
DELETE FROM public.lista_espera WHERE negocio_id = 'nose_03801';
INSERT INTO public.lista_espera (negocio_id, nombre, telefono, servicio_id, profesional_id, franja, nota, estado, created_at)
VALUES
  ('nose_03801', 'Manuel Torres', '+34612345678', '82f3b51f-25fe-4f18-b985-b93ac1cf64d2', '9262cf4e-f767-4062-b607-bc0bb33c3617', 'tarde', 'Prefiere corte degradado con Juan a última hora', 'esperando', now() - interval '2 hours'),
  ('nose_03801', 'Alejandro Sanz', '+34698765432', '12e61197-3b95-48be-afdc-c81b2c3fd6d2', null, 'manana', 'Urgente corte de barba antes del evento', 'esperando', now() - interval '1 hour'),
  ('nose_03801', 'Sofia Loren', '+34622334455', '674fdb90-ed4b-4cd4-9e19-447c737bab06', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', 'cualquiera', 'Tinte orgánico con Diego, si hay cancelación avisar', 'esperando', now() - interval '30 minutes');


-- 6. Seed Reviews (resenas)
DELETE FROM public.resenas WHERE negocio_id = 'nose_03801';
INSERT INTO public.resenas (negocio_id, puntuacion, comentario, autor_nombre, created_at, visible, fuente)
VALUES
  ('nose_03801', 5, 'El mejor degradado que me han hecho en Madrid. Juan es un crack y súper perfeccionista.', 'Raúl Jiménez', now() - interval '1 day', true, 'web'),
  ('nose_03801', 5, 'Trato impecable de Ana en la recepción y Diego me dejó el afeitado con toalla caliente espectacular. Volveré sin duda.', 'Andrés Montes', now() - interval '2 days', true, 'web'),
  ('nose_03801', 4, 'Me gusta mucho cómo corta Carlos, pero a veces hay un poco de retraso en la cita. Aún así el servicio de 10.', 'Julio Iglesias', now() - interval '3 days', true, 'web'),
  ('nose_03801', 5, 'Llevo tiñéndome aquí el pelo y la barba desde que abrieron. La calidad del tinte orgánico no da picor ni daña la piel.', 'Marcos Peña', now() - interval '4 days', true, 'web'),
  ('nose_03801', 5, 'Local muy moderno, café riquísimo y el corte + barba premium vale cada céntimo. ¡Grandes!', 'Carlos Herrera', now() - interval '5 days', true, 'web');


-- 7. Seed Products (productos, inventario, movimientos_inventario)
DELETE FROM public.productos WHERE negocio_id = 'nose_03801'; -- Cascades to inventario and movimientos
INSERT INTO public.productos (id, negocio_id, nombre, descripcion, categoria, precio_cents, iva_porcentaje, stock_minimo, activo, codigo_barras, imagen_url, proveedor)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'nose_03801', 'Champú Premium Cuidado Barba 250ml', 'Champú suavizante con aceites naturales para barba dura.', 'shampoo', 1890, 21.00, 8, true, '8410000000001', null, 'LOréal Paris'),
  ('a2000000-0000-0000-0000-000000000002', 'nose_03801', 'Aceite Nutritivo Barba de Eucalipto', 'Hidrata, suaviza y perfuma la barba con extracto de eucalipto.', 'tratamiento', 1450, 21.00, 5, true, '8410000000002', null, 'Proraso'),
  ('a3000000-0000-0000-0000-000000000003', 'nose_03801', 'Cera de Fijación Fuerte Mate 100g', 'Cera de peinado fijación extrema base agua con acabado mate.', 'styling', 1600, 21.00, 10, true, '8410000000003', null, 'Uppercut Deluxe'),
  ('a4000000-0000-0000-0000-000000000004', 'nose_03801', 'Acondicionador Refrescante Pelo 500ml', 'Acondicionador refrescante con mentol para cabello graso.', 'shampoo', 2100, 21.00, 5, true, '8410000000004', null, 'American Crew'),
  ('a5000000-0000-0000-0000-000000000005', 'nose_03801', 'Bálsamo para Después del Afeitado Alumbre', 'Bálsamo calmante anti-irritación para pieles sensibles.', 'tratamiento', 1250, 21.00, 6, true, '8410000000005', null, 'Proraso');

-- Seed Current Inventory Stocks (Make some below minimum for alerts!)
INSERT INTO public.inventario (negocio_id, producto_id, unidades, ubicacion)
VALUES
  ('nose_03801', 'a1000000-0000-0000-0000-000000000001', 3, 'Estantería Principal A'), -- Min: 8, Current: 3 (ALERT!)
  ('nose_03801', 'a2000000-0000-0000-0000-000000000002', 15, 'Estantería Principal B'), -- Min: 5, Current: 15
  ('nose_03801', 'a3000000-0000-0000-0000-000000000003', 4, 'Cajón Almacén 1'), -- Min: 10, Current: 4 (ALERT!)
  ('nose_03801', 'a4000000-0000-0000-0000-000000000004', 12, 'Estantería Principal A'), -- Min: 5, Current: 12
  ('nose_03801', 'a5000000-0000-0000-0000-000000000005', 2, 'Cajón Almacén 2'); -- Min: 6, Current: 2 (ALERT!)

-- Seed Inventory Movements Logs
INSERT INTO public.movimientos_inventario (negocio_id, producto_id, tipo, unidades, motivo, creado_por, notas)
VALUES
  ('nose_03801', 'a1000000-0000-0000-0000-000000000001', 'entrada', 20, 'reabastecimiento', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Llegada de pedido de distribuidor'),
  ('nose_03801', 'a1000000-0000-0000-0000-000000000001', 'salida', -17, 'venta', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Ventas acumuladas en salón'),
  ('nose_03801', 'a3000000-0000-0000-0000-000000000003', 'entrada', 10, 'ajuste', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Inventario inicial verificado'),
  ('nose_03801', 'a3000000-0000-0000-0000-000000000003', 'salida', -6, 'venta', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Despachado en caja'),
  ('nose_03801', 'a5000000-0000-0000-0000-000000000005', 'entrada', 5, 'reabastecimiento', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Entrada manual'),
  ('nose_03801', 'a5000000-0000-0000-0000-000000000005', 'salida', -3, 'ajuste', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Producto caducado retirado de estantería');


-- 8. Seed Absences/Blockages (bloqueos_profesional)
-- Juan has upcoming vacations in mid-July
INSERT INTO public.bloqueos_profesional (negocio_id, profesional_id, inicio, fin, tipo, motivo)
VALUES
  ('nose_03801', '9262cf4e-f767-4062-b607-bc0bb33c3617', '2026-07-15 00:00:00+00', '2026-07-20 23:59:59+00', 'vacaciones', 'Vacaciones de verano'),
-- Diego has a training session next week
  ('nose_03801', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', '2026-07-08 09:00:00+00', '2026-07-08 15:00:00+00', 'formacion', 'Curso de Tinte Orgánico Avanzado');


-- 9. Seed Appointments (citas) & Checkouts (cobros) for past and future
-- Clean existing appointments for this salon to prevent duplicates
DELETE FROM public.citas WHERE negocio_id = 'nose_03801';
DELETE FROM public.cobros WHERE negocio_id = 'nose_03801';

-- Helper to seed appointments and matching completed checkout rows.
-- We seed multiple past appointments (completed & paid) so we get robust reporting.
-- We also seed future appointments in July 2026 distributed across workers.

-- 9a. PAST APPOINTMENTS & COBROS (Completed)
-- Appointment 1: Lucía with Carlos, Corte Degradado, June 28
INSERT INTO public.citas (id, negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por, notas)
VALUES ('c0000000-0000-0000-0000-000000000001', 'nose_03801', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '82f3b51f-25fe-4f18-b985-b93ac1cf64d2', '0b4939f6-1189-41e1-b61e-76eb4f2cc77d', '2026-06-28 10:00:00+02', '2026-06-28 10:30:00+02', '2026-06-28 10:30:00+02', '2026-06-28 10:30:00+02', 'completada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316', 'Corte degradado muy apurado');

INSERT INTO public.cobros (id, negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at)
VALUES ('d0000000-0000-0000-0000-000000000001', 'nose_03801', 'c0000000-0000-0000-0000-000000000001', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '0b4939f6-1189-41e1-b61e-76eb4f2cc77d', 2200, 200, 0, 'efectivo', 2400, 0, 0, 'pos', 'completado', '2026-06-28 10:35:00+02');

INSERT INTO public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
VALUES ('d0000000-0000-0000-0000-000000000001', 'servicio', '82f3b51f-25fe-4f18-b985-b93ac1cf64d2', 'Corte Degradado & Peinado', 2200, 1);

-- Appointment 2: Pedro with Juan, Corte & Barba Premium, June 29
INSERT INTO public.citas (id, negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES ('c0000000-0000-0000-0000-000000000002', 'nose_03801', '9262cf4e-f767-4062-b607-bc0bb33c3617', '12e61197-3b95-48be-afdc-c81b2c3fd6d2', '50d89451-1ac3-434f-ae5e-35cafae0cf55', '2026-06-29 11:30:00+02', '2026-06-29 12:00:00+02', '2026-06-29 12:00:00+02', '2026-06-29 12:00:00+02', 'completada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');

INSERT INTO public.cobros (id, negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at)
VALUES ('d0000000-0000-0000-0000-000000000002', 'nose_03801', 'c0000000-0000-0000-0000-000000000002', '9262cf4e-f767-4062-b607-bc0bb33c3617', '50d89451-1ac3-434f-ae5e-35cafae0cf55', 3200, 300, 0, 'datafono', 0, 3500, 0, 'pos', 'completado', '2026-06-29 12:05:00+02');

INSERT INTO public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
VALUES
  ('d0000000-0000-0000-0000-000000000002', 'servicio', '12e61197-3b95-48be-afdc-c81b2c3fd6d2', 'Corte & Barba Premium', 3200, 1);

-- Appointment 3: Javier with Diego, Tinte Orgánico, June 30
INSERT INTO public.citas (id, negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES ('c0000000-0000-0000-0000-000000000003', 'nose_03801', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', '674fdb90-ed4b-4cd4-9e19-447c737bab06', 'a098cb07-8368-4b08-a498-7382d45f6345', '2026-06-30 16:00:00+02', '2026-06-30 16:30:00+02', '2026-06-30 16:30:00+02', '2026-06-30 16:30:00+02', 'completada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');

INSERT INTO public.cobros (id, negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at)
VALUES ('d0000000-0000-0000-0000-000000000003', 'nose_03801', 'c0000000-0000-0000-0000-000000000003', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', 'a098cb07-8368-4b08-a498-7382d45f6345', 4500, 0, 0, 'datafono', 0, 4500, 0, 'pos', 'completado', '2026-06-30 16:40:00+02');

INSERT INTO public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
VALUES ('d0000000-0000-0000-0000-000000000003', 'servicio', '674fdb90-ed4b-4cd4-9e19-447c737bab06', 'Tinte Orgánico Barba/Pelo', 4500, 1);

-- Appointment 4: Marta with Carlos, Afeitado Toalla Caliente + Product Sale, July 1
INSERT INTO public.citas (id, negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES ('c0000000-0000-0000-0000-000000000004', 'nose_03801', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '57b4adb0-2584-43f9-bd54-3352ee11d141', '3200e13f-0e07-4442-93a4-875415828ee4', '2026-07-01 10:30:00+02', '2026-07-01 11:00:00+02', '2026-07-01 11:00:00+02', '2026-07-01 11:00:00+02', 'completada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');

-- Total = 1500 (Service) + 1600 (Wax product) = 3100 cents
INSERT INTO public.cobros (id, negocio_id, cita_id, profesional_id, cliente_id, total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at)
VALUES ('d0000000-0000-0000-0000-000000000004', 'nose_03801', 'c0000000-0000-0000-0000-000000000004', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '3200e13f-0e07-4442-93a4-875415828ee4', 3100, 200, 0, 'bizum', 0, 0, 0, 'pos', 'completado', '2026-07-01 11:15:00+02');

INSERT INTO public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
VALUES
  ('d0000000-0000-0000-0000-000000000004', 'servicio', '57b4adb0-2584-43f9-bd54-3352ee11d141', 'Afeitado Clásico Toalla Caliente', 1500, 1),
  ('d0000000-0000-0000-0000-000000000004', 'producto', 'a3000000-0000-0000-0000-000000000003', 'Cera de Fijación Fuerte Mate 100g', 1600, 1);


-- 9b. FUTURE APPOINTMENTS (July 2026 - confirmadas)
-- Carlos appointments
INSERT INTO public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES
  ('nose_03801', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '82f3b51f-25fe-4f18-b985-b93ac1cf64d2', 'f12c3ba7-5cdc-48fb-90e8-290a9555ce13', (date_trunc('day', now()) + interval '1 day 10 hours')::timestamptz, (date_trunc('day', now()) + interval '1 day 10 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 10 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 10 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316'),
  ('nose_03801', '2dfc9977-6647-49ba-9148-2f4ff474edc2', '12e61197-3b95-48be-afdc-c81b2c3fd6d2', '50d89451-1ac3-434f-ae5e-35cafae0cf55', (date_trunc('day', now()) + interval '2 days 15 hours')::timestamptz, (date_trunc('day', now()) + interval '2 days 15 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '2 days 15 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '2 days 15 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');

-- Juan appointments
INSERT INTO public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES
  ('nose_03801', '9262cf4e-f767-4062-b607-bc0bb33c3617', '12e61197-3b95-48be-afdc-c81b2c3fd6d2', '0b4939f6-1189-41e1-b61e-76eb4f2cc77d', (date_trunc('day', now()) + interval '1 day 12 hours')::timestamptz, (date_trunc('day', now()) + interval '1 day 12 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 12 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 12 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316'),
  ('nose_03801', '9262cf4e-f767-4062-b607-bc0bb33c3617', '57b4adb0-2584-43f9-bd54-3352ee11d141', '3200e13f-0e07-4442-93a4-875415828ee4', (date_trunc('day', now()) + interval '3 days 16 hours')::timestamptz, (date_trunc('day', now()) + interval '3 days 16 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '3 days 16 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '3 days 16 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');

-- Diego appointments
INSERT INTO public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por)
VALUES
  ('nose_03801', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', '674fdb90-ed4b-4cd4-9e19-447c737bab06', 'a098cb07-8368-4b08-a498-7382d45f6345', (date_trunc('day', now()) + interval '1 day 17 hours')::timestamptz, (date_trunc('day', now()) + interval '1 day 17 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 17 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '1 day 17 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316'),
  ('nose_03801', 'ce8507c8-f40f-4b60-9de6-769594b40bb6', '82f3b51f-25fe-4f18-b985-b93ac1cf64d2', 'f12c3ba7-5cdc-48fb-90e8-290a9555ce13', (date_trunc('day', now()) + interval '2 days 11 hours')::timestamptz, (date_trunc('day', now()) + interval '2 days 11 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '2 days 11 hours 30 minutes')::timestamptz, (date_trunc('day', now()) + interval '2 days 11 hours 30 minutes')::timestamptz, 'confirmada', 'manual', '84ca88ba-00d0-43db-bbeb-58217176c316');


-- 10. Seed Fichajes of today (Clock-ins) for all workers
DELETE FROM public.fichajes WHERE negocio_id = 'nose_03801' AND marcado_at >= date_trunc('day', now());
INSERT INTO public.fichajes (negocio_id, user_id, tipo, marcado_at) VALUES
  ('nose_03801', '84ca88ba-00d0-43db-bbeb-58217176c316', 'entrada', date_trunc('day', now()) + interval '9 hours'),
  ('nose_03801', 'c314b75f-4fbd-405b-800d-1482e5dbf6ed', 'entrada', date_trunc('day', now()) + interval '9 hours 30 minutes'),
  ('nose_03801', '72de0f08-2df2-42bc-95c2-62c997ca45c0', 'entrada', date_trunc('day', now()) + interval '10 hours');

-- =====================================================================
-- END OF SEED
-- =====================================================================
