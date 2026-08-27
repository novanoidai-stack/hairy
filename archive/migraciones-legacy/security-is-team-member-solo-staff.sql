-- ============================================================================
-- SEGURIDAD (auditoría 3 jul 2026, hallazgo A3): is_team_member() sin hardcode
-- ============================================================================
-- APLICADA en remoto via MCP el 3 jul 2026 (security_is_team_member_solo_tabla_staff).
-- Reemplaza a apply-is-team-member.sql.
--
-- Problema: la versión anterior concedía acceso de equipo/plataforma por
--   (a) lista de emails Gmail personales hardcodeados,
--   (b) dominio '%@novanoidai.com' por ILIKE, y
--   (c) role = 'admin' (¡rol de NEGOCIO! => escalada a poderes de PLATAFORMA).
-- Solución: la pertenencia al equipo la decide solo la tabla public.staff
--   (igual que is_staff(), que ya gobierna los RPCs staff_* sensibles).
-- ============================================================================

-- 1) Migración sin pérdida: los 2 emails del equipo que solo estaban en el
--    hardcode se añaden a staff para que nadie pierda acceso.
insert into public.staff (email, nombre)
select v.email, v.nombre
from (values
  ('carlitoscanamartimez@gmail.com', 'Carlos (alt)'),
  ('carletes2007cc@gmail.com', 'Carlos (alt)')
) as v(email, nombre)
where not exists (
  select 1 from public.staff s where lower(s.email) = lower(v.email)
);

-- 2) Redefinición: pertenencia al equipo == estar en la tabla staff.
--    Fallback a profiles.email para sesiones cuyo JWT no trae email (OAuth raro).
create or replace function public.is_team_member()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.staff s
    where lower(s.email) = lower(coalesce(
      auth.jwt() ->> 'email',
      (select p.email from public.profiles p where p.id = auth.uid())
    ))
  );
$function$;
