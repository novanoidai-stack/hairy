-- =====================================================================
-- FIX: el CHECK de bloqueos_profesional no admite 'reunion', pero la UI
-- de creacion lo ofrece (equipo.web.tsx TIPOS_BLOQUEO y equipo.tsx) y la
-- agenda ya tiene color/etiqueta para el (BLOQUEO_COLORS.reunion). Resultado:
-- seleccionar "Reunion" hacia fallar el INSERT (violacion de CHECK) y, con
-- el catch silencioso, el bloqueo "nunca aparecia" en la agenda.
--
-- Idempotente. Aplicar junto con fix-cobros-refid-uuid.sql.
-- =====================================================================

alter table public.bloqueos_profesional
  drop constraint if exists bloqueos_profesional_tipo_check;

alter table public.bloqueos_profesional
  add constraint bloqueos_profesional_tipo_check
  check (tipo = any (array['vacaciones','formacion','descanso','baja','otro','reunion','reserva_temporal']));
