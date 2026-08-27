-- Migracion: endurecimiento de seguridad (auditoria 10 jun 2026)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- APLICADA en remoto el 10/06/2026 via MCP (apply_migration: security_hardening_exec_sql_addons)
--
-- Hallazgos que corrige:
--   1) public.exec_sql(text): funcion de desarrollo que ejecutaba SQL arbitrario
--      ("BEGIN EXECUTE sql; END;") y era invocable por anon y authenticated via
--      /rest/v1/rpc/exec_sql. Puerta trasera total. Nada del codigo vivo la usa
--      (solo el snapshot viejo project/uploads/Hairy/app/migrate-profiles.mjs).
--   2) cita_addons y service_addons: anon tenia TODOS los privilegios de tabla
--      (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) y la unica politica permisiva era
--      USING(true) WITH CHECK(true) para public. Es decir: cualquier persona con
--      la URL del proyecto y la anon key podia leer, escribir o VACIAR esas
--      tablas de todos los salones, sin login.
--
-- Las politicas demo_block_* (candado del visitante demo) se conservan.

-- 1) Eliminar la puerta trasera de SQL arbitrario
drop function if exists public.exec_sql(text);

-- 2) Revocar acceso anon y privilegios que PostgREST nunca necesita
revoke all on table public.cita_addons from anon;
revoke all on table public.service_addons from anon;
revoke truncate, references, trigger on table public.cita_addons from authenticated;
revoke truncate, references, trigger on table public.service_addons from authenticated;

-- 3) Sustituir las politicas USING(true) por el patron multi-tenant del proyecto
drop policy if exists cita_addons_all on public.cita_addons;
create policy cita_addons_negocio_all on public.cita_addons
  for all to authenticated
  using (exists (
    select 1 from public.citas c
    where c.id = cita_addons.cita_id
      and c.negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  ))
  with check (exists (
    select 1 from public.citas c
    where c.id = cita_addons.cita_id
      and c.negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
  ));

drop policy if exists service_addons_all on public.service_addons;
create policy service_addons_negocio_all on public.service_addons
  for all to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()))
  with check (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));
