-- Añadir duracion_activa_extra_min a servicios
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS duracion_activa_extra_min integer NOT NULL DEFAULT 0;

-- Añadir duracion_activa_extra_min a duraciones_profesional (override)
ALTER TABLE duraciones_profesional ADD COLUMN IF NOT EXISTS duracion_activa_extra_min integer NOT NULL DEFAULT 0;

-- Añadir fin_espera a citas (marca el fin de espera / inicio de activo extra)
ALTER TABLE citas ADD COLUMN IF NOT EXISTS fin_espera timestamptz;
