-- Migracion: round 4b — correccion del cierre de default privileges
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- APLICADA en remoto el 02/07/2026 (apply_migration: security_round4b_default_privileges_global).
--
-- El `alter default privileges ... in schema public` del round 4 NO bastaba: los
-- defaults por esquema se SUMAN a los globales (docs de PostgreSQL), y el default
-- global integrado concede EXECUTE a PUBLIC en toda funcion nueva — por eso
-- anonimizar_cliente/exportar_datos_negocio nacieron ejecutables por anon pese
-- al round 4. Solo una entrada GLOBAL (sin "in schema") reemplaza el default
-- integrado.
--
-- Verificado tras aplicar: funcion de prueba nueva nace con anon=false,
-- authenticated=true (via defacl de esquema), service_role=true.

alter default privileges for role postgres revoke execute on functions from public;

-- Las dos funciones RGPD que nacieron con el agujero (creadas minutos antes)
-- llevaban el grant a PUBLIC horneado en su ACL ({=X/postgres,...}). Revocar
-- de `anon` NO basta (anon hereda via PUBLIC): hay que revocar de PUBLIC. Ya
-- corregido dentro de migrations/gdpr-anonimizacion-y-retencion.sql:
--   revoke execute on function public.anonimizar_cliente(uuid) from public;
--   revoke execute on function public.exportar_datos_negocio() from public;
-- Verificado por HTTPS como anon: 401 permission denied en ambas.
