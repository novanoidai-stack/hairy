-- P1-117 (aplicada en remoto via MCP el 10-ago-2026, en 2 pasos consolidados aqui).
--
-- Los 6 helpers internos de RLS eran ejecutables por anon (round-4: las funciones
-- internas no deben ser superficie publica). Tenian EXECUTE via PUBLIC, asi que
-- anon lo heredaba. Se quita de public y anon, y se concede explicito a
-- authenticated: lo necesita para evaluar las policies RLS al consultar tablas de
-- tenant. postgres lo conserva por ser owner. Los flujos anon van por RPCs
-- security-definer, que ejecutan los helpers como el definer (no como anon), asi
-- que NO se ven afectados (verificado: los RPCs del marketplace siguen en 200 y
-- anon ya no puede llamar is_staff directo -> 401).
revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;
revoke execute on function public.is_team_member() from public, anon;
grant  execute on function public.is_team_member() to authenticated;
revoke execute on function public.is_shared_demo_visitor() from public, anon;
grant  execute on function public.is_shared_demo_visitor() to authenticated;
revoke execute on function public.my_app_role() from public, anon;
grant  execute on function public.my_app_role() to authenticated;
revoke execute on function public.my_negocio_id() from public, anon;
grant  execute on function public.my_negocio_id() to authenticated;
revoke execute on function public.my_negocio_id_text() from public, anon;
grant  execute on function public.my_negocio_id_text() to authenticated;
