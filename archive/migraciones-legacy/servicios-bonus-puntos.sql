-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Bonus de puntos en servicios
-- Autor: Carlos + Claude (1 jul 2026)
--
-- Añade campo bonus_puntos a la tabla servicios para que servicios premium
-- (tintes, tratamientos) otorguen más sellos/puntos del sistema de fidelización.
-- ────────────────────────────────────────────────────────────────────────────────

-- Añadir campo bonus_puntos (default 1 = 1 sello por visita)
ALTER TABLE servicios
ADD COLUMN IF NOT EXISTS bonus_puntos integer DEFAULT 1
CONSTRAINT bonus_puntos_positive CHECK (bonus_puntos >= 0);

-- Comentario
COMMENT ON COLUMN servicios.bonus_puntos IS 'Sellos/puntos otorgados por este servicio (default 1). Servicios premium dan más.';

-- Índice para servicios con bonus (optimiza consultas de fidelización)
CREATE INDEX IF NOT EXISTS servicios_bonus ON servicios(negocio_id, bonus_puntos) WHERE bonus_puntos > 1;

-- Backfill: actualizar servicios premium existentes
-- Descomentar y ajustar según catálogo del negocio
-- UPDATE servicios SET bonus_puntos = 2 WHERE nombre ILIKE '%tinte%';
-- UPDATE servicios SET bonus_puntos = 2 WHERE nombre ILIKE '%mechas%';
-- UPDATE servicios SET bonus_puntos = 3 WHERE nombre ILIKE '%tratamiento%';

-- RLS (mantener política existente de servicios)
-- La política existente ya cubre este campo, no hay cambios necesarios.
