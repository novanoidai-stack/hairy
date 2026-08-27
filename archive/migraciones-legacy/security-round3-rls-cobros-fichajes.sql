-- Migracion: RLS mas fina en cobros y fichajes (auditoria de seguridad 1 jul 2026)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
-- APLICADA en remoto el 01/07/2026 via MCP (apply_migration:
-- security_round3_rls_cobros_fichajes). get_advisors (security) corrido
-- despues: sin hallazgos nuevos relacionados (los 132 avisos existentes son
-- previos y no tocan cobros/fichajes).
--
-- Hallazgo que corrige:
--   Las politicas "cobros_select_own" y "fichajes_select_own" (creadas en
--   pos-caja-cobros-fichajes.sql, aplicada 19/06/2026) solo filtraban por
--   negocio_id, sin restringir por rol. Cualquier usuario autenticado con rol
--   employee/recepcion podia hacer supabase.from('cobros').select('*') o
--   .from('fichajes').select('*') directo desde el cliente y ver el dinero
--   (cobros, propinas, comisiones implicitas) y los horarios de fichaje de
--   TODO el equipo del negocio, no solo los suyos. La proteccion real hasta
--   ahora vivia solo a nivel de ruta/cliente (canAccessInformes en
--   informes.web.tsx, canSeeAll en caja.web.tsx), que no protege frente a una
--   llamada directa a la API REST de Supabase (bypass trivial del gate de ruta).
--
-- Regla nueva:
--   - owner/admin: SELECT completo del negocio (sin cambio de comportamiento).
--   - employee/recepcion: SELECT solo de sus propios registros.
--       cobros: profesional_id = su ficha de profesional
--         (profesionales.profile_id = auth.uid(), profesionales.id = cobros.profesional_id)
--       fichajes: user_id = auth.uid()
--
-- Verificado que no rompe flujos existentes (revisados antes de escribir esto):
--   - informes.web.tsx: solo navegable por owner/admin (canAccessInformes gatea
--     ANTES de leer cobros) -> sigue viendo el negocio entero, sin cambios.
--   - caja.web.tsx: carga cobros y fichajes del negocio entero en el estado de
--     React sin importar el rol, pero SOLO los pinta si canSeeAll (owner/admin).
--     Para employee/recepcion la consulta ya no traera los ajenos: no se rompe
--     nada visible (nunca se pintaban) y de paso se corrige un leak client-side
--     (antes quedaban en memoria del navegador aunque la UI los ocultara).
--   - mi-jornada.web.tsx: ya filtraba fichajes con .eq('user_id', profile.id) y
--     usa la RPC mi_jornada_resumen (security definer, gate server-side del
--     dinero) para el resto -> sin cambios de comportamiento.
--   - No se toca INSERT/UPDATE (fuera del alcance de este hallazgo; los cobros
--     tambien estan blindados de UPDATE/DELETE de campos financieros desde
--     compliance-antifraude-inmutabilidad.sql).

-- Indices de apoyo para las nuevas politicas (evitar seq scan por fila al
-- resolver "mi ficha de profesional" / "mis fichajes").
create index if not exists profesionales_profile_id_idx on public.profesionales(profile_id);
create index if not exists fichajes_user_id_idx on public.fichajes(user_id);

-- ─────────────────────────────────────────────────────────────────
-- cobros: SELECT completo para owner/admin, el resto solo lo suyo
-- ─────────────────────────────────────────────────────────────────
drop policy if exists "cobros_select_own" on public.cobros;

create policy "cobros_select_scoped" on public.cobros for select
  to authenticated
  using (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'admin')
      )
      or exists (
        select 1 from public.profesionales pr
        where pr.profile_id = auth.uid() and pr.id = cobros.profesional_id
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- fichajes: SELECT completo para owner/admin, el resto solo el suyo
-- ─────────────────────────────────────────────────────────────────
drop policy if exists "fichajes_select_own" on public.fichajes;

create policy "fichajes_select_scoped" on public.fichajes for select
  to authenticated
  using (
    negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid())
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'admin')
      )
      or user_id = auth.uid()
    )
  );
