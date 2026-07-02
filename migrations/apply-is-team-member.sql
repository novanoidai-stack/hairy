-- ============================================================================
-- [REEMPLAZADA — NO RE-APLICAR] MIGRACIÓN: is_team_member() con emails hardcoded
-- ============================================================================
-- Sustituida el 3 jul 2026 por security-is-team-member-solo-staff.sql (auditoría
-- de seguridad, hallazgo A3): los emails hardcodeados eran un riesgo (una cuenta
-- Gmail personal comprometida daba acceso de staff a toda la plataforma) y
-- role='admin' suponía escalada de negocio→plataforma. La fuente de verdad
-- de pertenencia al equipo es ahora ÚNICAMENTE la tabla public.staff.
-- Se conserva solo como historial. Ejecutar este archivo revertiría el fix.
-- ============================================================================

-- 1. Crear is_team_member() con emails hardcoded
CREATE OR REPLACE FUNCTION public.is_team_member()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or email ilike '%@novanoidai.com'
        or exists (
          select 1 from public.staff s
          where lower(s.email) = lower(profiles.email)
        )
        or lower(email) in (
          'novanoidai@gmail.com',
          'carlitosocanamartinez@gmail.com',
          'carlitoscanamartimez@gmail.com',
          'carletes2007cc@gmail.com',
          'alexandruiscru07@gmail.com',
          'alexandru.iscru07@gmail.com'
        )
      )
  ) into v_exists;
  return v_exists;
end;
$$;

-- 2. Actualizar políticas de staff para usar is_team_member
drop policy if exists "Staff can select all staff" on public.staff;
create policy "Staff can select all staff" on public.staff
  for select to authenticated
  using (public.is_team_member());

drop policy if exists "Staff can insert staff" on public.staff;
create policy "Staff can insert staff" on public.staff
  for insert to authenticated
  with check (public.is_team_member());

drop policy if exists "Staff can delete staff" on public.staff;
create policy "Staff can delete staff" on public.staff
  for delete to authenticated
  using (public.is_team_member());

-- 3. Otorgar permisos de ejecución
grant execute on function public.is_team_member() to authenticated, anon;

-- 4. Verificación
SELECT
  'is_team_member creada' as status,
  proname as function_name,
  prokind as kind
FROM pg_proc
WHERE proname = 'is_team_member';

SELECT
  'politicas staff actualizadas' as status,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'staff';
