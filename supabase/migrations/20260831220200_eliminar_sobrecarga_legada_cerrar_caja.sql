-- P5 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: cerrar_caja tenia dos
-- firmas (3 y 4 argumentos) con grants incoherentes a anon: la VIEJA (3 args,
-- sin Bizum) concedida a anon, la nueva NO. Mientras ambas existan, cualquier
-- llamada con los 3 nombres clasicos puede entrar por la vieja sin el paso
-- por el calculo de Bizum -- la mitad del incidente del HTTP 300.
--
-- Quien llama a cerrar_caja: solo la app autenticada
-- (components/pos/SesionCajaPanel.web.tsx:75, sesion de staff). anon no la usa
-- de verdad, asi que el grant de la vieja sobraba y la firma vieja sobra:
-- se elimina como se hizo con vender_bono (20260830230000). La llamada de la
-- app (3 args con nombre) resuelve a la firma de 4 con p_contado_bizum_cents
-- en su default null, que es exactamente lo que manda hoy.

drop function if exists public.cerrar_caja(integer, integer, text);

-- Homogeneo y explicito en la firma buena: ni anon ni public.
revoke all on function public.cerrar_caja(integer, integer, text, integer) from public, anon;
grant execute on function public.cerrar_caja(integer, integer, text, integer) to authenticated, service_role;
