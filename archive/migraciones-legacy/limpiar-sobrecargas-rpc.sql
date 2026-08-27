-- Fuera las versiones viejas de tres RPC que conviven con la nueva.
--
-- Cuando una funcion tiene DOS versiones y los parametros que sobran llevan
-- DEFAULT, PostgREST no sabe cual quieres: devuelve 42725 "function is not
-- unique" y la pantalla enseña un error que no dice nada. Esto ya paso en
-- produccion con el cobro ("No se pudo registrar el cobro", 12 jul): se arreglo
-- la llamada, pero la version vieja se quedo ahi, asi que la trampa seguia
-- armada para el siguiente que llamara sin ese parametro.
--
--   crear_cobro_desde_cita: la de 6 argumentos vs la de 7 (con p_lineas_extra).
--     Hoy solo la llama components/pos/CobroSheet.tsx y siempre manda
--     p_lineas_extra, que es lo unico que la desambigua. Cualquier otra llamada
--     (Chispa, un edge, otra pantalla) hubiera reventado.
--
--   guardar_pasarela_redsys: la de 3 argumentos vs la de 4 (con p_test).
--
--   crear_resena_publica: quedaban TRES (6, 8 y 14 argumentos). Aqui no habia
--     ambiguedad porque los conjuntos de nombres son distintos, pero eran dos
--     funciones muertas con acceso anonimo. Menos superficie, menos que auditar.
--     (lib/reservaPublica.ts tenia ademas un "si falla, prueba con la version de
--     6": ese apaño deja de tener sentido y se quita del cliente.)
--
-- Antes de soltarlas se comprobo que ninguna otra funcion de la base de datos
-- las llama.

drop function if exists public.crear_cobro_desde_cita(uuid, text, integer, integer, integer, integer);

drop function if exists public.guardar_pasarela_redsys(text, text, text);

drop function if exists public.crear_resena_publica(text, smallint, text, text, uuid, uuid);
drop function if exists public.crear_resena_publica(text, smallint, text, text, uuid, uuid, smallint, text);

notify pgrst, 'reload schema';
