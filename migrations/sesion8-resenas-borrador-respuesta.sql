-- Migración: Sesión 8 - Reseñas - Borrador de respuesta
-- Añade campo para guardar borrador de respuesta generado por IA (Chispa)
-- Autor: Carlos + Claude (9 jul 2026)

alter table public.resenas
  add column if not exists respuesta_borrador text;

-- Comentario
comment on column public.resenas.respuesta_borrador is 'Borrador de respuesta generado por IA (Chispa) para que el salón lo revise y envíe por WhatsApp/correo.';
