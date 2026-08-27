-- AGUJERO DE SEGURIDAD (encontrado y cerrado el 17 ago 2026).
--
-- Las tres politicas "demo_block" de negocio_fotos estaban creadas como
-- PERMISSIVE en vez de RESTRICTIVE. Es la diferencia entre un permiso y un
-- freno: Postgres une las PERMISIVAS con OR y las RESTRICTIVAS con AND.
--
-- Al ser permisiva, "no eres el visitante de la demo" dejaba de ser una
-- condicion que recorta y pasaba a ser una que CONCEDE. Resultado: cualquier
-- cuenta autenticada, de cualquier salon, podia insertar, modificar y borrar
-- filas de negocio_fotos de CUALQUIER negocio.
--
-- Comprobado en produccion dentro de una transaccion revertida: con la cuenta
-- de salon_pruebas_alex,
--     with b as (delete from public.negocio_fotos returning 1) select count(*) from b;
-- devolvia 6 -- las 6 fotos del salon de otro. Tras el arreglo devuelve 0, el
-- dueno legitimo sigue viendo y editando las suyas, y el visitante de la demo
-- por fin se queda fuera (que era el proposito original de estas politicas:
-- antes tampoco le frenaban, porque le valia la rama de negocio_fotos_owner_all).
--
-- El resto de tablas con demo_block (bloqueos, horarios_profesional,
-- duraciones_profesional, ...) ya las tenian RESTRICTIVE. Comprobacion para
-- que no vuelva a colarse una:
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname='public' and permissive='PERMISSIVE'
--     and (coalesce(qual,'') like '(NOT %' or coalesce(with_check,'') like '(NOT %');
--
-- (Una politica que empieza por NOT y es permisiva es, casi siempre, este
-- mismo error.)

drop policy if exists "negocio_fotos_demo_block_insert" on public.negocio_fotos;
drop policy if exists "negocio_fotos_demo_block_update" on public.negocio_fotos;
drop policy if exists "negocio_fotos_demo_block_delete" on public.negocio_fotos;

create policy "negocio_fotos_demo_block_insert" on public.negocio_fotos
  as restrictive for insert to authenticated
  with check (not (select public.is_shared_demo_visitor()));

create policy "negocio_fotos_demo_block_update" on public.negocio_fotos
  as restrictive for update to authenticated
  using (not (select public.is_shared_demo_visitor()))
  with check (not (select public.is_shared_demo_visitor()));

create policy "negocio_fotos_demo_block_delete" on public.negocio_fotos
  as restrictive for delete to authenticated
  using (not (select public.is_shared_demo_visitor()));
