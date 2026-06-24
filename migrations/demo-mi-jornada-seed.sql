-- Siembra demo para "Mi jornada" (tenant demo_salon_001). Carlos + Claude, 24 jun 2026.
-- IDEMPOTENTE: seguro de re-ejecutar. Aplicar al re-sembrar la demo para que el panel
-- personal del profesional salga poblado al enseñarlo.
--
-- Contexto: la demo no tiene cuentas de empleado (todo owner). Para poder demostrar
-- "Mi jornada" se vincula la ficha de profesional "Maria Garcia" (id estable
-- aa000000-…-001) con la cuenta publica de la demo (demo.publico@mecha.app,
-- id 0b7b8929-…) y se le crean fichaje + cobros walk-in de HOY.
-- Asi, al entrar la demo (auto-login como demo.publico), Mi jornada resuelve a Maria.
-- Como demo.publico es owner, ve todos los importes (el gate por rol no le aplica).

-- 1. Vincular ficha de profesional con la cuenta demo (profesionales.profile_id)
update profesionales
   set profile_id = '0b7b8929-fdda-46f8-bd80-59da09123ba7'
 where id = 'aa000000-0000-0000-0000-000000000001'
   and negocio_id = 'demo_salon_001';

-- 2. Fichaje de HOY (par limpio entrada -> salida) para la cuenta demo
delete from fichajes
 where negocio_id = 'demo_salon_001'
   and user_id = '0b7b8929-fdda-46f8-bd80-59da09123ba7'
   and marcado_at >= date_trunc('day', now());
insert into fichajes (negocio_id, user_id, tipo, marcado_at) values
 ('demo_salon_001','0b7b8929-fdda-46f8-bd80-59da09123ba7','entrada', date_trunc('day',now()) + interval '9 hours'),
 ('demo_salon_001','0b7b8929-fdda-46f8-bd80-59da09123ba7','salida',  date_trunc('day',now()) + interval '14 hours');

-- 3. Cobros walk-in de HOY atribuidos a Maria (idempotency_key como ancla idempotente)
delete from cobros where idempotency_key in ('demo-mijornada-1','demo-mijornada-2');
insert into cobros (negocio_id, profesional_id, cliente_id, total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, cobrado_at, idempotency_key)
values
 ('demo_salon_001','aa000000-0000-0000-0000-000000000001', null, 4500, 0,   0, 'efectivo', 4500, 0,    0, 'pos','completado', date_trunc('day',now()) + interval '10 hours', 'demo-mijornada-1'),
 ('demo_salon_001','aa000000-0000-0000-0000-000000000001', null, 4300, 500, 0, 'datafono', 0,    4300, 0, 'pos','completado', date_trunc('day',now()) + interval '12 hours', 'demo-mijornada-2');
