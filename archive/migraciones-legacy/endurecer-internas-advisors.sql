-- Endurecer internals que los advisors de seguridad marcaron (2026-08-27).
--
-- 1) agenda_ojos_latido: RLS activo SIN politicas era "a medias" para el
--    linter (rls_enabled_no_policy). La tabla es solo-servicio (la escribe el
--    trigger agenda_ojos_notify corriendo como postgres, y ya tiene revoke a
--    anon/authenticated). La politica denegatoria documenta esa intencion y
--    cierra el lint sin abrir acceso a nadie.
-- 2) pg_net instalada en schema public (extension_in_public, WARN). Se
--    reinstala en `extensions`. Sus funciones viven en el schema `net`, que
--    se recrea igual, asi que los net.http_post de los cron/triggers siguen
--    resolviendo sin cambios (verificado: cero dependientes fuera de `net`).

begin;

-- 1) Politica explicita de cierre total: nadie por PostgREST/RLS.
drop policy if exists agenda_ojos_latido_nadie on public.agenda_ojos_latido;
create policy agenda_ojos_latido_nadie
  on public.agenda_ojos_latido
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 2) pg_net fuera de public.
drop extension pg_net;
create extension pg_net with schema extensions;

commit;
