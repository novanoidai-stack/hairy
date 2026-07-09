-- FIX de seguridad (auditoría V3, 2026-07-09): chispa_acciones (S05) tenía
-- políticas RLS definidas pero RLS estaba DESHABILITADO en la tabla, dejando el
-- log de acciones/deshacer legible y escribible cross-tenant por cualquier
-- usuario autenticado. Las políticas existían pero eran inertes. Se habilita RLS.
ALTER TABLE public.chispa_acciones ENABLE ROW LEVEL SECURITY;
