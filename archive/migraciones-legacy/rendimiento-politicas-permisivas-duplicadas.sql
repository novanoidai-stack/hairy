-- Consolidar politicas PERMISIVAS que se solapan (aviso multiple_permissive_policies).
--
-- Postgres evalua TODAS las politicas permisivas que aplican a una tabla+rol+
-- operacion y las une con OR: cuantas mas hay, mas trabajo por consulta. De los
-- 122 avisos del advisor, solo estos son solapes de verdad.
--
-- Idempotente: se puede repasar entera sin miedo.
--
-- 17 ago 2026.

-- ---------------------------------------------------------------------------
-- 1) bloqueos, duraciones_profesional y horarios_profesional
--
-- Aqui SI habia restos de una migracion a medias: conviven dos formas de decir
-- exactamente lo mismo.
--
--   a) X_write_own_negocio  (FOR ALL)
--        EXISTS (profesionales p JOIN profiles pr ON pr.negocio_id = p.negocio_id
--                WHERE p.id = <tabla>.profesional_id AND pr.id = auth.uid())
--
--   b) "Users can ... own negocio" (una por operacion) + X_read_own_negocio
--        EXISTS (profesionales WHERE id = <tabla>.profesional_id
--                AND negocio_id = (SELECT negocio_id FROM profiles WHERE id = auth.uid()))
--
-- Son equivalentes: ambas piden que el profesional de la fila pertenezca al
-- negocio del perfil de quien consulta (sin perfil, o con negocio_id NULL, las
-- dos dan falso). La (a) es FOR ALL, asi que ya cubre SELECT/INSERT/UPDATE/
-- DELETE ella sola -- en una politica FOR ALL sin WITH CHECK, Postgres usa el
-- USING tambien como comprobacion de escritura.
--
-- Quitar politicas PERMISIVAS nunca puede dar acceso de mas: como mucho lo
-- quita, y aqui no lo quita porque lo que decian ya lo dice la que queda.
-- Las RESTRICTIVAS (demo_block_*) no se tocan: esas son las que impiden que un
-- visitante de la demo escriba.

drop policy if exists "Users can view bloqueos from own negocio" on public.bloqueos;
drop policy if exists "bloqueos_read_own_negocio" on public.bloqueos;
drop policy if exists "Users can create bloqueos in own negocio" on public.bloqueos;
drop policy if exists "Users can update bloqueos in own negocio" on public.bloqueos;
drop policy if exists "Users can delete bloqueos in own negocio" on public.bloqueos;

drop policy if exists "Users can view durations from own negocio" on public.duraciones_profesional;
drop policy if exists "duraciones_read_own_negocio" on public.duraciones_profesional;
drop policy if exists "Users can create durations in own negocio" on public.duraciones_profesional;
drop policy if exists "Users can update durations in own negocio" on public.duraciones_profesional;
drop policy if exists "Users can delete durations in own negocio" on public.duraciones_profesional;

drop policy if exists "Users can view schedules from own negocio" on public.horarios_profesional;
drop policy if exists "horarios_read_own_negocio" on public.horarios_profesional;
drop policy if exists "Users can create schedules in own negocio" on public.horarios_profesional;
drop policy if exists "Users can update schedules in own negocio" on public.horarios_profesional;
drop policy if exists "Users can delete schedules in own negocio" on public.horarios_profesional;

-- ---------------------------------------------------------------------------
-- 2) profiles y staff
--
-- OJO: aqui NO habia restos de nada. Son reglas DISTINTAS que se acumulan:
--   profiles: "el mio" + "el equipo Mecha los ve todos" + "direccion ve los de
--             su salon" (con la demo filtrada).
--   staff:    "soy del equipo" + "mi propia fila por correo".
-- Se juntan en una sola politica con OR, que es literalmente lo mismo que hace
-- Postgres al unirlas, pero evaluado una vez. No se gana ni se pierde acceso;
-- si alguna vez hay que cambiar una de las reglas, esta todo en un sitio.
--
-- profiles se lee dentro de casi todas las demas politicas, asi que es la que
-- mas veces se evalua de toda la base.
--
-- CUIDADO con el rol: la politica juntada va a 'authenticated', NO a 'public'.
-- Las tres originales eran dos de authenticated y una ("el propio perfil") de
-- public. Al juntarlas en una de public, tambien la evaluaba anon, y dentro hay
-- llamadas a is_staff() / my_negocio_id_text() que anon no puede ejecutar
-- (round 4 de seguridad): cualquier lectura anonima de profiles pasaba de
-- devolver cero filas a reventar con "permission denied for function is_staff".
-- Limitarla a authenticated no le quita acceso a nadie: para anon, auth.uid()
-- es NULL, asi que "el propio perfil" no casaba ninguna fila de todas formas.

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Staff can view all profiles" on public.profiles;
drop policy if exists "Direccion ve cuentas de su negocio" on public.profiles;
drop policy if exists "profiles_select_visible" on public.profiles;

create policy "profiles_select_visible" on public.profiles
  for select
  to authenticated
  using (
    -- el propio perfil
    (select auth.uid()) = id
    -- equipo Mecha: ve todos
    or (select is_staff())
    -- direccion (owner/admin): las cuentas de SU negocio. En el tenant de la
    -- demo solo las 4 de atrezzo, para no exponer cuentas reales (ahi nacen
    -- todos los registros nuevos).
    or (
      negocio_id is not null
      and negocio_id = (select my_negocio_id_text())
      and (select my_app_role()) = any (array['owner'::text, 'admin'::text])
      and (negocio_id <> 'demo_salon_001'::text or es_cuenta_demo)
    )
  );

drop policy if exists "Staff can select all staff" on public.staff;
drop policy if exists "staff_self_select" on public.staff;
drop policy if exists "staff_select_visible" on public.staff;

create policy "staff_select_visible" on public.staff
  for select
  to authenticated
  using (
    (select is_team_member())
    -- la propia fila por correo (usa el indice staff(lower(email)))
    or lower(email) = lower(((select auth.jwt()) ->> 'email'::text))
  );

-- ---------------------------------------------------------------------------
-- 3) Politicas SELECT que eran copia LITERAL (mismo USING byte a byte, mismos
-- roles) de la politica FOR ALL de su tabla. Una FOR ALL ya cubre SELECT: estas
-- solo hacian evaluar dos veces lo mismo en cada fila.
--
-- Localizadas asi (sirve para repasar en el futuro):
--   select r.tablename, r.policyname, a.policyname
--   from pg_policies r
--   join pg_policies a on a.tablename = r.tablename and a.cmd='ALL'
--    and a.permissive='PERMISSIVE' and a.roles::text = r.roles::text
--    and md5(coalesce(a.qual,'')) = md5(coalesce(r.qual,''))
--   where r.schemaname='public' and r.cmd='SELECT' and r.permissive='PERMISSIVE';

drop policy if exists "consentimientos_read" on public.consentimientos_cliente;
drop policy if exists "fichas_tecnicas_read" on public.fichas_tecnicas_color;
drop policy if exists "grupo_miembros_read" on public.grupo_familiar_miembros;
drop policy if exists "grupos_fam_read" on public.grupos_familiares;
drop policy if exists "notas_internas_read" on public.notas_internas_cliente;
drop policy if exists "prof_cat_hist_read" on public.profesional_categorias_historial;
drop policy if exists "serv_comb_read" on public.servicios_combinables;

-- Resultado: el aviso multiple_permissive_policies baja de 122 a 6. Los 6 que
-- quedan son reglas distintas de verdad (negocio_portal, pagos, resenas) y las
-- tres de negocio_fotos, que NO eran un tema de rendimiento sino un fallo de
-- seguridad: ver migrations/seguridad-negocio-fotos-demo-block-restrictive.sql.
