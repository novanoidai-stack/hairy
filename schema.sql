-- Insert test citas

WITH my_negocio AS (
  SELECT id FROM negocios LIMIT 1
),
profs AS (
  SELECT id FROM profesionales WHERE activo = true LIMIT 3
),
clts AS (
  SELECT id FROM clientes LIMIT 3
)
INSERT INTO citas (negocio_id, cliente_id, profesional_id, inicio, fin, estado)
SELECT
  my_negocio.id,
  clts.id,
  profs.id,
  NOW() + INTERVAL '1 hour',
  NOW() + INTERVAL '1.5 hours',
  'confirmada'
FROM my_negocio, (SELECT id FROM clientes LIMIT 1) clts, (SELECT id FROM profesionales WHERE activo = true LIMIT 1) profs
WHERE NOT EXISTS (SELECT 1 FROM citas WHERE estado = 'confirmada');

-- Insert more citas for today
WITH my_negocio AS (
  SELECT id FROM negocios LIMIT 1
)
INSERT INTO citas (negocio_id, cliente_id, profesional_id, inicio, fin, estado)
SELECT
  my_negocio.id,
  (SELECT id FROM clientes OFFSET 1 LIMIT 1),
  (SELECT id FROM profesionales WHERE activo = true OFFSET 1 LIMIT 1),
  NOW() + INTERVAL '3 hours',
  NOW() + INTERVAL '4 hours',
  'confirmada'
FROM my_negocio
WHERE NOT EXISTS (SELECT 1 FROM citas WHERE estado = 'confirmada' AND profesional_id = (SELECT id FROM profesionales WHERE activo = true OFFSET 1 LIMIT 1));

-- Insert another cita
WITH my_negocio AS (
  SELECT id FROM negocios LIMIT 1
)
INSERT INTO citas (negocio_id, cliente_id, profesional_id, inicio, fin, estado)
SELECT
  my_negocio.id,
  (SELECT id FROM clientes OFFSET 2 LIMIT 1),
  (SELECT id FROM profesionales WHERE activo = true OFFSET 2 LIMIT 1),
  NOW() + INTERVAL '5 hours',
  NOW() + INTERVAL '6.5 hours',
  'pendiente'
FROM my_negocio;
